import type { QuizAttempt } from "./db";
import { median, SURENESS_ORDER, type Sureness } from "./scoring";

/** One question as it was answered in one submitted quiz. */
export interface Obs {
  attemptId: string;
  at: number;
  questionId: string;
  stem: string;
  topicId: string;
  topicName: string;
  tags: string[];
  answered: boolean;
  correct: boolean;
  sureness?: Sureness;
  /** Time taken divided by the target time. 1.0 is exactly on target. */
  ratio: number;
  credit: number;
}

export function observations(attempts: QuizAttempt[]): Obs[] {
  const out: Obs[] = [];
  for (const a of attempts) {
    if (a.deletedAt || a.status !== "submitted" || a.submittedAt === undefined) continue;
    for (const it of a.items) {
      out.push({
        attemptId: a.id,
        at: a.submittedAt,
        questionId: it.questionId,
        stem: it.stem,
        topicId: it.topicId,
        topicName: it.topicName,
        tags: it.tags,
        answered: it.answered,
        correct: it.correct,
        sureness: it.sureness,
        ratio: it.targetSec > 0 ? it.activeMs / (it.targetSec * 1000) : 0,
        credit: it.credit,
      });
    }
  }
  return out;
}

export interface Group {
  key: string;
  label: string;
  /** Questions shown, answered or not. */
  n: number;
  correct: number;
  accuracy: number;
  /** Average credit, counting unanswered as 0. */
  credit: number;
  medianRatio: number;
  /** Wrong answers that were marked Sure. */
  confidentErrors: number;
  /** Credit of each quiz this group appeared in, oldest first. */
  trend: number[];
}

export function groupObs(obs: Obs[], keysOf: (o: Obs) => { key: string; label: string }[]): Group[] {
  const buckets = new Map<string, { label: string; items: Obs[] }>();
  for (const o of obs) {
    for (const { key, label } of keysOf(o)) {
      const b = buckets.get(key);
      if (b) b.items.push(o);
      else buckets.set(key, { label, items: [o] });
    }
  }
  return Array.from(buckets.entries()).map(([key, { label, items }]) => {
    const n = items.length;
    const correct = items.filter((o) => o.correct).length;
    const byAttempt = new Map<string, { at: number; sum: number; n: number }>();
    for (const o of items) {
      const t = byAttempt.get(o.attemptId) ?? { at: o.at, sum: 0, n: 0 };
      t.sum += o.credit;
      t.n += 1;
      byAttempt.set(o.attemptId, t);
    }
    return {
      key,
      label,
      n,
      correct,
      accuracy: n ? correct / n : 0,
      credit: n ? items.reduce((s, o) => s + o.credit, 0) / n : 0,
      medianRatio: median(items.filter((o) => o.answered).map((o) => o.ratio)),
      confidentErrors: items.filter((o) => o.answered && !o.correct && o.sureness === "sure").length,
      trend: Array.from(byAttempt.values())
        .sort((a, b) => a.at - b.at)
        .map((t) => t.sum / t.n),
    };
  });
}

export const byTopic = (obs: Obs[]) => groupObs(obs, (o) => [{ key: o.topicId, label: o.topicName }]);

export const byTag = (obs: Obs[]) =>
  groupObs(obs, (o) => o.tags.map((t) => ({ key: `${o.topicId}|${t.toLowerCase()}`, label: `${o.topicName} › ${t}` })));

export interface CalibrationRow {
  level: Sureness;
  answered: number;
  correct: number;
  /** How often you were right when you chose this level. */
  rate: number;
}

/** For each sureness level, how often you were actually right. Only answered questions count. */
export function calibration(obs: Obs[]): CalibrationRow[] {
  return SURENESS_ORDER.map((level) => {
    const mine = obs.filter((o) => o.answered && o.sureness === level);
    const correct = mine.filter((o) => o.correct).length;
    return { level, answered: mine.length, correct, rate: mine.length ? correct / mine.length : 0 };
  });
}

export interface QuizPoint {
  at: number;
  credit: number;
  scopeName: string;
}

/** The credit of each submitted quiz, oldest first. */
export function creditOverTime(attempts: QuizAttempt[]): QuizPoint[] {
  return attempts
    .filter((a) => !a.deletedAt && a.status === "submitted" && a.summary && a.submittedAt !== undefined)
    .sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0))
    .map((a) => ({ at: a.submittedAt as number, credit: a.summary?.credit ?? 0, scopeName: a.scopeName }));
}

export interface QuestionStat {
  questionId: string;
  stem: string;
  topicName: string;
  seen: number;
  correct: number;
  accuracy: number;
  avgRatio: number;
  confidentWrong: number;
  flag: "suspect" | "easy" | null;
}

/**
 * Per question, across every quiz it appeared in.
 * "suspect": wrong while sure at least half the time, so either the answer key is wrong or something stubborn is off.
 * "easy": always right and quick over several tries, so it adds little.
 */
export function questionStats(obs: Obs[]): QuestionStat[] {
  const by = new Map<string, Obs[]>();
  for (const o of obs) by.set(o.questionId, [...(by.get(o.questionId) ?? []), o]);
  return Array.from(by.entries()).map(([questionId, list]) => {
    const latest = [...list].sort((a, b) => b.at - a.at)[0];
    const seen = list.length;
    const correct = list.filter((o) => o.correct).length;
    const confidentWrong = list.filter((o) => o.answered && !o.correct && o.sureness === "sure").length;
    const answered = list.filter((o) => o.answered);
    const avgRatio = answered.length ? answered.reduce((s, o) => s + o.ratio, 0) / answered.length : 0;
    let flag: QuestionStat["flag"] = null;
    if (seen >= 3 && confidentWrong / seen >= 0.5) flag = "suspect";
    else if (seen >= 4 && correct === seen && avgRatio <= 0.5) flag = "easy";
    return {
      questionId,
      stem: latest.stem,
      topicName: latest.topicName,
      seen,
      correct,
      accuracy: seen ? correct / seen : 0,
      avgRatio,
      confidentWrong,
      flag,
    };
  });
}

export interface Summary {
  quizzes: number;
  questions: number;
  accuracy: number;
  credit: number;
  totalMs: number;
}

export function summarize(attempts: QuizAttempt[]): Summary {
  const done = attempts.filter((a) => !a.deletedAt && a.status === "submitted" && a.summary);
  const questions = done.reduce((s, a) => s + (a.summary?.n ?? 0), 0);
  const correct = done.reduce((s, a) => s + (a.summary?.correct ?? 0), 0);
  const credit = done.reduce((s, a) => s + (a.summary?.credit ?? 0) * (a.summary?.n ?? 0), 0);
  return {
    quizzes: done.length,
    questions,
    accuracy: questions ? correct / questions : 0,
    credit: questions ? credit / questions : 0,
    totalMs: done.reduce((s, a) => s + (a.summary?.totalMs ?? 0), 0),
  };
}