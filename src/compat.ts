import { generate } from "./generate.js";
import type { QRResult } from "./generate.js";
import type { QROptions } from "./options.js";
import type { ImageSource } from "./image.js";
import type {
  CornerDotStyle,
  CornerSquareStyle,
  DotStyle,
  ErrorCorrection,
  Fill,
  Gradient,
} from "./types.js";

export interface StyledGradient {
  type?: "linear" | "radial";
  rotation?: number;
  colorStops: { offset: number; color: string }[];
}

export interface StyledOptions {
  width?: number;
  height?: number;
  type?: "canvas" | "svg";
  data?: string;
  image?: ImageSource;
  margin?: number;
  qrOptions?: { errorCorrectionLevel?: ErrorCorrection };
  imageOptions?: { imageSize?: number; margin?: number; hideBackgroundDots?: boolean };
  dotsOptions?: { color?: string; gradient?: StyledGradient; type?: string };
  cornersSquareOptions?: { color?: string; gradient?: StyledGradient; type?: string };
  cornersDotOptions?: { color?: string; gradient?: StyledGradient; type?: string };
  backgroundOptions?: { color?: string; gradient?: StyledGradient };
}

const DOT_TYPES: Record<string, DotStyle> = {
  square: "square",
  dots: "dot",
  dot: "dot",
  rounded: "rounded",
  "extra-rounded": "extra-rounded",
  classy: "classy",
  "classy-rounded": "classy-rounded",
};

const CORNER_SQUARE_TYPES: Record<string, CornerSquareStyle> = {
  square: "square",
  dot: "dot",
  dots: "dot",
  rounded: "rounded",
  "extra-rounded": "extra-rounded",
};

const CORNER_DOT_TYPES: Record<string, CornerDotStyle> = {
  square: "square",
  dot: "dot",
  dots: "dot",
  rounded: "rounded",
};

export function fromStyledOptions(options: StyledOptions): QROptions {
  if (!options.data) throw new Error("data is required");

  const dots = fill(options.dotsOptions);
  const next: QROptions = {
    data: options.data,
    size: options.width ?? options.height ?? 300,
    margin: modulesFromPixels(options.margin, options.width ?? options.height ?? 300),
    dots: {
      style: DOT_TYPES[options.dotsOptions?.type ?? "square"] ?? "square",
      ...(dots ? { color: dots } : {}),
    },
    corners: {
      square: {
        style: CORNER_SQUARE_TYPES[options.cornersSquareOptions?.type ?? "square"] ?? "square",
        ...pick("color", fill(options.cornersSquareOptions) ?? dots),
      },
      dot: {
        style: CORNER_DOT_TYPES[options.cornersDotOptions?.type ?? "square"] ?? "square",
        ...pick("color", fill(options.cornersDotOptions) ?? dots),
      },
    },
    background: { color: fill(options.backgroundOptions) ?? "#FFFFFF" },
  };

  if (options.qrOptions?.errorCorrectionLevel) {
    next.qr = { errorCorrection: options.qrOptions.errorCorrectionLevel };
  }

  if (options.image) {
    next.logo = {
      src: options.image,
      size: options.imageOptions?.imageSize ?? 0.4,
      padding: options.imageOptions?.margin ?? 0,
      hideDots: options.imageOptions?.hideBackgroundDots ?? true,
    };
  }

  return next;
}

function fill(source?: { color?: string; gradient?: StyledGradient }): Fill | undefined {
  if (!source) return undefined;
  if (source.gradient) return toGradient(source.gradient);
  return source.color;
}

function toGradient(gradient: StyledGradient): Gradient {
  const colors = [...gradient.colorStops]
    .sort((a, b) => a.offset - b.offset)
    .map((stop) => stop.color);

  return {
    type: gradient.type ?? "linear",
    colors: colors.length >= 2 ? colors : [colors[0] ?? "#000000", colors[0] ?? "#000000"],
    rotation: ((gradient.rotation ?? 0) * 180) / Math.PI,
  };
}

function pick(key: "color", value: Fill | undefined) {
  return value === undefined ? {} : { [key]: value };
}

function modulesFromPixels(margin: number | undefined, size: number): number {
  if (margin === undefined) return 4;
  if (margin === 0) return 0;
  return Math.max(1, Math.round((margin / size) * 40));
}

export class QRCodeStyling {
  private options: StyledOptions;
  private pending: Promise<QRResult> | null = null;

  constructor(options: StyledOptions = {}) {
    this.options = options;
  }

  update(options: StyledOptions): void {
    this.options = { ...this.options, ...options };
    this.pending = null;
  }

  result(): Promise<QRResult> {
    this.pending ??= generate(fromStyledOptions(this.options));
    return this.pending;
  }

  async append(container: { innerHTML: string } | null): Promise<void> {
    if (!container) throw new Error("append() needs a container element");
    container.innerHTML = (await this.result()).toSVG();
  }

  async getRawData(extension: "svg" | "png" = "png"): Promise<Uint8Array> {
    const qr = await this.result();
    if (extension === "svg") return new TextEncoder().encode(qr.toSVG());
    return qr.toPNG();
  }

  async download(options: { name?: string; extension?: "svg" | "png" } = {}): Promise<void> {
    const extension = options.extension ?? "png";
    const name = `${options.name ?? "qr"}.${extension}`;
    const bytes = await this.getRawData(extension);
    const type = extension === "svg" ? "image/svg+xml" : "image/png";

    if (typeof document === "undefined") {
      throw new Error("download() needs a browser — use getRawData() on the server");
    }

    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}

export default QRCodeStyling;
