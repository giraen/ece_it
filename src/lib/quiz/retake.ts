import type { AttemptItem, QuizAttempt, TreeNode } from "@/lib/db";
import { CONFIG } from "@/lib/config";
import {
  observations,
  rankStandings,
  standingsOf,
  type Obs,
  type Ranking,
  type Standing,
} from "@/lib/progress/analytics";

/**
 * Reviewing a failed quiz before retaking it: the questions missed last time, and the weak spots of that topic,
 * subject or category from every quiz so far. It shows from the moment the quiz fails (while locked too) until a quiz
 * on the same place passes.
 */

/** Why a question was missed, in the words the Analytics lists use. */
export type MissReason = "misconception" | "careless" | "unprepared" | "skipped" | null;

export const MISS_LABEL: Record<Exclude<MissReason, null>, string> = {
  misconception: "Misconception",
  careless: "Careless",
  unprepared: "Unprepared",
  skipped: "Not answered",
};

export interface Missed {
  item: AttemptItem;
  reason: MissReason;
  /** Also missed in an earlier quiz. */
  before: boolean;
}

/** The lists shown under Weak spots, in this order. */
export const WEAK_LISTS: Ranking[] = ["weakest", "misconception", "unprepared", "careless"];
const WEAK_SIZE = 3;

export interface RetakeReview {
  attempt: QuizAttempt;
  missed: Missed[];
  weak: { ranking: Ranking; rows: Standing[] }[];
  /** The missed questions and the weak spots, once each: what Practise these starts. */
  practiceIds: string[];
}

/**
 * The quiz that failed, when the latest quiz that could pass on this place did not, and nothing has passed since.
 * Practice and incognito quizzes do not count either way.
 */
export function lastFailed(attempts: QuizAttempt[], nodeId: string): QuizAttempt | null {
  const mine = attempts
    .filter((a) => !a.deletedAt && a.status === "submitted" && a.scopeNodeId === nodeId && a.submittedAt !== undefined)
    .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
  const last = mine.find((a) => a.eligible !== false && !a.practice && !a.incognito);
  return last?.summary && !last.summary.passed ? last : null;
}

/** Why one question was missed: sure but wrong, fast and wrong, guessed, or left blank. */
export function missReason(it: AttemptItem): MissReason {
  if (!it.answered) return "skipped";
  if (it.sureness === "sure") return "misconception";
  const ratio = it.targetSec > 0 ? it.activeMs / (it.targetSec * 1000) : 1;
  if (ratio <= CONFIG.stats.fastRatio) return "careless";
  if (it.sureness === "not_sure" || it.sureness === "just_guessed") return "unprepared";
  return null;
}

/** The answers inside a node: a topic, a subject, or a category, by id. */
function inside(obs: Obs[], node: Pick<TreeNode, "id" | "kind">): Obs[] {
  if (node.kind === "topic") return obs.filter((o) => o.topicId === node.id);
  if (node.kind === "subject") return obs.filter((o) => o.subjectId === node.id);
  return obs.filter((o) => o.categoryId === node.id);
}

/**
 * The review for a node, or null when its latest quiz did not fail. `exists` says which questions are still in the
 * bank, so practice only uses those. `bar` is the mastery bar, as Weakest leaves out what already reaches it.
 */
export function retakeReview(
  attempts: QuizAttempt[],
  node: Pick<TreeNode, "id" | "kind">,
  bar: number,
  exists: (questionId: string) => boolean,
): RetakeReview | null {
  const attempt = lastFailed(attempts, node.id);
  if (!attempt) return null;

  const earlier = attempts.filter(
    (a) => a.id !== attempt.id && !a.deletedAt && a.status === "submitted" && !a.incognito,
  );
  const missedBefore = new Set(earlier.flatMap((a) => a.items.filter((it) => !it.correct).map((it) => it.questionId)));
  const seen = new Set<string>();
  const missed: Missed[] = [];
  for (const item of attempt.items) {
    if (item.correct || seen.has(item.questionId)) continue;
    seen.add(item.questionId);
    missed.push({ item, reason: missReason(item), before: missedBefore.has(item.questionId) });
  }

  // The same lists as Analytics › Strengths and weak spots, for single questions inside this place.
  const rows = standingsOf(inside(observations(attempts.filter((a) => !a.incognito)), node), "question");
  const weak = WEAK_LISTS.map((ranking) => ({
    ranking,
    rows: rankStandings(ranking === "weakest" ? rows.filter((r) => r.credit + 1e-9 < bar) : rows, ranking, WEAK_SIZE),
  }));

  const practiceIds = [
    ...new Set([...missed.map((m) => m.item.questionId), ...weak.flatMap((w) => w.rows.map((r) => r.key))]),
  ].filter(exists);
  return { attempt, missed, weak, practiceIds };
}

/** How many questions the weak-spot lists hold, counting each once. */
export const weakCount = (r: RetakeReview) => new Set(r.weak.flatMap((w) => w.rows.map((x) => x.key))).size;
