import { BUCKET, config, headers, ID, problem, SetupError, SPACE, upstream } from "../supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * PUT ?space&id with the encrypted image bytes saves it. GET ?space&id returns them.
 * Images are stored in a private Supabase bucket, one file per image, under the space's folder.
 */

const MAX_BYTES = 4_200_000;

function target(req: Request): { space: string; id: string } | null {
  const u = new URL(req.url);
  const space = u.searchParams.get("space") ?? "";
  const id = u.searchParams.get("id") ?? "";
  return SPACE.test(space) && ID.test(id) ? { space, id } : null;
}

function setup(): { url: string; key: string } | Response {
  try {
    return config();
  } catch (e) {
    return problem(503, e instanceof SetupError ? e.message : "Sync is not set up.");
  }
}

export async function PUT(req: Request) {
  const t = target(req);
  if (!t) return problem(400, "The request was not valid.");
  const cfg = setup();
  if (cfg instanceof Response) return cfg;
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return problem(413, "The image is too big to sync.");
  try {
    const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${t.space}/${t.id}`, {
      method: "POST",
      headers: headers(cfg.key, { "Content-Type": "application/octet-stream", "x-upsert": "true" }),
      body: bytes,
      cache: "no-store",
    });
    if (!res.ok) return upstream(res);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return problem(502, "Could not reach the sync server.");
  }
}

export async function GET(req: Request) {
  const t = target(req);
  if (!t) return problem(400, "The request was not valid.");
  const cfg = setup();
  if (cfg instanceof Response) return cfg;
  try {
    const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${t.space}/${t.id}`, {
      headers: headers(cfg.key),
      cache: "no-store",
    });
    if (!res.ok) return upstream(res);
    return new Response(await res.arrayBuffer(), {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" },
    });
  } catch {
    return problem(502, "Could not reach the sync server.");
  }
}
