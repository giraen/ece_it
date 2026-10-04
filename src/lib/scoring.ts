import { CONFIG } from "./config";

export type Sureness = "sure" | "not_sure" | "wise_guess" | "just_guessed";

export const SURENESS_ORDER: Sureness[] = ["sure", "not_sure", "wise_guess", "just_guessed"];

export const SURENESS_LABEL: Record<Sureness, string> = {
  sure: "Sure",
  not_sure: "Not sure",
  wise_guess: "Wise guess",
  just_guessed: "Just guessed",
};

/** 1.0 up to the target time, then a straight line down to minFactor at minAtRatio times the target. */
export function speedFactor(activeMs: number, targetSec: number): number {
  if (targetSec <= 0) return 1;
  const ratio = activeMs / (targetSec * 1000);
  const { fullUntilRatio, minFactor, minAtRatio } = CONFIG.speed;
  if (ratio <= fullUntilRatio) return 1;
  if (ratio >= minAtRatio) return minFactor;
  return 1 - ((ratio - fullUntilRatio) / (minAtRatio - fullUntilRatio)) * (1 - minFactor);
}

/** Credit for one answer: sureness credit times speed factor. A wrong or missing answer earns 0. */
export function itemCredit(input: {
  correct: boolean;
  sureness: Sureness | undefined;
  activeMs: number;
  targetSec: number;
}): number {
  if (!input.correct || !input.sureness) return 0;
  return CONFIG.sureCredit[input.sureness] * speedFactor(input.activeMs, input.targetSec);
}

/** What the scoring needs to know about one question in a quiz. */
export interface ScoredItem {
  answered: boolean;
  correct: boolean;
  sureness?: Sureness;
  activeMs: number;
  targetSec: number;
  credit: number;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface Overall {
  n: number;
  answered: number;
  correct: number;
  accuracy: number;
  /** Average credit across all questions. Unanswered questions count as 0. */
  credit: number;
  totalMs: number;
}

export function overallStats(items: ScoredItem[]): Overall {
  const n = items.length;
  const correct = items.filter((i) => i.correct).length;
  return {
    n,
    answered: items.filter((i) => i.answered).length,
    correct,
    accuracy: n ? correct / n : 0,
    credit: n ? items.reduce((s, i) => s + i.credit, 0) / n : 0,
    totalMs: items.reduce((s, i) => s + i.activeMs, 0),
  };
}

export interface GroupStats {
  key: string;
  label: string;
  n: number;
  correct: number;
  wrong: number;
  accuracy: number;
  credit: number;
  sureness: Record<Sureness, number>;
  /** Wrong answers that were marked Sure. */
  confidentErrors: number;
  /** Median of (time taken / target time). 1.0 means right on target. */
  medianRatio: number;
  /** Answered questions that took longer than their target time. */
  overTarget: number;
}

/** Groups items by one or more keys each. An item can belong to several groups (for example several tags). */
export function groupStats<T extends ScoredItem>(
  items: T[],
  keysOf: (item: T) => { key: string; label: string }[],
): GroupStats[] {
  const buckets = new Map<string, { label: string; items: T[] }>();
  for (const item of items) {
    for (const { key, label } of keysOf(item)) {
      const b = buckets.get(key);
      if (b) b.items.push(item);
      else buckets.set(key, { label, items: [item] });
    }
  }
  return Array.from(buckets.entries()).map(([key, { label, items: list }]) => {
    const n = list.length;
    const correct = list.filter((i) => i.correct).length;
    const sureness: Record<Sureness, number> = { sure: 0, not_sure: 0, wise_guess: 0, just_guessed: 0 };
    let confidentErrors = 0;
    for (const i of list) {
      if (i.answered && i.sureness) {
        sureness[i.sureness] += 1;
        if (!i.correct && i.sureness === "sure") confidentErrors += 1;
      }
    }
    const timed = list.filter((i) => i.answered && i.targetSec > 0);
    const ratios = timed.map((i) => i.activeMs / (i.targetSec * 1000));
    return {
      key,
      label,
      n,
      correct,
      wrong: n - correct,
      accuracy: n ? correct / n : 0,
      credit: n ? list.reduce((s, i) => s + i.credit, 0) / n : 0,
      sureness,
      confidentErrors,
      medianRatio: median(ratios),
      overTarget: ratios.filter((r) => r > 1).length,
    };
  });
}

export interface PassResult {
  passed: boolean;
  credit: number;
  bar: number;
  /** Labels of groups that fell below the floor. */
  failedGroups: string[];
}

const EPS = 1e-9;

/** Passes when the average credit reaches the bar and no sizeable group falls below the floor. */
export function evaluatePass(credit: number, groups: GroupStats[]): PassResult {
  const failedGroups = groups
    .filter((g) => g.n >= CONFIG.minPerGroup && g.credit + EPS < CONFIG.childFloor)
    .map((g) => g.label);
  return {
    passed: credit + EPS >= CONFIG.passBar && failedGroups.length === 0,
    credit,
    bar: CONFIG.passBar,
    failedGroups,
  };
}

export interface Weakness {
  key: string;
  label: string;
  credit: number;
  reason: string;
}

/** A plain-language reason a group lost credit. */
export function explainGroup(g: GroupStats): string {
  if (g.wrong > 0) {
    let s = `${g.wrong} of ${g.n} wrong`;
    if (g.confidentErrors > 0) s += `, ${g.confidentErrors} marked Sure`;
    if (g.medianRatio > 1.5) s += `; ${g.medianRatio.toFixed(1)}× slower than target`;
    return s;
  }
  const bits: string[] = [];
  if (g.medianRatio > 1.25) bits.push(`${g.medianRatio.toFixed(1)}× slower than target`);
  else if (g.overTarget > 0) bits.push(`${g.overTarget} of ${g.n} ran over the target time`);
  const unsure = g.n - g.sureness.sure;
  if (unsure > 0) bits.push(`${unsure} of ${g.n} not marked Sure`);
  return bits.length ? `right, but ${bits.join(" and ")}` : "below the mastery bar";
}

/** The weakest groups, lowest credit first. Only groups below the bar are listed. */
export function needsWork(groups: GroupStats[], limit = 3): Weakness[] {
  return groups
    .filter((g) => g.credit + EPS < CONFIG.passBar)
    .sort((a, b) => a.credit - b.credit)
    .slice(0, limit)
    .map((g) => ({ key: g.key, label: g.label, credit: g.credit, reason: explainGroup(g) }));
}
