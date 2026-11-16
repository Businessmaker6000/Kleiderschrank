"use client";

import { nearestColor } from "@/lib/taxonomy";

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  previewUrl: string;
  /** palette colour guessed on the device from the garment itself */
  color: string | null;
  /** true when the background is gone and the image is a transparent cut-out */
  cutout: boolean;
  /** true when the image was redrawn by the image model as a shop-style product shot */
  studio: boolean;
  /** why a requested step was skipped (shown to the user) */
  note: string | null;
}

export type Stage = "studio" | "cutout";

export interface PrepareOptions {
  /** let the image model redraw the garment as a product shot (needs the server feature) */
  studio?: boolean;
  /** cut the garment out of its background (default true) */
  cutout?: boolean;
  onStage?: (stage: Stage) => void;
  onProgress?: (fraction: number) => void;
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

async function toCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const img = await decode(blob);
  try {
    return draw(img.source, img.width, img.height);
  } finally {
    img.close();
  }
}

function onWhite(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  return flat;
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

type Finished = Pick<PreparedImage, "blob" | "width" | "height" | "previewUrl" | "color">;

/** Crops a transparent image tightly around the garment and encodes it. Null when (almost) nothing is left. */
async function finishCutout(full: HTMLCanvasElement): Promise<Finished | null> {
  const { box, color, coverage } = analyseCutout(full);
  if (!box || coverage < 0.02) return null;
  const pad = Math.round(Math.max(box.w, box.h) * 0.03);
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const w = Math.min(full.width - x, box.w + pad * 2);
  const h = Math.min(full.height - y, box.h + pad * 2);
  // stored images do not need more than this
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cropped = draw(full, Math.round(w * scale), Math.round(h * scale), x, y, w, h);
  let blob = await toBlob(cropped, "image/webp", 0.9);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(cropped, "image/png");
  if (!blob) return null;
  return { blob, width: cropped.width, height: cropped.height, previewUrl: URL.createObjectURL(blob), color };
}

/** Asks the server's image model for a shop-style product shot of the photographed garment. */
async function studioShot(base: HTMLCanvasElement, options: PrepareOptions): Promise<Finished> {
  const photo = await toBlob(onWhite(base), "image/jpeg", 0.9);
  if (!photo) throw new Error("Das Foto konnte nicht vorbereitet werden.");
  const form = new FormData();
  form.append("image", photo, "photo.jpg");
  let res: Response;
  try {
    res = await fetch("/api/studio", { method: "POST", body: form, credentials: "same-origin" });
  } catch {
    throw new Error("Keine Verbindung zur Bild-KI.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Das Studiobild konnte nicht erzeugt werden.");
  }
  const generated = await res.blob();
  let canvas = await toCanvas(generated);
  // the model was asked for a transparent background; if it drew one anyway, cut it out here
  if (analyseCutout(canvas).coverage > 0.97) {
    options.onStage?.("cutout");
    canvas = await toCanvas(await removeBackground(generated, options.onProgress));
  }
  const done = await finishCutout(canvas);
  if (!done) throw new Error("Die Bild-KI hat ein leeres Bild geliefert.");
  return done;
}

/**
 * Turns a raw photo into the image that is stored.
 *  1. optional: the image model redraws the garment as a clean product shot
 *  2. otherwise: the garment is cut out of its background on the device
 *  3. if neither works, the photo is kept as it is — an upload never depends on these steps
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

  let note: string | null = null;

  if (options.studio) {
    options.onStage?.("studio");
    try {
      return { ...(await studioShot(base, options)), cutout: true, studio: true, note: null };
    } catch (e) {
      note = `${(e as Error).message} Stattdessen wurde dein Foto freigestellt.`;
    }
  }

  if (options.cutout !== false) {
    options.onStage?.("cutout");
    try {
      const input = await toBlob(base, "image/png");
      if (!input) throw new Error("encode failed");
      const done = await finishCutout(await toCanvas(await removeBackground(input, options.onProgress)));
      // an (almost) empty result means the model found no garment — keep the photo instead
      if (done) return { ...done, cutout: true, studio: false, note };
    } catch (e) {
      console.warn("[cutout] background removal failed, keeping the photo", e);
    }
    note = "Der Hintergrund liess sich nicht entfernen – das Foto wird unverändert gespeichert.";
  }

  // plain photo on a white base
  const flat = onWhite(base);
  let blob = await toBlob(flat, "image/webp", 0.86);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(flat, "image/jpeg", 0.88);
  if (!blob) throw new Error("Das Bild konnte nicht verarbeitet werden.");
  return { blob, width: flat.width, height: flat.height, previewUrl: URL.createObjectURL(blob), color: dominantColor(flat), cutout: false, studio: false, note };
}
