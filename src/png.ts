import type { Raster } from "./raster.js";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Candidate order is none, sub, up, paeth. Paeth is filter type 4, not 3.
const FILTER_TYPES = [0, 1, 2, 4];

export async function encodePng(raster: Raster): Promise<Uint8Array> {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, raster.width);
  view.setUint32(4, raster.height);
  header[8] = 8;
  header[9] = 6;

  const compressed = await deflate(filterScanlines(raster));

  return concat([
    Uint8Array.from(SIGNATURE),
    chunk("IHDR", header),
    chunk("IDAT", compressed),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

function filterScanlines(raster: Raster): Uint8Array {
  const stride = raster.width * 4;
  const out = new Uint8Array((stride + 1) * raster.height);
  const candidates = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)];
  let prev: Uint8ClampedArray = new Uint8ClampedArray(stride);

  for (let y = 0; y < raster.height; y++) {
    const row = raster.data.subarray(y * stride, y * stride + stride);

    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? row[i - 4]! : 0;
      const b = prev[i]!;
      const c = i >= 4 ? prev[i - 4]! : 0;
      candidates[0]![i] = row[i]!;
      candidates[1]![i] = (row[i]! - a) & 0xff;
      candidates[2]![i] = (row[i]! - b) & 0xff;
      candidates[3]![i] = (row[i]! - paeth(a, b, c)) & 0xff;
    }

    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < candidates.length; f++) {
      let score = 0;
      const candidate = candidates[f]!;
      for (let i = 0; i < stride; i++) {
        const v = candidate[i]!;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }

    const offset = y * (stride + 1);
    out[offset] = FILTER_TYPES[best]!;
    out.set(candidates[best]!, offset + 1);
    prev = row;
  }

  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const Compression = (globalThis as { CompressionStream?: typeof CompressionStream })
    .CompressionStream;
  if (!Compression) return storedDeflate(bytes);

  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new Compression("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function storedDeflate(bytes: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [Uint8Array.from([0x78, 0x01])];
  const MAX = 0xffff;

  for (let offset = 0; offset < bytes.length || offset === 0; offset += MAX) {
    const slice = bytes.subarray(offset, offset + MAX);
    const last = offset + MAX >= bytes.length ? 1 : 0;
    const head = new Uint8Array(5);
    head[0] = last;
    head[1] = slice.length & 0xff;
    head[2] = (slice.length >> 8) & 0xff;
    head[3] = ~slice.length & 0xff;
    head[4] = (~slice.length >> 8) & 0xff;
    blocks.push(head, slice);
    if (last) break;
  }

  const checksum = new Uint8Array(4);
  new DataView(checksum.buffer).setUint32(0, adler32(bytes));
  blocks.push(checksum);

  return concat(blocks);
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4)));
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
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
