import { CONFIG } from "./config";
import { db, type QuizAttempt } from "./db";
import { formatDate, formatPercent } from "./format";
import { now } from "./ids";
import { awardsMastery, expiryFor } from "./mastery";
import { loadMasteryBar } from "./preferences";
import { masteryEligibility } from "./quizPlan";
import { evaluatePass, overallStats } from "./scoring";

/** A finished quiz that mastery can be judged on. A practice quiz never counts, and an unfinished one has no score. */
export function canRecheck(a: QuizAttempt): boolean {
  return a.status === "submitted" && !a.practice && !a.deletedAt && !!a.summary && a.submittedAt !== undefined;
}

export interface Outcome {
  /** The quiz as it is after the check. It is the same object when nothing changed. */
  next: QuizAttempt;
  changed: boolean;
  /** It earned mastery before the check, and after it. */
  had: boolean;
  has: boolean;
  text: string;
}

/**
 * Judges a finished quiz again under the rules as they are now: the mastery bar and the fewest questions. Which
 * tags or topics were in it does not matter. The score comes from the answers it holds, and mastery is dated to the day
 * the quiz was taken, so the time it lasts does not change. It can give mastery and it can take it away.
 */
export function recheckOne(a: QuizAttempt, bar: number, nowMs: number): Outcome {
  const s = a.summary!;
  const submittedAt = a.submittedAt!;
  const credit = overallStats(a.items).credit;
  const pass = evaluatePass(credit, bar);
  const elig = masteryEligibility(a.scopeKind, a.items.length);
  const has = pass.passed && elig.eligible;
  const had = awardsMastery(a);

  const { ineligibleReason, noLock, ...rest } = a;
  void ineligibleReason;
  const { failedGroups, ...summary } = s;
  void failedGroups;
  const next: QuizAttempt = {
    ...rest,
    eligible: elig.eligible,
    ...(elig.reason ? { ineligibleReason: elig.reason } : {}),
    // Taking mastery away from a quiz that had passed must not lock the item, which only a failed quiz does.
    ...(pass.passed ? {} : s.passed ? { noLock: true } : noLock ? { noLock: true } : {}),
    summary: { ...summary, credit, passed: pass.passed, bar, masteryAwarded: has },
  };
  const same =
    s.passed === pass.passed &&
    s.bar === bar &&
    s.masteryAwarded === has &&
    s.failedGroups === undefined &&
    (a.eligible !== false) === elig.eligible &&
    a.ineligibleReason === elig.reason &&
    !!a.noLock === !!next.noLock;

  let text: string;
  if (has) {
    const until = expiryFor(a.scopeKind, submittedAt);
    text =
      nowMs < until
        ? `Mastered until ${formatDate(until)}.`
        : `It reaches the bar, but the mastery it gives ran out on ${formatDate(until)}.`;
  } else if (!elig.eligible) {
    text = `Not mastered. ${elig.reason}`;
  } else {
    text = `Not mastered. It scored ${formatPercent(credit)} and the bar is ${formatPercent(bar, 0)}.`;
  }
  return { next: same ? a : next, changed: !same, had, has, text };
}

/** Checks one quiz again and saves what changed. */
export async function recheckMastery(id: string): Promise<{ ok: boolean; changed: boolean; text: string }> {
  const a = await db.attempts.get(id);
  if (!a || !canRecheck(a)) return { ok: false, changed: false, text: "This quiz cannot be checked again." };
  const out = recheckOne(a, await loadMasteryBar(), now());
  if (out.changed) await db.attempts.put({ ...out.next, updatedAt: now() });
  const gained = !out.had && out.has;
  const lost = out.had && !out.has;
  const lead = gained ? "Mastery earned. " : lost ? "Mastery removed. " : "";
  return { ok: out.has, changed: out.changed, text: `${lead}${out.text}` };
}

export interface RecheckSummary {
  checked: number;
  gained: number;
  lost: number;
}

/**
 * Checks every quiz again whose mastery could still be running, which is the ones taken within the time mastery lasts
 * for their level. An older quiz cannot change what is mastered now, so it is left alone.
 */
export async function recheckAll(): Promise<RecheckSummary> {
  const bar = await loadMasteryBar();
  const t = now();
  const list = await db.attempts.filter((a) => canRecheck(a) && t < expiryFor(a.scopeKind, a.submittedAt!)).toArray();
  const puts: QuizAttempt[] = [];
  let gained = 0;
  let lost = 0;
  for (const a of list) {
    const out = recheckOne(a, bar, t);
    if (!out.changed) continue;
    puts.push({ ...out.next, updatedAt: t });
    if (!out.had && out.has) gained += 1;
    if (out.had && !out.has) lost += 1;
  }
  if (puts.length) await db.attempts.bulkPut(puts);
  return { checked: list.length, gained, lost };
}

// ---------------------------------------------------------------------------------------------
// Rechecking by itself when the rules change
// ---------------------------------------------------------------------------------------------

const RULES_KEY = "rulesApplied";

/** What a quiz is judged by. When any of it changes, the quizzes still counting toward mastery are checked again. */
async function currentRules() {
  return {
    bar: await loadMasteryBar(),
    min: {
      topic: CONFIG.quiz.topic.minItems,
      subject: CONFIG.quiz.subject.minItems,
      category: CONFIG.quiz.category.minItems,
    },
    days: CONFIG.masteryDays,
  };
}

/** Sent on the window when an automatic recheck changed something, so the page frame can say so. */
export const RECHECK_EVENT = "ece:rechecked";

let running: Promise<RecheckSummary | null> | null = null;
let again = false;

/** One look at the rules: when they differ from the saved ones, it rechecks and saves them. */
async function syncOnce(): Promise<RecheckSummary | null> {
  const rules = JSON.stringify(await currentRules());
  const row = await db.settings.get(RULES_KEY);
  if (row && !row.deletedAt && row.value === rules) return null;
  const summary = await recheckAll();
  await db.settings.put({ id: RULES_KEY, value: rules, updatedAt: now() });
  if (summary.gained + summary.lost > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<RecheckSummary>(RECHECK_EVENT, { detail: summary }));
  }
  return summary;
}

/**
 * Compares the rules with the ones the quizzes were last judged by. When they differ, or none were saved, it checks
 * the quizzes again and saves the rules. Returns what happened, or null when nothing needed doing. A call made while
 * one is running makes it look again afterward, so a change made in the middle is not missed.
 */
export function syncRules(): Promise<RecheckSummary | null> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      let result = await syncOnce();
      while (again) {
        again = false;
        result = (await syncOnce()) ?? result;
      }
      return result;
    } finally {
      running = null;
      again = false;
    }
  })();
  return running;
}