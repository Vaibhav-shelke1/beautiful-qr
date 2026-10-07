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
  /**
   * Contrast ratio between the dot colour and the background. Reported
   * separately from decoding because a decoder thresholds a clean buffer
   * adaptively and reads codes a phone in poor light would not.
   */
  contrastRatio: number;
  sufficientContrast: boolean;
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
  contrastRatio?: number;
  /**
   * Multiplier for physical effects this harness cannot measure, such as ink
   * spread on paper. Supplied by the caller, never inferred here, so measured
   * robustness and published guidance stay separable in the result.
   */
  printPenalty?: number;
}

export type Decoder = (image: { width: number; height: number; data: Uint8ClampedArray }) => string | null;

// Scale is bisected rather than walked down a fixed list. A discrete ladder
// makes the result hostage to where the steps happen to fall, which measurably
// collapsed distinct designs onto the same number. Bisection gives a
// step-independent threshold for the same number of decodes.
const SCALE_BOUNDS = { easy: 1, hard: 0.1 };
const SCALE_ITERATIONS = 6;
const BLUR_FRACTIONS = [0.2, 0.4, 0.6, 0.85];
const CONTRAST_STEPS = [0.8, 0.6, 0.45, 0.3, 0.2];
const ROTATION_STEPS = [8, 15, 25, 35, 45];

// Published guidance converges on roughly 0.5mm modules scanning reliably with
// a phone at arm's length, which anchors the floor. The reference figures are
// what a plain square-dot code reaches in this harness.
//
// What this measures and what it does not: degrading a clean synthetic buffer
// captures robustness to resolution, blur, contrast and rotation, and those do
// track payload density. It does not capture ink spread, paper, or camera
// optics. Dot shape was measured and found to make no difference to decoding
// here, because a round dot still reads dark at the module centre the decoder
// samples. Shape penalties therefore arrive as printPenalty from the caller,
// sourced from published print guidance, and are never inferred from these
// measurements.
// Below this the code is at real risk under imperfect lighting even though a
// decoder still reads the clean render, so it counts as a failure of its own.
export const MIN_CONTRAST_RATIO = 3;

const BASE_PITCH_MM = 0.5;
const REFERENCE_PX_PER_MODULE = 1.5;
const REFERENCE_BLUR_FRACTION = 0.6;

export function verify(input: VerifyInput): VerifyReport {
  const { raster, expected, modules, margin, decode } = input;
  const extent = modules + margin * 2;
  const pxPerModule = raster.width / extent;
  const flat = flattenOnto(raster, "#FFFFFF");
  const contrastRatio = input.contrastRatio ?? Infinity;
  const sufficientContrast = contrastRatio >= MIN_CONTRAST_RATIO;
  const base = { contrastRatio, sufficientContrast, pxPerModule };

  if (reads(flat, expected, decode) === false) {
    return { ...base, decodes: false, survives: null, weakest: null, estimatedMinPrintSize: null };
  }

  if (input.ladder === false) {
    return { ...base, decodes: true, survives: null, weakest: null, estimatedMinPrintSize: null };
  }

  const endure = <T>(steps: T[], pristine: T, apply: (step: T) => Raster) =>
    lastSurviving(steps, pristine, apply, expected, decode);

  const survives: Survival = {
    scale: bisect(SCALE_BOUNDS.easy, SCALE_BOUNDS.hard, (f) =>
      reads(downscale(flat, f), expected, decode),
    ),
    blurPx: endure(BLUR_FRACTIONS.map((f) => f * pxPerModule), 0, (r) => blur(flat, r)),
    contrast: endure(CONTRAST_STEPS, 1, (k) => reduceContrast(flat, k)),
    rotationDeg: endure(ROTATION_STEPS, 0, (d) => rotate(flat, d)),
  };

  const minPxPerModule = survives.scale * pxPerModule;
  const resolutionPenalty = clamp(minPxPerModule / REFERENCE_PX_PER_MODULE, 1, 3);
  const blurShortfall = REFERENCE_BLUR_FRACTION - survives.blurPx / pxPerModule;
  const blurPenalty = clamp(1 + blurShortfall * 1.5, 1, 2);
  const pitchMm = BASE_PITCH_MM * resolutionPenalty * blurPenalty * (input.printPenalty ?? 1);
  const cm = (extent * pitchMm) / 10;

  return {
    ...base,
    decodes: true,
    survives,
    weakest: weakestAxis(survives, pxPerModule),
    estimatedMinPrintSize: { cm: round(cm, 1), in: round(cm / 2.54, 2) },
  };
}

function bisect(easy: number, hard: number, survives: (value: number) => boolean): number {
  let lo = easy;
  let hi = hard;

  for (let i = 0; i < SCALE_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (survives(mid)) lo = mid;
    else hi = mid;
  }

  return round(lo, 3);
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
