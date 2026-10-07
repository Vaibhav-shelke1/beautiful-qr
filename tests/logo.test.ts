import { describe, expect, it } from "vitest";
import decodeQR from "qr/decode.js";
import { buildGeometry } from "../src/geometry.js";
import { buildMatrix } from "../src/matrix.js";
import { rasterize } from "../src/raster.js";
import { encodePng } from "../src/png.js";
import { decodePng, loadImage } from "../src/image.js";
import { compositeLogo, coverageOf, logoSvg, occlusionMask, placeLogo, prepareLogo } from "../src/logo.js";
import type { Bitmap } from "../src/image.js";

const PAYLOAD = "https://example.com/logo";

function swatch(size = 48, color: [number, number, number, number] = [220, 38, 38, 255]): Bitmap {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = color[0];
    data[i * 4 + 1] = color[1];
    data[i * 4 + 2] = color[2];
    data[i * 4 + 3] = color[3];
  }
  return { width: size, height: size, data };
}

async function renderWithLogo(size: number, hideDots = true) {
  const matrix = buildMatrix(PAYLOAD, "H");
  const logo = await prepareLogo({ src: swatch(), size, hideDots }, matrix.size);
  const geometry = buildGeometry(matrix, {
    dotStyle: "square",
    cornerSquareStyle: "square",
    cornerDotStyle: "square",
    occluded: occlusionMask(logo.placement),
  });
  const margin = 4;
  const raster = rasterize(geometry, {
    size: (matrix.size + margin * 2) * 10,
    margin,
    fills: { dot: "#000000", "corner-square": "#000000", "corner-dot": "#000000" },
    background: "#FFFFFF",
  });
  compositeLogo(raster, logo, matrix.size, margin);
  return { raster, logo, modules: matrix.size };
}

function decode(raster: { width: number; height: number; data: Uint8ClampedArray }) {
  try {
    return decodeQR(raster as ImageData);
  } catch {
    return null;
  }
}

describe("placement", () => {
  it("centres the logo on the code", () => {
    const p = placeLogo({ src: swatch(), size: 0.2 }, 40);
    expect(p.x).toBeCloseTo(16);
    expect(p.y).toBeCloseTo(16);
    expect(p.size).toBeCloseTo(8);
  });

  it("clamps absurd sizes into a sane range", () => {
    expect(placeLogo({ src: swatch(), size: 5 }, 40).size).toBeLessThanOrEqual(24);
    expect(placeLogo({ src: swatch(), size: 0 }, 40).size).toBeGreaterThan(0);
  });

  it("reports coverage that grows with logo size", () => {
    const small = placeLogo({ src: swatch(), size: 0.15 }, 41);
    const large = placeLogo({ src: swatch(), size: 0.35 }, 41);
    expect(coverageOf(large, 41)).toBeGreaterThan(coverageOf(small, 41));
  });

  it("masks nothing when hideDots is off", () => {
    const p = placeLogo({ src: swatch(), size: 0.3, hideDots: false }, 41);
    expect(occlusionMask(p)(20, 20)).toBe(false);
  });

  it("masks the centre and leaves the corners alone", () => {
    const p = placeLogo({ src: swatch(), size: 0.3 }, 41);
    const mask = occlusionMask(p);
    expect(mask(20, 20)).toBe(true);
    expect(mask(0, 0)).toBe(false);
  });
});

describe("image decoding", () => {
  it("round trips a bitmap through encode and decode", async () => {
    const source = swatch(16, [10, 20, 30, 255]);
    const decoded = await decodePng(await encodePng(source));
    expect(decoded.width).toBe(16);
    expect([decoded.data[0], decoded.data[1], decoded.data[2]]).toEqual([10, 20, 30]);
  });

  it("passes a pre-decoded bitmap straight through", async () => {
    const source = swatch(8);
    expect(await loadImage(source)).toBe(source);
  });

  it("rejects bytes that are not a PNG", async () => {
    await expect(loadImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).rejects.toThrow(/not a PNG/);
  });

  it("decodes png bytes supplied directly", async () => {
    const bytes = await encodePng(swatch(12, [1, 2, 3, 255]));
    expect((await loadImage(bytes)).width).toBe(12);
  });
});

describe("svg embedding", () => {
  it("emits an image element with a data uri", async () => {
    const logo = await prepareLogo({ src: swatch(), size: 0.2 }, 41);
    const svg = logoSvg(logo, 4, "bq");
    expect(svg).toContain("<image");
    expect(svg).toContain("data:image/png;base64,");
  });

  it("adds a clip path for circular logos", async () => {
    const logo = await prepareLogo({ src: swatch(), size: 0.2, shape: "circle" }, 41);
    expect(logoSvg(logo, 4, "bq")).toContain("<clipPath");
  });

  it("omits the clip path for square logos", async () => {
    const logo = await prepareLogo({ src: swatch(), size: 0.2, shape: "square" }, 41);
    expect(logoSvg(logo, 4, "bq")).not.toContain("<clipPath");
  });

  it("draws a backing plate when a background is set", async () => {
    const logo = await prepareLogo({ src: swatch(), size: 0.2, background: "#FFFFFF" }, 41);
    expect(logoSvg(logo, 4, "bq")).toContain('fill="#FFFFFF"');
  });
});

describe("raster compositing", () => {
  it("paints the logo pixels into the centre", async () => {
    const { raster } = await renderWithLogo(0.2);
    const mid = (Math.floor(raster.height / 2) * raster.width + Math.floor(raster.width / 2)) * 4;
    expect(raster.data[mid]).toBe(220);
    expect(raster.data[mid + 1]).toBe(38);
  });

  it("still decodes with a logo inside the error correction budget", async () => {
    const { raster } = await renderWithLogo(0.2);
    expect(decode(raster)).toBe(PAYLOAD);
  });

  it("stops decoding once the logo covers too much", async () => {
    const { raster } = await renderWithLogo(0.55);
    expect(decode(raster)).not.toBe(PAYLOAD);
  });
});
