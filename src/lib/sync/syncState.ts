import { useSyncExternalStore } from "react";

/**
 * What sync remembers on this device. The code is the secret that links devices, so it never leaves this browser
 * except encrypted into nothing: the server only ever sees a hash of it.
 */
export interface SyncConfig {
  code: string;
  /** The server's change counter at the last pull. The next pull asks only for what came after it. */
  lastSeq: number;
  lastSyncAt?: number;
}

const CONFIG = "ece:sync";
const PUSHED = "ece:syncPushed";

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage is full or blocked. Sync still works this time, and starts over next time.
  }
}

export function loadConfig(): SyncConfig | null {
  try {
    const c = JSON.parse(get(CONFIG) ?? "null") as SyncConfig | null;
    return c && typeof c.code === "string" ? c : null;
  } catch {
    return null;
  }
}

export function saveConfig(c: SyncConfig | null): void {
  set(CONFIG, c ? JSON.stringify(c) : null);
  if (!c) set(PUSHED, null);
  notify();
}

/**
 * The version of each item this device knows the server has, as "kind:id" → updatedAt. An item whose updatedAt is
 * different from this is sent at the next sync.
 */
export function loadPushed(): Record<string, number> {
  try {
    return (JSON.parse(get(PUSHED) ?? "{}") as Record<string, number>) ?? {};
  } catch {
    return {};
  }
}

export function savePushed(p: Record<string, number>): void {
  set(PUSHED, JSON.stringify(p));
}

// ---------------------------------------------------------------------------------------------
// What the page shows
// ---------------------------------------------------------------------------------------------

export interface SyncStatus {
  on: boolean;
  running: boolean;
  /** What a running sync is doing, such as "Sending 120 items…". */
  step?: string;
  lastSyncAt?: number;
  error?: string;
  /** Images that could not be fetched or sent yet. They are tried again at every sync. */
  waitingImages: number;
}

let status: SyncStatus = { on: false, running: false, waitingImages: 0 };
let fresh = false;
const listeners = new Set<() => void>();

function notify() {
  fresh = false;
  for (const l of listeners) l();
}

export function setStatus(patch: Partial<SyncStatus>): void {
  status = { ...current(), ...patch };
  fresh = true;
  for (const l of listeners) l();
}

function current(): SyncStatus {
  if (!fresh) {
    const c = typeof window === "undefined" ? null : loadConfig();
    status = { ...status, on: !!c, lastSyncAt: c?.lastSyncAt ?? status.lastSyncAt };
    fresh = true;
  }
  return status;
}

const OFF: SyncStatus = { on: false, running: false, waitingImages: 0 };

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => OFF,
  );
}
