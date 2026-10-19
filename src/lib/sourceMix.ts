import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { now } from "./ids";
import { splitReference, type Source } from "./sources";

/**
 * The four groups quizzes are mixed from, from the most to the least wanted:
 * past quizzes you took, books, online sources (websites and videos), and everything else (notes, handouts, or no
 * source at all).
 */
export type Tier = "quiz" | "book" | "online" | "other";

export const TIERS: { id: Tier; label: string; about: string }[] = [
  { id: "quiz", label: "Past quizzes", about: "Questions from quizzes you took before" },
  { id: "book", label: "Books", about: "Questions from a book" },
  { id: "online", label: "Online", about: "Websites and videos" },
  { id: "other", label: "Others", about: "Anything else: notes, handouts, or no source" },
];

export type Mix = Record<Tier, number>;

/** Each tier's weight, from 1 to 10. The share of a quiz is its weight out of the total. */
export const MIX_MIN = 1;
export const MIX_MAX = 10;
export const DEFAULT_MIX: Mix = { quiz: 4, book: 3, online: 2, other: 1 };
export const EQUAL_MIX: Mix = { quiz: 1, book: 1, online: 1, other: 1 };

/** A quiz with at least this many questions includes every tier that has questions. */
export const EVERY_TIER_FROM = 8;

const KEY = "sourceMix";
const WEB = /https?:\/\/|www\.|youtu\.?be/i;

/** Which tier a question's reference puts it in. */
export function tierOfReference(reference: string | undefined, sources: Source[]): Tier {
  const ref = reference?.trim();
  if (!ref) return "other";
  const { source } = splitReference(ref, sources);
  if (source) {
    if (source.kind === "quiz") return "quiz";
    if (source.kind === "book") return "book";
    if (source.kind === "website" || source.kind === "video") return "online";
    // A source made as "Other" stays in Others, whatever its link is.
    return "other";
  }
  // A reference typed by hand that holds a web address still counts as online.
  return WEB.test(ref) ? "online" : "other";
}

/** A stored or typed mix as whole weights in range, or null when it is not one. */
export function cleanMix(v: unknown): Mix | null {
  if (!v || typeof v !== "object") return null;
  const out = { ...DEFAULT_MIX };
  for (const t of TIERS) {
    const n = (v as Record<string, unknown>)[t.id];
    if (typeof n !== "number" || !Number.isInteger(n) || n < MIX_MIN || n > MIX_MAX) return null;
    out[t.id] = n;
  }
  return out;
}

export async function loadSourceMix(): Promise<Mix> {
  const row = await db.settings.get(KEY);
  return (row && !row.deletedAt ? cleanMix(row.value) : null) ?? DEFAULT_MIX;
}

export function useSourceMix(): Mix {
  return useLiveQuery(() => loadSourceMix(), []) ?? DEFAULT_MIX;
}

export async function saveSourceMix(mix: Mix): Promise<boolean> {
  const clean = cleanMix(mix);
  if (!clean) return false;
  await db.settings.put({ id: KEY, value: clean, updatedAt: now() });
  return true;
}

/** Each tier's share of the total weight, as a whole percent. They add up to 100. */
export function sharesOf(mix: Mix): Mix {
  const total = TIERS.reduce((s, t) => s + mix[t.id], 0);
  const raw = TIERS.map((t) => ({ id: t.id, exact: (mix[t.id] / total) * 100 }));
  const out = Object.fromEntries(raw.map((r) => [r.id, Math.floor(r.exact)])) as Mix;
  let left = 100 - TIERS.reduce((s, t) => s + out[t.id], 0);
  for (const r of [...raw].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)))) {
    if (left <= 0) break;
    out[r.id] += 1;
    left -= 1;
  }
  return out;
}

/**
 * How many questions to take from each tier for a quiz of `n`.
 * Only tiers that have questions get any. In a quiz of EVERY_TIER_FROM or more, each of those gets at least one.
 * The rest are shared by weight, and a tier that runs out hands its share to the others. A shorter quiz picks each
 * question's tier at random by weight, so over many quizzes the shares still hold.
 */
export function quotas(avail: Mix, weights: Mix, n: number, rand: () => number = Math.random): Mix {
  const out: Mix = { quiz: 0, book: 0, online: 0, other: 0 };
  const total = TIERS.reduce((s, t) => s + avail[t.id], 0);
  let left = Math.max(0, Math.min(n, total));
  const open = () => TIERS.filter((t) => out[t.id] < avail[t.id]);
  if (left >= EVERY_TIER_FROM) {
    for (const t of open()) {
      out[t.id] = 1;
      left -= 1;
    }
    // Share the rest by weight: the tier furthest below its share gets the next one.
    while (left > 0) {
      const sum = open().reduce((s, t) => s + weights[t.id], 0);
      const given = TIERS.reduce((s, t) => s + out[t.id], 0) + 1;
      let best = open()[0];
      let gap = -Infinity;
      for (const t of open()) {
        const g = (weights[t.id] / sum) * given - out[t.id];
        if (g > gap + 1e-9 || (Math.abs(g - gap) <= 1e-9 && weights[t.id] > weights[best.id])) {
          best = t;
          gap = g;
        }
      }
      out[best.id] += 1;
      left -= 1;
    }
    return out;
  }
  while (left > 0) {
    const tiers = open();
    const sum = tiers.reduce((s, t) => s + weights[t.id], 0);
    let r = rand() * sum;
    let pick = tiers[tiers.length - 1];
    for (const t of tiers) {
      r -= weights[t.id];
      if (r < 0) {
        pick = t;
        break;
      }
    }
    out[pick.id] += 1;
    left -= 1;
  }
  return out;
}