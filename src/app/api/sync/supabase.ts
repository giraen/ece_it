/**
 * The server side of sync: talks to Supabase with the secret key, which only exists here (in Vercel's environment
 * variables) and is never sent to a browser.
 *
 * Everything it stores was encrypted on the device with the sync code, which never reaches the server, so even with
 * the key nobody can read it.
 *
 * The synced copy is one file, like a backup, kept in a private bucket as numbered parts of at most 3.5 MB (the most
 * a Vercel function passes on is 4.5 MB). Images are separate files, one per picture, stored once.
 */

/** The shared data's name: a 64-character hash of the sync code. */
export const SPACE = /^[0-9a-f]{64}$/;
/** A name for one upload of the synced copy. */
export const UPLOAD = /^[0-9a-z]{16,40}$/;
/** Image ids are SHA-256 hashes of the picture. */
export const IMAGE = /^[0-9a-f]{64}$/;
export const MAX_PARTS = 200;
export const MAX_PART_BYTES = 3_700_000;

export const BUCKET = "sync-files";

export class SetupError extends Error {}

export function config(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    throw new SetupError(
      "Sync is not set up on the server yet. Add SUPABASE_URL and SUPABASE_SECRET_KEY to the site's environment variables, then redeploy.",
    );
  }
  return { url, key };
}

/** Headers for Supabase. A new secret key goes in apikey only; an older service_role key (a JWT) also as Bearer. */
export function headers(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: key,
    ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
    ...extra,
  };
}

export function problem(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export function setup(): { url: string; key: string } | Response {
  try {
    return config();
  } catch (e) {
    return problem(503, e instanceof SetupError ? e.message : "Sync is not set up.");
  }
}

/** Turns a failed Supabase answer into a short message, without passing on anything secret. */
export async function upstream(res: Response): Promise<Response> {
  const text = await res.text().catch(() => "");
  console.error("Supabase error", res.status, text.slice(0, 500));
  if (res.status === 401 || res.status === 403) {
    return problem(502, "The sync server refused the key. Check SUPABASE_SECRET_KEY in the site's settings.");
  }
  if (res.status === 404) {
    return problem(502, "The sync storage was not found. Run the setup SQL in Supabase.");
  }
  return problem(502, `The sync server had a problem (${res.status}). Try again in a moment.`);
}

/** Stores one file in the bucket, replacing any file with that name. */
export async function putFile(
  cfg: { url: string; key: string },
  path: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Response> {
  return fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: headers(cfg.key, { "Content-Type": "application/octet-stream", "x-upsert": "true" }),
    body: new Uint8Array(bytes),
    cache: "no-store",
  });
}

export async function getFile(cfg: { url: string; key: string }, path: string): Promise<Response> {
  return fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${path}`, { headers: headers(cfg.key), cache: "no-store" });
}

/** Removes files. Used to clear out an older copy once a newer one is saved. */
export async function removeFiles(cfg: { url: string; key: string }, paths: string[]): Promise<void> {
  if (!paths.length) return;
  await fetch(`${cfg.url}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: headers(cfg.key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: paths }),
    cache: "no-store",
  }).catch(() => undefined);
}

export const partPaths = (space: string, upload: string, parts: number) =>
  Array.from({ length: parts }, (_, i) => `${space}/copy/${upload}/${i}`);

export const noStore = { headers: { "Cache-Control": "no-store" } };
