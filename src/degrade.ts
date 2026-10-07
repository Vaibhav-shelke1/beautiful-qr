import type { Raster } from "./raster.js";

export function downscale(raster: Raster, factor: number): Raster {
  const width = Math.max(1, Math.round(raster.width * factor));
  const height = Math.max(1, Math.round(raster.height * factor));
  if (width === raster.width && height === raster.height) return raster;

  const data = new Uint8ClampedArray(width * height * 4);
  const xRatio = raster.width / width;
  const yRatio = raster.height / height;

  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.min(raster.height, Math.max(y0 + 1, Math.floor((y + 1) * yRatio)));

    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.min(raster.width, Math.max(x0 + 1, Math.floor((x + 1) * xRatio)));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * raster.width + sx) * 4;
          r += raster.data[i]!;
          g += raster.data[i + 1]!;
          b += raster.data[i + 2]!;
          a += raster.data[i + 3]!;
          count++;
        }
      }

      const o = (y * width + x) * 4;
      data[o] = r / count;
      data[o + 1] = g / count;
      data[o + 2] = b / count;
      data[o + 3] = a / count;
    }
  }

  return { width, height, data };
}

export function blur(raster: Raster, radius: number): Raster {
  if (radius <= 0) return raster;

  const box = Math.max(1, Math.round(radius));
  let current = raster;
  for (let pass = 0; pass < 3; pass++) current = boxPass(current, box);
  return current;
}

function boxPass(raster: Raster, radius: number): Raster {
  const horizontal = axisBlur(raster, radius, true);
  return axisBlur(horizontal, radius, false);
}

function axisBlur(raster: Raster, radius: number, horizontal: boolean): Raster {
  const { width, height } = raster;
  const src = raster.data;
  const data = new Uint8ClampedArray(src.length);
  const span = radius * 2 + 1;
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  const step = horizontal ? 4 : width * 4;
  const last = inner - 1;

  for (let o = 0; o < outer; o++) {
    const base = horizontal ? o * width * 4 : o * 4;
    const at = (i: number) => base + Math.min(last, Math.max(0, i)) * step;

    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;

    for (let k = -radius; k <= radius; k++) {
      const j = at(k);
      r += src[j]!;
      g += src[j + 1]!;
      b += src[j + 2]!;
      a += src[j + 3]!;
    }

    for (let i = 0; i < inner; i++) {
      const out = base + i * step;
      data[out] = r / span;
      data[out + 1] = g / span;
      data[out + 2] = b / span;
      data[out + 3] = a / span;

      const leave = at(i - radius);
      const enter = at(i + radius + 1);
      r += src[enter]! - src[leave]!;
      g += src[enter + 1]! - src[leave + 1]!;
      b += src[enter + 2]! - src[leave + 2]!;
      a += src[enter + 3]! - src[leave + 3]!;
    }
  }

  return { width, height, data };
}

export function reduceContrast(raster: Raster, keep: number): Raster {
  const data = new Uint8ClampedArray(raster.data.length);

  for (let i = 0; i < raster.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      data[i + c] = 128 + (raster.data[i + c]! - 128) * keep;
    }
    data[i + 3] = raster.data[i + 3]!;
  }

  return { width: raster.width, height: raster.height, data };
}

export function rotate(raster: Raster, degrees: number): Raster {
  if (degrees === 0) return raster;

  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const { width, height } = raster;
  const size = Math.ceil((width * Math.abs(cos) + height * Math.abs(sin)) * 1.02);
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      const sx = dx * cos + dy * sin + cx;
      const sy = -dx * sin + dy * cos + cy;
      if (sx < 0 || sy < 0 || sx >= width - 1 || sy >= height - 1) continue;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const o = (y * size + x) * 4;

      for (let c = 0; c < 4; c++) {
        const p00 = raster.data[(y0 * width + x0) * 4 + c]!;
        const p10 = raster.data[(y0 * width + x0 + 1) * 4 + c]!;
        const p01 = raster.data[((y0 + 1) * width + x0) * 4 + c]!;
        const p11 = raster.data[((y0 + 1) * width + x0 + 1) * 4 + c]!;
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        data[o + c] = top + (bottom - top) * fy;
      }
    }
  }

  return { width: size, height: size, data };
}
