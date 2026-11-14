"use client";

import { useSyncExternalStore } from "react";

/**
 * Incognito: while it is on, quizzes and memory reviews on this device are not recorded. Nothing counts toward
 * mastery, analytics, or memory boxes, and nothing syncs. It is a switch on this device only, so a phone lent to a
 * friend does not turn it on for the laptop.
 */
const KEY = "ece:incognito";
const listeners = new Set<() => void>();
let cache: boolean | undefined;

function read(): boolean {
  if (cache === undefined) {
    try {
      cache = localStorage.getItem(KEY) === "1";
    } catch {
      cache = false;
    }
  }
  return cache;
}

export function setIncognito(on: boolean): void {
  cache = on;
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage is blocked: the switch lasts until the page is closed.
  }
  for (const l of listeners) l();
}

/** Whether incognito is on now, read once. */
export const loadIncognito = (): boolean => read();

export function useIncognito(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => false,
  );
}
