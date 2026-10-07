import decodeQR from "qr/decode.js";
import { buildGeometry } from "./geometry.js";
import type { Geometry } from "./geometry.js";
import { buildMatrix } from "./matrix.js";
import { attachLogo, compositeLogo, loadLogoAsset, logoSvg, occlusionMask } from "./logo.js";
import type { LogoAsset, PreparedLogo } from "./logo.js";
import { encodePng } from "./png.js";
import { rasterize } from "./raster.js";
import type { Raster } from "./raster.js";
import { hash, renderSvg } from "./svg.js";
import { verify } from "./verify.js";
import type { Decoder, VerifyReport } from "./verify.js";
import { resolveOptions } from "./options.js";
import type { PresetOptions, QROptions, Resolved } from "./options.js";
import { contrastOf, nextRepair } from "./repair.js";
import type { Repair } from "./repair.js";
import { presets } from "./presets.js";
import type { DotStyle, QRMatrix } from "./types.js";

const VERIFY_PX_PER_MODULE = 6;
const MAX_REPAIRS = 8;

// Ink spreads on paper and camera optics soften edges, both of which cost a
// rounded module more of its area than a square one. Verification measures a
// clean buffer and cannot see either effect, so these come from published print
// guidance and are applied to the size estimate rather than inferred from it.
const PRINT_PENALTY: Record<DotStyle, number> = {
  square: 1,
  classy: 1.05,
  "classy-rounded": 1.1,
  rounded: 1.1,
  "extra-rounded": 1.2,
  dot: 1.3,
};

export interface QRResult {
  verified: boolean;
  repairs: Repair[];
  report: VerifyReport | null;
  options: Resolved;
  matrix: QRMatrix;
  toSVG(): string;
  toPNG(): Promise<Uint8Array>;
  toDataURL(format?: "png" | "svg"): Promise<string>;
  save(path: string): Promise<void>;
}

const decode: Decoder = (image) => {
  try {
    return decodeQR(image as ImageData);
  } catch {
    return null;
  }
};

export async function generate(options: QROptions): Promise<QRResult> {
  const preset = resolvePreset(options.preset);
  let current = resolveOptions(options, preset);
  const asset = current.logo ? await loadLogoAsset(current.logo.src) : null;
  const repairs: Repair[] = [];

  let build = compose(current, asset);
  let report: VerifyReport | null = null;

  if (current.verify.enabled) {
    report = check(current, build);

    while (!passes(report) && current.verify.repair && repairs.length < MAX_REPAIRS) {
      const attempt = nextRepair(current);
      if (!attempt) break;

      current = attempt.options;
      build = compose(current, asset);
      report = check(current, build);
      repairs.push(attempt.repair);
    }
  }

  return result(current, build, asset, report, repairs);
}

function passes(report: VerifyReport): boolean {
  return report.decodes && report.sufficientContrast;
}

interface Build {
  matrix: QRMatrix;
  geometry: Geometry;
  logo: PreparedLogo | null;
}

function compose(current: Resolved, asset: LogoAsset | null): Build {
  const matrix = buildMatrix(current.data, current.errorCorrection);
  const logo = asset && current.logo ? attachLogo(asset, current.logo, matrix.size) : null;
  const geometry = buildGeometry(matrix, {
    dotStyle: current.dotStyle,
    cornerSquareStyle: current.cornerSquareStyle,
    cornerDotStyle: current.cornerDotStyle,
    ...(logo ? { occluded: occlusionMask(logo.placement) } : {}),
  });

  return { matrix, geometry, logo };
}

function check(current: Resolved, build: Build): VerifyReport {
  const extent = build.matrix.size + current.margin * 2;
  const raster = paint(current, build, extent * VERIFY_PX_PER_MODULE);

  return verify({
    raster,
    expected: current.data,
    modules: build.matrix.size,
    margin: current.margin,
    ladder: current.verify.ladder,
    printPenalty: PRINT_PENALTY[current.dotStyle],
    contrastRatio: contrastOf(current),
    decode,
  });
}

function paint(current: Resolved, build: Build, size: number): Raster {
  const raster = rasterize(build.geometry, {
    size,
    margin: current.margin,
    fills: {
      dot: current.dotColor,
      "corner-square": current.cornerSquareColor,
      "corner-dot": current.cornerDotColor,
    },
    background: current.background,
  });

  if (build.logo) compositeLogo(raster, build.logo, build.matrix.size, current.margin);
  return raster;
}

// Element ids end up in the document, not just the file, so two codes inlined
// on one page must not share them. Deriving the prefix from the payload and
// style keeps clip paths and gradients separate per code.
function idPrefixFor(current: Resolved): string {
  return `bq${hash(current.data + current.dotStyle + current.size + JSON.stringify(current.logo?.size ?? 0))}`;
}

function result(
  current: Resolved,
  build: Build,
  asset: LogoAsset | null,
  report: VerifyReport | null,
  repairs: Repair[],
): QRResult {
  const idPrefix = idPrefixFor(current);

  const toSVG = () =>
    renderSvg(build.geometry, {
      size: current.size,
      margin: current.margin,
      fills: {
        dot: current.dotColor,
        "corner-square": current.cornerSquareColor,
        "corner-dot": current.cornerDotColor,
      },
      background: current.background,
      idPrefix,
      ...(build.logo ? { embed: logoSvg(build.logo, current.margin, idPrefix) } : {}),
    });

  const toPNG = async () => {
    if (asset && current.logo) assertRasterisableLogo(asset);
    return encodePng(paint(current, build, current.size));
  };

  return {
    verified: report ? passes(report) : false,
    repairs,
    report,
    options: current,
    matrix: build.matrix,
    toSVG,
    toPNG,
    async toDataURL(format = "png") {
      if (format === "svg") {
        return `data:image/svg+xml;base64,${base64(new TextEncoder().encode(toSVG()))}`;
      }
      return `data:image/png;base64,${base64(await toPNG())}`;
    },
    async save(path: string) {
      const fs = await nodeFs();
      if (!fs) throw new Error("save() needs Node — use toPNG() or toSVG() elsewhere");

      if (path.toLowerCase().endsWith(".svg")) {
        await fs.writeFile(path, toSVG());
        return;
      }
      await fs.writeFile(path, await toPNG());
    },
  };
}

function assertRasterisableLogo(asset: LogoAsset): void {
  if (asset.dataUri.startsWith("data:image/png") || asset.dataUri.startsWith("data:image/jpeg")) {
    return;
  }
  if (asset.bitmap.width > 0) return;
  throw new Error(
    "this logo format can only be embedded in SVG output — supply a PNG for raster export",
  );
}

function resolvePreset(name: string | undefined): PresetOptions | null {
  if (!name) return null;
  const preset = presets[name];
  if (!preset) {
    throw new Error(`unknown preset "${name}" — available: ${Object.keys(presets).join(", ")}`);
  }
  return preset;
}

async function nodeFs(): Promise<{
  writeFile(p: string, data: string | Uint8Array): Promise<void>;
} | null> {
  if (typeof process === "undefined" || !process.versions?.node) return null;
  try {
    const specifier = "node:fs/promises";
    return (await import(/* @vite-ignore */ specifier)) as {
      writeFile(p: string, data: string | Uint8Array): Promise<void>;
    };
  } catch {
    return null;
  }
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
