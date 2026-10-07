export interface Bitmap {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type ImageSource = string | Uint8Array | ArrayBuffer | Bitmap;

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isBitmap(value: unknown): value is Bitmap {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Bitmap>;
  return (
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    candidate.data instanceof Uint8ClampedArray
  );
}

export async function loadImage(source: ImageSource): Promise<Bitmap> {
  if (isBitmap(source)) return source;
  if (source instanceof Uint8Array) return decodePng(source);
  if (source instanceof ArrayBuffer) return decodePng(new Uint8Array(source));
  return decodePng(await readBytes(source));
}

export async function readBytes(source: string): Promise<Uint8Array> {
  if (/^(data|https?):/.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`could not fetch logo: ${source} (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  }

  const fs = await nodeFs();
  if (!fs) {
    throw new Error(
      `cannot read "${source}" outside Node — pass image bytes, a data: URI, or an https URL`,
    );
  }
  return new Uint8Array(await fs.readFile(source));
}

async function nodeFs(): Promise<{ readFile(p: string): Promise<Uint8Array> } | null> {
  const isNode = typeof process !== "undefined" && process.versions?.node;
  if (!isNode) return null;
  try {
    const specifier = "node:fs/promises";
    return (await import(/* @vite-ignore */ specifier)) as { readFile(p: string): Promise<Uint8Array> };
  } catch {
    return null;
  }
}

export async function decodePng(bytes: Uint8Array): Promise<Bitmap> {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) {
      throw new Error("logo is not a PNG — convert it, or pass pre-decoded pixels");
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const idat: Uint8Array[] = [];
  let header: { width: number; height: number; depth: number; colorType: number } | null = null;
  let palette: Uint8Array | null = null;
  let alpha: Uint8Array | null = null;
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      const h = new DataView(data.buffer, data.byteOffset, data.byteLength);
      if (data[12] !== 0) throw new Error("interlaced PNG logos are not supported");
      header = { width: h.getUint32(0), height: h.getUint32(4), depth: data[8]!, colorType: data[9]! };
      if (header.depth !== 8) throw new Error(`only 8 bit PNG logos are supported, got ${header.depth}`);
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") alpha = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;

    offset += length + 12;
  }

  if (!header) throw new Error("PNG logo has no IHDR chunk");

  const channels = CHANNELS[header.colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${header.colorType}`);

  const raw = unfilter(await inflate(concat(idat)), header.width, header.height, channels);
  return toRgba(raw, header.width, header.height, header.colorType, palette, alpha);
}

const CHANNELS: Record<number, number | undefined> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const Decompression = (globalThis as { DecompressionStream?: typeof DecompressionStream })
    .DecompressionStream;
  if (!Decompression) throw new Error("this runtime cannot inflate PNG data — pass pre-decoded pixels");

  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new Decompression("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function unfilter(raw: Uint8Array, width: number, height: number, channels: number): Uint8Array {
  const stride = width * channels;
  const out = new Uint8Array(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[y * stride + i - channels]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0;
      const c = i >= channels && y > 0 ? out[(y - 1) * stride + i - channels]! : 0;
      let value = line[i]!;

      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + i] = value & 0xff;
    }
  }

  return out;
}

function toRgba(
  raw: Uint8Array,
  width: number,
  height: number,
  colorType: number,
  palette: Uint8Array | null,
  transparency: Uint8Array | null,
): Bitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  const pixels = width * height;

  for (let i = 0; i < pixels; i++) {
    const o = i * 4;

    if (colorType === 0) {
      data[o] = data[o + 1] = data[o + 2] = raw[i]!;
      data[o + 3] = 255;
    } else if (colorType === 2) {
      data[o] = raw[i * 3]!;
      data[o + 1] = raw[i * 3 + 1]!;
      data[o + 2] = raw[i * 3 + 2]!;
      data[o + 3] = 255;
    } else if (colorType === 3) {
      if (!palette) throw new Error("indexed PNG logo has no palette");
      const index = raw[i]!;
      data[o] = palette[index * 3]!;
      data[o + 1] = palette[index * 3 + 1]!;
      data[o + 2] = palette[index * 3 + 2]!;
      data[o + 3] = transparency?.[index] ?? 255;
    } else if (colorType === 4) {
      data[o] = data[o + 1] = data[o + 2] = raw[i * 2]!;
      data[o + 3] = raw[i * 2 + 1]!;
    } else {
      data[o] = raw[i * 4]!;
      data[o + 1] = raw[i * 4 + 1]!;
      data[o + 2] = raw[i * 4 + 2]!;
      data[o + 3] = raw[i * 4 + 3]!;
    }
  }

  return { width, height, data };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
