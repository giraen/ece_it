"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type CardEvent } from "@/lib/db";
import { now } from "@/lib/ids";
import { SPREAD_DEFAULT_HOURS, startOfDay } from "./schedule";

/**
 * The daily review: a goal of answering a number of memory cards a day, from every deck, as practice on the side of
 * the deck reviews (see `startDaily`). The goal is saved with your settings, so it syncs.
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

/** Cards answered in today's daily review. Only those count toward the goal; deck reviews are separate. */
export function answeredToday(events: CardEvent[], nowMs: number): number {
  const from = startOfDay(nowMs);
  return events.filter((e) => e.type === "answer" && !e.deletedAt && (e.daily || e.early) && e.at >= from).length;
}

/**
 * How many cards each deck opens with, before any are earned. After that, each card that reaches box 3 opens one
 * more. Raising it opens more cards at the next review; lowering it never locks a card again.
 */
const START_KEY = "memoryStartCards";
export const START_DEFAULT = 10;
export const START_MIN = 1;
export const START_MAX = 100;

const clampStart = (n: number) => Math.min(START_MAX, Math.max(START_MIN, Math.round(n)));

export async function loadStartCards(): Promise<number> {
  const row = await db.settings.get(START_KEY);
  const n = row && !row.deletedAt ? Number(row.value) : NaN;
  return Number.isFinite(n) ? clampStart(n) : START_DEFAULT;
}

export function useStartCards(): number | undefined {
  return useLiveQuery(() => loadStartCards(), []);
}

export async function saveStartCards(n: number): Promise<number> {
  const value = Number.isFinite(n) ? clampStart(n) : START_DEFAULT;
  await db.settings.put({ id: START_KEY, value, updatedAt: now() });
  return value;
}

/**
 * How many hours a card's variants are spread over, from the first one of a round: with 4 hours, 2 variants come 4
 * hours apart and 3 come 2 hours apart. A waiting variant can always be taken sooner from Activity.
 */
const SPREAD_KEY = "variantSpreadHours";
export const SPREAD_MIN = 1;
export const SPREAD_MAX = 12;

const clampSpread = (n: number) => Math.min(SPREAD_MAX, Math.max(SPREAD_MIN, Math.round(n)));

export async function loadSpreadHours(): Promise<number> {
  const row = await db.settings.get(SPREAD_KEY);
  const n = row && !row.deletedAt ? Number(row.value) : NaN;
  return Number.isFinite(n) ? clampSpread(n) : SPREAD_DEFAULT_HOURS;
}

export function useSpreadHours(): number | undefined {
  return useLiveQuery(() => loadSpreadHours(), []);
}

export async function saveSpreadHours(n: number): Promise<number> {
  const value = Number.isFinite(n) ? clampSpread(n) : SPREAD_DEFAULT_HOURS;
  await db.settings.put({ id: SPREAD_KEY, value, updatedAt: now() });
  return value;
}
