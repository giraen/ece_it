import { db, type StoredImage, type TreeNode } from "@/lib/db";
import { FIXED_CATEGORIES } from "@/lib/bank/categories";
import { mergeById } from "@/lib/backup/merge";
import { now } from "@/lib/ids";
import { keyOf, open, openJson, seal, sealJson, spaceOf } from "./crypto";
import { applyPrefs, readPrefs, type DevicePrefs } from "./devicePrefs";
import { loadConfig, loadPushed, saveConfig, savePushed, setStatus, type SyncConfig } from "./syncState";

/**
 * Two-way sync through the site's /api/sync route, which stores everything in Supabase.
 *
 * Every item is encrypted here before it is sent, and the server only stores the scrambled text. A sync:
 * 1. Pulls what other devices sent since last time, and merges it in with the same rule a backup Merge uses: the
 *    newer copy of each item wins, and a deletion is just a newer copy with deletedAt.
 * 2. Sends every item that changed here since the server last had it.
 * Images are sent as their own encrypted files, before the item that names them.
 */

/** The database tables that sync, in the order they are applied. */
const TABLES = ["nodes", "questions", "blueprints", "attempts", "variants", "settings", "concepts", "drafts"] as const;
type TableKind = (typeof TABLES)[number];
type Kind = TableKind | "images" | "prefs";

interface Row {
  kind: Kind;
  id: string;
  updated_at: number;
  data: string;
  seq?: number;
}

interface ImageMeta {
  id: string;
  mime: string;
  width: number;
  height: number;
  createdAt: number;
}

const PULL_PAGE = 500;
/** Each push stays well under the 4.5 MB a Vercel function accepts. */
const PUSH_BYTES = 2_500_000;
/** The biggest single image sync sends. Bigger ones stay on the device they were added on. */
export const MAX_IMAGE_BYTES = 4_000_000;

export class SyncError extends Error {}

async function api<T>(body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new SyncError("You seem to be offline. Sync will try again when you are back online.");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new SyncError(json.error ?? `The sync server answered ${res.status}.`);
  return json;
}

const imageUrl = (space: string, id: string) =>
  `/api/sync/image?space=${encodeURIComponent(space)}&id=${encodeURIComponent(id)}`;

async function uploadImage(space: string, key: CryptoKey, img: StoredImage): Promise<boolean> {
  const bytes = new Uint8Array(await img.blob.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) return false;
  const sealed = await seal(key, bytes);
  const res = await fetch(imageUrl(space, img.id), {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Blob([new Uint8Array(sealed)]),
  }).catch(() => null);
  return !!res?.ok;
}

async function downloadImage(space: string, key: CryptoKey, meta: ImageMeta): Promise<boolean> {
  const res = await fetch(imageUrl(space, meta.id)).catch(() => null);
  if (!res?.ok) return false;
  try {
    const bytes = await open(key, new Uint8Array(await res.arrayBuffer()));
    await db.images.put({ ...meta, blob: new Blob([new Uint8Array(bytes)], { type: meta.mime }) });
    return true;
  } catch {
    return false;
  }
}

/**
 * The four fixed categories are made on every device, so two devices that each started on their own can end up with
 * two MATH categories after a sync. This keeps the one that holds things and removes the empty copies.
 */
async function tidyCategories(): Promise<void> {
  const nodes = (await db.nodes.toArray()).filter((n) => !n.deletedAt);
  const hasChildren = (id: string) => nodes.some((n) => n.parentId === id || n.parentIds?.includes(id));
  const t = now();
  for (const f of FIXED_CATEGORIES) {
    const same = nodes.filter((n) => n.kind === "category" && n.name.trim().toLowerCase() === f.name.toLowerCase());
    if (same.length < 2) continue;
    const rank = (n: TreeNode) => (hasChildren(n.id) ? 2 : 0) + (n.id.startsWith("fixed-") ? 0 : 1);
    const keep = [...same].sort((a, b) => rank(b) - rank(a) || a.createdAt - b.createdAt)[0];
    for (const n of same) {
      if (n.id !== keep.id && !hasChildren(n.id)) await db.nodes.update(n.id, { deletedAt: t, updatedAt: t });
    }
  }
}

async function pull(
  cfg: SyncConfig,
  space: string,
  key: CryptoKey,
  pushed: Record<string, number>,
  waiting: Set<string>,
): Promise<number> {
  let since = cfg.lastSeq;
  const incoming = new Map<Kind, { id: string; updatedAt: number; value: unknown }[]>();
  for (;;) {
    const { rows } = await api<{ rows: Row[] }>({ action: "pull", space, since, limit: PULL_PAGE });
    for (const r of rows) {
      since = Math.max(since, r.seq ?? since);
      try {
        const value = await openJson<unknown>(key, r.data);
        incoming.set(r.kind, [...(incoming.get(r.kind) ?? []), { id: r.id, updatedAt: r.updated_at, value }]);
      } catch {
        // An item this code cannot open. It cannot be ours, so it is skipped.
      }
    }
    setStatus({ step: "Receiving changes…" });
    if (rows.length < PULL_PAGE) break;
  }

  let applied = 0;
  for (const kind of TABLES) {
    const got = incoming.get(kind);
    if (!got?.length) continue;
    const table = db.table(kind);
    const local = (await table.bulkGet(got.map((g) => g.id))).filter(Boolean) as { id: string; updatedAt: number }[];
    const { puts } = mergeById(
      local,
      got.map((g) => g.value as { id: string; updatedAt: number }),
    );
    if (puts.length) await table.bulkPut(puts);
    applied += puts.length;
    for (const g of got) pushed[`${kind}:${g.id}`] = g.updatedAt;
  }

  for (const g of incoming.get("images") ?? []) {
    pushed[`images:${g.id}`] = g.updatedAt;
    if (!(await db.images.get(g.id))) waiting.add(JSON.stringify(g.value));
  }

  const prefs = incoming.get("prefs")?.find((g) => g.id === "device");
  if (prefs) {
    pushed["prefs:device"] = prefs.updatedAt;
    if (prefs.updatedAt > readPrefs().updatedAt) applyPrefs(prefs.value as DevicePrefs);
  }

  if (applied) await tidyCategories();
  return since;
}

async function push(
  space: string,
  key: CryptoKey,
  pushed: Record<string, number>,
): Promise<{ sent: number; skipped: number }> {
  const rows: Row[] = [];
  for (const kind of TABLES) {
    const all = (await db.table(kind).toArray()) as { id: string; updatedAt: number }[];
    for (const r of all) {
      if (pushed[`${kind}:${r.id}`] === r.updatedAt) continue;
      rows.push({ kind, id: r.id, updated_at: r.updatedAt, data: await sealJson(key, r) });
    }
  }

  // Images first, so no item ever points at a picture the server does not have yet.
  let skipped = 0;
  const imageIds = (await db.images.toCollection().primaryKeys()) as string[];
  const newImages = imageIds.filter((id) => pushed[`images:${id}`] === undefined);
  let n = 0;
  for (const id of newImages) {
    const img = await db.images.get(id);
    if (!img) continue;
    setStatus({ step: `Sending images… ${++n} of ${newImages.length}` });
    if (!(await uploadImage(space, key, img))) {
      skipped++;
      continue;
    }
    const meta: ImageMeta = { id, mime: img.mime, width: img.width, height: img.height, createdAt: img.createdAt };
    rows.push({ kind: "images", id, updated_at: img.createdAt, data: await sealJson(key, meta) });
  }

  const prefs = readPrefs();
  if (prefs.updatedAt > 0 && pushed["prefs:device"] !== prefs.updatedAt) {
    rows.push({ kind: "prefs", id: "device", updated_at: prefs.updatedAt, data: await sealJson(key, prefs) });
  }

  // Send in batches small enough for the server.
  let batch: Row[] = [];
  let size = 0;
  let sent = 0;
  const flush = async () => {
    if (!batch.length) return;
    setStatus({ step: `Sending changes… ${sent + batch.length} of ${rows.length}` });
    await api({ action: "push", space, rows: batch });
    for (const r of batch) pushed[`${r.kind}:${r.id}`] = r.updated_at;
    savePushed(pushed);
    sent += batch.length;
    batch = [];
    size = 0;
  };
  for (const r of rows) {
    if (size + r.data.length > PUSH_BYTES) await flush();
    batch.push(r);
    size += r.data.length + 100;
  }
  await flush();
  return { sent, skipped };
}

const WAITING = "ece:syncWaitingImages";

function loadWaiting(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(WAITING) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveWaiting(w: Set<string>): void {
  try {
    if (w.size) localStorage.setItem(WAITING, JSON.stringify([...w]));
    else localStorage.removeItem(WAITING);
  } catch {
    // ignore
  }
}

let running: Promise<void> | null = null;

/** Runs one sync now. A sync that is already running is joined rather than started twice. */
export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const run = async () => {
      const cfg = loadConfig();
      if (!cfg) return;
      setStatus({ on: true, running: true, error: undefined, step: "Connecting…" });
      try {
        const [space, key] = await Promise.all([spaceOf(cfg.code), keyOf(cfg.code)]);
        const pushed = loadPushed();
        const waiting = loadWaiting();

        const lastSeq = await pull(cfg, space, key, pushed, waiting);
        savePushed(pushed);

        // Pictures other devices sent: fetch any this device is still missing.
        let i = 0;
        for (const w of [...waiting]) {
          const meta = JSON.parse(w) as ImageMeta;
          setStatus({ step: `Receiving images… ${++i} of ${waiting.size}` });
          if ((await db.images.get(meta.id)) || (await downloadImage(space, key, meta))) waiting.delete(w);
        }
        saveWaiting(waiting);

        const { skipped } = await push(space, key, pushed);
        const done = { ...cfg, lastSeq, lastSyncAt: now() };
        if (loadConfig()?.code === cfg.code) saveConfig(done);
        setStatus({
          running: false,
          step: undefined,
          lastSyncAt: done.lastSyncAt,
          waitingImages: waiting.size + skipped,
          error: skipped
            ? `${skipped} image${skipped === 1 ? " is" : "s are"} too big to sync (over 4 MB) or could not be sent.`
            : undefined,
        });
      } catch (e) {
        setStatus({
          running: false,
          step: undefined,
          error: e instanceof SyncError ? e.message : "Sync failed. It will try again soon.",
        });
      }
    };
    // Only one tab syncs at a time.
    if (typeof navigator !== "undefined" && navigator.locks) await navigator.locks.request("ece-sync", run);
    else await run();
  })().finally(() => {
    running = null;
  });
  return running;
}
