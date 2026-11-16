"use client";

import { nearestColor } from "@/lib/taxonomy";

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  previewUrl: string;
  /** palette colour guessed on the device from the photo itself */
  color: string | null;
}

const MAX_SIDE = 1400;

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
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

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Estimates the garment colour: average of the pixels that differ from the photo's border (the background). */
function dominantColor(canvas: HTMLCanvasElement): string | null {
  try {
    const size = 48;
    const small = document.createElement("canvas");
    small.width = small.height = size;
    const ctx = small.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(canvas, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const px = (x: number, y: number) => {
      const i = (y * size + x) * 4;
      return [data[i], data[i + 1], data[i + 2]] as const;
    };
    const bg = [0, 0, 0];
    let bgN = 0;
    for (let i = 0; i < size; i++) {
      for (const p of [px(i, 0), px(i, size - 1), px(0, i), px(size - 1, i)]) {
        bg[0] += p[0];
        bg[1] += p[1];
        bg[2] += p[2];
        bgN++;
      }
    }
    bg.forEach((_, i) => (bg[i] /= bgN));
    const sum = [0, 0, 0];
    let n = 0;
    const all = [0, 0, 0];
    let allN = 0;
    for (let y = 8; y < size - 8; y++) {
      for (let x = 8; x < size - 8; x++) {
        const p = px(x, y);
        all[0] += p[0];
        all[1] += p[1];
        all[2] += p[2];
        allN++;
        if (Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 60) {
          sum[0] += p[0];
          sum[1] += p[1];
          sum[2] += p[2];
          n++;
        }
      }
    }
    // if barely anything stands out, the garment has the colour of its background
    const [r, g, b] = n > allN * 0.06 ? sum.map((v) => v / n) : all.map((v) => v / allN);
    return nearestColor(r, g, b);
  } catch {
    return null;
  }
}

/** Downscales and re-encodes a photo on the device, so uploads stay small and fast on mobile data. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const img = await decode(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    // white base: transparent cut-outs stay clean on the tile
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.source, 0, 0, width, height);

    let blob = await toBlob(canvas, "image/webp", 0.86);
    // Safari silently falls back to PNG when it cannot encode WebP
    if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", 0.88);
    if (!blob) throw new Error("Das Bild konnte nicht verarbeitet werden.");
    return { blob, width, height, previewUrl: URL.createObjectURL(blob), color: dominantColor(canvas) };
  } finally {
    img.close();
  }
}
