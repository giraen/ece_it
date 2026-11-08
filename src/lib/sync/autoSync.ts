import { db } from "@/lib/db";
import { newSyncCode } from "./crypto";
import { LOCAL_CHANGE_EVENT } from "./devicePrefs";
import { syncNow } from "./engine";
import { loadConfig, saveConfig, setStatus } from "./syncState";

/**
 * When sync runs by itself: when the site opens, a few seconds after anything changes (a quiz answer, an edit in the
 * Bank, a setting), when the device comes back online or back to this tab, and every few minutes while it is open.
 */

const AFTER_CHANGE_MS = 8_000;
const EVERY_MS = 5 * 60_000;
const ON_RETURN_AFTER_MS = 60_000;

let started = false;
let timer: number | undefined;
let lastRun = 0;

function run() {
  window.clearTimeout(timer);
  timer = undefined;
  if (!loadConfig()) return;
  lastRun = Date.now();
  void syncNow();
}

/** Asks for a sync soon. Many changes in a row make one sync. */
export function syncSoon(delay = AFTER_CHANGE_MS): void {
  if (!loadConfig()) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(run, delay);
}

/** Starts the automatic syncing. Safe to call more than once. */
export function startAutoSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const changed = () => syncSoon();
  for (const t of [
    "nodes",
    "questions",
    "blueprints",
    "attempts",
    "variants",
    "settings",
    "concepts",
    "drafts",
    "images",
  ]) {
    const table = db.table(t);
    table.hook("creating", changed);
    table.hook("updating", changed);
    table.hook("deleting", changed);
  }
  window.addEventListener(LOCAL_CHANGE_EVENT, changed);
  window.addEventListener("online", () => syncSoon(1_000));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastRun > ON_RETURN_AFTER_MS) syncSoon(500);
  });
  window.setInterval(() => {
    if (document.visibilityState === "visible") run();
  }, EVERY_MS);

  if (loadConfig()) syncSoon(1_500);
}

/** Turns sync on with a brand-new code. Use on the first device. */
export async function turnOnSync(): Promise<string> {
  const code = newSyncCode();
  saveConfig({ code, lastSeq: 0 });
  await syncNow();
  return code;
}

/** Links this device to the others that use this code, then syncs: what is here and what is there are combined. */
export async function joinSync(code: string): Promise<void> {
  saveConfig({ code, lastSeq: 0 });
  await syncNow();
}

/** Stops syncing on this device. Nothing is deleted, here or on the other devices. */
export function turnOffSync(): void {
  saveConfig(null);
  try {
    localStorage.removeItem("ece:syncWaitingImages");
  } catch {
    // ignore
  }
  setStatus({ on: false, running: false, error: undefined, step: undefined, lastSyncAt: undefined, waitingImages: 0 });
}
