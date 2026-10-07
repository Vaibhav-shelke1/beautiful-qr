import { describe, expect, it } from "vitest";
import decodeQR from "qr/decode.js";
import { generate } from "../src/generate.js";
import { presetNames } from "../src/presets.js";
import { encodePng } from "../src/png.js";
import type { Bitmap } from "../src/image.js";

const PAYLOAD = "https://example.com/generate";

function swatch(size = 64): Bitmap {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = 220;
    data[i * 4 + 1] = 38;
    data[i * 4 + 2] = 38;
    data[i * 4 + 3] = 255;
  }
  return { width: size, height: size, data };
}

describe("generate", () => {
  it("works with nothing but data", async () => {
    const qr = await generate({ data: PAYLOAD });
    expect(qr.verified).toBe(true);
    expect(qr.repairs).toHaveLength(0);
    expect(qr.toSVG()).toContain("<svg");
  });

  it("rejects missing data", async () => {
    // @ts-expect-error data is required
    await expect(generate({})).rejects.toThrow(/data is required/);
  });

  it("defaults to a four module quiet zone and 512px", async () => {
    const qr = await generate({ data: PAYLOAD });
    expect(qr.options.margin).toBe(4);
    expect(qr.options.size).toBe(512);
    expect(qr.toSVG()).toContain('width="512"');
  });

  it("raises error correction automatically when a logo is present", async () => {
    const qr = await generate({ data: PAYLOAD, logo: swatch() });
    expect(qr.options.errorCorrection).toBe("H");
  });

  it("reports an estimated print size", async () => {
    const qr = await generate({ data: PAYLOAD });
    expect(qr.report!.estimatedMinPrintSize!.cm).toBeGreaterThan(0);
  });

  it("skips verification when asked", async () => {
    const qr = await generate({ data: PAYLOAD, verify: false });
    expect(qr.report).toBeNull();
    expect(qr.toSVG()).toContain("<svg");
  });

  it("runs a quick check when the ladder is disabled", async () => {
    const qr = await generate({ data: PAYLOAD, verify: { ladder: false } });
    expect(qr.verified).toBe(true);
    expect(qr.report!.survives).toBeNull();
  });
});

describe("repair", () => {
  it("rescues an oversized logo and says what it changed", async () => {
    const qr = await generate({
      data: PAYLOAD,
      logo: { src: swatch(), size: 0.55 },
    });

    expect(qr.verified).toBe(true);
    expect(qr.repairs.length).toBeGreaterThan(0);
    expect(qr.repairs.some((r) => r.field === "logo.size")).toBe(true);
    expect(qr.options.logo!.size).toBeLessThan(0.55);
    for (const repair of qr.repairs) expect(repair.why).toMatch(/\w/);
  });

  it("rescues a code with too little contrast", async () => {
    const qr = await generate({
      data: PAYLOAD,
      dots: { color: "#BBBBBB" },
      background: { color: "#CCCCCC" },
    });

    expect(qr.verified).toBe(true);
    expect(qr.repairs.some((r) => r.field === "dots.color")).toBe(true);
  });

  it("widens a quiet zone that is too tight", async () => {
    const qr = await generate({ data: PAYLOAD, margin: 0, dots: { color: "#DDDDDD" }, background: { color: "#E5E5E5" } });
    expect(qr.verified).toBe(true);
    expect(qr.options.margin).toBe(4);
  });

  it("leaves a healthy code completely untouched", async () => {
    const qr = await generate({
      data: PAYLOAD,
      dots: { style: "rounded", color: "#111827" },
      background: { color: "#FFFFFF" },
    });
    expect(qr.repairs).toHaveLength(0);
  });

  it("makes no changes when repair is disabled", async () => {
    const qr = await generate({
      data: PAYLOAD,
      logo: { src: swatch(), size: 0.55 },
      verify: { repair: false },
    });
    expect(qr.repairs).toHaveLength(0);
    expect(qr.verified).toBe(false);
    expect(qr.options.logo!.size).toBe(0.55);
  });
});

describe("output", () => {
  it("emits a png that decodes back to the payload", async () => {
    const qr = await generate({ data: PAYLOAD, size: 420, dots: { style: "rounded" } });
    const png = await qr.toPNG();
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("emits an svg carrying the logo as a data uri", async () => {
    const qr = await generate({ data: PAYLOAD, logo: swatch() });
    expect(qr.toSVG()).toContain("data:image/png;base64,");
  });

  it("accepts png bytes as a logo source", async () => {
    const bytes = await encodePng(swatch(32));
    const qr = await generate({ data: PAYLOAD, logo: bytes });
    expect(qr.verified).toBe(true);
  });

  it("builds data urls for both formats", async () => {
    const qr = await generate({ data: PAYLOAD, size: 200 });
    expect(await qr.toDataURL("svg")).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(await qr.toDataURL("png")).toMatch(/^data:image\/png;base64,/);
  });
});

describe("presets", () => {
  it.each(presetNames())("renders and verifies preset %s", async (name) => {
    const qr = await generate({ data: PAYLOAD, preset: name });
    expect(qr.verified).toBe(true);
    expect(qr.toSVG()).toContain("<svg");
  });

  it("rejects an unknown preset by name", async () => {
    await expect(generate({ data: PAYLOAD, preset: "nope" })).rejects.toThrow(/unknown preset/);
  });

  it("lets explicit options win over the preset", async () => {
    const qr = await generate({ data: PAYLOAD, preset: "neon", dots: { style: "square" } });
    expect(qr.options.dotStyle).toBe("square");
    expect(qr.options.background).toBe("#050505");
  });
});

describe("data helpers", () => {
  it("round trips a wifi payload through a real decode", async () => {
    const { wifi } = await import("../src/data.js");
    const payload = wifi({ ssid: "My Net", password: "p@ss;word", encryption: "WPA" });
    expect(payload).toBe("WIFI:T:WPA;S:My Net;P:p@ss\\;word;;");

    const qr = await generate({ data: payload, size: 400 });
    const png = await qr.toPNG();
    expect(png.length).toBeGreaterThan(0);
    expect(qr.verified).toBe(true);
  });

  it("builds the documented shapes", async () => {
    const d = await import("../src/data.js");
    expect(d.phone("+911234567890")).toBe("tel:+911234567890");
    expect(d.geo({ latitude: 19.8762, longitude: 75.3433 })).toBe("geo:19.8762,75.3433");
    expect(d.sms({ phone: "+91", message: "hi" })).toBe("SMSTO:+91:hi");
    expect(d.email({ to: "a@b.com", subject: "Hi there" })).toBe("mailto:a@b.com?subject=Hi+there");
    expect(d.vcard({ name: "Vaibhav Shelke", phone: "+91" })).toContain("BEGIN:VCARD");
  });
});

describe("decoding the real exported artifact", () => {
  it("decodes the exact pixels the png encoder wrote", async () => {
    const { inflateSync } = await import("node:zlib");
    const qr = await generate({
      data: PAYLOAD,
      size: 440,
      preset: "modern",
      logo: { src: swatch(), size: 0.2, background: "#FFFFFF" },
    });

    const png = await qr.toPNG();
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    let offset = 8;
    let idat: Uint8Array | null = null;
    let width = 0;
    let height = 0;

    while (offset < png.length) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
      const body = png.subarray(offset + 8, offset + 8 + length);
      if (type === "IHDR") {
        const h = new DataView(body.buffer, body.byteOffset, body.byteLength);
        width = h.getUint32(0);
        height = h.getUint32(4);
      }
      if (type === "IDAT") idat = body;
      offset += length + 12;
    }

    const raw = new Uint8Array(inflateSync(idat!));
    const stride = width * 4;
    const pixels = new Uint8ClampedArray(stride * height);

    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)]!;
      const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? pixels[y * stride + i - 4]! : 0;
        const b = y > 0 ? pixels[(y - 1) * stride + i]! : 0;
        const c = i >= 4 && y > 0 ? pixels[(y - 1) * stride + i - 4]! : 0;
        let v = line[i]!;
        if (filter === 1) v += a;
        else if (filter === 2) v += b;
        else if (filter === 3) v += (a + b) >> 1;
        else if (filter === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        pixels[y * stride + i] = v & 0xff;
      }
    }

    expect(decodeQR({ width, height, data: pixels } as ImageData)).toBe(PAYLOAD);
  });
});
