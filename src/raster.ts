import { createSampler, parseColor } from "./color.js";
import type { Box, RGBA, Sampler } from "./color.js";
import type { Geometry, Primitive, Shape, ShapeRole } from "./geometry.js";
import type { Fill } from "./types.js";

export interface RasterOptions {
  size: number;
  margin: number;
  fills: Record<ShapeRole, Fill>;
  background: Fill | "transparent";
}

export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const ROLES: ShapeRole[] = ["dot", "corner-square", "corner-dot"];

export function rasterize(geometry: Geometry, options: RasterOptions): Raster {
  const extent = geometry.modules + options.margin * 2;
  const size = Math.max(1, Math.round(options.size));
  const scale = size / extent;
  const offset = options.margin * scale;

  const raster: Raster = {
    width: size,
    height: size,
    data: new Uint8ClampedArray(size * size * 4),
  };

  if (options.background !== "transparent") {
    paintBackground(raster, options.background);
  }

  for (const role of ROLES) {
    const shapes = geometry.shapes.filter((s) => s.role === role);
    if (shapes.length === 0) continue;

    const box = pixelBounds(shapes, scale, offset);
    const sampler = createSampler(options.fills[role], box);
    for (const shape of shapes) paintShape(raster, shape, scale, offset, sampler);
  }

  return raster;
}

function paintBackground(raster: Raster, fill: Fill): void {
  const box: Box = { x: 0, y: 0, w: raster.width, h: raster.height };
  const sampler = createSampler(fill, box);

  for (let y = 0; y < raster.height; y++) {
    for (let x = 0; x < raster.width; x++) {
      blend(raster, x, y, sampler(x + 0.5, y + 0.5), 1);
    }
  }
}

function paintShape(
  raster: Raster,
  shape: Shape,
  scale: number,
  offset: number,
  sampler: Sampler,
): void {
  const bounds = primitiveBounds(shape.outer, scale, offset);
  const minX = Math.max(0, Math.floor(bounds.x - 1));
  const minY = Math.max(0, Math.floor(bounds.y - 1));
  const maxX = Math.min(raster.width - 1, Math.ceil(bounds.x + bounds.w + 1));
  const maxY = Math.min(raster.height - 1, Math.ceil(bounds.y + bounds.h + 1));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let coverage = cover(shape.outer, px, py, scale, offset);
      if (coverage <= 0) continue;
      if (shape.hole) coverage -= cover(shape.hole, px, py, scale, offset);
      if (coverage <= 0) continue;
      blend(raster, x, y, sampler(px, py), Math.min(1, coverage));
    }
  }
}

function cover(p: Primitive, px: number, py: number, scale: number, offset: number): number {
  const d = distance(p, px, py, scale, offset);
  return Math.min(1, Math.max(0, 0.5 - d));
}

function distance(p: Primitive, px: number, py: number, scale: number, offset: number): number {
  if (p.kind === "circle") {
    const cx = p.cx * scale + offset;
    const cy = p.cy * scale + offset;
    return Math.hypot(px - cx, py - cy) - p.radius * scale;
  }

  const x = p.x * scale + offset;
  const y = p.y * scale + offset;
  const w = p.w * scale;
  const h = p.h * scale;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const cap = Math.min(w, h) / 2;

  const [tl, tr, br, bl] = p.r.map((v) => Math.min(Math.max(v * scale, 0), cap));
  const r = px < cx ? (py < cy ? tl! : bl!) : py < cy ? tr! : br!;

  const qx = Math.abs(px - cx) - (w / 2 - r);
  const qy = Math.abs(py - cy) - (h / 2 - r);

  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function primitiveBounds(p: Primitive, scale: number, offset: number): Box {
  if (p.kind === "circle") {
    return {
      x: (p.cx - p.radius) * scale + offset,
      y: (p.cy - p.radius) * scale + offset,
      w: p.radius * 2 * scale,
      h: p.radius * 2 * scale,
    };
  }
  return { x: p.x * scale + offset, y: p.y * scale + offset, w: p.w * scale, h: p.h * scale };
}

function pixelBounds(shapes: Shape[], scale: number, offset: number): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const shape of shapes) {
    const b = primitiveBounds(shape.outer, scale, offset);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function blend(raster: Raster, x: number, y: number, color: RGBA, coverage: number): void {
  const alpha = color.a * coverage;
  if (alpha <= 0) return;

  const i = (y * raster.width + x) * 4;
  const data = raster.data;
  const dstA = data[i + 3]! / 255;
  const outA = alpha + dstA * (1 - alpha);
  if (outA <= 0) return;

  const mix = (src: number, dst: number) => (src * alpha + dst * dstA * (1 - alpha)) / outA;

  data[i] = mix(color.r, data[i]!);
  data[i + 1] = mix(color.g, data[i + 1]!);
  data[i + 2] = mix(color.b, data[i + 2]!);
  data[i + 3] = outA * 255;
}

export function flattenOnto(raster: Raster, background: string): Raster {
  const onto = parseColor(background);
  const data = new Uint8ClampedArray(raster.data.length);

  for (let i = 0; i < raster.data.length; i += 4) {
    const a = raster.data[i + 3]! / 255;
    data[i] = raster.data[i]! * a + onto.r * (1 - a);
    data[i + 1] = raster.data[i + 1]! * a + onto.g * (1 - a);
    data[i + 2] = raster.data[i + 2]! * a + onto.b * (1 - a);
    data[i + 3] = 255;
  }

  return { width: raster.width, height: raster.height, data };
}
