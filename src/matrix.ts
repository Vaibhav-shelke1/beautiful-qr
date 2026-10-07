import encodeQR from "qr";
import type { ErrorCorrection, QRMatrix } from "./types.js";

const ECC_NAMES = {
  L: "low",
  M: "medium",
  Q: "quartile",
  H: "high",
} as const;

const FINDER_SPAN = 7;

export function buildMatrix(data: string, errorCorrection: ErrorCorrection): QRMatrix {
  if (data.length === 0) throw new Error("data must not be empty");

  const grid = encodeQR(data, "raw", { ecc: ECC_NAMES[errorCorrection] });
  const size = grid.length;

  return {
    size,
    errorCorrection,
    get(x, y) {
      if (x < 0 || y < 0 || x >= size || y >= size) return false;
      return grid[y]![x]!;
    },
    isReserved(x, y) {
      return finderAt(x, y, size) !== null;
    },
  };
}

export type FinderCorner = "top-left" | "top-right" | "bottom-left";

export interface FinderHit {
  corner: FinderCorner;
  originX: number;
  originY: number;
}

export function finderAt(x: number, y: number, size: number): FinderHit | null {
  const last = size - FINDER_SPAN;
  const inSpan = (v: number, origin: number) => v >= origin && v < origin + FINDER_SPAN;

  if (inSpan(x, 0) && inSpan(y, 0)) return { corner: "top-left", originX: 0, originY: 0 };
  if (inSpan(x, last) && inSpan(y, 0)) return { corner: "top-right", originX: last, originY: 0 };
  if (inSpan(x, 0) && inSpan(y, last)) return { corner: "bottom-left", originX: 0, originY: last };
  return null;
}

export function finderOrigins(size: number): FinderHit[] {
  const last = size - FINDER_SPAN;
  return [
    { corner: "top-left", originX: 0, originY: 0 },
    { corner: "top-right", originX: last, originY: 0 },
    { corner: "bottom-left", originX: 0, originY: last },
  ];
}

export { FINDER_SPAN };
