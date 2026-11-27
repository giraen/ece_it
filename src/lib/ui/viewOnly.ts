"use client";

import { useSyncExternalStore } from "react";
import { useReadOnly } from "@/lib/sync/syncState";

/** The width from which the bank can be changed: the `lg` breakpoint, where the pages get their computer layout. */
const WIDE = "(min-width: 1024px)";

function subscribe(cb: () => void) {
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

/** True on a narrow screen, such as a phone. */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !window.matchMedia(WIDE).matches,
    () => false,
  );
}

/**
 * The bank can be looked through but not changed: on a phone, and on an on-the-go device. Questions and cards are
 * written and organised on a computer.
 */
export function useBankViewOnly(): boolean {
  const narrow = useNarrow();
  const readOnly = useReadOnly();
  return narrow || readOnly;
}
