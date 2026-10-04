import { CONFIG } from "./config";
import { composeQuiz, shuffle } from "./compose";
import { db, type AttemptItem, type NodeKind, type Question, type QuizAttempt, type TreeNode } from "./db";
import { newId, now } from "./ids";
import { evaluatePass, groupStats, itemCredit, overallStats, type Sureness } from "./scoring";
import { pathOf } from "./tree";

/** Which results group an item belongs to, depending on the level of the quiz. */
export function groupKeysFor(kind: NodeKind, item: AttemptItem): { key: string; label: string }[] {
  if (kind === "category") return [{ key: item.subjectId, label: item.subjectName }];
  if (kind === "subject") return [{ key: item.topicId, label: item.topicName }];
  if (item.tags.length === 0) return [{ key: "", label: "Untagged" }];
  return item.tags.map((t) => ({ key: t.toLowerCase(), label: t }));
}

function buildItem(q: Question, nodes: TreeNode[]): AttemptItem {
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
    targetSec: q.targetSec ?? CONFIG.defaultTargetSec[q.type],
    confirmed: false,
    activeMs: 0,
    changes: 0,
    answered: false,
    correct: false,
    credit: 0,
  };
}

/** Starts a quiz on a category, subject, or topic and returns its id. Category quizzes run as mock boards. */
export async function startAttempt(scopeId: string, length: number): Promise<string> {
  const nodes = await db.nodes.filter((n) => !n.deletedAt).toArray();
  const scope = nodes.find((n) => n.id === scopeId);
  if (!scope) throw new Error("That item no longer exists.");
  const questions = await db.questions.filter((q) => !q.deletedAt).toArray();
  const picked = composeQuiz({ nodes, questions, scope, length });
  if (picked.length === 0) throw new Error("There are no questions to quiz on here yet.");

  const t = now();
  const attempt: QuizAttempt = {
    id: newId(),
    scopeNodeId: scope.id,
    scopeKind: scope.kind,
    scopeName: pathOf(nodes, scope.id),
    mode: scope.kind === "category" ? "mock" : "standard",
    status: "in_progress",
    startedAt: t,
    currentIndex: 0,
    items: picked.map((q) => buildItem(q, nodes)),
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

/** Records time spent on a question. Never lowers the stored value. */
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

export function isComplete(item: AttemptItem): boolean {
  return Boolean(item.selectedChoiceId && item.sureness);
}

/** Scores the quiz and locks it. Questions with no choice or no sureness rating score 0. */
export async function submitAttempt(id: string): Promise<void> {
  await db.transaction("rw", db.attempts, async () => {
    const a = await db.attempts.get(id);
    if (!a || a.status !== "in_progress") return;
    const items = a.items.map((it) => {
      const answered = isComplete(it);
      const correct = answered && it.selectedChoiceId === it.correctChoiceId;
      return {
        ...it,
        answered,
        correct,
        credit: itemCredit({ correct, sureness: it.sureness, activeMs: it.activeMs, targetSec: it.targetSec }),
      };
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
