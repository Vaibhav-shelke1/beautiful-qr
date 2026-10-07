import { describe, expect, it } from "vitest";
import { buildGeometry } from "../src/geometry.js";
import type { GeometryOptions, Primitive, Shape } from "../src/geometry.js";
import { buildMatrix } from "../src/matrix.js";
import type { DotStyle } from "../src/types.js";

const DOT_STYLES: DotStyle[] = [
  "square",
  "dot",
  "rounded",
  "extra-rounded",
  "classy",
  "classy-rounded",
];

function opts(overrides: Partial<GeometryOptions> = {}): GeometryOptions {
  return {
    dotStyle: "square",
    cornerSquareStyle: "square",
    cornerDotStyle: "square",
    ...overrides,
  };
}

function rolesOf(shapes: Shape[], role: Shape["role"]) {
  return shapes.filter((s) => s.role === role);
}

function within(p: Primitive, modules: number): boolean {
  if (p.kind === "circle") {
    return p.cx - p.radius >= -0.001 && p.cx + p.radius <= modules + 0.001;
  }
  return p.x >= -0.001 && p.y >= -0.001 && p.x + p.w <= modules + 0.001;
}

describe("buildGeometry", () => {
  const m = buildMatrix("https://example.com", "H");

  it("emits exactly three corner squares and three corner dots", () => {
    const g = buildGeometry(m, opts());
    expect(rolesOf(g.shapes, "corner-square")).toHaveLength(3);
    expect(rolesOf(g.shapes, "corner-dot")).toHaveLength(3);
  });

  it("never emits data dots inside the finder regions", () => {
    const g = buildGeometry(m, opts());
    for (const shape of rolesOf(g.shapes, "dot")) {
      const p = shape.outer;
      const x = Math.floor(p.kind === "rect" ? p.x : p.cx);
      const y = Math.floor(p.kind === "rect" ? p.y : p.cy);
      expect(m.isReserved(x, y)).toBe(false);
    }
  });

  it("keeps every shape inside the module grid", () => {
    const g = buildGeometry(m, opts({ dotStyle: "dot", cornerSquareStyle: "dot" }));
    for (const s of g.shapes) expect(within(s.outer, g.modules)).toBe(true);
  });

  it.each(DOT_STYLES)("emits one dot per dark data module for style %s", (dotStyle) => {
    const g = buildGeometry(m, opts({ dotStyle }));
    let expected = 0;
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        if (m.get(x, y) && !m.isReserved(x, y)) expected++;
      }
    }
    expect(rolesOf(g.shapes, "dot")).toHaveLength(expected);
  });

  it("skips modules reported as occluded", () => {
    const plain = buildGeometry(m, opts());
    const masked = buildGeometry(m, opts({ occluded: (x, y) => x > 10 && x < 20 && y > 10 && y < 20 }));
    expect(rolesOf(masked.shapes, "dot").length).toBeLessThan(rolesOf(plain.shapes, "dot").length);
    expect(rolesOf(masked.shapes, "corner-square")).toHaveLength(3);
  });

  it("gives corner squares a hole so they render as rings", () => {
    const g = buildGeometry(m, opts({ cornerSquareStyle: "extra-rounded" }));
    for (const s of rolesOf(g.shapes, "corner-square")) expect(s.hole).toBeDefined();
  });

  it("uses circles for dot style and rects otherwise", () => {
    expect(buildGeometry(m, opts({ dotStyle: "dot" })).shapes[0]!.outer.kind).toBe("circle");
    expect(buildGeometry(m, opts({ dotStyle: "square" })).shapes[0]!.outer.kind).toBe("rect");
  });
});

describe("neighbour aware rounding", () => {
  const m = buildMatrix("https://example.com/neighbours", "H");

  it("leaves square style with no radii at all", () => {
    const g = buildGeometry(m, opts({ dotStyle: "square" }));
    for (const s of g.shapes) {
      if (s.role !== "dot" || s.outer.kind !== "rect") continue;
      expect(s.outer.r).toEqual([0, 0, 0, 0]);
    }
  });

  it("rounds at least some corners for rounded style", () => {
    const g = buildGeometry(m, opts({ dotStyle: "rounded" }));
    const rounded = g.shapes.filter(
      (s) => s.role === "dot" && s.outer.kind === "rect" && s.outer.r.some((v) => v > 0),
    );
    expect(rounded.length).toBeGreaterThan(0);
  });

  it("only rounds a corner when both adjoining neighbours are absent", () => {
    const g = buildGeometry(m, opts({ dotStyle: "extra-rounded" }));
    for (const s of g.shapes) {
      if (s.role !== "dot" || s.outer.kind !== "rect") continue;
      const { x, y, r } = s.outer;
      const dark = (dx: number, dy: number) => m.get(x + dx, y + dy) && !m.isReserved(x + dx, y + dy);
      if (r[0] > 0) expect(dark(0, -1) || dark(-1, 0)).toBe(false);
      if (r[2] > 0) expect(dark(0, 1) || dark(1, 0)).toBe(false);
    }
  });

  it("squares off the alternate corners for classy style", () => {
    const g = buildGeometry(m, opts({ dotStyle: "classy" }));
    for (const s of g.shapes) {
      if (s.role !== "dot" || s.outer.kind !== "rect") continue;
      expect(s.outer.r[1]).toBe(0);
      expect(s.outer.r[3]).toBe(0);
    }
  });
});
