import Dexie from "dexie";
import { db, type StoredImage, type TreeNode } from "@/lib/db";
import { FIXED_CATEGORIES } from "@/lib/bank/categories";
import { loadTables, tablesFrom } from "@/lib/backup/backup";
import { buildZipAsync, readZipAsync, type Container } from "@/lib/backup/backupFormat";
import { planBackupMerge, type Tables } from "@/lib/backup/merge";
import { now } from "@/lib/ids";
import { keyOf, open, seal, spaceOf } from "./crypto";
import { applyPrefs, readPrefs, type DevicePrefs } from "./devicePrefs";
import {
  loadChanges,
  noteChange,
  loadCloudImages,
  loadConfig,
  loadImageMeta,
  saveChanges,
  saveImageMeta,
  saveCloudImages,
  saveConfig,
  setStatus as showStatus,
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
 *
 * One device is the main device (your laptop): the bank is changed only there. The others are on-the-go devices
 * (your phones): they take quizzes and play games, and their bank is a read-only copy of the main device's.
 * - The main device takes only quiz results from the cloud copy. Whatever else the copy holds, its bank stays its own.
 * - An on-the-go device makes its bank exactly the main device's, and adds its quiz results to the copy.
 * The role is fixed when sync starts on a device: the one that turns it on is main, the ones that join are on-the-go.
 * Nothing in the app moves it. To make another device main, turn sync off on every device, import a backup on the new
 * one, turn sync on there, and join the others with its new code.
 *
 * A sync that stops making progress while you are on the page is stopped, so it can never hang.
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
/** How long a sync may go without progress, counting only time the page is on screen, before it is stopped. */
const STALL_MS = 120_000;

export class SyncError extends Error {}

const STALLED = "Sync got stuck and was stopped. Nothing was lost; it will try again.";

// ---------------------------------------------------------------------------------------------
// Telling the device's own changes from the ones a sync writes
// ---------------------------------------------------------------------------------------------

/** Database transactions that write a downloaded copy in. Writes in them are not changes made on this device. */
const remoteTx = new WeakSet<object>();

/** True for a write made by sync itself. Only that write is skipped; anything you do meanwhile still counts. */
export function isRemote(trans: unknown): boolean {
  return !!trans && remoteTx.has(trans as object);
}

function markRemote(): void {
  const t = Dexie.currentTransaction;
  if (t) remoteTx.add(t);
}

// ---------------------------------------------------------------------------------------------
// The watchdog
// ---------------------------------------------------------------------------------------------

let abort: AbortController | null = null;
let idle = 0;

/** Stops here if the watchdog has given up on this sync. */
function alive(): void {
  if (abort?.signal.aborted) throw new SyncError(STALLED);
}

/** Shows what sync is doing, and tells the watchdog it is still moving. */
function setStatus(patch: Parameters<typeof showStatus>[0]): void {
  alive();
  idle = 0;
  showStatus(patch);
}

/** Rejects once the sync has made no progress for a while. Time with the page hidden does not count. */
function watchdog(): { stalled: Promise<never>; stop: () => void } {
  idle = 0;
  let last = Date.now();
  let timer: number | undefined;
  const stalled = new Promise<never>((_, reject) => {
    timer = window.setInterval(() => {
      const t = Date.now();
      // A phone that slept or a hidden tab freezes the page; that time is not the sync's fault.
      if (document.visibilityState === "visible") idle += Math.min(t - last, 10_000);
      last = t;
      if (idle > STALL_MS) {
        abort?.abort();
        reject(new SyncError(STALLED));
      }
    }, 5_000);
  });
  stalled.catch(() => {});
  return { stalled, stop: () => window.clearInterval(timer) };
}

async function api<T>(body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: abort?.signal,
    });
  } catch {
    alive();
    throw new SyncError("You seem to be offline. Sync will try again when you are back online.");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new SyncError(json.error ?? `The sync server answered ${res.status}.`);
  return json;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  alive();
  const res = await fetch(url, { signal: abort?.signal }).catch(() => null);
  alive();
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
    signal: abort?.signal,
  }).catch(() => null);
  alive();
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
    setStatus({
      step: "Downloading the latest copy…",
      progress: i / (h.parts ?? 1),
    });
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

/** The tables that make up the bank, which only the main device changes. */
const BANK = ["nodes", "questions", "blueprints", "variants", "settings", "concepts", "drafts"] as const;
type Row = { id: string; updatedAt: number; deletedAt?: number };

/** True when two copies of the bank differ in any item. */
function bankDiffers(a: Tables, b: Tables): boolean {
  return BANK.some((t) => {
    const ours = a[t] as Row[];
    const theirs = b[t] as Row[];
    if (ours.length !== theirs.length) return true;
    const byId = new Map(ours.map((r) => [r.id, r]));
    return theirs.some((r) => {
      const o = byId.get(r.id);
      return !o || o.updatedAt !== r.updatedAt || o.deletedAt !== r.deletedAt;
    });
  });
}

/** Merges a downloaded copy in, by this device's role. Returns the images the copy lists, which the cloud has. */
async function mergeIn(c: Container, role: SyncConfig["role"]): Promise<ImageMeta[]> {
  setStatus({ step: "Merging it into this device…", progress: undefined });

  const incoming = tablesFrom(c);
  const local = await loadTables();
  const plan = planBackupMerge(local, incoming);
  const p = plan.puts;

  if (role === "main") {
    // Only quiz results come in. The bank here is the one that counts.
    if (p.attempts.length) {
      await db.transaction("rw", db.attempts, async () => {
        markRemote();
        await db.attempts.bulkPut(p.attempts);
      });
    }
    // If the copy's bank is not this one (another device changed it somehow), send this one again to put it right.
    if (bankDiffers(local, incoming)) noteChange();
  } else if (role === "go") {
    // The bank becomes exactly the main device's: changed items are copied, ones it does not have are removed.
    // Quiz results are combined, as before.
    await db.transaction("rw", [...BANK.map((t) => db.table(t)), db.attempts], async () => {
      markRemote();
      for (const t of BANK) {
        const theirs = incoming[t] as Row[];
        const ours = new Map((local[t] as Row[]).map((r) => [r.id, r]));
        const ids = new Set(theirs.map((r) => r.id));
        const puts = theirs.filter((r) => {
          const o = ours.get(r.id);
          return !o || o.updatedAt !== r.updatedAt || o.deletedAt !== r.deletedAt;
        });
        const drops = [...ours.keys()].filter((id) => !ids.has(id));
        if (puts.length) await db.table(t).bulkPut(puts);
        if (drops.length) await db.table(t).bulkDelete(drops);
      }
      if (p.attempts.length) await db.attempts.bulkPut(p.attempts);
    });
  } else {
    // A device that has not been given a role yet merges everything, newest first, as sync first did.
    const count = Object.values(p).reduce((n, list) => n + list.length, 0);
    if (count) {
      await db.transaction(
        "rw",
        [db.nodes, db.questions, db.blueprints, db.attempts, db.variants, db.settings, db.concepts, db.drafts],
        async () => {
          markRemote();
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
      await tidyCategories();
    }
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
      await db.transaction("rw", db.images, async () => {
        markRemote();
        await db.images.put({
          ...m,
          blob: new Blob([new Uint8Array(bytes)], { type: m.mime }),
        });
      });
      cloud.add(m.id);
    } catch {
      alive();
      failed++;
    }
    setStatus({
      step: `Downloading images… ${++done} of ${missing.length}`,
      progress: done / missing.length,
    });
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
    setStatus({
      step: `Uploading images… ${++done} of ${ids.length}`,
      progress: done / ids.length,
    });
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
      metas.set(i.id, {
        id: i.id,
        mime: i.mime,
        width: i.width,
        height: i.height,
        createdAt: i.createdAt,
      });
  });
  const container: Container = {
    manifest: {
      app: "ece-review",
      format: 1,
      kind: "backup",
      createdAt: now(),
      counts: {},
    },
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
/** A sync the watchdog stopped that is still winding down. No new sync starts until it has. */
let stopping: Promise<unknown> | null = null;

/** One sync, start to finish. Returns how many images could not be fetched and how many are too big to send. */
async function work(start: SyncConfig): Promise<{ cfg: SyncConfig; failedImages: number; tooBig: number }> {
  let cfg = start;
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
      knownMeta = await mergeIn(copy, cfg.role);
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
    alive();
    if (saved.ok) {
      cfg = { ...cfg, version: saved.version };
      if (loadConfig()?.code === cfg.code) saveConfig(cfg);
      saveChanges({ ...loadChanges(), sent: madeBefore });
      break;
    }
    // Another device saved first: go round again, merge its copy, and save after it.
  }
  return { cfg, failedImages, tooBig };
}

/** Runs one sync now. A sync that is already running is joined rather than started twice. */
export function syncNow(): Promise<void> {
  if (running) return running;
  if (stopping) return Promise.resolve();
  running = (async () => {
    const run = async () => {
      const start = loadConfig();
      if (!start) return;
      abort = new AbortController();
      const dog = watchdog();
      setStatus({ on: true, running: true, error: undefined, step: "Checking for changes…", progress: undefined });
      const job = work(start);
      job.catch(() => {});
      try {
        const { cfg, failedImages, tooBig } = await Promise.race([job, dog.stalled]);
        const done: SyncConfig = { ...cfg, lastSyncAt: now() };
        if (loadConfig()?.code === cfg.code) saveConfig(done);
        showStatus({
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
        if (!abort.signal.aborted) abort.abort();
        // Stopped by the watchdog: no new sync starts until this one has wound down.
        else
          stopping = job.then(
            () => (stopping = null),
            () => (stopping = null),
          );
        showStatus({
          running: false,
          step: undefined,
          progress: undefined,
          error: e instanceof SyncError ? e.message : "Sync did not finish. Nothing was lost; it will try again.",
        });
      } finally {
        dog.stop();
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
