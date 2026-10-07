import { describe, expect, it } from "vitest";
import decodeQR from "qr/decode.js";
import { buildGeometry } from "../src/geometry.js";
import { buildMatrix } from "../src/matrix.js";
import { flattenOnto, rasterize } from "../src/raster.js";
import type { RasterOptions } from "../src/raster.js";
import type { CornerDotStyle, CornerSquareStyle, DotStyle, ErrorCorrection } from "../src/types.js";

const DOT_STYLES: DotStyle[] = [
  "square",
  "dot",
  "rounded",
  "extra-rounded",
  "classy",
  "classy-rounded",
];
const CORNER_SQUARES: CornerSquareStyle[] = ["square", "rounded", "extra-rounded", "dot"];
const CORNER_DOTS: CornerDotStyle[] = ["square", "dot", "rounded"];

function render(
  data: string,
  style: {
    dotStyle?: DotStyle;
    cornerSquareStyle?: CornerSquareStyle;
    cornerDotStyle?: CornerDotStyle;
    ecc?: ErrorCorrection;
  } = {},
  raster: Partial<RasterOptions> = {},
) {
  const matrix = buildMatrix(data, style.ecc ?? "H");
  const geometry = buildGeometry(matrix, {
    dotStyle: style.dotStyle ?? "square",
    cornerSquareStyle: style.cornerSquareStyle ?? "square",
    cornerDotStyle: style.cornerDotStyle ?? "square",
  });
  return rasterize(geometry, {
    size: 480,
    margin: 4,
    fills: { dot: "#000000", "corner-square": "#000000", "corner-dot": "#000000" },
    background: "#FFFFFF",
    ...raster,
  });
}

function decode(data: string, style = {}, raster = {}) {
  const r = render(data, style, raster);
  return decodeQR({ width: r.width, height: r.height, data: r.data } as ImageData);
}

const PAYLOAD = "https://example.com/raster-round-trip";

describe("rasterize", () => {
  it("produces a square RGBA buffer of the requested size", () => {
    const r = render(PAYLOAD, {}, { size: 300 });
    expect(r.width).toBe(300);
    expect(r.height).toBe(300);
    expect(r.data.length).toBe(300 * 300 * 4);
  });

  it("leaves the quiet zone as background", () => {
    const r = render(PAYLOAD, {}, { size: 480, margin: 4, background: "#FFFFFF" });
    expect([r.data[0], r.data[1], r.data[2], r.data[3]]).toEqual([255, 255, 255, 255]);
  });

  it("writes transparent pixels when the background is transparent", () => {
    const r = render(PAYLOAD, {}, { background: "transparent" });
    expect(r.data[3]).toBe(0);
  });

  it("antialiases rounded edges rather than hard clipping", () => {
    const r = render(PAYLOAD, { dotStyle: "dot" });
    let partial = 0;
    for (let i = 0; i < r.data.length; i += 4) {
      const v = r.data[i]!;
      if (v > 20 && v < 235) partial++;
    }
    expect(partial).toBeGreaterThan(0);
  });
});

describe("round trip through the decoder", () => {
  it.each(DOT_STYLES)("decodes with dot style %s", (dotStyle) => {
    expect(decode(PAYLOAD, { dotStyle })).toBe(PAYLOAD);
  });

  it.each(CORNER_SQUARES)("decodes with corner square style %s", (cornerSquareStyle) => {
    expect(decode(PAYLOAD, { cornerSquareStyle })).toBe(PAYLOAD);
  });

  it.each(CORNER_DOTS)("decodes with corner dot style %s", (cornerDotStyle) => {
    expect(decode(PAYLOAD, { cornerDotStyle })).toBe(PAYLOAD);
  });

  it.each(["L", "M", "Q", "H"] as ErrorCorrection[])("decodes at ecc %s", (ecc) => {
    expect(decode(PAYLOAD, { ecc, dotStyle: "extra-rounded" })).toBe(PAYLOAD);
  });

  it("decodes the most heavily styled combination", () => {
    expect(
      decode(PAYLOAD, {
        dotStyle: "extra-rounded",
        cornerSquareStyle: "dot",
        cornerDotStyle: "dot",
      }),
    ).toBe(PAYLOAD);
  });

  it("decodes long payloads at a larger version", () => {
    const long = "https://example.com/?q=" + "a".repeat(300);
    expect(decode(long, { dotStyle: "rounded" })).toBe(long);
  });

  it("decodes with a gradient fill", () => {
    expect(
      decode(
        PAYLOAD,
        { dotStyle: "rounded" },
        {
          fills: {
            dot: { type: "linear", colors: ["#0b1020", "#1e3a8a"], rotation: 45 },
            "corner-square": "#0b1020",
            "corner-dot": "#0b1020",
          },
        },
      ),
    ).toBe(PAYLOAD);
  });

  it("decodes a transparent background once flattened onto white", () => {
    const r = flattenOnto(render(PAYLOAD, { dotStyle: "rounded" }, { background: "transparent" }), "#FFFFFF");
    expect(decodeQR({ width: r.width, height: r.height, data: r.data } as ImageData)).toBe(PAYLOAD);
  });
});
