import { describe, expect, it } from "vitest";
import decodeQR from "qr/decode.js";
import { buildGeometry } from "../src/geometry.js";
import { buildMatrix } from "../src/matrix.js";
import { rasterize } from "../src/raster.js";
import { verify } from "../src/verify.js";
import type { Decoder } from "../src/verify.js";
import { blur, downscale, reduceContrast, rotate } from "../src/degrade.js";
import type { DotStyle } from "../src/types.js";

const PAYLOAD = "https://example.com/verify";
const MARGIN = 4;

const decode: Decoder = (image) => {
  try {
    return decodeQR(image as ImageData);
  } catch {
    return null;
  }
};

function build(dotStyle: DotStyle = "square", pxPerModule = 8, data = PAYLOAD) {
  const matrix = buildMatrix(data, "H");
  const geometry = buildGeometry(matrix, {
    dotStyle,
    cornerSquareStyle: "square",
    cornerDotStyle: "square",
  });
  const extent = matrix.size + MARGIN * 2;
  const raster = rasterize(geometry, {
    size: extent * pxPerModule,
    margin: MARGIN,
    fills: { dot: "#000000", "corner-square": "#000000", "corner-dot": "#000000" },
    background: "#FFFFFF",
  });
  return { raster, modules: matrix.size, margin: MARGIN };
}

describe("degradation primitives", () => {
  const { raster } = build();

  it("downscales to the requested factor", () => {
    const out = downscale(raster, 0.5);
    expect(out.width).toBe(Math.round(raster.width * 0.5));
  });

  it("returns the same raster for a no-op downscale", () => {
    expect(downscale(raster, 1)).toBe(raster);
  });

  it("softens hard edges when blurring", () => {
    const sharp = countMidtones(raster);
    expect(countMidtones(blur(raster, 3))).toBeGreaterThan(sharp);
  });

  it("pulls values toward mid grey when reducing contrast", () => {
    const out = reduceContrast(raster, 0.5);
    expect(out.data[0]).toBe(192);
  });

  it("grows the canvas when rotating", () => {
    expect(rotate(raster, 25).width).toBeGreaterThan(raster.width);
  });

  it("leaves the raster untouched at zero rotation", () => {
    expect(rotate(raster, 0)).toBe(raster);
  });
});

function countMidtones(r: { data: Uint8ClampedArray }): number {
  let n = 0;
  for (let i = 0; i < r.data.length; i += 4) {
    const v = r.data[i]!;
    if (v > 40 && v < 215) n++;
  }
  return n;
}

describe("verify", () => {
  it("reports a clean render as decoding", () => {
    const { raster, modules, margin } = build();
    const report = verify({ raster, expected: PAYLOAD, modules, margin, decode });
    expect(report.decodes).toBe(true);
  });

  it("reports a mismatched payload as not decoding", () => {
    const { raster, modules, margin } = build();
    const report = verify({ raster, expected: "something else", modules, margin, decode });
    expect(report.decodes).toBe(false);
    expect(report.estimatedMinPrintSize).toBeNull();
  });

  it("computes pixels per module from the raster and quiet zone", () => {
    const { raster, modules, margin } = build("square", 8);
    const report = verify({ raster, expected: PAYLOAD, modules, margin, decode });
    expect(report.pxPerModule).toBeCloseTo(8, 5);
  });

  it("skips the ladder when disabled", () => {
    const { raster, modules, margin } = build();
    const report = verify({ raster, expected: PAYLOAD, modules, margin, decode, ladder: false });
    expect(report.decodes).toBe(true);
    expect(report.survives).toBeNull();
  });

  it("survives some downscaling and reports it", () => {
    const { raster, modules, margin } = build("square", 10);
    const report = verify({ raster, expected: PAYLOAD, modules, margin, decode });
    expect(report.survives!.scale).toBeLessThan(1);
    expect(report.survives!.scale).toBeGreaterThanOrEqual(0.25);
  });

  it("estimates a print size in a physically plausible range", () => {
    const { raster, modules, margin } = build("square", 10);
    const report = verify({ raster, expected: PAYLOAD, modules, margin, decode });
    const { cm, in: inches } = report.estimatedMinPrintSize!;
    expect(cm).toBeGreaterThan(1);
    expect(cm).toBeLessThan(15);
    expect(inches).toBeCloseTo(cm / 2.54, 1);
  });

  it("names the weakest axis", () => {
    const { raster, modules, margin } = build("square", 10);
    const report = verify({ raster, expected: PAYLOAD, modules, margin, decode });
    expect(["resolution", "blur", "contrast", "rotation"]).toContain(report.weakest);
  });

  it("rates round dots no more robust than square dots at the same size", () => {
    const square = build("square", 10);
    const dots = build("dot", 10);
    const a = verify({ ...square, expected: PAYLOAD, decode });
    const b = verify({ ...dots, expected: PAYLOAD, decode });
    expect(b.estimatedMinPrintSize!.cm).toBeGreaterThanOrEqual(a.estimatedMinPrintSize!.cm);
  });

  it("needs a larger print for a denser payload", () => {
    const small = build("square", 10, "https://a.co");
    const large = build("square", 10, "https://example.com/?q=" + "x".repeat(400));
    const a = verify({ ...small, expected: "https://a.co", decode });
    const b = verify({ ...large, expected: "https://example.com/?q=" + "x".repeat(400), decode });
    expect(b.estimatedMinPrintSize!.cm).toBeGreaterThan(a.estimatedMinPrintSize!.cm);
  });
});
