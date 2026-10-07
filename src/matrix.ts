import encodeQR from "qr";
import type { ErrorCorrection, QRMatrix } from "./types.js";

const ECC_NAMES = {
  L: "low",
  M: "medium",
  Q: "quartile",
  H: "high",
} as const;

const FINDER_SPAN = 7;

// qr always pads the raw grid by `border` modules and rejects a border of 0,
// so the smallest pad is requested and stripped here. Quiet zone is the
// renderer's job, not the encoder's.
const ENCODER_BORDER = 1;

export function buildMatrix(data: string, errorCorrection: ErrorCorrection): QRMatrix {
  if (data.length === 0) throw new Error("data must not be empty");

  const grid = encodeQR(data, "raw", {
    ecc: ECC_NAMES[errorCorrection],
    border: ENCODER_BORDER,
  });
  const size = grid.length - ENCODER_BORDER * 2;

  return {
    size,
    errorCorrection,
    get(x, y) {
      if (x < 0 || y < 0 || x >= size || y >= size) return false;
      return grid[y + ENCODER_BORDER]![x + ENCODER_BORDER]!;
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
