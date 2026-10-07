import { describe, expect, it } from "vitest";
import { QRCodeStyling, fromStyledOptions } from "../src/compat.js";
import { encodePng } from "../src/png.js";
import type { Bitmap } from "../src/image.js";

const PAYLOAD = "https://example.com/compat";

function swatch(size = 32): Bitmap {
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let i = 0; i < size * size; i++) data[i * 4 + 3] = 255;
  return { width: size, height: size, data };
}

describe("fromStyledOptions", () => {
  it("maps the option names qr-code-styling uses", () => {
    const mapped = fromStyledOptions({
      width: 300,
      data: PAYLOAD,
      dotsOptions: { color: "#4267b2", type: "rounded" },
      cornersSquareOptions: { color: "#1a1a1a", type: "extra-rounded" },
      cornersDotOptions: { color: "#4267b2", type: "dot" },
      backgroundOptions: { color: "#e9ebee" },
      qrOptions: { errorCorrectionLevel: "Q" },
    });

    expect(mapped.size).toBe(300);
    expect(mapped.dots).toEqual({ style: "rounded", color: "#4267b2" });
    expect(mapped.corners?.square).toEqual({ style: "extra-rounded", color: "#1a1a1a" });
    expect(mapped.corners?.dot).toEqual({ style: "dot", color: "#4267b2" });
    expect(mapped.background).toEqual({ color: "#e9ebee" });
    expect(mapped.qr).toEqual({ errorCorrection: "Q" });
  });

  it("translates their plural dots type to ours", () => {
    expect(fromStyledOptions({ data: PAYLOAD, dotsOptions: { type: "dots" } }).dots?.style).toBe("dot");
  });

  it("converts gradient rotation from radians to degrees", () => {
    const mapped = fromStyledOptions({
      data: PAYLOAD,
      dotsOptions: {
        gradient: {
          type: "linear",
          rotation: Math.PI / 2,
          colorStops: [
            { offset: 1, color: "#ffffff" },
            { offset: 0, color: "#000000" },
          ],
        },
      },
    });

    expect(mapped.dots?.color).toEqual({
      type: "linear",
      colors: ["#000000", "#ffffff"],
      rotation: 90,
    });
  });

  it("maps the image options onto a logo", () => {
    const mapped = fromStyledOptions({
      data: PAYLOAD,
      image: swatch(),
      imageOptions: { imageSize: 0.3, margin: 2, hideBackgroundDots: false },
    });

    expect(mapped.logo).toMatchObject({ size: 0.3, padding: 2, hideDots: false });
  });

  it("falls back to the dot colour for corners when unset", () => {
    const mapped = fromStyledOptions({ data: PAYLOAD, dotsOptions: { color: "#123456" } });
    expect(mapped.corners?.square?.color).toBe("#123456");
    expect(mapped.corners?.dot?.color).toBe("#123456");
  });

  it("requires data just like the original", () => {
    expect(() => fromStyledOptions({})).toThrow(/data is required/);
  });
});

describe("QRCodeStyling shim", () => {
  it("renders through the familiar constructor", async () => {
    const qr = new QRCodeStyling({
      width: 300,
      height: 300,
      data: PAYLOAD,
      dotsOptions: { color: "#4267b2", type: "rounded" },
      backgroundOptions: { color: "#ffffff" },
    });

    const result = await qr.result();
    expect(result.verified).toBe(true);
    expect(result.toSVG()).toContain("<svg");
  });

  it("appends markup into a container", async () => {
    const container = { innerHTML: "" };
    await new QRCodeStyling({ data: PAYLOAD }).append(container);
    expect(container.innerHTML).toContain("<svg");
  });

  it("returns raw bytes for both formats", async () => {
    const qr = new QRCodeStyling({ data: PAYLOAD, width: 200 });
    expect([...(await qr.getRawData("png")).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(new TextDecoder().decode(await qr.getRawData("svg"))).toContain("<svg");
  });

  it("re-renders after update", async () => {
    const qr = new QRCodeStyling({ data: PAYLOAD, dotsOptions: { type: "square" } });
    const before = (await qr.result()).options.dotStyle;
    qr.update({ dotsOptions: { type: "extra-rounded" } });
    expect(before).toBe("square");
    expect((await qr.result()).options.dotStyle).toBe("extra-rounded");
  });

  it("accepts png bytes as the image, like the original accepts a url", async () => {
    const qr = new QRCodeStyling({
      data: PAYLOAD,
      image: await encodePng(swatch()),
      imageOptions: { imageSize: 0.2 },
    });
    expect((await qr.result()).verified).toBe(true);
  });

  it("explains itself when download is called off a browser", async () => {
    await expect(new QRCodeStyling({ data: PAYLOAD }).download()).rejects.toThrow(/needs a browser/);
  });

  it("repairs an unscannable migrated config instead of passing it through", async () => {
    const qr = new QRCodeStyling({
      data: PAYLOAD,
      image: await encodePng(swatch(64)),
      imageOptions: { imageSize: 0.55 },
      qrOptions: { errorCorrectionLevel: "L" },
    });

    const result = await qr.result();
    expect(result.verified).toBe(true);
    expect(result.repairs.length).toBeGreaterThan(0);
  });
});
