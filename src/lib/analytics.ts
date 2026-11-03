import { CONFIG } from "./config";
import type { QuizAttempt } from "./db";
import { median, SURENESS_ORDER, type Sureness } from "./scoring";
import { isExemptTag } from "./tagRules";

/** One question as it was answered in one submitted quiz. */
export interface Obs {
  attemptId: string;
  at: number;
  questionId: string;
  stem: string;
  topicId: string;
  topicName: string;
  /** The category the question was asked under, as it was named then. */
  categoryName: string;
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
        categoryName: it.categoryName ?? "",
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
    .map((a) => ({
      at: a.submittedAt as number,
      credit: a.summary?.credit ?? 0,
      scopeName: a.practice ? `${a.scopeName} (practice)` : a.scopeName,
    }));
}

/** One part of a quiz's result inside a line: a subject inside a category, or a topic inside a subject. */
export interface SeriesPart {
  key: string;
  label: string;
  /** Average credit of that part's questions in the quiz. */
  credit: number;
  /** How many of the quiz's questions were in that part. */
  n: number;
}

export interface SeriesPoint {
  at: number;
  /** Average credit of this quiz's questions that belong to the line. */
  credit: number;
  /** The quiz it came from, e.g. "ELEX › Circuits". */
  label: string;
  /**
   * The same result split one level down, weakest first: by subject inside a category, or by topic inside a subject.
   * When a quiz only covered one subject, a category's point is split by topic instead. Empty for a topic.
   */
  parts: SeriesPart[];
  /** What the parts are. */
  partsBy?: "category" | "subject" | "topic";
}

export interface CategorySeries {
  key: string;
  name: string;
  /** Where it sits, for grouping in a list: the category of a subject, or the category and subject of a topic. */
  group?: string;
  points: SeriesPoint[];
}

/** The key of the extra series that covers every category together. */
export const ALL_KEY = "all";

type Item = QuizAttempt["items"][number];

function submittedInOrder(attempts: QuizAttempt[]): QuizAttempt[] {
  return attempts
    .filter((a) => !a.deletedAt && a.status === "submitted" && a.summary && a.submittedAt !== undefined)
    .sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
}

const average = (items: Item[]) => items.reduce((s, it) => s + it.credit, 0) / items.length;

/** Splits a quiz's questions into parts and scores each one, weakest first. */
function partsOf(items: Item[], keyOf: (it: Item) => { key: string; label: string }): SeriesPart[] {
  const by = new Map<string, { label: string; items: Item[] }>();
  for (const it of items) {
    const { key, label } = keyOf(it);
    const b = by.get(key);
    if (b) b.items.push(it);
    else by.set(key, { label, items: [it] });
  }
  return Array.from(by.entries())
    .map(([key, b]) => ({ key, label: b.label, credit: average(b.items), n: b.items.length }))
    .sort((x, y) => x.credit - y.credit || x.label.localeCompare(y.label));
}

const bySubject = (it: Item) => ({ key: it.subjectId, label: it.subjectName });
const byTopicPart = (it: Item) => ({ key: it.topicId, label: it.topicName });
const byCategory = (it: Item) => ({ key: (it.categoryName ?? "").trim().toLowerCase(), label: it.categoryName ?? "" });

/** Splits by the first level that has more than one part, so a one-subject quiz is split by topic. */
function splitDown(
  items: Item[],
  levels: { by: "category" | "subject" | "topic"; keyOf: (it: Item) => { key: string; label: string } }[],
): Pick<SeriesPoint, "parts" | "partsBy"> {
  for (const l of levels) {
    const parts = partsOf(items, l.keyOf);
    if (parts.length > 1) return { parts, partsBy: l.by };
  }
  return { parts: [] };
}
const SUBJECT = { by: "subject" as const, keyOf: bySubject };
const TOPIC = { by: "topic" as const, keyOf: byTopicPart };
const CATEGORY = { by: "category" as const, keyOf: byCategory };

/**
 * One line of points per category, plus one for all of them together (always last), oldest first.
 * A quiz makes a point in every category it asked questions from, scored on those questions only, and split by
 * subject.
 */
export function categorySeries(
  attempts: QuizAttempt[],
  categories: readonly { key: string; name: string }[],
): CategorySeries[] {
  const names = categories.map((c) => c.name.trim().toLowerCase());
  const out: CategorySeries[] = categories.map((c) => ({ key: c.key, name: c.name, points: [] }));
  const all: CategorySeries = { key: ALL_KEY, name: "All categories", points: [] };

  for (const a of submittedInOrder(attempts)) {
    const label = a.practice ? `${a.scopeName} (practice)` : a.scopeName;
    const at = a.submittedAt as number;
    const perCat: Item[][] = categories.map(() => []);
    for (const it of a.items) {
      const ci = names.indexOf((it.categoryName ?? "").trim().toLowerCase());
      if (ci >= 0) perCat[ci].push(it);
    }
    perCat.forEach((items, ci) => {
      if (items.length)
        out[ci].points.push({ at, credit: average(items), label, ...splitDown(items, [SUBJECT, TOPIC]) });
    });
    if (a.items.length) {
      all.points.push({ at, credit: a.summary?.credit ?? 0, label, ...splitDown(a.items, [CATEGORY, SUBJECT, TOPIC]) });
    }
  }
  return [...out, all];
}

/**
 * One line per subject or per topic that has been quizzed, oldest point first. A quiz makes a point on every subject
 * or topic it asked questions from, scored on those questions only. A subject's point is split by topic.
 */
export function levelSeries(attempts: QuizAttempt[], level: "subject" | "topic"): CategorySeries[] {
  const lines = new Map<string, CategorySeries>();
  for (const a of submittedInOrder(attempts)) {
    const label = a.practice ? `${a.scopeName} (practice)` : a.scopeName;
    const at = a.submittedAt as number;
    const by = new Map<string, Item[]>();
    for (const it of a.items) {
      const key = level === "subject" ? it.subjectId : it.topicId;
      by.set(key, [...(by.get(key) ?? []), it]);
    }
    for (const [key, items] of by) {
      const first = items[items.length - 1];
      let line = lines.get(key);
      if (!line) {
        line = { key, name: "", points: [] };
        lines.set(key, line);
      }
      // The newest name wins, so a renamed subject or topic shows its current name.
      line.name = level === "subject" ? first.subjectName : first.topicName;
      line.group =
        level === "subject" ? (first.categoryName ?? "") : `${first.categoryName ?? ""} › ${first.subjectName}`;
      line.points.push({
        at,
        credit: average(items),
        label,
        ...(level === "subject" ? splitDown(items, [TOPIC]) : { parts: [] }),
      });
    }
  }
  return Array.from(lines.values()).sort(
    (x, y) => (x.group ?? "").localeCompare(y.group ?? "") || x.name.localeCompare(y.name),
  );
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
/** One tag, or one question, with how you do on it. Used to list what you are weak at, sure of, fast at, and so on. */
export interface Standing {
  key: string;
  label: string;
  /** The topic a question belongs to. Tags span topics, so they have none. */
  topicName?: string;
  /** Times it was asked, answered or not. */
  n: number;
  /** Times it was answered. */
  answered: number;
  accuracy: number;
  /** Average credit, counting unanswered as 0. */
  credit: number;
  /** Median time taken divided by the target. Under 1.0 is faster than the target. 0 when nothing was answered. */
  pace: number;
  /** How often you said Sure, out of the answered ones. */
  sureRate: number;
  /** How often you were right when you said Sure. */
  sureRight: number;
  /** Wrong answers that were marked Sure: you believed something that was not true. */
  sureWrong: number;
  /** Answers marked Not sure or Just guessed: you were not prepared for it. */
  unsure: number;
  /** Wrong answers given much faster than the target time: a slip rather than a gap. */
  fastWrong: number;
}

export type StandingKind = "tag" | "question";
export type Ranking = "weakest" | "slowest" | "fastest" | "sure" | "misconception" | "unprepared" | "careless";

const plain = (stem: string) => stem.replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]");

/**
 * How you do on each tag, or on each question, inside one category (or all of them with `category` null).
 * Tags are counted across every topic of the category, and the exempt tags such as "solving" are left out. A tag or a
 * question needs enough answers to say anything, so rarer ones are left out.
 */
export function standings(obs: Obs[], kind: StandingKind, category: string | null): Standing[] {
  const wanted = category?.trim().toLowerCase() ?? null;
  const buckets = new Map<string, { label: string; topicName?: string; items: Obs[] }>();
  const put = (key: string, label: string, topicName: string | undefined, o: Obs) => {
    const b = buckets.get(key);
    if (b) b.items.push(o);
    else buckets.set(key, { label, topicName, items: [o] });
  };
  for (const o of obs) {
    if (wanted !== null && o.categoryName.trim().toLowerCase() !== wanted) continue;
    if (kind === "question") {
      put(o.questionId, plain(o.stem), o.topicName, o);
      continue;
    }
    const seen = new Set<string>();
    for (const t of o.tags) {
      const key = t.trim().toLowerCase();
      if (!key || isExemptTag(key) || seen.has(key)) continue;
      seen.add(key);
      put(key, t.trim(), undefined, o);
    }
  }
  const min = kind === "tag" ? CONFIG.stats.minTagAnswers : CONFIG.stats.minQuestionAnswers;
  const out: Standing[] = [];
  for (const [key, { label, topicName, items }] of buckets) {
    const answered = items.filter((o) => o.answered);
    if (answered.length < min) continue;
    const sure = answered.filter((o) => o.sureness === "sure");
    out.push({
      key,
      label,
      topicName,
      n: items.length,
      answered: answered.length,
      accuracy: items.filter((o) => o.correct).length / items.length,
      credit: items.reduce((s, o) => s + o.credit, 0) / items.length,
      pace: median(answered.map((o) => o.ratio)),
      sureRate: sure.length / answered.length,
      sureRight: sure.length ? sure.filter((o) => o.correct).length / sure.length : 0,
      sureWrong: sure.filter((o) => !o.correct).length,
      unsure: answered.filter((o) => o.sureness === "not_sure" || o.sureness === "just_guessed").length,
      fastWrong: answered.filter((o) => !o.correct && o.ratio <= CONFIG.stats.fastRatio).length,
    });
  }
  return out;
}

/** The first few of a list, best fit for the ranking first. Ties go to the one with more answers. */
export function rankStandings(rows: Standing[], ranking: Ranking, size: number = CONFIG.stats.listSize): Standing[] {
  const share = (n: number, r: Standing) => n / r.answered;
  const fits: Record<Ranking, (r: Standing) => boolean> = {
    weakest: () => true,
    slowest: (r) => r.pace > 0,
    // Quick is only worth listing where you are also right, or the list would be full of rushed wrong answers.
    fastest: (r) => r.pace > 0 && r.accuracy + 1e-9 >= CONFIG.stats.fastMinAccuracy,
    sure: (r) => r.sureRate > 0,
    misconception: (r) => r.sureWrong > 0,
    unprepared: (r) => r.unsure > 0,
    careless: (r) => r.fastWrong > 0,
  };
  const order: Record<Ranking, (a: Standing, b: Standing) => number> = {
    weakest: (a, b) => a.credit - b.credit,
    slowest: (a, b) => b.pace - a.pace,
    fastest: (a, b) => a.pace - b.pace,
    sure: (a, b) => b.sureRate - a.sureRate,
    misconception: (a, b) => share(b.sureWrong, b) - share(a.sureWrong, a),
    unprepared: (a, b) => share(b.unsure, b) - share(a.unsure, a),
    careless: (a, b) => share(b.fastWrong, b) - share(a.fastWrong, a),
  };
  return rows
    .filter(fits[ranking])
    .sort((a, b) => order[ranking](a, b) || b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, size);
}