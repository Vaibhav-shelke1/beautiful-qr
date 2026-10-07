export type ErrorCorrection = "L" | "M" | "Q" | "H";

export type DotStyle =
  | "square"
  | "dot"
  | "rounded"
  | "extra-rounded"
  | "classy"
  | "classy-rounded";

export type CornerSquareStyle = "square" | "rounded" | "extra-rounded" | "dot";

export type CornerDotStyle = "square" | "dot" | "rounded";

export interface Gradient {
  type: "linear" | "radial";
  colors: string[];
  rotation?: number;
}

export type Fill = string | Gradient;

export interface QRMatrix {
  size: number;
  get(x: number, y: number): boolean;
  isReserved(x: number, y: number): boolean;
  errorCorrection: ErrorCorrection;
}
