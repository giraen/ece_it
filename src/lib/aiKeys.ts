import { useSyncExternalStore } from "react";

/**
 * API keys live only in this browser. By default they are kept for the current tab (session storage) and
 * forgotten when it closes. The user can choose to remember them on this device (local storage).
 * They are never written to the database, so they are never in a backup or a shared pack.
 */
const STORE = "ece:aiKeys";
const REMEMBER = "ece:aiRememberKeys";
const EVENT = "ece:aiKeys";

type KeyMap = Record<string, string>;

function read(area: Storage | undefined): KeyMap {
  try {
    return area ? (JSON.parse(area.getItem(STORE) ?? "{}") as KeyMap) : {};
  } catch {
    return {};
  }
}

function write(area: Storage | undefined, map: KeyMap): void {
  try {
    if (!area) return;
    if (Object.keys(map).length) area.setItem(STORE, JSON.stringify(map));
    else area.removeItem(STORE);
  } catch {
    // Storage can be blocked in private windows. The key then lasts only until the page is closed.
  }
}

const session = () => (typeof window === "undefined" ? undefined : window.sessionStorage);
const local = () => (typeof window === "undefined" ? undefined : window.localStorage);
const changed = () => window.dispatchEvent(new Event(EVENT));

export function remembersKeys(): boolean {
  try {
    return local()?.getItem(REMEMBER) === "1";
  } catch {
    return false;
  }
}

/** Switches where keys are kept, moving the ones already saved. */
export function setRemember(on: boolean): void {
  const all = { ...read(local()), ...read(session()) };
  try {
    if (on) local()?.setItem(REMEMBER, "1");
    else local()?.removeItem(REMEMBER);
  } catch {
    // ignore
  }
  write(on ? local() : session(), all);
  write(on ? session() : local(), {});
  changed();
}

export function getKey(providerId: string): string {
  return read(session())[providerId] ?? read(local())[providerId] ?? "";
}

export function setKey(providerId: string, key: string): void {
  const area = remembersKeys() ? local() : session();
  write(area, { ...read(area), [providerId]: key.trim() });
  changed();
}

export function forgetKey(providerId: string): void {
  for (const area of [session(), local()]) {
    const m = read(area);
    delete m[providerId];
    write(area, m);
  }
  changed();
}

/** Forget every key on this device. */
export function forgetAllKeys(): void {
  write(session(), {});
  write(local(), {});
  changed();
}

const VALID = /^[A-Za-z0-9_\-.]{16,300}$/;

/** Reads a key from the text of a file: either just the key, or lines like GROQ_API_KEY=... as in an .env file. */
export function readKeyFromText(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  for (const line of lines) {
    const m = /^(?:export\s+)?[A-Za-z0-9_]+\s*=\s*(.+)$/.exec(line);
    if (!m) continue;
    const v = m[1].trim().replace(/^["']|["']$/g, "");
    if (VALID.test(v)) return v;
  }
  const first = (lines[0] ?? "").replace(/^["']|["']$/g, "");
  return VALID.test(first) ? first : null;
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

const idsSnapshot = () =>
  Object.keys({ ...read(local()), ...read(session()) })
    .filter((id) => getKey(id))
    .sort()
    .join(",");

/** Which providers have a key saved here. Never exposes the keys themselves. */
export function useKeyIds(): string[] {
  const s = useSyncExternalStore(subscribe, idsSnapshot, () => "");
  return s ? s.split(",") : [];
}

export function useRemember(): boolean {
  return useSyncExternalStore(subscribe, remembersKeys, () => false);
}