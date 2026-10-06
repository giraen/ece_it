import type { Question, QuizAttempt, TreeNode } from "./db";
import { masteryFor } from "./mastery";
import { childrenOf, subtreeOf } from "./tree";

/** Mastery that runs out within this many days counts as "expiring". */
export const EXPIRING_DAYS = 3;
const DAY = 86_400_000;

export interface Suggestion {
  node: TreeNode;
  reason: "expiring" | "expired" | "never";
}

export interface Dashboard {
  /** Topics that have at least one question. */
  topics: number;
  topicsMastered: number;
  /** Topics with questions that do not currently hold mastery. */
  topicsLeft: number;
  /** Topics with questions that have never been quizzed. */
  neverTaken: number;
  /** Mastery, at any level, that runs out soon. Soonest first. */
  expiringSoon: { node: TreeNode; expiresAt: number }[];
  /** Mastery that has already lapsed, at any level. */
  expired: number;
  /** Items locked after a failed quiz. Soonest to unlock first. */
  locked: { node: TreeNode; until: number }[];
  inProgress: number;
  questions: number;
  quizzesTaken: number;
  recent: QuizAttempt[];
  next: Suggestion | null;
}

/** A quick overview for the home page, worked out from the bank and the quiz history. Never changes anything. */
export function computeDashboard(input: {
  nodes: TreeNode[];
  questions: Question[];
  attempts: QuizAttempt[];
  nowMs: number;
}): Dashboard {
  const { nodes, nowMs } = input;
  const questions = input.questions.filter((q) => !q.deletedAt);
  const attempts = input.attempts.filter((a) => !a.deletedAt);
  const live = nodes.filter((n) => !n.deletedAt);
  const submitted = attempts.filter((a) => a.status === "submitted");

  const questionCount = new Map<string, number>();
  for (const q of questions) questionCount.set(q.topicId, (questionCount.get(q.topicId) ?? 0) + 1);
  // Computation questions cannot be quizzed yet, so only standard ones decide whether something can be quizzed.
  const countUnder = (id: string) =>
    subtreeOf(live, id)
      .filter((n) => n.kind === "topic")
      .reduce((s, n) => s + (questionCount.get(n.id) ?? 0), 0);

  const info = new Map(live.map((n) => [n.id, masteryFor(submitted, n, nowMs)]));
  const topicsWithQuestions = live.filter((n) => n.kind === "topic" && (questionCount.get(n.id) ?? 0) > 0);
  const quizzed = new Set(submitted.map((a) => a.scopeNodeId));

  const mastered = topicsWithQuestions.filter((n) => info.get(n.id)?.status === "mastered");
  const neverTaken = topicsWithQuestions.filter((n) => !quizzed.has(n.id));

  const expiringSoon = live
    .map((node) => ({ node, i: info.get(node.id) }))
    .filter(
      (x) => x.i?.status === "mastered" && x.i.expiresAt !== undefined && x.i.expiresAt - nowMs <= EXPIRING_DAYS * DAY,
    )
    .map((x) => ({ node: x.node, expiresAt: x.i?.expiresAt as number }))
    .sort((a, b) => a.expiresAt - b.expiresAt);

  const expiredNodes = live.filter((n) => info.get(n.id)?.status === "expired");
  const locked = live
    .filter((n) => info.get(n.id)?.lockedUntil !== undefined)
    .map((node) => ({ node, until: info.get(node.id)?.lockedUntil as number }))
    .sort((a, b) => a.until - b.until);
  const isLocked = (id: string) => info.get(id)?.lockedUntil !== undefined;

  // A suggestion is a topic or subject you can quiz right now, most urgent first.
  const quizzable = (n: TreeNode) => n.kind !== "category" && countUnder(n.id) > 0 && !isLocked(n.id);
  let next: Suggestion | null = null;
  const soon = expiringSoon.find((x) => quizzable(x.node));
  if (soon) next = { node: soon.node, reason: "expiring" };
  if (!next) {
    const lapsed = expiredNodes
      .filter(quizzable)
      .sort((a, b) => (info.get(a.id)?.expiresAt ?? 0) - (info.get(b.id)?.expiresAt ?? 0))[0];
    if (lapsed) next = { node: lapsed, reason: "expired" };
  }
  if (!next) {
    const fresh = neverTaken.find((n) => quizzable(n));
    if (fresh) next = { node: fresh, reason: "never" };
  }

  return {
    topics: topicsWithQuestions.length,
    topicsMastered: mastered.length,
    topicsLeft: topicsWithQuestions.length - mastered.length,
    neverTaken: neverTaken.length,
    expiringSoon,
    expired: expiredNodes.length,
    locked,
    inProgress: attempts.filter((a) => a.status === "in_progress").length,
    questions: questions.length,
    quizzesTaken: submitted.length,
    recent: [...submitted].sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0)).slice(0, 3),
    next,
  };
}

/** The top-level nodes, in order, for places that need them. */
export const roots = (nodes: TreeNode[]) =>
  childrenOf(
    nodes.filter((n) => !n.deletedAt),
    null,
  );