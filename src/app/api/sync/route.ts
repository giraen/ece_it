import {
  headers,
  MAX_PARTS,
  noStore,
  partPaths,
  problem,
  removeFiles,
  setup,
  SPACE,
  UPLOAD,
  upstream,
} from "./supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST { action: "head", space } says which version of the synced copy is in the cloud, and how it is stored.
 * POST { action: "commit", space, expected, upload, parts, size } makes an uploaded copy the current one, but only if
 * the cloud still has version `expected`. If another device saved first, it answers ok: false and this device merges
 * that copy and tries again, so no device ever overwrites another's work.
 */

interface Head {
  version: number;
  upload?: string;
  parts?: number;
  size?: number;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return problem(400, "The request was not valid.");
  }
  const space = body.space;
  if (typeof space !== "string" || !SPACE.test(space)) return problem(400, "The sync code is not valid.");
  const cfg = setup();
  if (cfg instanceof Response) return cfg;

  try {
    if (body.action === "head") {
      const q = new URLSearchParams({ select: "version,upload,parts,size", space: `eq.${space}` });
      const res = await fetch(`${cfg.url}/rest/v1/sync_snapshots?${q}`, {
        headers: headers(cfg.key),
        cache: "no-store",
      });
      if (!res.ok) return upstream(res);
      const rows = (await res.json()) as Head[];
      const h = rows[0];
      return Response.json(
        h
          ? { version: Number(h.version), upload: h.upload, parts: Number(h.parts), size: Number(h.size) }
          : { version: 0 },
        noStore,
      );
    }

    if (body.action === "commit") {
      const { expected, upload, parts, size } = body;
      if (
        !Number.isSafeInteger(expected) ||
        (expected as number) < 0 ||
        typeof upload !== "string" ||
        !UPLOAD.test(upload) ||
        !Number.isSafeInteger(parts) ||
        (parts as number) < 1 ||
        (parts as number) > MAX_PARTS ||
        !Number.isSafeInteger(size)
      ) {
        return problem(400, "The request was not valid.");
      }
      const res = await fetch(`${cfg.url}/rest/v1/rpc/sync_commit`, {
        method: "POST",
        headers: headers(cfg.key, { "Content-Type": "application/json" }),
        body: JSON.stringify({ p_space: space, p_expected: expected, p_upload: upload, p_parts: parts, p_size: size }),
        cache: "no-store",
      });
      if (!res.ok) return upstream(res);
      const out = (await res.json()) as { ok: boolean; version: number; old_upload?: string; old_parts?: number };
      // The copy that was replaced, or this upload if it lost the race, is no longer needed.
      if (out.ok && out.old_upload) await removeFiles(cfg, partPaths(space, out.old_upload, Number(out.old_parts)));
      if (!out.ok) await removeFiles(cfg, partPaths(space, upload, parts as number));
      return Response.json({ ok: out.ok, version: Number(out.version) }, noStore);
    }

    return problem(400, "Unknown sync action.");
  } catch (e) {
    console.error("Sync route failed", e);
    return problem(502, "Could not reach the sync server. Try again in a moment.");
  }
}
