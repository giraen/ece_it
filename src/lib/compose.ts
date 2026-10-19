import type { NodeKind, Question, QuizAttempt, TreeNode } from "./db";
import { quotas, type Mix, type Tier } from "./sourceMix";
import { subtreeOf } from "./tree";

export type Rand = () => number;

/** What is known about a question from earlier quizzes. */
export interface History {
  lastSeen: number;
  /** The most recent answer was wrong. */
  wrong: boolean;
}

/** Fisher-Yates on a copy. */
export function shuffle<T>(arr: readonly T[], rand: Rand = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type KeyFn = (q: Question) => string;

/**
 * Within a group, puts questions you got wrong last time first, then ones you have never seen,
 * then the rest with the longest-unseen first. The input order (already shuffled) breaks ties.
 */
function prefer(pool: Question[], history?: Map<string, History>): Question[] {
  const hasPriority = pool.some((q) => q.priority);
  if ((!history || history.size === 0) && !hasPriority) return pool;
  // Priority questions come first, but one you already got right waits behind anything new or missed,
  // so the same few do not fill every quiz.
  const cls = (q: Question) => {
    const h = history?.get(q.id);
    const state = h ? (h.wrong ? "wrong" : "right") : "new";
    if (q.priority && state !== "right") return state === "wrong" ? 0 : 1;
    if (state === "wrong") return 2;
    if (state === "new") return 3;
    return q.priority ? 4 : 5;
  };
  const seen = (q: Question) => history?.get(q.id)?.lastSeen ?? 0;
  return [...pool].sort((a, b) => cls(a) - cls(b) || seen(a) - seen(b));
}

/**
 * Orders questions so that any prefix is spread evenly across the groups.
 * Groups are formed by the first key function, then each group is spread by the rest.
 */
function spread(pool: Question[], keyFns: KeyFn[], rand: Rand, history?: Map<string, History>): Question[] {
  if (keyFns.length === 0) return prefer(shuffle(pool, rand), history);
  const [keyFn, ...rest] = keyFns;
  const groups = new Map<string, Question[]>();
  for (const q of pool) {
    const k = keyFn(q);
    const g = groups.get(k);
    if (g) g.push(q);
    else groups.set(k, [q]);
  }
  const lists = Array.from(groups.values()).map((g) => spread(g, rest, rand, history));
  const next = lists.map(() => 0);
  const out: Question[] = [];
  while (out.length < pool.length) {
    for (const i of shuffle(
      lists.map((_, idx) => idx),
      rand,
    )) {
      if (next[i] < lists[i].length) out.push(lists[i][next[i]++]);
    }
  }
  return out;
}

/** True when the item at `i` has the same question within `gap` places on either side. */
function clashes<T extends { id: string }>(list: T[], i: number, gap: number): boolean {
  for (let k = Math.max(0, i - gap); k <= Math.min(list.length - 1, i + gap); k++) {
    if (k !== i && list[k].id === list[i].id) return true;
  }
  return false;
}

/**
 * Moves copies of the same question apart. It aims for at least 4 places between copies, and settles for
 * fewer when the quiz is too short or too repetitive for that. Questions that appear once are left where they are
 * unless one has to move to make room. Never adds or removes anything.
 */
export function separateCopies<T extends { id: string }>(list: readonly T[], rand: Rand = Math.random): T[] {
  const out = [...list];
  if (new Set(out.map((x) => x.id)).size === out.length) return out;
  const spots = out.map((_, i) => i);
  for (const gap of [4, 3, 2, 1]) {
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (let i = 0; i < out.length; i++) {
        if (!clashes(out, i, gap)) continue;
        for (const j of shuffle(spots, rand)) {
          if (j === i) continue;
          [out[i], out[j]] = [out[j], out[i]];
          if (!clashes(out, i, gap) && !clashes(out, j, gap)) {
            moved = true;
            break;
          }
          [out[i], out[j]] = [out[j], out[i]];
        }
      }
      if (!moved) break;
    }
  }
  return out;
}

/** How to mix the kinds of source in a quiz. `tierOf` says which kind of source a question comes from. */
export interface SourceMix {
  tierOf: (q: Question) => Tier;
  weights: Mix;
}

export interface ComposeInput {
  nodes: TreeNode[];
  questions: Question[];
  scope: TreeNode;
  length: number;
  rand?: Rand;
  history?: Map<string, History>;
  mix?: SourceMix;
}

/**
 * Takes `take` questions from an already ordered list so each kind of source gets its share.
 * The order is kept, so the spread across topics and tags and the "missed and new first" order still decide
 * which questions of a kind are taken.
 */
function applyMix(ordered: Question[], take: number, mix: SourceMix, rand: Rand): Question[] {
  const avail: Mix = { quiz: 0, book: 0, online: 0, other: 0 };
  for (const q of ordered) avail[mix.tierOf(q)] += 1;
  const left = quotas(avail, mix.weights, take, rand);
  const out: Question[] = [];
  for (const q of ordered) {
    const t = mix.tierOf(q);
    if (left[t] > 0) {
      left[t] -= 1;
      out.push(q);
    }
  }
  return out;
}

const tagKey: KeyFn = (q) => q.tags[0]?.toLowerCase() ?? "";
const topicKey: KeyFn = (q) => q.topicId;

/**
 * Picks questions for a quiz, spread across the child groups of the scope:
 * tags for a topic, topics for a subject, subjects (then topics) for a category.
 * Returns the picks in a shuffled order. If the pool is smaller than `length`, returns the whole pool.
 */
export function composeQuiz({
  nodes,
  questions,
  scope,
  length,
  rand = Math.random,
  history,
  mix,
}: ComposeInput): Question[] {
  const topicIds = new Set(
    subtreeOf(nodes, scope.id)
      .filter((n) => n.kind === "topic")
      .map((n) => n.id),
  );
  const pool = questions.filter((q) => !q.deletedAt && topicIds.has(q.topicId));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const subjectKey: KeyFn = (q) => byId.get(q.topicId)?.parentId ?? "";

  const levels: Record<NodeKind, KeyFn[]> = {
    topic: [tagKey],
    subject: [topicKey, tagKey],
    category: [subjectKey, topicKey, tagKey],
  };
  const take = Math.max(0, Math.min(length, pool.length));
  const ordered = spread(pool, levels[scope.kind], rand, history);
  return shuffle(mix ? applyMix(ordered, take, mix, rand) : ordered.slice(0, take), rand);
}

/** How many questions a scope could draw on. */
export function countAvailable(nodes: TreeNode[], questions: Question[], scopeId: string): number {
  const topicIds = new Set(
    subtreeOf(nodes, scopeId)
      .filter((n) => n.kind === "topic")
      .map((n) => n.id),
  );
  return questions.filter((q) => !q.deletedAt && topicIds.has(q.topicId)).length;
}

/** For each question: when it was last seen in a submitted quiz, and whether that answer was wrong. */
export function historyFrom(attempts: QuizAttempt[]): Map<string, History> {
  const out = new Map<string, History>();
  const done = attempts
    .filter((a) => !a.deletedAt && a.status === "submitted" && a.submittedAt !== undefined)
    .sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
  for (const a of done) {
    for (const it of a.items) {
      out.set(it.questionId, { lastSeen: a.submittedAt ?? 0, wrong: it.answered && !it.correct });
    }
  }
  return out;
}