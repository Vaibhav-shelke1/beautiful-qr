export { buildMatrix, finderAt, finderOrigins, FINDER_SPAN } from "./matrix.js";
export type { FinderCorner, FinderHit } from "./matrix.js";
export { buildGeometry, finderCells } from "./geometry.js";
export { renderSvg, escapeAttr } from "./svg.js";
export type { SvgOptions } from "./svg.js";
export { rasterize, flattenOnto } from "./raster.js";
export type { Raster, RasterOptions } from "./raster.js";
export { parseColor, contrastRatio, relativeLuminance, averageFill, flatten } from "./color.js";
export type { RGBA, Box, Sampler } from "./color.js";
export type {
  Geometry,
  GeometryOptions,
  Primitive,
  Radii,
  Shape,
  ShapeRole,
} from "./geometry.js";
export type {
  ErrorCorrection,
  DotStyle,
  CornerSquareStyle,
  CornerDotStyle,
  Gradient,
  Fill,
  QRMatrix,
} from "./types.js";
