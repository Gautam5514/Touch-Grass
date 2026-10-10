import { MAX_AI_DIMENSION } from "./ai/config";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const STORE_MAX = 720;
const THUMB_MAX = 256;

export class ImageError extends Error {
  constructor(readonly code: "type" | "size" | "decode" | "empty", message: string) {
    super(message);
  }
}

export interface PreparedImage {
  /** RGB pixels for the model. */
  rgb: { data: Uint8ClampedArray; width: number; height: number };
  /** Compressed copy kept in the journal. */
  image: Blob;
  thumbnail: Blob;
}

export function validateFile(file: Blob & { name?: string }) {
  if (!file || file.size === 0) throw new ImageError("empty", "That file is empty. Please choose another photo.");
  if (file.type && !file.type.startsWith("image/")) throw new ImageError("type", "That isn’t an image. Please choose a photo.");
  if (file.size > MAX_FILE_BYTES) throw new ImageError("size", `That photo is too large (over ${MAX_FILE_BYTES / 1024 / 1024} MB). Try a smaller one.`);
}

/** Largest size that keeps aspect ratio and fits within `max` on the long edge (never upscales). */
export function fitWithin(w: number, h: number, max: number) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

function draw(bmp: ImageBitmap, max: number) {
  const { width, height } = fitWithin(bmp.width, bmp.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new ImageError("decode", "Your browser couldn’t process this image.");
  ctx.drawImage(bmp, 0, 0, width, height);
  return { canvas, ctx, width, height };
}

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new ImageError("decode", "Couldn’t compress the photo."))), "image/jpeg", quality));

/** Decodes with EXIF orientation applied, then derives the model input, a journal copy and a thumbnail. */
export async function prepareImage(file: Blob & { name?: string }): Promise<PreparedImage> {
  validateFile(file);
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageError("decode", "We couldn’t read that image. It may be damaged or in an unsupported format.");
  }
  try {
    const ai = draw(bmp, MAX_AI_DIMENSION);
    const rgba = ai.ctx.getImageData(0, 0, ai.width, ai.height).data;
    const rgb = new Uint8ClampedArray(ai.width * ai.height * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }
    const [image, thumbnail] = await Promise.all([toJpeg(draw(bmp, STORE_MAX).canvas, 0.8), toJpeg(draw(bmp, THUMB_MAX).canvas, 0.7)]);
    return { rgb: { data: rgb, width: ai.width, height: ai.height }, image, thumbnail };
  } finally {
    bmp.close();
  }
}
