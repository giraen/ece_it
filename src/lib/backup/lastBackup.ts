import { useSyncExternalStore } from "react";
import { now } from "./ids";

const KEY = "ece:lastBackupAt";
const EVENT = "ece:lastBackup";

/** Remembers that a full backup was just exported from this browser. */
export function markBackup(): void {
  try {
    localStorage.setItem(KEY, String(now()));
  } catch {
    // Storage can be blocked in private windows. The backup itself is unaffected.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** When this browser last exported a full backup, in ms, or null if it never has. */
export function useLastBackup(): number | null {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}