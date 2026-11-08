/**
 * The server side of sync: talks to Supabase with the secret key, which only exists here (in Vercel's environment
 * variables) and is never sent to a browser.
 *
 * What it stores is already encrypted by the device, so even with the key nobody can read the items.
 */

export const KINDS = new Set([
  "nodes",
  "questions",
  "blueprints",
  "attempts",
  "variants",
  "settings",
  "concepts",
  "drafts",
  "images",
  "prefs",
]);

/** The shared data's name: a 64-character hash of the sync code. */
export const SPACE = /^[0-9a-f]{64}$/;
/** Item ids: uuids, hashes, and names such as "fixed-math" or "ai:providers". */
export const ID = /^[\w.:-]{1,128}$/;

export const BUCKET = "sync-images";

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

/** Turns a failed Supabase answer into a short message, without passing on anything secret. */
export async function upstream(res: Response): Promise<Response> {
  const text = await res.text().catch(() => "");
  console.error("Supabase error", res.status, text.slice(0, 500));
  if (res.status === 401 || res.status === 403) {
    return problem(502, "The sync server refused the key. Check SUPABASE_SECRET_KEY in the site's settings.");
  }
  if (res.status === 404) {
    return problem(502, "The sync tables were not found. Run the setup SQL in Supabase.");
  }
  return problem(502, `The sync server had a problem (${res.status}). It will try again.`);
}
