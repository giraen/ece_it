import { config, headers, ID, KINDS, problem, SetupError, SPACE, upstream } from "./supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST { action: "push", space, rows } saves encrypted items. A row only replaces an older version of itself.
 * POST { action: "pull", space, since, limit } returns the items saved after the change counter `since`.
 */

const MAX_ROWS = 2000;
const MAX_ROW_BYTES = 3_000_000;
const MAX_LIMIT = 1000;

interface Row {
  kind: string;
  id: string;
  updated_at: number;
  data: string;
}

function validRow(r: unknown): r is Row {
  if (!r || typeof r !== "object") return false;
  const x = r as Record<string, unknown>;
  return (
    typeof x.kind === "string" &&
    KINDS.has(x.kind) &&
    typeof x.id === "string" &&
    ID.test(x.id) &&
    typeof x.updated_at === "number" &&
    Number.isSafeInteger(x.updated_at) &&
    typeof x.data === "string" &&
    x.data.length > 0 &&
    x.data.length <= MAX_ROW_BYTES
  );
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

  let cfg: { url: string; key: string };
  try {
    cfg = config();
  } catch (e) {
    return problem(503, e instanceof SetupError ? e.message : "Sync is not set up.");
  }

  try {
    if (body.action === "push") {
      const rows = body.rows;
      if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS || !rows.every(validRow)) {
        return problem(400, "Some items could not be sent.");
      }
      const res = await fetch(`${cfg.url}/rest/v1/rpc/sync_push`, {
        method: "POST",
        headers: headers(cfg.key, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          p_space: space,
          p_rows: rows.map(({ kind, id, updated_at, data }) => ({ kind, id, updated_at, data })),
        }),
        cache: "no-store",
      });
      if (!res.ok) return upstream(res);
      return Response.json({ seq: Number(await res.json()) || 0 }, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "pull") {
      const since = Number(body.since);
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || 500));
      if (!Number.isSafeInteger(since) || since < 0) return problem(400, "The request was not valid.");
      const q = new URLSearchParams({
        select: "kind,id,updated_at,seq,data",
        space: `eq.${space}`,
        seq: `gt.${since}`,
        order: "seq.asc",
        limit: String(limit),
      });
      const res = await fetch(`${cfg.url}/rest/v1/sync_records?${q}`, {
        headers: headers(cfg.key),
        cache: "no-store",
      });
      if (!res.ok) return upstream(res);
      const rows = (await res.json()) as (Row & { seq: number | string })[];
      return Response.json(
        { rows: rows.map((r) => ({ ...r, seq: Number(r.seq), updated_at: Number(r.updated_at) })) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return problem(400, "Unknown sync action.");
  } catch (e) {
    console.error("Sync route failed", e);
    return problem(502, "Could not reach the sync server. It will try again.");
  }
}
