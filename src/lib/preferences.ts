import { useLiveQuery } from "dexie-react-hooks";
import { CONFIG } from "./config";
import { db } from "./db";
import { now } from "./ids";

const KEY = "masteryBar";

/** The lowest mastery bar that can be set, in whole percent. It has to be above the fixed minimum to pass. */
export const MASTERY_BAR_MIN = Math.round(CONFIG.minimumPass * 100) + 1;
export const MASTERY_BAR_MAX = 100;
export const MASTERY_BAR_DEFAULT = Math.round(CONFIG.passBar * 100);

/** A stored or typed percent as a whole number in range, or null when it is not one. */
export function cleanMasteryBar(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n)) return null;
  return n >= MASTERY_BAR_MIN && n <= MASTERY_BAR_MAX ? n : null;
}

/** The mastery bar as a fraction, such as 0.95. A quiz passes when its average credit reaches it. */
export async function loadMasteryBar(): Promise<number> {
  const row = await db.settings.get(KEY);
  const pct = row && !row.deletedAt ? cleanMasteryBar(row.value) : null;
  return (pct ?? MASTERY_BAR_DEFAULT) / 100;
}

/** The mastery bar as a fraction, kept up to date. It is the default while the first read happens. */
export function useMasteryBar(): number {
  return useLiveQuery(() => loadMasteryBar(), []) ?? CONFIG.passBar;
}

/** Saves the mastery bar in whole percent. Returns false when the number is not allowed. */
export async function saveMasteryBar(percent: number | string): Promise<boolean> {
  const pct = cleanMasteryBar(percent);
  if (pct === null) return false;
  await db.settings.put({ id: KEY, value: pct, updatedAt: now() });
  return true;
}