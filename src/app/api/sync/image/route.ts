import { getFile, IMAGE, MAX_PART_BYTES, problem, putFile, setup, SPACE, upstream } from "../supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * PUT ?space&id saves one encrypted image. GET returns it. An image never changes (its id is a hash of the picture),
 * so each one is sent once and kept.
 */

function target(req: Request): string | null {
  const u = new URL(req.url);
  const space = u.searchParams.get("space") ?? "";
  const id = u.searchParams.get("id") ?? "";
  return SPACE.test(space) && IMAGE.test(id) ? `${space}/img/${id}` : null;
}

export async function PUT(req: Request) {
  const path = target(req);
  if (!path) return problem(400, "The request was not valid.");
  const cfg = setup();
  if (cfg instanceof Response) return cfg;
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PART_BYTES) return problem(413, "The image is too big to sync.");
  try {
    const res = await putFile(cfg, path, bytes);
    if (!res.ok) return upstream(res);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return problem(502, "Could not reach the sync server.");
  }
}

export async function GET(req: Request) {
  const path = target(req);
  if (!path) return problem(400, "The request was not valid.");
  const cfg = setup();
  if (cfg instanceof Response) return cfg;
  try {
    const res = await getFile(cfg, path);
    if (!res.ok) return upstream(res);
    return new Response(await res.arrayBuffer(), {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" },
    });
  } catch {
    return problem(502, "Could not reach the sync server.");
  }
}
