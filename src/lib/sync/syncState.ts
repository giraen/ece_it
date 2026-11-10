import { useSyncExternalStore } from "react";

/**
 * What sync remembers on this device. The code is the secret that links devices; the server only ever sees a hash
 * of it.
 */
/** "main": the device the bank is changed on (your laptop). "go": an on-the-go device whose bank is read-only. */
export type SyncRole = "main" | "go";

export interface SyncConfig {
  code: string;
  /** Set when sync starts on this device, and never changed. Missing on a device that started before roles existed. */
  role?: SyncRole;
  /** The version of the cloud copy this device last merged in or saved. */
  version: number;
  lastSyncAt?: number;
}

const CONFIG = "ece:sync";
const CHANGES = "ece:syncChanges";
const CLOUD_IMAGES = "ece:syncCloudImages";
const IMAGE_META = "ece:syncImageMeta";

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
    // Storage is full or blocked. Sync still works; it may just send a little more next time.
  }
}

export function loadConfig(): SyncConfig | null {
  try {
    const c = JSON.parse(get(CONFIG) ?? "null") as SyncConfig | null;
    return c && typeof c.code === "string" && typeof c.version === "number" ? c : null;
  } catch {
    return null;
  }
}

export function saveConfig(c: SyncConfig | null): void {
  set(CONFIG, c ? JSON.stringify(c) : null);
  if (!c) {
    set(CHANGES, null);
    set(CLOUD_IMAGES, null);
    set(IMAGE_META, null);
  }
  notify();
}

/**
 * Counts changes made on this device. `made` goes up with every change; `sent` is what `made` was when the last copy
 * was saved to the cloud. More made than sent means there is something to send.
 */
export function loadChanges(): { made: number; sent: number } {
  try {
    const c = JSON.parse(get(CHANGES) ?? "null") as { made: number; sent: number } | null;
    return c ?? { made: 0, sent: 0 };
  } catch {
    return { made: 0, sent: 0 };
  }
}

export function saveChanges(c: { made: number; sent: number }): void {
  set(CHANGES, JSON.stringify(c));
}

export function noteChange(): void {
  const c = loadChanges();
  saveChanges({ ...c, made: c.made + 1 });
}

export const hasUnsentChanges = () => {
  const c = loadChanges();
  return c.made > c.sent;
};

/** The images the cloud already has, so each picture is sent only once, even if a sync is cut short. */
export function loadCloudImages(): Set<string> {
  try {
    return new Set(JSON.parse(get(CLOUD_IMAGES) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function saveCloudImages(ids: Set<string>): void {
  set(CLOUD_IMAGES, JSON.stringify([...ids]));
}

/** The images the last cloud copy listed, so any this device is still missing are fetched at the next sync. */
export function loadImageMeta<T>(): T[] {
  try {
    return JSON.parse(get(IMAGE_META) ?? "[]") as T[];
  } catch {
    return [];
  }
}

export function saveImageMeta<T>(list: T[]): void {
  set(IMAGE_META, JSON.stringify(list));
}

// ---------------------------------------------------------------------------------------------
// What the page shows
// ---------------------------------------------------------------------------------------------

export interface SyncStatus {
  on: boolean;
  running: boolean;
  /** What a running sync is doing, such as "Uploading…". */
  step?: string;
  /** How far the current step is, from 0 to 1, when that is known. */
  progress?: number;
  lastSyncAt?: number;
  error?: string;
  /** Something worth knowing that is not a problem, such as images too big to sync. */
  note?: string;
  role?: SyncRole;
}

let status: SyncStatus = { on: false, running: false };
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
    status = { ...status, on: !!c, role: c?.role, lastSyncAt: c?.lastSyncAt ?? status.lastSyncAt };
    fresh = true;
  }
  return status;
}

const OFF: SyncStatus = { on: false, running: false };

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

/** True on an on-the-go device: the bank is read-only there. */
export function useReadOnly(): boolean {
  return useSyncStatus().role === "go";
}
