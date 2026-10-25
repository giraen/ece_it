import { db, type QuizAttempt } from "./db";
import { now } from "./ids";
import { recheckEligibility, withCopies } from "./quizPlan";
import { subtreeOf } from "./tree";

/** A quiz that passed but was ruled out only because a tag or topic was left out, so it can be checked again. */
export function canRecheck(a: QuizAttempt): boolean {
  return (
    a.status === "submitted" &&
    !a.practice &&
    a.eligible === false &&
    a.scopeKind !== "category" &&
    !!a.summary?.passed &&
    !a.summary.masteryAwarded &&
    /^Some (tag|topic)s /.test(a.ineligibleReason ?? "")
  );
}

/** Checks the quiz against the rule as it is now. When it qualifies, mastery is awarded as of the day it was taken. */
export async function recheckMastery(id: string): Promise<{ ok: boolean; text: string }> {
  const a = await db.attempts.get(id);
  if (!a || !canRecheck(a) || !a.summary) return { ok: false, text: "This quiz cannot be checked again." };
  const nodes = await db.nodes.filter((n) => !n.deletedAt).toArray();
  const topicIds = new Set(
    subtreeOf(nodes, a.scopeNodeId)
      .filter((n) => n.kind === "topic")
      .map((n) => n.id),
  );
  const questions = await db.questions.filter((q) => !q.deletedAt && topicIds.has(q.topicId)).toArray();
  const result = recheckEligibility(a.scopeKind as "topic" | "subject", a.items, withCopies(questions));
  if (!result.eligible) {
    return { ok: false, text: `Still not eligible. ${result.reason ?? ""}`.trim() };
  }
  const { ineligibleReason, ...rest } = a;
  void ineligibleReason;
  await db.attempts.put({ ...rest, eligible: true, summary: { ...a.summary, masteryAwarded: true }, updatedAt: now() });
  return { ok: true, text: "Mastery earned." };
}