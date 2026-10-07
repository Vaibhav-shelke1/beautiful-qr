import { afterEach, describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import decodeQR from "qr/decode.js";
import { buildGeometry } from "../src/geometry.js";
import { buildMatrix } from "../src/matrix.js";
import { rasterize } from "../src/raster.js";
import type { Raster } from "../src/raster.js";
import { encodePng } from "../src/png.js";

const PAYLOAD = "https://example.com/png-round-trip";

function sample(size = 240): Raster {
  const matrix = buildMatrix(PAYLOAD, "H");
  const geometry = buildGeometry(matrix, {
    dotStyle: "rounded",
    cornerSquareStyle: "extra-rounded",
    cornerDotStyle: "dot",
  });
  return rasterize(geometry, {
    size,
    margin: 4,
    fills: { dot: "#111827", "corner-square": "#111827", "corner-dot": "#111827" },
    background: "#FFFFFF",
  });
}

function readChunks(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: { type: string; data: Uint8Array }[] = [];
  let offset = 8;

  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    chunks.push({ type, data: png.subarray(offset + 8, offset + 8 + length) });
    offset += length + 12;
  }
  return chunks;
}

function unfilter(raw: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const stride = width * 4;
  const out = new Uint8ClampedArray(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);

    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? out[y * stride + i - 4]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0;
      const c = i >= 4 && y > 0 ? out[(y - 1) * stride + i - 4]! : 0;
      let value = line[i]!;

      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += Math.floor((a + b) / 2);
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

function expectSamePixels(actual: ArrayLike<number>, expected: ArrayLike<number>): void {
  expect(actual.length).toBe(expected.length);
  let mismatch = -1;
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      mismatch = i;
      break;
    }
  }
  expect(mismatch).toBe(-1);
}

const original = globalThis.CompressionStream;
afterEach(() => {
  globalThis.CompressionStream = original;
});

describe("encodePng", () => {
  it("starts with the png signature", async () => {
    const png = await encodePng(sample());
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("writes IHDR, IDAT and IEND in order", async () => {
    const chunks = readChunks(await encodePng(sample()));
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("declares 8 bit rgba with no interlacing", async () => {
    const raster = sample(240);
    const ihdr = readChunks(await encodePng(raster))[0]!.data;
    const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
    expect(view.getUint32(0)).toBe(raster.width);
    expect(view.getUint32(4)).toBe(raster.height);
    expect(ihdr[8]).toBe(8);
    expect(ihdr[9]).toBe(6);
    expect(ihdr[12]).toBe(0);
  });

  it("reproduces the exact source pixels after inflate and unfilter", async () => {
    const raster = sample(200);
    const idat = readChunks(await encodePng(raster)).find((c) => c.type === "IDAT")!;
    const pixels = unfilter(new Uint8Array(inflateSync(idat.data)), raster.width, raster.height);
    expectSamePixels(pixels, raster.data);
  });

  it("compresses well below the raw byte count", async () => {
    const raster = sample(400);
    const png = await encodePng(raster);
    expect(png.length).toBeLessThan(raster.data.length / 4);
  });

  it("produces a png whose pixels still decode as the original payload", async () => {
    const raster = sample(420);
    const idat = readChunks(await encodePng(raster)).find((c) => c.type === "IDAT")!;
    const data = unfilter(new Uint8Array(inflateSync(idat.data)), raster.width, raster.height);
    expect(decodeQR({ width: raster.width, height: raster.height, data } as ImageData)).toBe(PAYLOAD);
  });

  it("falls back to stored blocks when CompressionStream is missing", async () => {
    // @ts-expect-error exercising the runtime without the web stream
    delete globalThis.CompressionStream;
    const raster = sample(200);
    const idat = readChunks(await encodePng(raster)).find((c) => c.type === "IDAT")!;
    const pixels = unfilter(new Uint8Array(inflateSync(idat.data)), raster.width, raster.height);
    expectSamePixels(pixels, raster.data);
  });
});
