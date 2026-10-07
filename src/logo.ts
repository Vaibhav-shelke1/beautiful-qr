import { encodePng } from "./png.js";
import { escapeAttr } from "./svg.js";
import { loadImage, readBytes } from "./image.js";
import type { Bitmap, ImageSource } from "./image.js";
import type { Raster } from "./raster.js";
import { parseColor } from "./color.js";

export type LogoShape = "none" | "square" | "rounded" | "circle";

export interface LogoOptions {
  src: ImageSource;
  size?: number;
  padding?: number;
  shape?: LogoShape;
  background?: string;
  hideDots?: boolean;
}

export interface Placement {
  x: number;
  y: number;
  size: number;
  padding: number;
  shape: LogoShape;
  background?: string;
  hideDots: boolean;
}

export interface PreparedLogo {
  bitmap: Bitmap;
  dataUri: string;
  placement: Placement;
  coverage: number;
}

const DEFAULTS = { size: 0.2, padding: 0.5, shape: "square" as LogoShape, hideDots: true };

export function placeLogo(options: LogoOptions, modules: number): Placement {
  const fraction = clamp(options.size ?? DEFAULTS.size, 0.05, 0.6);
  const size = modules * fraction;

  return {
    x: (modules - size) / 2,
    y: (modules - size) / 2,
    size,
    padding: Math.max(0, options.padding ?? DEFAULTS.padding),
    shape: options.shape ?? DEFAULTS.shape,
    ...(options.background === undefined ? {} : { background: options.background }),
    hideDots: options.hideDots ?? DEFAULTS.hideDots,
  };
}

export function occlusionMask(placement: Placement): (x: number, y: number) => boolean {
  if (!placement.hideDots) return () => false;

  const pad = placement.padding;
  const left = placement.x - pad;
  const top = placement.y - pad;
  const right = placement.x + placement.size + pad;
  const bottom = placement.y + placement.size + pad;

  return (x, y) => {
    const cx = x + 0.5;
    const cy = y + 0.5;
    return cx >= left && cx <= right && cy >= top && cy <= bottom;
  };
}

export function coverageOf(placement: Placement, modules: number): number {
  const inside = occlusionMask({ ...placement, hideDots: true });
  let hidden = 0;
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) if (inside(x, y)) hidden++;
  }
  return hidden / (modules * modules);
}

export interface LogoAsset {
  bitmap: Bitmap;
  dataUri: string;
}

export async function loadLogoAsset(src: ImageSource): Promise<LogoAsset> {
  const bitmap = await loadImage(src);
  return { bitmap, dataUri: await toDataUri(src, bitmap) };
}

export function attachLogo(
  asset: LogoAsset,
  options: LogoOptions,
  modules: number,
): PreparedLogo {
  const placement = placeLogo(options, modules);
  return { ...asset, placement, coverage: coverageOf(placement, modules) };
}

export async function prepareLogo(options: LogoOptions, modules: number): Promise<PreparedLogo> {
  return attachLogo(await loadLogoAsset(options.src), options, modules);
}

async function toDataUri(source: ImageSource, bitmap: Bitmap): Promise<string> {
  if (typeof source === "string" && source.startsWith("data:")) return source;

  const bytes =
    typeof source === "string"
      ? await readBytes(source)
      : source instanceof Uint8Array
        ? source
        : source instanceof ArrayBuffer
          ? new Uint8Array(source)
          : await encodePng(bitmap);

  return `data:${sniffMime(bytes)};base64,${base64(bytes)}`;
}

function sniffMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x3c || (bytes[0] === 0xef && bytes[3] === 0x3c)) return "image/svg+xml";
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  return "application/octet-stream";
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function logoSvg(logo: PreparedLogo, margin: number, idPrefix: string): string {
  const { placement, dataUri } = logo;
  const pad = placement.padding;
  const x = placement.x + margin;
  const y = placement.y + margin;
  const plateX = x - pad;
  const plateY = y - pad;
  const plateSize = placement.size + pad * 2;
  const parts: string[] = [];

  if (placement.background) {
    parts.push(plate(placement.shape, plateX, plateY, plateSize, placement.background));
  }

  const clipId = `${idPrefix}-logo-clip`;
  const clipped = placement.shape === "circle" || placement.shape === "rounded";

  if (clipped) {
    const inner =
      placement.shape === "circle"
        ? `<circle cx="${x + placement.size / 2}" cy="${y + placement.size / 2}" r="${placement.size / 2}"/>`
        : `<rect x="${x}" y="${y}" width="${placement.size}" height="${placement.size}" rx="${placement.size * 0.18}"/>`;
    parts.push(`<defs><clipPath id="${clipId}">${inner}</clipPath></defs>`);
  }

  parts.push(
    `<image href="${escapeAttr(dataUri)}" x="${x}" y="${y}"` +
      ` width="${placement.size}" height="${placement.size}"` +
      ` preserveAspectRatio="xMidYMid meet"${clipped ? ` clip-path="url(#${clipId})"` : ""}/>`,
  );

  return parts.join("");
}

function plate(shape: LogoShape, x: number, y: number, size: number, fill: string): string {
  const color = escapeAttr(fill);
  if (shape === "circle") {
    return `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 2}" fill="${color}"/>`;
  }
  const rx = shape === "rounded" ? size * 0.18 : 0;
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${rx}" fill="${color}"/>`;
}

export function compositeLogo(
  raster: Raster,
  logo: PreparedLogo,
  modules: number,
  margin: number,
): void {
  const extent = modules + margin * 2;
  const scale = raster.width / extent;
  const { placement, bitmap } = logo;
  const pad = placement.padding;

  if (placement.background) {
    fillShape(
      raster,
      (placement.x - pad + margin) * scale,
      (placement.y - pad + margin) * scale,
      (placement.size + pad * 2) * scale,
      placement.shape,
      placement.background,
    );
  }

  const x0 = (placement.x + margin) * scale;
  const y0 = (placement.y + margin) * scale;
  const box = placement.size * scale;
  const ratio = Math.min(box / bitmap.width, box / bitmap.height);
  const drawW = bitmap.width * ratio;
  const drawH = bitmap.height * ratio;
  const offsetX = x0 + (box - drawW) / 2;
  const offsetY = y0 + (box - drawH) / 2;

  for (let py = Math.floor(offsetY); py < Math.ceil(offsetY + drawH); py++) {
    for (let px = Math.floor(offsetX); px < Math.ceil(offsetX + drawW); px++) {
      if (px < 0 || py < 0 || px >= raster.width || py >= raster.height) continue;
      if (!insideShape(px + 0.5, py + 0.5, x0, y0, box, placement.shape)) continue;

      const sx = Math.floor(((px + 0.5 - offsetX) / drawW) * bitmap.width);
      const sy = Math.floor(((py + 0.5 - offsetY) / drawH) * bitmap.height);
      if (sx < 0 || sy < 0 || sx >= bitmap.width || sy >= bitmap.height) continue;

      const s = (sy * bitmap.width + sx) * 4;
      const alpha = bitmap.data[s + 3]! / 255;
      if (alpha <= 0) continue;

      const d = (py * raster.width + px) * 4;
      for (let c = 0; c < 3; c++) {
        raster.data[d + c] = bitmap.data[s + c]! * alpha + raster.data[d + c]! * (1 - alpha);
      }
      raster.data[d + 3] = Math.max(raster.data[d + 3]!, alpha * 255);
    }
  }
}

function fillShape(
  raster: Raster,
  x: number,
  y: number,
  size: number,
  shape: LogoShape,
  color: string,
): void {
  const rgba = parseColor(color);

  for (let py = Math.floor(y); py < Math.ceil(y + size); py++) {
    for (let px = Math.floor(x); px < Math.ceil(x + size); px++) {
      if (px < 0 || py < 0 || px >= raster.width || py >= raster.height) continue;
      if (!insideShape(px + 0.5, py + 0.5, x, y, size, shape)) continue;

      const d = (py * raster.width + px) * 4;
      raster.data[d] = rgba.r;
      raster.data[d + 1] = rgba.g;
      raster.data[d + 2] = rgba.b;
      raster.data[d + 3] = rgba.a * 255;
    }
  }
}

function insideShape(
  px: number,
  py: number,
  x: number,
  y: number,
  size: number,
  shape: LogoShape,
): boolean {
  if (shape === "circle") {
    return Math.hypot(px - (x + size / 2), py - (y + size / 2)) <= size / 2;
  }
  return px >= x && py >= y && px <= x + size && py <= y + size;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
