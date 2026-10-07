import { averageFill, contrastRatio, parseColor } from "./color.js";
import { ECC_ORDER } from "./options.js";
import type { Resolved } from "./options.js";
import type { DotStyle } from "./types.js";

export interface Repair {
  field: string;
  from: unknown;
  to: unknown;
  why: string;
}

export interface Attempt {
  options: Resolved;
  repair: Repair;
}

type Strategy = (current: Resolved) => Attempt | null;

const MIN_LOGO_SIZE = 0.12;
const STURDIER_DOTS: Partial<Record<DotStyle, DotStyle>> = {
  dot: "rounded",
  "extra-rounded": "rounded",
  "classy-rounded": "classy",
  rounded: "square",
  classy: "square",
};

// Contrast comes first because it is the one failure nothing else can
// compensate for: with dots and background too close, no amount of error
// correction or logo shrinking produces a readable code.
export const STRATEGIES: Strategy[] = [
  raiseContrast,
  raiseErrorCorrection,
  widenQuietZone,
  shrinkLogo,
  sturdierDots,
];

export function nextRepair(current: Resolved): Attempt | null {
  for (const strategy of STRATEGIES) {
    const attempt = strategy(current);
    if (attempt) return attempt;
  }
  return null;
}

function raiseErrorCorrection(current: Resolved): Attempt | null {
  const to = ECC_ORDER[ECC_ORDER.length - 1]!;
  if (current.errorCorrection === to) return null;

  return {
    options: { ...current, errorCorrection: to },
    repair: {
      field: "qr.errorCorrection",
      from: current.errorCorrection,
      to,
      why: "a failing code has nothing to gain from a lower correction level",
    },
  };
}

function widenQuietZone(current: Resolved): Attempt | null {
  if (current.margin >= 4) return null;

  return {
    options: { ...current, margin: 4 },
    repair: {
      field: "margin",
      from: current.margin,
      to: 4,
      why: "scanners need four modules of clear space to find the code",
    },
  };
}

function shrinkLogo(current: Resolved): Attempt | null {
  if (!current.logo) return null;
  const from = current.logo.size ?? 0.2;
  if (from <= MIN_LOGO_SIZE) return null;
  const to = Math.max(MIN_LOGO_SIZE, round(from * 0.75));

  return {
    options: { ...current, logo: { ...current.logo, size: to } },
    repair: {
      field: "logo.size",
      from,
      to,
      why: "the logo was covering more modules than error correction could rebuild",
    },
  };
}

function raiseContrast(current: Resolved): Attempt | null {
  if (current.background === "transparent") return null;

  const dots = averageFill(current.dotColor);
  const background = averageFill(current.background);
  const ratio = contrastRatio(dots, background);
  if (ratio >= 7) return null;

  const darkOnLight = dots.r + dots.g + dots.b <= background.r + background.g + background.b;
  const to = darkOnLight ? "#000000" : "#FFFFFF";
  if (typeof current.dotColor === "string" && current.dotColor.toLowerCase() === to.toLowerCase()) {
    return null;
  }

  return {
    options: { ...current, dotColor: to, cornerSquareColor: to, cornerDotColor: to },
    repair: {
      field: "dots.color",
      from: current.dotColor,
      to,
      why: `contrast against the background was ${ratio.toFixed(1)}:1, below the 7:1 a scanner wants`,
    },
  };
}

function sturdierDots(current: Resolved): Attempt | null {
  const to = STURDIER_DOTS[current.dotStyle];
  if (!to) return null;

  return {
    options: { ...current, dotStyle: to },
    repair: {
      field: "dots.style",
      from: current.dotStyle,
      to,
      why: "rounder dots leave less ink per module, which a scanner reads as noise",
    },
  };
}

export function contrastOf(current: Resolved): number {
  if (current.background === "transparent") {
    return contrastRatio(averageFill(current.dotColor), parseColor("#FFFFFF"));
  }
  return contrastRatio(averageFill(current.dotColor), averageFill(current.background));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
