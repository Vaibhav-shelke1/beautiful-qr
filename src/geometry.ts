import { FINDER_SPAN, finderAt, finderOrigins } from "./matrix.js";
import type { CornerDotStyle, CornerSquareStyle, DotStyle, QRMatrix } from "./types.js";

export type ShapeRole = "dot" | "corner-square" | "corner-dot";

export type Primitive =
  | { kind: "rect"; x: number; y: number; w: number; h: number; r: Radii }
  | { kind: "circle"; cx: number; cy: number; radius: number };

export type Radii = [tl: number, tr: number, br: number, bl: number];

export interface Shape {
  role: ShapeRole;
  outer: Primitive;
  hole?: Primitive;
}

export interface Geometry {
  modules: number;
  shapes: Shape[];
}

export interface GeometryOptions {
  dotStyle: DotStyle;
  cornerSquareStyle: CornerSquareStyle;
  cornerDotStyle: CornerDotStyle;
  occluded?: (x: number, y: number) => boolean;
}

const DOT_RADIUS: Record<DotStyle, number> = {
  square: 0,
  dot: 0,
  rounded: 0.35,
  "extra-rounded": 0.5,
  classy: 0.5,
  "classy-rounded": 0.5,
};

const CORNER_SQUARE_RADIUS: Record<CornerSquareStyle, number> = {
  square: 0,
  rounded: 1.5,
  "extra-rounded": 2.5,
  dot: 3.5,
};

const CORNER_DOT_RADIUS: Record<CornerDotStyle, number> = {
  square: 0,
  rounded: 0.75,
  dot: 1.5,
};

export function buildGeometry(m: QRMatrix, options: GeometryOptions): Geometry {
  const shapes: Shape[] = [];
  const occluded = options.occluded ?? (() => false);

  const isDark = (x: number, y: number) =>
    m.get(x, y) && !m.isReserved(x, y) && !occluded(x, y);

  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!isDark(x, y)) continue;
      shapes.push({ role: "dot", outer: dotPrimitive(x, y, options.dotStyle, isDark) });
    }
  }

  for (const { originX, originY } of finderOrigins(m.size)) {
    shapes.push(cornerSquare(originX, originY, options.cornerSquareStyle));
    shapes.push(cornerDot(originX, originY, options.cornerDotStyle));
  }

  return { modules: m.size, shapes };
}

function dotPrimitive(
  x: number,
  y: number,
  style: DotStyle,
  isDark: (x: number, y: number) => boolean,
): Primitive {
  if (style === "dot") return { kind: "circle", cx: x + 0.5, cy: y + 0.5, radius: 0.5 };

  return { kind: "rect", x, y, w: 1, h: 1, r: dotRadii(x, y, style, isDark) };
}

function dotRadii(
  x: number,
  y: number,
  style: DotStyle,
  isDark: (x: number, y: number) => boolean,
): Radii {
  const r = DOT_RADIUS[style];
  if (r === 0) return [0, 0, 0, 0];

  const up = isDark(x, y - 1);
  const down = isDark(x, y + 1);
  const left = isDark(x - 1, y);
  const right = isDark(x + 1, y);

  const free: Radii = [
    !up && !left ? r : 0,
    !up && !right ? r : 0,
    !down && !right ? r : 0,
    !down && !left ? r : 0,
  ];

  if (style === "classy") return [free[0], 0, free[2], 0];
  if (style === "classy-rounded") return [free[0], free[1] * 0.4, free[2], free[3] * 0.4];
  return free;
}

function cornerSquare(originX: number, originY: number, style: CornerSquareStyle): Shape {
  const r = CORNER_SQUARE_RADIUS[style];
  const span = FINDER_SPAN;

  if (style === "dot") {
    return {
      role: "corner-square",
      outer: { kind: "circle", cx: originX + span / 2, cy: originY + span / 2, radius: span / 2 },
      hole: {
        kind: "circle",
        cx: originX + span / 2,
        cy: originY + span / 2,
        radius: span / 2 - 1,
      },
    };
  }

  return {
    role: "corner-square",
    outer: { kind: "rect", x: originX, y: originY, w: span, h: span, r: [r, r, r, r] },
    hole: {
      kind: "rect",
      x: originX + 1,
      y: originY + 1,
      w: span - 2,
      h: span - 2,
      r: inset(r),
    },
  };
}

function cornerDot(originX: number, originY: number, style: CornerDotStyle): Shape {
  const x = originX + 2;
  const y = originY + 2;

  if (style === "dot") {
    return {
      role: "corner-dot",
      outer: { kind: "circle", cx: x + 1.5, cy: y + 1.5, radius: CORNER_DOT_RADIUS.dot },
    };
  }

  const r = CORNER_DOT_RADIUS[style];
  return { role: "corner-dot", outer: { kind: "rect", x, y, w: 3, h: 3, r: [r, r, r, r] } };
}

function inset(r: number): Radii {
  const v = Math.max(0, r - 1);
  return [v, v, v, v];
}

export function finderCells(size: number): (x: number, y: number) => boolean {
  return (x, y) => finderAt(x, y, size) !== null;
}
