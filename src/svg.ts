import type { Geometry, Primitive, Radii, Shape, ShapeRole } from "./geometry.js";
import type { Fill, Gradient } from "./types.js";

export interface SvgOptions {
  size: number;
  margin: number;
  fills: Record<ShapeRole, Fill>;
  background: Fill | "transparent";
  idPrefix?: string;
  embed?: string;
}

export function renderSvg(geometry: Geometry, options: SvgOptions): string {
  const extent = geometry.modules + options.margin * 2;
  const prefix = options.idPrefix ?? "bq";
  const defs: string[] = [];
  const resolve = (fill: Fill) => resolveFill(fill, prefix, defs);

  const body: string[] = [];

  if (options.background !== "transparent") {
    body.push(
      `<rect width="${n(extent)}" height="${n(extent)}" fill="${resolve(options.background)}"/>`,
    );
  }

  for (const role of ["dot", "corner-square", "corner-dot"] as const) {
    const d = pathFor(geometry.shapes, role, options.margin);
    if (!d) continue;
    body.push(`<path d="${d}" fill="${resolve(options.fills[role])}" fill-rule="evenodd"/>`);
  }

  if (options.embed) body.push(options.embed);

  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(options.size)}" height="${n(options.size)}"` +
    ` viewBox="0 0 ${n(extent)} ${n(extent)}" shape-rendering="geometricPrecision">`;
  const defsBlock = defs.length ? `<defs>${defs.join("")}</defs>` : "";

  return `${head}${defsBlock}${body.join("")}</svg>`;
}

function pathFor(shapes: Shape[], role: ShapeRole, margin: number): string {
  let d = "";
  for (const shape of shapes) {
    if (shape.role !== role) continue;
    d += primitivePath(shape.outer, margin);
    if (shape.hole) d += primitivePath(shape.hole, margin);
  }
  return d;
}

function primitivePath(p: Primitive, margin: number): string {
  if (p.kind === "circle") return circlePath(p.cx + margin, p.cy + margin, p.radius);
  return rectPath(p.x + margin, p.y + margin, p.w, p.h, p.r);
}

function rectPath(x: number, y: number, w: number, h: number, radii: Radii): string {
  const cap = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = radii.map((v) => Math.min(Math.max(v, 0), cap)) as Radii;

  if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
    return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
  }

  const arc = (r: number, ex: number, ey: number) => `A${n(r)} ${n(r)} 0 0 1 ${n(ex)} ${n(ey)}`;

  return (
    `M${n(x + tl)} ${n(y)}` +
    `L${n(x + w - tr)} ${n(y)}${tr ? arc(tr, x + w, y + tr) : ""}` +
    `L${n(x + w)} ${n(y + h - br)}${br ? arc(br, x + w - br, y + h) : ""}` +
    `L${n(x + bl)} ${n(y + h)}${bl ? arc(bl, x, y + h - bl) : ""}` +
    `L${n(x)} ${n(y + tl)}${tl ? arc(tl, x + tl, y) : ""}` +
    "Z"
  );
}

function circlePath(cx: number, cy: number, r: number): string {
  return (
    `M${n(cx - r)} ${n(cy)}` +
    `a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0` +
    `a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0Z`
  );
}

function resolveFill(fill: Fill, prefix: string, defs: string[]): string {
  if (typeof fill === "string") return escapeAttr(fill);

  const id = `${prefix}-${hash(JSON.stringify(fill))}`;
  if (!defs.some((d) => d.includes(`id="${id}"`))) defs.push(gradientDef(fill, id));
  return `url(#${id})`;
}

function gradientDef(g: Gradient, id: string): string {
  const colors = g.colors.length >= 2 ? g.colors : [g.colors[0] ?? "#000", g.colors[0] ?? "#000"];
  const stops = colors
    .map((c, i) => {
      const offset = colors.length === 1 ? 0 : i / (colors.length - 1);
      return `<stop offset="${n(offset)}" stop-color="${escapeAttr(c)}"/>`;
    })
    .join("");

  if (g.type === "radial") {
    return `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient>`;
  }

  const rad = ((g.rotation ?? 0) * Math.PI) / 180;
  const dx = Math.cos(rad) / 2;
  const dy = Math.sin(rad) / 2;
  return (
    `<linearGradient id="${id}" x1="${n(0.5 - dx)}" y1="${n(0.5 - dy)}"` +
    ` x2="${n(0.5 + dx)}" y2="${n(0.5 + dy)}">${stops}</linearGradient>`
  );
}

export function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function n(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
