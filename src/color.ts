import type { Fill, Gradient } from "./types.js";

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Sampler = (x: number, y: number) => RGBA;

const NAMED: Record<string, string> = {
  transparent: "#00000000",
  black: "#000000",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  white: "#ffffff",
  maroon: "#800000",
  red: "#ff0000",
  purple: "#800080",
  fuchsia: "#ff00ff",
  magenta: "#ff00ff",
  green: "#008000",
  lime: "#00ff00",
  olive: "#808000",
  yellow: "#ffff00",
  navy: "#000080",
  blue: "#0000ff",
  teal: "#008080",
  aqua: "#00ffff",
  cyan: "#00ffff",
  orange: "#ffa500",
};

export function parseColor(input: string): RGBA {
  const value = input.trim().toLowerCase();
  const named = NAMED[value];
  if (named) return parseColor(named);

  if (value.startsWith("#")) {
    const hex = value.slice(1);
    const expand = (c: string) => parseInt(c + c, 16);

    if (hex.length === 3 || hex.length === 4) {
      return {
        r: expand(hex[0]!),
        g: expand(hex[1]!),
        b: expand(hex[2]!),
        a: hex.length === 4 ? expand(hex[3]!) / 255 : 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      const pair = (i: number) => parseInt(hex.slice(i, i + 2), 16);
      if (/^[0-9a-f]+$/.test(hex)) {
        return {
          r: pair(0),
          g: pair(2),
          b: pair(4),
          a: hex.length === 8 ? pair(6) / 255 : 1,
        };
      }
    }
  }

  const fn = value.match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    const parts = fn[1]!.split(/[,\s/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const channel = (s: string) =>
        s.endsWith("%") ? (parseFloat(s) / 100) * 255 : parseFloat(s);
      const alpha = parts[3] === undefined ? 1 : parseFloat(parts[3]) * (parts[3].endsWith("%") ? 0.01 : 1);
      return {
        r: clampByte(channel(parts[0]!)),
        g: clampByte(channel(parts[1]!)),
        b: clampByte(channel(parts[2]!)),
        a: Math.min(1, Math.max(0, alpha)),
      };
    }
  }

  throw new Error(`unsupported color "${input}" — use a hex value such as #2563EB`);
}

export function createSampler(fill: Fill, box: Box): Sampler {
  if (typeof fill === "string") {
    const color = parseColor(fill);
    return () => color;
  }
  return gradientSampler(fill, box);
}

function gradientSampler(gradient: Gradient, box: Box): Sampler {
  const stops = gradient.colors.map(parseColor);
  if (stops.length === 0) throw new Error("gradient needs at least one color");
  if (stops.length === 1) return () => stops[0]!;

  const width = box.w || 1;
  const height = box.h || 1;

  if (gradient.type === "radial") {
    return (x, y) => {
      const u = (x - box.x) / width - 0.5;
      const v = (y - box.y) / height - 0.5;
      return interpolate(stops, Math.min(1, Math.hypot(u, v) / 0.5));
    };
  }

  const rad = ((gradient.rotation ?? 0) * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  return (x, y) => {
    const u = (x - box.x) / width - 0.5;
    const v = (y - box.y) / height - 0.5;
    return interpolate(stops, Math.min(1, Math.max(0, (u * dx + v * dy) + 0.5)));
  };
}

function interpolate(stops: RGBA[], t: number): RGBA {
  const span = (stops.length - 1) * Math.min(1, Math.max(0, t));
  const index = Math.min(stops.length - 2, Math.floor(span));
  const local = span - index;
  const from = stops[index]!;
  const to = stops[index + 1]!;

  return {
    r: from.r + (to.r - from.r) * local,
    g: from.g + (to.g - from.g) * local,
    b: from.b + (to.b - from.b) * local,
    a: from.a + (to.a - from.a) * local,
  };
}

export function relativeLuminance({ r, g, b }: RGBA): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: RGBA, b: RGBA): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function flatten(color: RGBA, onto: RGBA): RGBA {
  if (color.a >= 1) return color;
  const a = color.a;
  return {
    r: color.r * a + onto.r * (1 - a),
    g: color.g * a + onto.g * (1 - a),
    b: color.b * a + onto.b * (1 - a),
    a: 1,
  };
}

export function averageFill(fill: Fill): RGBA {
  if (typeof fill === "string") return parseColor(fill);
  const stops = fill.colors.map(parseColor);
  if (stops.length === 0) throw new Error("gradient needs at least one color");

  return stops.reduce(
    (acc, c, _i, all) => ({
      r: acc.r + c.r / all.length,
      g: acc.g + c.g / all.length,
      b: acc.b + c.b / all.length,
      a: acc.a + c.a / all.length,
    }),
    { r: 0, g: 0, b: 0, a: 0 },
  );
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}
