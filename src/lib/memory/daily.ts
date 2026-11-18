"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type CardEvent } from "@/lib/db";
import { now } from "@/lib/ids";
import { startOfDay } from "./schedule";

/**
 * The daily review: a goal of answering a number of memory cards a day, from every deck. Everything due comes first;
 * when that is less than the goal, cards due soon fill it up. The goal is saved with your settings, so it syncs.
 */
const KEY = "dailyCards";
export const DAILY_DEFAULT = 15;
export const DAILY_MIN = 15;
export const DAILY_MAX = 100;

const clamp = (n: number) => Math.min(DAILY_MAX, Math.max(DAILY_MIN, Math.round(n)));

export async function loadDailySize(): Promise<number> {
  const row = await db.settings.get(KEY);
  const n = row && !row.deletedAt ? Number(row.value) : NaN;
  return Number.isFinite(n) ? clamp(n) : DAILY_DEFAULT;
}

export function useDailySize(): number | undefined {
  return useLiveQuery(() => loadDailySize(), []);
}

/** Saves the goal, kept between the least and the most allowed. */
export async function saveDailySize(n: number): Promise<number> {
  const value = Number.isFinite(n) ? clamp(n) : DAILY_DEFAULT;
  await db.settings.put({ id: KEY, value, updatedAt: now() });
  return value;
}

/** Cards answered today, in any review. They all count toward the goal. */
export function answeredToday(events: CardEvent[], nowMs: number): number {
  const from = startOfDay(nowMs);
  return events.filter((e) => e.type === "answer" && !e.deletedAt && e.at >= from).length;
}
