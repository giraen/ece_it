import { composeBlueprintQuiz } from "./blueprint";
import { composeQuiz, historyFrom, shuffle } from "./compose";
import { db, type AttemptItem, type Question, type QuizAttempt, type TreeNode, type Variant } from "./db";
import { formatCountdown } from "./format";
import { newId, now } from "./ids";
import { masteryFor } from "./mastery";
import { pickVariant, serveCounts, usableFrames } from "./serve";
import { MAX_MINUTES, groupKeysFor, itemsProblem, masteryEligibility, planFor } from "./quizPlan";
import { evaluatePass, groupStats, itemCredit, overallStats, targetSecPerItem, type Sureness } from "./scoring";
import { pathOf, subtreeOf } from "./tree";

/** What the quiz shows for a question. For a computation question this is one roll of fresh numbers. */
interface Shown {
  stem: string;
  choices: Question["choices"];
  correctChoiceId: string;
  /** Set when an approved AI rewording of the question is shown instead of the original. */
  variantId?: string;
}

function buildItem(
  q: Question,
  nodes: TreeNode[],
  targetSec: number,
  shown: Shown,
  entry?: { id: string; name: string },
): AttemptItem {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const topic = byId.get(q.topicId);
  const subject = topic?.parentId ? byId.get(topic.parentId) : undefined;
  const category = subject?.parentId ? byId.get(subject.parentId) : undefined;
  return {
    questionId: q.id,
    type: q.type,
    stem: shown.stem,
    choices: shown.choices,
    correctChoiceId: shown.correctChoiceId,
    tags: q.tags,
    topicId: q.topicId,
    topicName: topic?.name ?? "(deleted topic)",
    subjectId: subject?.id ?? "",
    subjectName: subject?.name ?? "(deleted subject)",
    categoryId: category?.id ?? "",
    categoryName: category?.name ?? "(deleted category)",
    choiceOrder: shuffle(shown.choices.map((c) => c.id)),
    variantId: shown.variantId,
    entryId: entry?.id,
    entryName: entry?.name,
    targetSec,
    confirmed: false,
    activeMs: 0,
    changes: 0,
    answered: false,
    correct: false,
    credit: 0,
  };
}

type Computation = typeof import("./computation");

/**
* What a quiz shows for a question. It never waits on an AI: it uses a rewording that was already made and checked,
* and falls back to the original question when there is none.
* - A standard question shows whichever version has been shown least: the original or an approved variant.
* - A computation question rolls fresh numbers, using its own wordings plus any approved AI wordings.
*/
function shownFor(
  q: Question,
  comp: Computation | null,
  variants: Variant[],
  counts: Map<string, number> | undefined,
): Shown {
  if (q.type !== "computation") {
    const v = pickVariant(variants, counts);
    return v ? { stem: v.stem, choices: v.choices, correctChoiceId: v.correctChoiceId, variantId: v.id } : q;
  }
  if (!comp) throw new Error("Computation questions could not be loaded.");
  const frames = usableFrames(q, variants);
  const withFrames =
    frames.length && q.template
      ? { ...q, template: { ...q.template, stems: [...q.template.stems, ...frames.map((f) => f.stem)] } }
      : q;
  const r = comp.rollQuestion(withFrames);
  if (!r.ok) throw new Error(`A computation question could not be generated. ${r.reason}`);
  return r.rolled;
}

/**
 * Starts a quiz and returns its id. A topic or subject quiz has `items` questions. A category quiz is a mock board
 * built from the category's blueprint, so `items` is ignored for it. Each item's target time is the quiz's total
 * time divided by the number of items. It is only a statistic.
 */
export async function startAttempt(scopeId: string, items: number, totalMinutes: number): Promise<string> {
  const nodes = await db.nodes.filter((n) => !n.deletedAt).toArray();
  const scope = nodes.find((n) => n.id === scopeId);
  if (!scope) throw new Error("That item no longer exists.");

  // A node stays locked for a day after a failed quiz that could have earned mastery.
  const everyAttempt = await db.attempts.toArray();
  const { lockedUntil } = masteryFor(everyAttempt, scope, now());
  if (lockedUntil !== undefined) {
    throw new Error(
      `This ${scope.kind} is locked after a failed quiz. You can retake it in ${formatCountdown(lockedUntil - now())}.`,
    );
  }
  const history = historyFrom(everyAttempt);
  const counts = serveCounts(everyAttempt);
  const approved = await db.variants.filter((v) => !v.deletedAt && v.status === "approved").toArray();
  const variantsOf = new Map<string, Variant[]>();
  for (const v of approved) variantsOf.set(v.questionId, [...(variantsOf.get(v.questionId) ?? []), v]);

  const everyQuestion = await db.questions.filter((q) => !q.deletedAt).toArray();
  // The formula engine is only loaded when there is a computation question to roll.
  const comp = everyQuestion.some((q) => q.type === "computation") ? await import("./computation") : null;
  // A computation recipe that cannot produce a question is left out rather than breaking the quiz.
  const usable = comp ? everyQuestion.filter((q) => q.type !== "computation" || comp.isUsable(q)) : everyQuestion;

  let picked: { question: Question; entry?: { id: string; name: string } }[];
  let eligibility: { eligible: boolean; reason?: string };
  let minutes: number;
  const mode: "standard" | "mock" = scope.kind === "category" ? "mock" : "standard";

  if (scope.kind === "category") {
    const blueprint = await db.blueprints.get(scope.id);
    if (!blueprint || blueprint.deletedAt) throw new Error("Set up a blueprint for this category first.");
    const bq = composeBlueprintQuiz({ nodes, questions: usable, blueprint, history });
    if (bq.picks.length === 0) throw new Error("There are no questions to quiz on here yet.");
    picked = bq.picks.map((p) => ({ question: p.question, entry: { id: p.entryId, name: p.entryName } }));
    eligibility = { eligible: bq.eligible, reason: bq.reason };
    minutes = totalMinutes;
  } else {
    const topicIds = new Set(
      subtreeOf(nodes, scope.id)
        .filter((n) => n.kind === "topic")
        .map((n) => n.id),
    );
    const pool = usable.filter((q) => topicIds.has(q.topicId));
    const plan = planFor(scope.kind, pool.length);
    const problem = itemsProblem(plan, items);
    if (problem) throw new Error(problem);
    const chosen = composeQuiz({ nodes, questions: pool, scope, length: items, history });
    if (chosen.length === 0) throw new Error("There are no questions to quiz on here yet.");
    picked = chosen.map((question) => ({ question }));
    eligibility = masteryEligibility(plan, chosen, pool);
    minutes = plan.fixedMinutes ?? totalMinutes;
  }

  if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
    throw new Error(`The total time must be between 1 and ${MAX_MINUTES} minutes.`);
  }
  const targetSec = targetSecPerItem(minutes * 60, picked.length);

  const t = now();
  const attempt: QuizAttempt = {
    id: newId(),
    scopeNodeId: scope.id,
    scopeKind: scope.kind,
    scopeName: pathOf(nodes, scope.id),
    mode,
    eligible: eligibility.eligible,
    ineligibleReason: eligibility.reason,
    status: "in_progress",
    startedAt: t,
    currentIndex: 0,
    items: picked.map((p) =>
      buildItem(
        p.question,
        nodes,
        targetSec,
        shownFor(p.question, comp, variantsOf.get(p.question.id) ?? [], counts.get(p.question.id)),
        p.entry,
      ),
    ),
    createdAt: t,
    updatedAt: t,
  };
  await db.attempts.add(attempt);
  return attempt.id;
}

async function patchAttempt(id: string, fn: (a: QuizAttempt) => void): Promise<void> {
  await db.transaction("rw", db.attempts, async () => {
    const a = await db.attempts.get(id);
    if (!a || a.status !== "in_progress") return;
    fn(a);
    a.updatedAt = now();
    await db.attempts.put(a);
  });
}

/** Time only ever goes up, so a late or repeated save can never lower it. */
function bumpTime(item: AttemptItem, ms: number) {
  if (ms > item.activeMs) item.activeMs = ms;
}

export function setSelection(id: string, index: number, choiceId: string, activeMs: number): Promise<void> {
  return patchAttempt(id, (a) => {
    const it = a.items[index];
    if (!it) return;
    bumpTime(it, activeMs);
    if (it.selectedChoiceId === choiceId) return;
    if (it.selectedChoiceId) it.changes += 1;
    else it.firstSelectMs = Math.max(it.activeMs, activeMs);
    it.selectedChoiceId = choiceId;
    it.confirmed = false;
  });
}

export function setSureness(id: string, index: number, sureness: Sureness, activeMs: number): Promise<void> {
  return patchAttempt(id, (a) => {
    const it = a.items[index];
    if (!it) return;
    bumpTime(it, activeMs);
    if (it.sureness === sureness) return;
    it.sureness = sureness;
    it.confirmed = false;
  });
}

export function confirmItem(id: string, index: number, activeMs: number): Promise<void> {
  return patchAttempt(id, (a) => {
    const it = a.items[index];
    if (!it) return;
    bumpTime(it, activeMs);
    it.confirmed = true;
  });
}

/** Records time spent on a question. */
export function saveTime(id: string, index: number, activeMs: number): Promise<void> {
  return patchAttempt(id, (a) => {
    const it = a.items[index];
    if (it) bumpTime(it, activeMs);
  });
}

export function setCurrentIndex(id: string, index: number): Promise<void> {
  return patchAttempt(id, (a) => {
    a.currentIndex = Math.max(0, Math.min(index, a.items.length - 1));
  });
}

/** A question counts as answered once it has a choice and a sureness rating. */
export function isComplete(item: AttemptItem): boolean {
  return Boolean(item.selectedChoiceId && item.sureness);
}

/** Scores the quiz and locks it. A question with no choice or no sureness rating scores 0. */
export async function submitAttempt(id: string): Promise<void> {
  await db.transaction("rw", db.attempts, async () => {
    const a = await db.attempts.get(id);
    if (!a || a.status !== "in_progress") return;
    const items = a.items.map((it) => {
      const answered = isComplete(it);
      const correct = answered && it.selectedChoiceId === it.correctChoiceId;
      return { ...it, answered, correct, credit: itemCredit({ correct, sureness: it.sureness }) };
    });
    const overall = overallStats(items);
    const groups = groupStats(items, (it) => groupKeysFor(a.scopeKind, it));
    const pass = evaluatePass(overall.credit, groups);
    const t = now();
    await db.attempts.put({
      ...a,
      items,
      status: "submitted",
      submittedAt: t,
      updatedAt: t,
      summary: {
        n: overall.n,
        answered: overall.answered,
        correct: overall.correct,
        accuracy: overall.accuracy,
        credit: overall.credit,
        totalMs: overall.totalMs,
        passed: pass.passed,
        masteryAwarded: pass.passed && a.eligible !== false,
        bar: pass.bar,
        failedGroups: pass.failedGroups,
      },
    });
  });
}

/** Gives up on an unfinished quiz. It stays in the database but never counts. */
export function abandonAttempt(id: string): Promise<void> {
  return patchAttempt(id, (a) => {
    a.status = "abandoned";
  });
}