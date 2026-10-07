import type { ImageSource } from "./image.js";
import type { LogoOptions } from "./logo.js";
import type {
  CornerDotStyle,
  CornerSquareStyle,
  DotStyle,
  ErrorCorrection,
  Fill,
} from "./types.js";

export interface VerifyOptions {
  ladder?: boolean;
  repair?: boolean;
}

export interface QROptions {
  data: string;
  size?: number;
  margin?: number;
  preset?: string;
  qr?: { errorCorrection?: ErrorCorrection };
  dots?: { style?: DotStyle; color?: Fill };
  corners?: {
    square?: { style?: CornerSquareStyle; color?: Fill };
    dot?: { style?: CornerDotStyle; color?: Fill };
  };
  background?: { color?: Fill | "transparent" };
  logo?: LogoOptions | ImageSource;
  verify?: boolean | VerifyOptions;
}

export type PresetOptions = Omit<QROptions, "data" | "preset" | "logo"> & {
  logo?: Omit<LogoOptions, "src">;
};

export interface Resolved {
  data: string;
  size: number;
  margin: number;
  errorCorrection: ErrorCorrection;
  dotStyle: DotStyle;
  dotColor: Fill;
  cornerSquareStyle: CornerSquareStyle;
  cornerSquareColor: Fill;
  cornerDotStyle: CornerDotStyle;
  cornerDotColor: Fill;
  background: Fill | "transparent";
  logo: LogoOptions | null;
  verify: { enabled: boolean; ladder: boolean; repair: boolean };
}

export const ECC_ORDER: ErrorCorrection[] = ["L", "M", "Q", "H"];

export function resolveOptions(options: QROptions, preset: PresetOptions | null): Resolved {
  if (typeof options.data !== "string" || options.data.length === 0) {
    throw new Error("data is required and must be a non-empty string");
  }

  const merged = preset ? mergePreset(options, preset) : options;
  const dotColor = merged.dots?.color ?? "#000000";
  const verify = normaliseVerify(merged.verify);

  return {
    data: options.data,
    size: merged.size ?? 512,
    margin: merged.margin ?? 4,
    errorCorrection: merged.qr?.errorCorrection ?? (merged.logo ? "H" : "M"),
    dotStyle: merged.dots?.style ?? "square",
    dotColor,
    cornerSquareStyle: merged.corners?.square?.style ?? "square",
    cornerSquareColor: merged.corners?.square?.color ?? dotColor,
    cornerDotStyle: merged.corners?.dot?.style ?? "square",
    cornerDotColor: merged.corners?.dot?.color ?? dotColor,
    background: merged.background?.color ?? "#FFFFFF",
    logo: normaliseLogo(merged.logo),
    verify,
  };
}

function mergePreset(options: QROptions, preset: PresetOptions): QROptions {
  return {
    ...preset,
    ...options,
    qr: { ...preset.qr, ...options.qr },
    dots: { ...preset.dots, ...options.dots },
    corners: {
      square: { ...preset.corners?.square, ...options.corners?.square },
      dot: { ...preset.corners?.dot, ...options.corners?.dot },
    },
    background: { ...preset.background, ...options.background },
    logo: mergeLogo(options.logo, preset.logo),
  };
}

function mergeLogo(
  logo: QROptions["logo"],
  presetLogo: PresetOptions["logo"],
): QROptions["logo"] {
  if (!logo) return undefined;
  if (!presetLogo) return logo;
  const asOptions = isLogoOptions(logo) ? logo : { src: logo };
  return { ...presetLogo, ...asOptions };
}

function normaliseLogo(logo: QROptions["logo"]): LogoOptions | null {
  if (!logo) return null;
  return isLogoOptions(logo) ? logo : { src: logo };
}

function isLogoOptions(value: NonNullable<QROptions["logo"]>): value is LogoOptions {
  return typeof value === "object" && value !== null && "src" in value;
}

function normaliseVerify(verify: QROptions["verify"]): Resolved["verify"] {
  if (verify === false) return { enabled: false, ladder: false, repair: false };
  if (verify === true || verify === undefined) {
    return { enabled: true, ladder: true, repair: true };
  }
  return {
    enabled: true,
    ladder: verify.ladder ?? true,
    repair: verify.repair ?? true,
  };
}
