import type { PresetOptions } from "./options.js";

export const presets: Record<string, PresetOptions> = {
  minimal: {
    dots: { style: "square", color: "#000000" },
    background: { color: "#FFFFFF" },
  },

  modern: {
    dots: { style: "rounded", color: "#111827" },
    corners: { square: { style: "extra-rounded" }, dot: { style: "dot" } },
    background: { color: "#FFFFFF" },
  },

  soft: {
    dots: { style: "extra-rounded", color: "#334155" },
    corners: { square: { style: "extra-rounded" }, dot: { style: "rounded" } },
    background: { color: "#F8FAFC" },
  },

  classy: {
    dots: { style: "classy-rounded", color: "#1F2937" },
    corners: { square: { style: "rounded" }, dot: { style: "square" } },
    background: { color: "#FFFFFF" },
  },

  mono: {
    dots: { style: "dot", color: "#000000" },
    corners: { square: { style: "dot" }, dot: { style: "dot" } },
    background: { color: "#FFFFFF" },
  },

  corporate: {
    dots: { style: "square", color: "#0F172A" },
    corners: { square: { style: "rounded", color: "#1D4ED8" }, dot: { style: "square", color: "#1D4ED8" } },
    background: { color: "#FFFFFF" },
  },

  midnight: {
    dots: { style: "rounded", color: "#E2E8F0" },
    corners: { square: { style: "extra-rounded", color: "#38BDF8" }, dot: { style: "dot", color: "#38BDF8" } },
    background: { color: "#020617" },
  },

  neon: {
    qr: { errorCorrection: "H" },
    dots: { style: "rounded", color: { type: "linear", colors: ["#22D3EE", "#A855F7"], rotation: 45 } },
    corners: { square: { style: "extra-rounded", color: "#22D3EE" }, dot: { style: "dot", color: "#A855F7" } },
    background: { color: "#050505" },
  },

  ocean: {
    dots: { style: "rounded", color: { type: "linear", colors: ["#0EA5E9", "#1E3A8A"], rotation: 90 } },
    corners: { square: { style: "extra-rounded", color: "#0369A1" }, dot: { style: "dot", color: "#0EA5E9" } },
    background: { color: "#FFFFFF" },
  },

  sunset: {
    dots: { style: "extra-rounded", color: { type: "linear", colors: ["#F97316", "#DB2777"], rotation: 60 } },
    corners: { square: { style: "extra-rounded", color: "#DB2777" }, dot: { style: "dot", color: "#F97316" } },
    background: { color: "#FFF7ED" },
  },

  forest: {
    dots: { style: "classy", color: "#14532D" },
    corners: { square: { style: "rounded", color: "#166534" }, dot: { style: "square", color: "#15803D" } },
    background: { color: "#F0FDF4" },
  },

  candy: {
    dots: { style: "dot", color: { type: "radial", colors: ["#EC4899", "#8B5CF6"] } },
    corners: { square: { style: "dot", color: "#8B5CF6" }, dot: { style: "dot", color: "#EC4899" } },
    background: { color: "#FFFFFF" },
  },
};

export type PresetName = keyof typeof presets;

export function presetNames(): string[] {
  return Object.keys(presets);
}
