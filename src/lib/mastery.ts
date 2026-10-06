import { CONFIG } from "./config";
import type { NodeKind, QuizAttempt, TreeNode } from "./db";
import { childrenOf } from "./tree";

export type MasteryStatus = "not_yet" | "mastered" | "expired";

export interface MasteryInfo {
  status: MasteryStatus;
  /** When the latest awarding quiz was submitted. */
  masteredAt?: number;
  expiresAt?: number;
  /** Set while a failed quiz keeps this node locked. */
  lockedUntil?: number;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function masteryDays(kind: NodeKind): number {
  return CONFIG.masteryDays[kind];
}

/** When mastery earned at `earnedAt` runs out. */
export function expiryFor(kind: NodeKind, earnedAt: number): number {
  return earnedAt + masteryDays(kind) * DAY;
}

/** A submitted quiz awards mastery when it passed and was eligible. */
export function awardsMastery(a: QuizAttempt): boolean {
  const s = a.summary;
  if (a.status !== "submitted" || !s) return false;
  return s.masteryAwarded ?? (s.passed && a.eligible !== false);
}

/**
 * Mastery and cooldown for one topic, subject, or category, worked out only from submitted attempts.
 * - Mastery comes from the latest awarding quiz and lasts a fixed time that depends on the level.
 * - A failed quiz that could have awarded mastery locks the node for the cooldown. A later quiz replaces it.
 *   A failed practice-only quiz never locks anything, since it could not have earned mastery anyway.
 * - Failing never removes mastery you still hold, and quizzes you did not submit never count.
 */
export function masteryFor(attempts: QuizAttempt[], node: Pick<TreeNode, "id" | "kind">, nowMs: number): MasteryInfo {
  const mine = attempts
    .filter((a) => !a.deletedAt && a.status === "submitted" && a.scopeNodeId === node.id && a.submittedAt !== undefined)
    .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));

  let status: MasteryStatus = "not_yet";
  let masteredAt: number | undefined;
  let expiresAt: number | undefined;
  const award = mine.find(awardsMastery);
  if (award && award.submittedAt !== undefined) {
    masteredAt = award.submittedAt;
    expiresAt = expiryFor(node.kind, masteredAt);
    status = nowMs < expiresAt ? "mastered" : "expired";
  }

  let lockedUntil: number | undefined;
  const last = mine.find((a) => a.eligible !== false);
  if (last?.summary && !last.summary.passed && last.submittedAt !== undefined) {
    const until = last.submittedAt + CONFIG.cooldownHours * HOUR;
    if (nowMs < until) lockedUntil = until;
  }
  return { status, masteredAt, expiresAt, lockedUntil };
}

export interface TreeMastery {
  info: MasteryInfo;
  /** For a subject, its topics; for a category, its subjects. */
  childTotal: number;
  /** How many of those currently hold valid mastery of their own. */
  childMastered: number;
}

/** Mastery for every node, with the child counts an overview shows. A shared subject counts under each category. */
export function treeMastery(nodes: TreeNode[], attempts: QuizAttempt[], nowMs: number): Map<string, TreeMastery> {
  const infos = new Map(nodes.map((n) => [n.id, masteryFor(attempts, n, nowMs)]));
  const out = new Map<string, TreeMastery>();
  for (const n of nodes) {
    const kids = childrenOf(nodes, n.id);
    out.set(n.id, {
      info: infos.get(n.id)!,
      childTotal: kids.length,
      childMastered: kids.filter((c) => infos.get(c.id)?.status === "mastered").length,
    });
  }
  return out;
}