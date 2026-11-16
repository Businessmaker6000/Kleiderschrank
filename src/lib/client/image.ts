"use client";

import { nearestColor } from "@/lib/taxonomy";

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  previewUrl: string;
  /** palette colour guessed on the device from the garment itself */
  color: string | null;
  /** true when the background was removed and the image is a transparent cut-out */
  cutout: boolean;
}

const MAX_SIDE = 1200;

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // fall through to <img>, which supports more formats on some browsers
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Dieses Bild konnte nicht gelesen werden. Bitte ein JPEG-, PNG- oder WebP-Foto verwenden.");
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function draw(source: CanvasImageSource, width: number, height: number, sx = 0, sy = 0, sw = width, sh = height): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
  return canvas;
}

/** Bounding box of everything that is not transparent, plus the average colour of those pixels. */
function analyseCutout(canvas: HTMLCanvasElement): { box: { x: number; y: number; w: number; h: number } | null; color: string | null; coverage: number } {
  const { width, height } = canvas;
  const { data } = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, width, height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      // colour from solidly opaque pixels only, sampled sparsely
      if (a > 200 && (x & 3) === 0 && (y & 3) === 0) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
    }
  }
  if (maxX < 0) return { box: null, color: null, coverage: 0 };
  const box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  return { box, color: n ? nearestColor(r / n, g / n, b / n) : null, coverage: (n * 16) / (width * height) };
}

/** Fallback colour guess for photos that keep their background: pixels that differ from the border. */
function dominantColor(canvas: HTMLCanvasElement): string | null {
  try {
    const size = 48;
    const small = draw(canvas, size, size, 0, 0, canvas.width, canvas.height);
    const { data } = small.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, size, size);
    const px = (x: number, y: number) => {
      const i = (y * size + x) * 4;
      return [data[i], data[i + 1], data[i + 2]] as const;
    };
    const bg = [0, 0, 0];
    for (let i = 0; i < size; i++) for (const p of [px(i, 0), px(i, size - 1), px(0, i), px(size - 1, i)]) p.forEach((v, k) => (bg[k] += v / (size * 4)));
    const sum = [0, 0, 0];
    const all = [0, 0, 0];
    let n = 0;
    let allN = 0;
    for (let y = 8; y < size - 8; y++) {
      for (let x = 8; x < size - 8; x++) {
        const p = px(x, y);
        p.forEach((v, k) => (all[k] += v));
        allN++;
        if (Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 60) {
          p.forEach((v, k) => (sum[k] += v));
          n++;
        }
      }
    }
    const [r, g, b] = n > allN * 0.06 ? sum.map((v) => v / n) : all.map((v) => v / allN);
    return nearestColor(r, g, b);
  } catch {
    return null;
  }
}

/**
 * Removes the background on the device. The photo never leaves the phone for this step;
 * only the AI model itself is downloaded once (and then cached by the browser).
 */
async function removeBackground(input: Blob, onProgress?: (fraction: number) => void): Promise<Blob> {
  const { removeBackground: run } = await import("@imgly/background-removal");
  return run(input, {
    output: { format: "image/png" },
    progress: (key: string, current: number, total: number) => {
      // downloads report as "fetch:…", the actual work as "compute:…"
      if (total > 0 && key.startsWith("fetch")) onProgress?.(Math.min(0.6, (current / total) * 0.6));
      else if (total > 0) onProgress?.(0.6 + Math.min(0.4, (current / total) * 0.4));
    },
  });
}

export interface PrepareOptions {
  /** cut the garment out of its background (default true) */
  cutout?: boolean;
  onProgress?: (fraction: number) => void;
}

/**
 * Turns a raw photo into the image that is stored: scaled down, background removed,
 * cropped tightly around the garment. If the cut-out fails (old device, no network for the
 * model), the photo is kept as it is — the upload itself never depends on it.
 */
export async function prepareImage(file: Blob, options: PrepareOptions = {}): Promise<PreparedImage> {
  const img = await decode(file);
  let base: HTMLCanvasElement;
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    base = draw(img.source, Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)), 0, 0, img.width, img.height);
  } finally {
    img.close();
  }

  if (options.cutout !== false) {
    try {
      const input = await toBlob(base, "image/png");
      if (!input) throw new Error("encode failed");
      const cut = await decode(await removeBackground(input, options.onProgress));
      try {
        const full = draw(cut.source, cut.width, cut.height);
        const { box, color, coverage } = analyseCutout(full);
        // an (almost) empty result means the model found no garment — keep the photo instead
        if (box && coverage > 0.02) {
          const pad = Math.round(Math.max(box.w, box.h) * 0.03);
          const x = Math.max(0, box.x - pad);
          const y = Math.max(0, box.y - pad);
          const w = Math.min(full.width - x, box.w + pad * 2);
          const h = Math.min(full.height - y, box.h + pad * 2);
          const cropped = draw(full, w, h, x, y, w, h);
          let blob = await toBlob(cropped, "image/webp", 0.9);
          if (!blob || blob.type !== "image/webp") blob = await toBlob(cropped, "image/png");
          if (blob) return { blob, width: w, height: h, previewUrl: URL.createObjectURL(blob), color, cutout: true };
        }
      } finally {
        cut.close();
      }
    } catch (e) {
      console.warn("[cutout] background removal failed, keeping the photo", e);
    }
  }

  // plain photo on a white base
  const flat = document.createElement("canvas");
  flat.width = base.width;
  flat.height = base.height;
  const ctx = flat.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(base, 0, 0);
  let blob = await toBlob(flat, "image/webp", 0.86);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(flat, "image/jpeg", 0.88);
  if (!blob) throw new Error("Das Bild konnte nicht verarbeitet werden.");
  return { blob, width: flat.width, height: flat.height, previewUrl: URL.createObjectURL(blob), color: dominantColor(flat), cutout: false };
}
