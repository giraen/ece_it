import type { QuizAttempt, Question, Variant } from "./db";
import { slotsIn } from "./slots";

export const ORIGINAL = "original";

/** How many times each version of each question has been shown, from every quiz that was started and not deleted. */
export function serveCounts(attempts: QuizAttempt[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const a of attempts) {
    if (a.deletedAt) continue;
    for (const it of a.items) {
      const m = out.get(it.questionId) ?? new Map<string, number>();
      const key = it.variantId ?? ORIGINAL;
      m.set(key, (m.get(key) ?? 0) + 1);
      out.set(it.questionId, m);
    }
  }
  return out;
}

/** The ids of variants that have been shown at least once. */
export function servedVariantIds(attempts: QuizAttempt[]): Set<string> {
  const ids = new Set<string>();
  for (const a of attempts) {
    if (a.deletedAt) continue;
    for (const it of a.items) if (it.variantId) ids.add(it.variantId);
  }
  return ids;
}

/**
 * Chooses which version of a standard question to show: the original or one of its approved variants,
 * whichever has been shown least. Ties are broken at random. Returns null for the original.
 */
export function pickVariant(
  variants: Variant[],
  counts: Map<string, number> | undefined,
  rand: () => number = Math.random,
): Variant | null {
  const options: (Variant | null)[] = [
    null,
    ...variants.filter((v) => v.kind === "concept" && v.status === "approved" && !v.deletedAt),
  ];
  const seen = (v: Variant | null) => counts?.get(v ? v.id : ORIGINAL) ?? 0;
  const least = Math.min(...options.map(seen));
  const pool = options.filter((v) => seen(v) === least);
  return pool[Math.floor(rand() * pool.length)];
}

/** Approved wordings that still fit the template, meaning every slot they use exists. */
export function usableFrames(q: Question, variants: Variant[]): Variant[] {
  const t = q.template;
  if (!t) return [];
  const known = new Set([...t.givens.map((g) => g.name), ...t.derived.map((d) => d.name)]);
  return variants.filter(
    (v) => v.kind === "frame" && v.status === "approved" && !v.deletedAt && slotsIn(v.stem).every((s) => known.has(s)),
  );
}