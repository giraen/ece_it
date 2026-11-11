"use client";

import { useSyncExternalStore } from "react";

/**
 * The categories in the mixed deck, such as GEAS and ESAT. Kept on this device only, so a phone and a laptop can
 * each have their own mix.
 */
const KEY = "ece:memoryMix";
const listeners = new Set<() => void>();
let cache: string | null | undefined;

function read(): string | null {
  if (cache === undefined) {
    try {
      cache = localStorage.getItem(KEY);
    } catch {
      cache = null;
    }
  }
  return cache;
}

export function saveMix(ids: string[]): void {
  cache = JSON.stringify(ids);
  try {
    localStorage.setItem(KEY, cache);
  } catch {
    // Storage is blocked: the mix lasts until the page is closed.
  }
  for (const l of listeners) l();
}

const parse = (raw: string | null): string[] | null => {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
};

/** The chosen category ids now, read once. */
export const loadMix = (): string[] | null => parse(read());

/** The chosen category ids, or null when no mix has been chosen yet. */
export function useMix(): string[] | null {
  const raw = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => null,
  );
  return parse(raw);
}
