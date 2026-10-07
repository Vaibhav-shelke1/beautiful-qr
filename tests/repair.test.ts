import { describe, expect, it } from "vitest";
import { contrastOf, nextRepair } from "../src/repair.js";
import { resolveOptions } from "../src/options.js";
import type { Resolved } from "../src/options.js";
import type { QROptions } from "../src/options.js";

function resolved(options: Partial<QROptions> = {}): Resolved {
  return resolveOptions({ data: "https://example.com", ...options }, null);
}

describe("strategy ordering", () => {
  it("reaches for contrast first when contrast is the problem", () => {
    const attempt = nextRepair(
      resolved({ dots: { color: "#BBBBBB" }, background: { color: "#C4C4C4" }, margin: 0 }),
    );
    expect(attempt!.repair.field).toBe("dots.color");
  });

  it("jumps straight to the highest correction level rather than stepping", () => {
    const attempt = nextRepair(resolved({ qr: { errorCorrection: "L" } }));
    expect(attempt!.repair.field).toBe("qr.errorCorrection");
    expect(attempt!.repair.to).toBe("H");
  });

  it("widens the quiet zone once correction is already maxed", () => {
    const attempt = nextRepair(resolved({ qr: { errorCorrection: "H" }, margin: 1 }));
    expect(attempt!.repair.field).toBe("margin");
    expect(attempt!.options.margin).toBe(4);
  });

  it("shrinks the logo after the cheaper fixes are exhausted", () => {
    const attempt = nextRepair(
      resolved({
        qr: { errorCorrection: "H" },
        margin: 4,
        logo: { src: "data:image/png;base64,x", size: 0.4 },
      }),
    );
    expect(attempt!.repair.field).toBe("logo.size");
    expect(attempt!.options.logo!.size).toBeCloseTo(0.3, 2);
  });

  it("falls back to a sturdier dot shape last", () => {
    const attempt = nextRepair(
      resolved({ qr: { errorCorrection: "H" }, margin: 4, dots: { style: "dot" } }),
    );
    expect(attempt!.repair.field).toBe("dots.style");
    expect(attempt!.repair.to).toBe("rounded");
  });

  it("runs out of ideas on an already optimal config", () => {
    expect(
      nextRepair(resolved({ qr: { errorCorrection: "H" }, margin: 4, dots: { style: "square" } })),
    ).toBeNull();
  });

  it("stops shrinking a logo at the floor", () => {
    const attempt = nextRepair(
      resolved({
        qr: { errorCorrection: "H" },
        margin: 4,
        dots: { style: "square" },
        logo: { src: "data:image/png;base64,x", size: 0.12 },
      }),
    );
    expect(attempt).toBeNull();
  });

  it("explains every repair it proposes", () => {
    const attempt = nextRepair(resolved({ qr: { errorCorrection: "L" } }));
    expect(attempt!.repair.why.length).toBeGreaterThan(10);
  });
});

describe("contrast measurement", () => {
  it("rates black on white as the maximum", () => {
    expect(contrastOf(resolved({ dots: { color: "#000000" } }))).toBeCloseTo(21, 0);
  });

  it("rates near identical colours as close to one", () => {
    const ratio = contrastOf(resolved({ dots: { color: "#CCCCCC" }, background: { color: "#CFCFCF" } }));
    expect(ratio).toBeLessThan(1.1);
  });

  it("measures a gradient by its average", () => {
    const ratio = contrastOf(
      resolved({ dots: { color: { type: "linear", colors: ["#000000", "#333333"] } } }),
    );
    expect(ratio).toBeGreaterThan(10);
  });

  it("assumes white behind a transparent background", () => {
    expect(
      contrastOf(resolved({ dots: { color: "#000000" }, background: { color: "transparent" } })),
    ).toBeCloseTo(21, 0);
  });
});
