import { describe, expect, it } from "vitest";
import decodeQR from "qr/decode.js";
import { buildMatrix, finderAt, finderOrigins } from "../src/matrix.js";
import type { ErrorCorrection, QRMatrix } from "../src/types.js";

const LEVELS: ErrorCorrection[] = ["L", "M", "Q", "H"];

function rasterize(m: QRMatrix, scale = 8, quiet = 4): ImageData {
  const size = (m.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);

  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!m.get(x, y)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
        }
      }
    }
  }

  return { width: size, height: size, data } as ImageData;
}

describe("buildMatrix", () => {
  it("rejects empty data", () => {
    expect(() => buildMatrix("", "H")).toThrow(/must not be empty/);
  });

  it("produces an odd square matrix of at least version 1 size", () => {
    const m = buildMatrix("hello", "M");
    expect(m.size).toBeGreaterThanOrEqual(21);
    expect(m.size % 2).toBe(1);
  });

  it("grows with payload length", () => {
    const small = buildMatrix("hi", "M");
    const large = buildMatrix("x".repeat(400), "M");
    expect(large.size).toBeGreaterThan(small.size);
  });

  it("reads false outside bounds instead of throwing", () => {
    const m = buildMatrix("hello", "M");
    expect(m.get(-1, 0)).toBe(false);
    expect(m.get(0, m.size)).toBe(false);
  });

  it.each(LEVELS)("round trips through a decoder at ecc %s", (ecc) => {
    const data = "https://example.com/round-trip-check";
    const m = buildMatrix(data, ecc);
    expect(decodeQR(rasterize(m))).toBe(data);
  });

  it("round trips unicode payloads", () => {
    const data = "कुछ भी — 日本語 — 🎯";
    const m = buildMatrix(data, "H");
    expect(decodeQR(rasterize(m))).toBe(data);
  });
});

describe("finder detection", () => {
  const m = buildMatrix("https://example.com", "H");

  it("marks all three finder corners as reserved", () => {
    for (const { originX, originY } of finderOrigins(m.size)) {
      expect(m.isReserved(originX, originY)).toBe(true);
      expect(m.isReserved(originX + 6, originY + 6)).toBe(true);
    }
  });

  it("leaves the fourth corner free", () => {
    expect(m.isReserved(m.size - 1, m.size - 1)).toBe(false);
  });

  it("identifies which corner a cell belongs to", () => {
    expect(finderAt(0, 0, m.size)?.corner).toBe("top-left");
    expect(finderAt(m.size - 1, 0, m.size)?.corner).toBe("top-right");
    expect(finderAt(0, m.size - 1, m.size)?.corner).toBe("bottom-left");
    expect(finderAt(10, 10, m.size)).toBeNull();
  });
});
