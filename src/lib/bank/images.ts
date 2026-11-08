import { db } from "./db";
import { now } from "./ids";

const MAX_WIDTH = 1200;

/** Small non-cryptographic hash, used only when crypto.subtle is unavailable (insecure origins). */
function fallbackHash(bytes: Uint8Array): string {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < bytes.length; i++) {
    const k = bytes[i];
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1]
    .map((x) => (x >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

/** Content hash used as the image id. SHA-256 on secure origins, a fallback hash otherwise. */
async function contentHash(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  if (typeof crypto.subtle?.digest === "function") {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return fallbackHash(new Uint8Array(bytes));
}

/**
 * Stores a pasted or dropped image and returns its id.
 * Raster images are scaled down to MAX_WIDTH and saved as WebP. SVG is kept as is.
 */
export async function storeImage(file: Blob): Promise<string> {
  let blob: Blob = file;
  let width = 0;
  let height = 0;

  if (file.type !== "image/svg+xml") {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_WIDTH / bitmap.width);
    width = Math.round(bitmap.width * scale);
    height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process the image.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))),
        "image/webp",
        0.85,
      );
    });
  }

  const id = (await contentHash(blob)).slice(0, 24);
  const existing = await db.images.get(id);
  if (!existing) {
    await db.images.add({ id, blob, mime: blob.type, width, height, createdAt: now() });
  }
  return id;
}

/** Object URLs are cached per image id for the life of the tab. Images are content-addressed, so they never change. */
const urlCache = new Map<string, string>();

export async function imageUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const rec = await db.images.get(id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  return url;
}