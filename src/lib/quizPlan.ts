import { CONFIG } from "./config";
import type { AttemptItem, NodeKind, Question } from "./db";

/** What a quiz on a topic or subject may look like, given how many questions are available. */
export interface QuizPlan {
  kind: "topic" | "subject";
  available: number;
  /** The fewest items a quiz may have and still be able to award mastery. */
  masteryMin: number;
  /** The most items you can ask for. */
  maxItems: number;
  defaultItems: number;
  /** A topic quiz is always this many minutes. A subject quiz lets you choose, so this is null. */
  fixedMinutes: number | null;
}

export function planFor(kind: "topic" | "subject", available: number): QuizPlan {
  if (kind === "topic") {
    const t = CONFIG.quiz.topic;
    return {
      kind,
      available,
      masteryMin: t.minItems,
      maxItems: Math.min(t.maxItems, available),
      defaultItems: Math.min(t.defaultItems, available),
      fixedMinutes: t.totalMinutes,
    };
  }
  const s = CONFIG.quiz.subject;
  return {
    kind,
    available,
    masteryMin: s.minItems,
    maxItems: available,
    defaultItems: Math.min(s.defaultItems, available),
    fixedMinutes: null,
  };
}

/** The longest total time a quiz may be given, in minutes. */
export const MAX_MINUTES = 24 * 60;

/** A suggested total time for a quiz of this many items. */
export function suggestedMinutes(items: number): number {
  return Math.max(1, Math.round((items * CONFIG.quiz.suggestedSecPerItem) / 60));
}

/** Whether `n` is a whole number of items this plan allows. */
export function itemsProblem(plan: QuizPlan, n: number): string | null {
  if (plan.available === 0) return "There are no questions here yet.";
  if (!Number.isInteger(n) || n < 1) return "Enter a whole number of questions.";
  if (n > plan.maxItems) return `The most you can ask for here is ${plan.maxItems}.`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Does a quiz cover its groups well enough to award mastery?
// ---------------------------------------------------------------------------------------------

/** Tag groups for a topic quiz. Every tag counts, and an untagged question is its own group. */
export const tagKeys = (q: Question): string[] => (q.tags.length ? q.tags.map((t) => t.toLowerCase()) : [""]);
export const topicKeys = (q: Question): string[] => [q.topicId];

export function coverageFor(kind: "topic" | "subject") {
  return kind === "topic" ? { keysOf: tagKeys, groupName: "tag" } : { keysOf: topicKeys, groupName: "topic" };
}

/** Each group the bank has at least 2 questions for must contribute at least 2 to the quiz. */
export function checkCoverage(
  picked: Question[],
  pool: Question[],
  keysOf: (q: Question) => string[],
  groupName: string,
): { ok: boolean; reason?: string } {
  const have = new Map<string, number>();
  const got = new Map<string, number>();
  for (const q of pool) for (const k of keysOf(q)) have.set(k, (have.get(k) ?? 0) + 1);
  for (const q of picked) for (const k of keysOf(q)) got.set(k, (got.get(k) ?? 0) + 1);
  for (const [k, n] of have) {
    if (n >= CONFIG.minPerGroup && (got.get(k) ?? 0) < CONFIG.minPerGroup) {
      return { ok: false, reason: `Some ${groupName}s have fewer than ${CONFIG.minPerGroup} questions in this quiz.` };
    }
  }
  return { ok: true };
}

/** The shortest quiz that could give every group its 2 questions, never below `floor` and never above the pool. */
export function minLengthForCoverage(pool: Question[], keysOf: (q: Question) => string[], floor: number): number {
  const have = new Map<string, number>();
  for (const q of pool) for (const k of keysOf(q)) have.set(k, (have.get(k) ?? 0) + 1);
  let total = 0;
  for (const n of have.values()) total += Math.min(n, CONFIG.minPerGroup);
  return Math.min(Math.max(total, floor), pool.length);
}

/** Whether a quiz that was picked can award mastery, and if not, why. */
export function masteryEligibility(
  plan: QuizPlan,
  picked: Question[],
  pool: Question[],
): { eligible: boolean; reason?: string } {
  if (picked.length < plan.masteryMin) {
    return { eligible: false, reason: `Mastery needs at least ${plan.masteryMin} questions in a ${plan.kind} quiz.` };
  }
  const { keysOf, groupName } = coverageFor(plan.kind);
  const c = checkCoverage(picked, pool, keysOf, groupName);
  return c.ok ? { eligible: true } : { eligible: false, reason: c.reason };
}

/** Which results group an item belongs to: tags in a topic quiz, topics in a subject quiz. */
export function groupKeysFor(kind: NodeKind, item: AttemptItem): { key: string; label: string }[] {
  if (kind === "subject") return [{ key: item.topicId, label: item.topicName }];
  if (item.tags.length === 0) return [{ key: "", label: "Untagged" }];
  return item.tags.map((t) => ({ key: t.toLowerCase(), label: t }));
}