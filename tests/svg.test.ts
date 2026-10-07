import { describe, expect, it } from "vitest";
import { buildGeometry } from "../src/geometry.js";
import { buildMatrix } from "../src/matrix.js";
import { renderSvg } from "../src/svg.js";
import type { SvgOptions } from "../src/svg.js";

const matrix = buildMatrix("https://example.com", "H");
const geometry = buildGeometry(matrix, {
  dotStyle: "rounded",
  cornerSquareStyle: "extra-rounded",
  cornerDotStyle: "dot",
});

function opts(overrides: Partial<SvgOptions> = {}): SvgOptions {
  return {
    size: 320,
    margin: 4,
    fills: { dot: "#111827", "corner-square": "#2563EB", "corner-dot": "#06B6D4" },
    background: "#FFFFFF",
    ...overrides,
  };
}

describe("renderSvg", () => {
  it("produces a well formed root element", () => {
    const svg = renderSvg(geometry, opts());
    expect(svg.startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\"")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('width="320" height="320"');
  });

  it("sizes the viewBox to modules plus margin on both sides", () => {
    const svg = renderSvg(geometry, opts({ margin: 4 }));
    expect(svg).toContain(`viewBox="0 0 ${geometry.modules + 8} ${geometry.modules + 8}"`);
  });

  it("emits one path per shape role", () => {
    const svg = renderSvg(geometry, opts());
    expect(svg.match(/<path /g)).toHaveLength(3);
  });

  it("omits the background rect when transparent", () => {
    expect(renderSvg(geometry, opts({ background: "transparent" }))).not.toContain("<rect");
    expect(renderSvg(geometry, opts({ background: "#FFF" }))).toContain("<rect");
  });

  it("is deterministic across renders", () => {
    expect(renderSvg(geometry, opts())).toBe(renderSvg(geometry, opts()));
  });

  it("keeps every coordinate inside the viewBox", () => {
    const svg = renderSvg(geometry, opts({ margin: 4 }));
    const extent = geometry.modules + 8;
    const d = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]!).join(" ");
    for (const value of d.match(/-?\d+(\.\d+)?/g) ?? []) {
      expect(Math.abs(Number(value))).toBeLessThanOrEqual(extent + 0.001);
    }
  });
});

describe("fills", () => {
  it("inlines solid colours directly", () => {
    const svg = renderSvg(geometry, opts());
    expect(svg).toContain('fill="#111827"');
    expect(svg).not.toContain("<defs>");
  });

  it("creates a linear gradient def and references it", () => {
    const svg = renderSvg(
      geometry,
      opts({
        fills: {
          dot: { type: "linear", colors: ["#06B6D4", "#8B5CF6"], rotation: 45 },
          "corner-square": "#000",
          "corner-dot": "#000",
        },
      }),
    );
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain("stop-color=\"#06B6D4\"");
    const id = svg.match(/<linearGradient id="([^"]+)"/)?.[1];
    expect(svg).toContain(`fill="url(#${id})"`);
  });

  it("supports radial gradients", () => {
    const svg = renderSvg(
      geometry,
      opts({
        fills: {
          dot: { type: "radial", colors: ["#FF0080", "#7928CA"] },
          "corner-square": "#000",
          "corner-dot": "#000",
        },
      }),
    );
    expect(svg).toContain("<radialGradient");
  });

  it("reuses one def when the same gradient is used twice", () => {
    const gradient = { type: "linear" as const, colors: ["#000", "#FFF"] };
    const svg = renderSvg(
      geometry,
      opts({ fills: { dot: gradient, "corner-square": gradient, "corner-dot": "#000" } }),
    );
    expect(svg.match(/<linearGradient/g)).toHaveLength(1);
  });

  it("gives different gradients different ids", () => {
    const svg = renderSvg(
      geometry,
      opts({
        fills: {
          dot: { type: "linear", colors: ["#000", "#FFF"] },
          "corner-square": { type: "linear", colors: ["#F00", "#00F"] },
          "corner-dot": "#000",
        },
      }),
    );
    expect(svg.match(/<linearGradient/g)).toHaveLength(2);
  });

  it("escapes characters that would break out of an attribute", () => {
    const svg = renderSvg(geometry, opts({ background: '"><script>x</script>' }));
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&quot;");
  });
});
