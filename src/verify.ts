import { blur, downscale, reduceContrast, rotate } from "./degrade.js";
import { flattenOnto } from "./raster.js";
import type { Raster } from "./raster.js";

export type DegradationAxis = "resolution" | "blur" | "contrast" | "rotation";

export interface Survival {
  scale: number;
  blurPx: number;
  contrast: number;
  rotationDeg: number;
}

export interface VerifyReport {
  decodes: boolean;
  pxPerModule: number;
  survives: Survival | null;
  weakest: DegradationAxis | null;
  estimatedMinPrintSize: { cm: number; in: number } | null;
}

export interface VerifyInput {
  raster: Raster;
  expected: string;
  modules: number;
  margin: number;
  ladder?: boolean;
  decode: Decoder;
}

export type Decoder = (image: { width: number; height: number; data: Uint8ClampedArray }) => string | null;

const SCALE_STEPS = [0.75, 0.6, 0.5, 0.4, 0.3, 0.25];
const BLUR_FRACTIONS = [0.15, 0.3, 0.5, 0.75, 1];
const CONTRAST_STEPS = [0.8, 0.6, 0.45, 0.3, 0.2];
const ROTATION_STEPS = [8, 15, 25, 35, 45];

// Published guidance converges on roughly 0.5mm modules scanning reliably with
// a phone at arm's length, and a robust square-dot code decoding at about
// 3 rendered pixels per module. Both constants anchor the estimate below, which
// is a calibrated heuristic rather than a physical simulation of a camera.
const BASE_PITCH_MM = 0.5;
const REFERENCE_PX_PER_MODULE = 3;

export function verify(input: VerifyInput): VerifyReport {
  const { raster, expected, modules, margin, decode } = input;
  const extent = modules + margin * 2;
  const pxPerModule = raster.width / extent;
  const flat = flattenOnto(raster, "#FFFFFF");

  if (reads(flat, expected, decode) === false) {
    return {
      decodes: false,
      pxPerModule,
      survives: null,
      weakest: null,
      estimatedMinPrintSize: null,
    };
  }

  if (input.ladder === false) {
    return {
      decodes: true,
      pxPerModule,
      survives: null,
      weakest: null,
      estimatedMinPrintSize: null,
    };
  }

  const endure = <T>(steps: T[], pristine: T, apply: (step: T) => Raster) =>
    lastSurviving(steps, pristine, apply, expected, decode);

  const survives: Survival = {
    scale: endure(SCALE_STEPS, 1, (f) => downscale(flat, f)),
    blurPx: endure(BLUR_FRACTIONS.map((f) => f * pxPerModule), 0, (r) => blur(flat, r)),
    contrast: endure(CONTRAST_STEPS, 1, (k) => reduceContrast(flat, k)),
    rotationDeg: endure(ROTATION_STEPS, 0, (d) => rotate(flat, d)),
  };

  const minPxPerModule = Math.max(1, survives.scale * pxPerModule);
  const resolutionPenalty = Math.max(1, minPxPerModule / REFERENCE_PX_PER_MODULE);
  const blurPenalty = survives.blurPx >= 0.5 * pxPerModule ? 1 : 1.25;
  const pitchMm = BASE_PITCH_MM * resolutionPenalty * blurPenalty;
  const cm = (extent * pitchMm) / 10;

  return {
    decodes: true,
    pxPerModule,
    survives,
    weakest: weakestAxis(survives, pxPerModule),
    estimatedMinPrintSize: { cm: round(cm, 1), in: round(cm / 2.54, 2) },
  };
}

function lastSurviving<T>(
  steps: T[],
  pristine: T,
  apply: (step: T) => Raster,
  expected: string,
  decode: Decoder,
): T {
  let best = pristine;
  for (const step of steps) {
    if (!reads(apply(step), expected, decode)) break;
    best = step;
  }
  return best;
}

function reads(raster: Raster, expected: string, decode: Decoder): boolean {
  try {
    return decode({ width: raster.width, height: raster.height, data: raster.data }) === expected;
  } catch {
    return false;
  }
}

function weakestAxis(survives: Survival, pxPerModule: number): DegradationAxis | null {
  const scores: [DegradationAxis, number][] = [
    ["resolution", 1 - survives.scale],
    ["blur", survives.blurPx / pxPerModule],
    ["contrast", 1 - survives.contrast],
    ["rotation", survives.rotationDeg / 45],
  ];
  scores.sort((a, b) => a[1] - b[1]);
  return scores[0]?.[0] ?? null;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
