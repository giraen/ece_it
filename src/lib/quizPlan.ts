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

/** How many times a question can appear in one quiz: a whole number from 1 to the most allowed. Missing means 1. */
export function repeatsOf(q: Pick<Question, "repeats">): number {
  const n = q.repeats;
  if (typeof n !== "number" || !Number.isFinite(n)) return 1;
  return Math.min(CONFIG.maxRepeats, Math.max(1, Math.floor(n)));
}

/** The questions with each one listed as many times as it may appear. This is what a quiz draws from. */
export function withCopies(questions: Question[]): Question[] {
  return questions.flatMap((q) => Array.from({ length: repeatsOf(q) }, () => q));
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
// Can a quiz award mastery?
// ---------------------------------------------------------------------------------------------

/** The fewest questions a quiz of this kind may have and still award mastery. */
export function masteryMinItems(kind: NodeKind): number {
  return CONFIG.quiz[kind].minItems;
}

/**
 * Whether a quiz with this many questions can award mastery. Only the length matters: which tags or topics showed up
 * does not, and passing is decided by the mastery bar alone.
 */
export function masteryEligibility(kind: NodeKind, count: number): { eligible: boolean; reason?: string } {
  const min = masteryMinItems(kind);
  if (count < min) {
    const where = kind === "category" ? "a category mock" : `a ${kind} quiz`;
    return { eligible: false, reason: `Mastery needs at least ${min} questions in ${where}.` };
  }
  return { eligible: true };
}

/** Which results group an item belongs to: tags in a topic quiz, topics in a subject quiz, blueprint entries in a mock. */
export function groupKeysFor(kind: NodeKind, item: AttemptItem): { key: string; label: string }[] {
  if (kind === "category") {
    if (item.entryId) return [{ key: item.entryId, label: item.entryName ?? item.subjectName }];
    return [{ key: item.subjectId, label: item.subjectName }];
  }
  if (kind === "subject") return [{ key: item.topicId, label: item.topicName }];
  if (item.tags.length === 0) return [{ key: "", label: "Untagged" }];
  return item.tags.map((t) => ({ key: t.toLowerCase(), label: t }));
}