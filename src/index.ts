import { generate } from "./generate.js";
import * as data from "./data.js";

export const QRCode = {
  generate,
  url: data.url,
  wifi: data.wifi,
  email: data.email,
  sms: data.sms,
  phone: data.phone,
  geo: data.geo,
  vcard: data.vcard,
};

export { generate };
export type { QRResult } from "./generate.js";

export { presets, presetNames } from "./presets.js";
export type { PresetName } from "./presets.js";

export { resolveOptions, ECC_ORDER } from "./options.js";
export type { QROptions, PresetOptions, Resolved, VerifyOptions } from "./options.js";

export { nextRepair, STRATEGIES, contrastOf } from "./repair.js";
export type { Repair, Attempt } from "./repair.js";

export { url, wifi, email, sms, phone, geo, vcard } from "./data.js";
export type { WifiInput, EmailInput, SmsInput, GeoInput, VCardInput } from "./data.js";

export { buildMatrix, finderAt, finderOrigins, FINDER_SPAN } from "./matrix.js";
export type { FinderCorner, FinderHit } from "./matrix.js";

export { buildGeometry, finderCells } from "./geometry.js";
export type { Geometry, GeometryOptions, Primitive, Radii, Shape, ShapeRole } from "./geometry.js";

export { renderSvg, escapeAttr } from "./svg.js";
export type { SvgOptions } from "./svg.js";

export { rasterize, flattenOnto } from "./raster.js";
export type { Raster, RasterOptions } from "./raster.js";

export { parseColor, contrastRatio, relativeLuminance, averageFill, flatten } from "./color.js";
export type { RGBA, Box, Sampler } from "./color.js";

export { verify } from "./verify.js";
export type { VerifyReport, VerifyInput, Survival, Decoder, DegradationAxis } from "./verify.js";

export { blur, downscale, reduceContrast, rotate } from "./degrade.js";
export { encodePng } from "./png.js";

export {
  prepareLogo,
  placeLogo,
  occlusionMask,
  coverageOf,
  logoSvg,
  compositeLogo,
  loadLogoAsset,
  attachLogo,
} from "./logo.js";
export type { LogoOptions, LogoShape, Placement, PreparedLogo, LogoAsset } from "./logo.js";

export { loadImage, decodePng, isBitmap, readBytes } from "./image.js";
export type { Bitmap, ImageSource } from "./image.js";

export type {
  ErrorCorrection,
  DotStyle,
  CornerSquareStyle,
  CornerDotStyle,
  Gradient,
  Fill,
  QRMatrix,
} from "./types.js";

export default QRCode;
