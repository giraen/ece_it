import { db } from "@/lib/db";
import { newSyncCode } from "./crypto";
import { LOCAL_CHANGE_EVENT } from "./devicePrefs";
import { isRemote, syncNow } from "./engine";
import { hasUnsentChanges, loadConfig, noteChange, saveConfig, setStatus } from "./syncState";

/**
 * When sync runs by itself.
 *
 * Checking the cloud for a newer copy is quick, so it happens when the site opens, when you come back to it, and every
 * few minutes. Saving a copy sends everything, so it waits until you pause: a minute after your last change, at once
 * when you finish a quiz, and when you leave the site or switch to another app.
 */

const AFTER_CHANGE_MS = 60_000;
const AFTER_QUIZ_MS = 2_000;
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

/** Asks for a sync after a pause. Many changes in a row make one sync. */
export function syncSoon(delay = AFTER_CHANGE_MS): void {
  if (!loadConfig()) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(run, delay);
}

const TABLES = ["nodes", "questions", "blueprints", "attempts", "variants", "settings", "concepts", "drafts", "images"];

/** Starts the automatic syncing. Safe to call more than once. */
export function startAutoSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const changed = (trans?: unknown) => {
    if (isRemote(trans) || !loadConfig()) return;
    noteChange();
    syncSoon();
  };
  for (const t of TABLES) {
    const table = db.table(t);
    table.hook("creating", (_key, _obj, trans) => changed(trans));
    table.hook("deleting", (_key, _obj, trans) => changed(trans));
    table.hook("updating", (mods, _key, _obj, trans) => {
      changed(trans);
      // A finished quiz is worth sending at once.
      if (
        t === "attempts" &&
        (mods as { status?: string }).status === "submitted" &&
        !isRemote(trans) &&
        loadConfig()
      ) {
        syncSoon(AFTER_QUIZ_MS);
      }
    });
  }
  window.addEventListener(LOCAL_CHANGE_EVENT, () => changed());
  window.addEventListener("online", () => syncSoon(1_000));
  document.addEventListener("visibilitychange", () => {
    if (!loadConfig()) return;
    if (document.visibilityState === "hidden" && hasUnsentChanges()) run();
    else if (document.visibilityState === "visible" && Date.now() - lastRun > ON_RETURN_AFTER_MS) syncSoon(500);
  });
  window.setInterval(() => {
    if (document.visibilityState === "visible") run();
  }, EVERY_MS);

  // Left over from the first version of sync, which sent items one by one.
  try {
    for (const k of ["ece:syncPushed", "ece:syncWaitingImages"]) localStorage.removeItem(k);
  } catch {
    // ignore
  }

  if (loadConfig()) syncSoon(1_500);
}

/**
 * Turns sync on with a brand-new code. Use on the first device, which becomes the main device: it saves the first
 * copy to the cloud.
 */
export async function turnOnSync(): Promise<string> {
  const code = newSyncCode();
  saveConfig({ code, version: 0, role: "main" });
  await syncNow();
  return code;
}

/**
 * Links this device to the others that use this code, as an on-the-go device. Its bank becomes the main device's,
 * and the quiz results here are added to the cloud copy.
 */
export async function joinSync(code: string): Promise<void> {
  saveConfig({ code, version: 0, role: "go" });
  noteChange();
  await syncNow();
}

/** Stops syncing on this device. Nothing is deleted, here or on the other devices. */
export function turnOffSync(): void {
  saveConfig(null);
  setStatus({ on: false, running: false, error: undefined, note: undefined, step: undefined, lastSyncAt: undefined });
}
