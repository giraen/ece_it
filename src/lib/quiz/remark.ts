import { db, type AttemptItem, type Question, type QuizAttempt } from "@/lib/db";
import { now } from "@/lib/ids";
import { loadMasteryBar } from "@/lib/preferences";
import { canRecheck, recheckOne } from "@/lib/progress/recheck";
import { evaluatePass, itemCredit, overallStats } from "./scoring";

/**
 * Re-marking past quizzes after a wrong answer key is fixed in the bank.
 *
 * A finished quiz keeps its own copy of every question, so fixing the bank does not change past results by itself.
 * This marks the old answers again against the corrected key: an answer that is now right earns its credit (by how
 * sure you were), and one that is now wrong loses it. The quiz's score and its mastery are then worked out again.
 */

/**
 * The bank's corrected answer for this copy of a question, or null when there is nothing to re-mark: the key is the
 * same, the question is gone, or the copy's choices no longer match the bank's (a dynamic question, or a reworded
 * version with its own choices).
 */
export function correctedKey(item: AttemptItem, q: Question | undefined): string | null {
  if (!q || q.deletedAt || q.type !== "standard" || item.type !== "standard") return null;
  if (q.correctChoiceId === item.correctChoiceId) return null;
  if (!item.choices.some((c) => c.id === q.correctChoiceId)) return null;
  return q.correctChoiceId;
}

function remarkItems(items: AttemptItem[], keys: Map<string, string>): { items: AttemptItem[]; changed: number } {
  let changed = 0;
  const next = items.map((it) => {
    const key = keys.get(it.questionId);
    if (!key || !it.choices.some((c) => c.id === key) || it.correctChoiceId === key) return it;
    changed++;
    const correct = it.answered && it.selectedChoiceId === key;
    return { ...it, correctChoiceId: key, correct, credit: itemCredit({ correct, sureness: it.sureness }) };
  });
  return { items: next, changed };
}

export interface RemarkResult {
  /** Quizzes that changed. */
  quizzes: number;
  /** Answers that were marked again. */
  answers: number;
  gained: number;
  lost: number;
}

/**
 * Marks every finished quiz again for the given questions, against the answer keys in the bank now. Leave out
 * `questionIds` to do every question whose key changed.
 */
export async function remarkQuizzes(questionIds?: string[]): Promise<RemarkResult> {
  const only = questionIds ? new Set(questionIds) : null;
  const questions = new Map(
    (only ? await db.questions.bulkGet([...only]) : await db.questions.toArray())
      .filter((q): q is Question => !!q)
      .map((q) => [q.id, q]),
  );
  const bar = await loadMasteryBar();
  const t = now();
  const out: RemarkResult = { quizzes: 0, answers: 0, gained: 0, lost: 0 };
  const attempts = await db.attempts.filter((a) => a.status === "submitted" && !a.deletedAt && !!a.summary).toArray();

  const updates: QuizAttempt[] = [];
  for (const a of attempts) {
    const keys = new Map<string, string>();
    for (const it of a.items) {
      if (only && !only.has(it.questionId)) continue;
      const key = correctedKey(it, questions.get(it.questionId));
      if (key) keys.set(it.questionId, key);
    }
    if (!keys.size) continue;
    const { items, changed } = remarkItems(a.items, keys);
    if (!changed) continue;

    const overall = overallStats(items);
    let next: QuizAttempt = {
      ...a,
      items,
      updatedAt: t,
      summary: {
        ...a.summary!,
        n: overall.n,
        answered: overall.answered,
        correct: overall.correct,
        accuracy: overall.accuracy,
        credit: overall.credit,
        totalMs: overall.totalMs,
      },
    };
    if (canRecheck(next)) {
      // Pass or fail, and mastery, under the rules as they are now, dated to the day the quiz was taken.
      const r = recheckOne(next, bar, t);
      next = { ...r.next, updatedAt: t };
      if (!r.had && r.has) out.gained++;
      if (r.had && !r.has) out.lost++;
    } else {
      const pass = evaluatePass(overall.credit, next.summary!.bar);
      next = { ...next, summary: { ...next.summary!, passed: pass.passed } };
    }
    updates.push(next);
    out.quizzes++;
    out.answers += changed;
  }
  if (updates.length) await db.attempts.bulkPut(updates);
  return out;
}

/** How many finished quizzes still hold the old answer key for this question. */
export async function quizzesWithOldKey(q: Question): Promise<number> {
  const attempts = await db.attempts
    .filter((a) => a.status === "submitted" && !a.deletedAt && a.items.some((it) => it.questionId === q.id))
    .toArray();
  return attempts.filter((a) => a.items.some((it) => it.questionId === q.id && correctedKey(it, q))).length;
}

/** A short line saying what re-marking did. */
export function describeRemark(r: RemarkResult): string {
  if (!r.quizzes) return "Nothing to re-mark: those quizzes already use the answer in the bank.";
  const parts = [
    `Re-marked ${r.answers} answer${r.answers === 1 ? "" : "s"} in ${r.quizzes} quiz${r.quizzes === 1 ? "" : "zes"}.`,
  ];
  if (r.gained) parts.push(`${r.gained} now earn${r.gained === 1 ? "s" : ""} mastery.`);
  if (r.lost) parts.push(`${r.lost} no longer earn${r.lost === 1 ? "s" : ""} mastery.`);
  return parts.join(" ");
}
