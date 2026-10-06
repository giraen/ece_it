import { composeQuiz, historyFrom, shuffle } from "./compose";
import { db, type AttemptItem, type Question, type QuizAttempt, type TreeNode } from "./db";
import { newId, now } from "./ids";
import { MAX_MINUTES, groupKeysFor, itemsProblem, masteryEligibility, planFor } from "./quizPlan";
import { evaluatePass, groupStats, itemCredit, overallStats, targetSecPerItem, type Sureness } from "./scoring";
import { pathOf, subtreeOf } from "./tree";
import { formatCountdown } from "./format";
import { masteryFor } from "./mastery";

function buildItem(q: Question, nodes: TreeNode[], targetSec: number): AttemptItem {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const topic = byId.get(q.topicId);
  const subject = topic?.parentId ? byId.get(topic.parentId) : undefined;
  const category = subject?.parentId ? byId.get(subject.parentId) : undefined;
  return {
    questionId: q.id,
    type: q.type,
    stem: q.stem,
    choices: q.choices,
    correctChoiceId: q.correctChoiceId,
    tags: q.tags,
    topicId: q.topicId,
    topicName: topic?.name ?? "(deleted topic)",
    subjectId: subject?.id ?? "",
    subjectName: subject?.name ?? "(deleted subject)",
    categoryId: category?.id ?? "",
    categoryName: category?.name ?? "(deleted category)",
    choiceOrder: shuffle(q.choices.map((c) => c.id)),
    targetSec,
    confirmed: false,
    activeMs: 0,
    changes: 0,
    answered: false,
    correct: false,
    credit: 0,
  };
}

/**
 * Starts a quiz on a topic or subject and returns its id.
 * Each item's target time is the quiz's total time divided by the number of items. It is only a statistic.
 */
export async function startAttempt(scopeId: string, items: number, totalMinutes: number): Promise<string> {
  const nodes = await db.nodes.filter((n) => !n.deletedAt).toArray();
  const scope = nodes.find((n) => n.id === scopeId);
  if (!scope) throw new Error("That item no longer exists.");
  if (scope.kind === "category") throw new Error("Choose a topic or a subject.");

  // Computation questions are left out until they can be rolled into real numbers.
  const topicIds = new Set(
    subtreeOf(nodes, scope.id)
      .filter((n) => n.kind === "topic")
      .map((n) => n.id),
  );
  const pool = (await db.questions.filter((q) => !q.deletedAt && q.type === "standard").toArray()).filter((q) =>
    topicIds.has(q.topicId),
  );

  const plan = planFor(scope.kind, pool.length);
  const problem = itemsProblem(plan, items);
  if (problem) throw new Error(problem);
  const minutes = plan.fixedMinutes ?? totalMinutes;
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
    throw new Error(`The total time must be between 1 and ${MAX_MINUTES} minutes.`);
  }

  // A node stays locked for a day after a failed quiz that could have earned mastery.
  const everyAttempt = await db.attempts.toArray();
  const { lockedUntil } = masteryFor(everyAttempt, scope, now());
  if (lockedUntil !== undefined) {
    throw new Error(
        `This ${scope.kind} is locked after a failed quiz. You can retake it in ${formatCountdown(lockedUntil - now())}.`,
    );
    }
const history = historyFrom(everyAttempt);
  const picked = composeQuiz({ nodes, questions: pool, scope, length: items, history });
  if (picked.length === 0) throw new Error("There are no questions to quiz on here yet.");
  const targetSec = targetSecPerItem(minutes * 60, picked.length);
  const eligibility = masteryEligibility(plan, picked, pool);

  const t = now();
  const attempt: QuizAttempt = {
    id: newId(),
    scopeNodeId: scope.id,
    scopeKind: scope.kind,
    scopeName: pathOf(nodes, scope.id),
    mode: "standard",
    eligible: eligibility.eligible,
    ineligibleReason: eligibility.reason,
    status: "in_progress",
    startedAt: t,
    currentIndex: 0,
    items: picked.map((q) => buildItem(q, nodes, targetSec)),
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