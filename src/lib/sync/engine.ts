import { db, type StoredImage, type TreeNode } from "@/lib/db";
import { FIXED_CATEGORIES } from "@/lib/bank/categories";
import { loadTables, tablesFrom } from "@/lib/backup/backup";
import { buildZipAsync, readZipAsync, type Container } from "@/lib/backup/backupFormat";
import { planBackupMerge } from "@/lib/backup/merge";
import { now } from "@/lib/ids";
import { keyOf, open, seal, spaceOf } from "./crypto";
import { applyPrefs, readPrefs, type DevicePrefs } from "./devicePrefs";
import {
  loadChanges,
  loadCloudImages,
  loadConfig,
  loadImageMeta,
  saveChanges,
  saveImageMeta,
  saveCloudImages,
  saveConfig,
  setStatus,
  type SyncConfig,
} from "./syncState";

/**
 * Sync works like a backup kept in the cloud.
 *
 * The cloud holds one copy of everything, encrypted on the device with the sync code, plus each image once as its
 * own file. A sync:
 * 1. Asks which version of the copy the cloud has. If it is newer than the one this device last saw, it downloads it
 *    and merges it in with the same rule as a backup Merge: the newer copy of each item wins.
 * 2. If anything changed on this device since it last saved, it sends any new images, then saves a fresh copy.
 *    The cloud only takes it if no other device saved in the meantime; if one did, this device merges that copy
 *    first and tries again. So no device ever overwrites another's work.
 *
 * A sync that is cut short (the tab closed, the page reloaded, the connection dropped) changes nothing in the cloud;
 * the next one simply runs again. Images already sent or received are kept, so those are not repeated.
 */

interface ImageMeta {
  id: string;
  mime: string;
  width: number;
  height: number;
  createdAt: number;
}

interface Head {
  version: number;
  upload?: string;
  parts?: number;
}

/** Each part of the copy stays under the 4.5 MB a Vercel function passes on. */
const PART_BYTES = 3_500_000;
/** The biggest image sync sends (after encryption it must still fit in one part). */
const MAX_IMAGE_BYTES = 3_500_000;
const IMAGES_AT_ONCE = 4;
const MAX_TRIES = 4;

export class SyncError extends Error {}

/** True while a downloaded copy is being written in, so those writes are not counted as changes made here. */
export let applyingRemote = false;

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

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url).catch(() => null);
  if (!res) throw new SyncError("You seem to be offline. Sync will try again when you are back online.");
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new SyncError(json.error ?? `The sync server answered ${res.status}.`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function putBytes(url: string, bytes: Uint8Array): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Blob([new Uint8Array(bytes)]),
  }).catch(() => null);
  if (!res) throw new SyncError("You seem to be offline. Sync will try again when you are back online.");
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new SyncError(json.error ?? `The sync server answered ${res.status}.`);
  }
}

const q = (o: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();

/** Runs `fn` on every item, a few at a time. */
async function inParallel<T>(items: T[], at: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(at, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Downloading and merging
// ---------------------------------------------------------------------------------------------

async function download(space: string, key: CryptoKey, h: Head): Promise<Container> {
  const parts: Uint8Array[] = [];
  for (let i = 0; i < (h.parts ?? 0); i++) {
    setStatus({ step: "Downloading the latest copy…", progress: i / (h.parts ?? 1) });
    parts.push(await fetchBytes(`/api/sync/part?${q({ space, upload: h.upload!, n: i })}`));
  }
  setStatus({ step: "Opening it…", progress: undefined });
  const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  let zip: Uint8Array;
  try {
    zip = await open(key, all);
  } catch {
    throw new SyncError("The cloud copy could not be opened with this sync code.");
  }
  return readZipAsync(zip);
}

/**
 * The four fixed categories are made on every device, so two devices that each started on their own can end up with
 * two MATH categories after a merge. This keeps the one that holds things and removes the empty copies.
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

/** Merges a downloaded copy in. Returns the images it lists, which the cloud has. */
async function mergeIn(c: Container): Promise<ImageMeta[]> {
  setStatus({ step: "Merging it into this device…", progress: undefined });
  const incoming = tablesFrom(c);
  const plan = planBackupMerge(await loadTables(), incoming);
  const p = plan.puts;
  const count = Object.values(p).reduce((s, list) => s + list.length, 0);
  if (count) {
    applyingRemote = true;
    try {
      await db.transaction(
        "rw",
        [db.nodes, db.questions, db.blueprints, db.attempts, db.variants, db.settings, db.concepts, db.drafts],
        async () => {
          await db.nodes.bulkPut(p.nodes);
          await db.questions.bulkPut(p.questions);
          await db.blueprints.bulkPut(p.blueprints);
          await db.attempts.bulkPut(p.attempts);
          await db.variants.bulkPut(p.variants);
          await db.settings.bulkPut(p.settings);
          await db.concepts.bulkPut(p.concepts);
          await db.drafts.bulkPut(p.drafts);
        },
      );
    } finally {
      applyingRemote = false;
    }
    await tidyCategories();
  }
  const prefs = (c.data.prefs?.[0] ?? null) as DevicePrefs | null;
  if (prefs && prefs.updatedAt > readPrefs().updatedAt) applyPrefs(prefs);
  return (c.data.imageMeta ?? []) as ImageMeta[];
}

/** Fetches the images the cloud has that this device does not. Each is saved as it arrives. */
async function receiveImages(space: string, key: CryptoKey, metas: ImageMeta[], cloud: Set<string>): Promise<number> {
  const have = new Set((await db.images.toCollection().primaryKeys()) as string[]);
  const missing = metas.filter((m) => !have.has(m.id));
  let done = 0;
  let failed = 0;
  await inParallel(missing, IMAGES_AT_ONCE, async (m) => {
    try {
      const bytes = await open(key, await fetchBytes(`/api/sync/image?${q({ space, id: m.id })}`));
      applyingRemote = true;
      try {
        await db.images.put({ ...m, blob: new Blob([new Uint8Array(bytes)], { type: m.mime }) });
      } finally {
        applyingRemote = false;
      }
      cloud.add(m.id);
    } catch {
      failed++;
    }
    setStatus({ step: `Downloading images… ${++done} of ${missing.length}`, progress: done / missing.length });
  });
  saveCloudImages(cloud);
  return failed;
}

// ---------------------------------------------------------------------------------------------
// Saving a copy
// ---------------------------------------------------------------------------------------------

/** Sends the images the cloud does not have yet. Returns how many are too big to sync. */
async function sendImages(space: string, key: CryptoKey, cloud: Set<string>): Promise<number> {
  const ids = ((await db.images.toCollection().primaryKeys()) as string[]).filter((id) => !cloud.has(id));
  let done = 0;
  let tooBig = 0;
  await inParallel(ids, IMAGES_AT_ONCE, async (id) => {
    const img = (await db.images.get(id)) as StoredImage | undefined;
    if (img) {
      const bytes = new Uint8Array(await img.blob.arrayBuffer());
      if (bytes.length > MAX_IMAGE_BYTES) tooBig++;
      else {
        await putBytes(`/api/sync/image?${q({ space, id })}`, await seal(key, bytes));
        cloud.add(id);
        saveCloudImages(cloud);
      }
    }
    setStatus({ step: `Uploading images… ${++done} of ${ids.length}`, progress: done / ids.length });
  });
  return tooBig;
}

function randomName(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Builds a copy of everything here, sends it, and asks the cloud to make it current. */
async function saveCopy(
  space: string,
  key: CryptoKey,
  expected: number,
  cloud: Set<string>,
  knownMeta: ImageMeta[],
): Promise<{ ok: boolean; version: number }> {
  setStatus({ step: "Packing everything up…", progress: undefined });
  const tables = await loadTables();
  // Every image the cloud has, described here so the other devices know to fetch it.
  const metas = new Map(knownMeta.filter((m) => cloud.has(m.id)).map((m) => [m.id, m]));
  await db.images.each((i) => {
    if (cloud.has(i.id))
      metas.set(i.id, { id: i.id, mime: i.mime, width: i.width, height: i.height, createdAt: i.createdAt });
  });
  const container: Container = {
    manifest: { app: "ece-review", format: 1, kind: "backup", createdAt: now(), counts: {} },
    data: { ...tables, prefs: [readPrefs()], imageMeta: [...metas.values()] },
    images: [],
  };
  const sealed = await seal(key, await buildZipAsync(container));

  const upload = randomName();
  const parts = Math.max(1, Math.ceil(sealed.length / PART_BYTES));
  for (let i = 0; i < parts; i++) {
    setStatus({ step: "Uploading…", progress: i / parts });
    await putBytes(
      `/api/sync/part?${q({ space, upload, n: i })}`,
      sealed.subarray(i * PART_BYTES, Math.min(sealed.length, (i + 1) * PART_BYTES)),
    );
  }
  setStatus({ step: "Finishing…", progress: undefined });
  return api<{ ok: boolean; version: number }>({
    action: "commit",
    space,
    expected,
    upload,
    parts,
    size: sealed.length,
  });
}

// ---------------------------------------------------------------------------------------------

let running: Promise<void> | null = null;

/** Runs one sync now. A sync that is already running is joined rather than started twice. */
export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const run = async () => {
      let cfg = loadConfig();
      if (!cfg) return;
      setStatus({ on: true, running: true, error: undefined, step: "Checking for changes…", progress: undefined });
      try {
        const [space, key] = await Promise.all([spaceOf(cfg.code), keyOf(cfg.code)]);
        const cloud = loadCloudImages();
        let knownMeta = loadImageMeta<ImageMeta>();
        let failedImages = 0;
        let tooBig = 0;

        for (let tries = 0; ; tries++) {
          if (tries >= MAX_TRIES) throw new SyncError("Another device kept saving at the same time. Try again.");
          const h = await api<Head>({ action: "head", space });

          if (h.version > 0 && h.version !== cfg.version) {
            const copy = await download(space, key, h);
            knownMeta = await mergeIn(copy);
            saveImageMeta(knownMeta);
            for (const m of knownMeta) cloud.add(m.id);
            saveCloudImages(cloud);
            cfg = { ...cfg, version: h.version };
            if (loadConfig()?.code === cfg.code) saveConfig(cfg);
          }
          // Fetch any listed image this device does not have yet, including ones a cut-short sync missed.
          failedImages = await receiveImages(space, key, knownMeta, cloud);

          const changes = loadChanges();
          if (h.version > 0 && changes.made <= changes.sent) break;

          const madeBefore = changes.made;
          tooBig = await sendImages(space, key, cloud);
          const saved = await saveCopy(space, key, cfg.version, cloud, knownMeta);
          if (saved.ok) {
            cfg = { ...cfg, version: saved.version };
            if (loadConfig()?.code === cfg.code) saveConfig(cfg);
            saveChanges({ ...loadChanges(), sent: madeBefore });
            break;
          }
          // Another device saved first: go round again, merge its copy, and save after it.
        }

        const done: SyncConfig = { ...cfg, lastSyncAt: now() };
        if (loadConfig()?.code === cfg.code) saveConfig(done);
        setStatus({
          running: false,
          step: undefined,
          progress: undefined,
          lastSyncAt: done.lastSyncAt,
          error: failedImages
            ? `${failedImages} image${failedImages === 1 ? "" : "s"} could not be downloaded. Sync will try again.`
            : undefined,
          note: tooBig
            ? `${tooBig} image${tooBig === 1 ? " is" : "s are"} over 3.5 MB, so ${tooBig === 1 ? "it stays" : "they stay"} on this device only.`
            : undefined,
        });
      } catch (e) {
        setStatus({
          running: false,
          step: undefined,
          progress: undefined,
          error: e instanceof SyncError ? e.message : "Sync did not finish. Nothing was lost; it will try again.",
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
