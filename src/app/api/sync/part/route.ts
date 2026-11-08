import { getFile, MAX_PART_BYTES, MAX_PARTS, problem, putFile, setup, SPACE, UPLOAD, upstream } from "../supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** PUT ?space&upload&n saves one part of an uploaded copy. GET returns it. */

function target(req: Request): string | null {
  const u = new URL(req.url);
  const space = u.searchParams.get("space") ?? "";
  const upload = u.searchParams.get("upload") ?? "";
  const n = Number(u.searchParams.get("n"));
  if (!SPACE.test(space) || !UPLOAD.test(upload) || !Number.isInteger(n) || n < 0 || n >= MAX_PARTS) return null;
  return `${space}/copy/${upload}/${n}`;
}

export async function PUT(req: Request) {
  const path = target(req);
  if (!path) return problem(400, "The request was not valid.");
  const cfg = setup();
  if (cfg instanceof Response) return cfg;
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PART_BYTES) return problem(413, "That part is too big.");
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
