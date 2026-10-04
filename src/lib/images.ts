import { db } from "./db";
import { now } from "./ids";

const MAX_WIDTH = 1200;

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  const id = (await sha256Hex(blob)).slice(0, 24);
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
