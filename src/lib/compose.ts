import { CONFIG } from "./config";
import type { NodeKind, Question, QuizAttempt, TreeNode } from "./db";
import { quotas, type Mix, type Tier } from "./sourceMix";
import { groupTags } from "./tagRules";
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
  if (!history || history.size === 0) return pool;
  const cls = (q: Question) => {
    const h = history.get(q.id);
    if (!h) return 1;
    return h.wrong ? 0 : 2;
  };
  const seen = (q: Question) => history.get(q.id)?.lastSeen ?? 0;
  return [...pool].sort((a, b) => cls(a) - cls(b) || seen(a) - seen(b));
}

/** How a quiz is shaped: spread evenly across its groups, or with one group taking a share of it. */
export type Shape = { kind: "even" } | { kind: "focused"; share: number };

/** Decides the shape of one quiz. Most quizzes are even, and some are focused on one group, so they vary. */
export function chooseShape(rand: Rand = Math.random): Shape {
  if (rand() < CONFIG.build.evenShare) return { kind: "even" };
  const { min, max } = CONFIG.build.focusShare;
  return { kind: "focused", share: min + rand() * (max - min) };
}

/**
 * Interleaves the groups so that one of them, picked at random, takes about `share` of every prefix and the others
 * split the rest evenly. A group that runs out simply stops, so the others fill in. A group with the key "" holds
 * questions with no group of their own, and is never the focus unless it is all there is.
 */
function focusedOrder(lists: Question[][], keys: string[], share: number, rand: Rand): Question[] {
  if (lists.length === 1) return lists[0];
  const named = lists.map((_, i) => i).filter((i) => keys[i] !== "");
  const choices = named.length ? named : lists.map((_, i) => i);
  const focus = choices[Math.floor(rand() * choices.length)];
  // With few groups the share asked for would be smaller than an even one, so the focus gets a little more than even.
  const own = Math.min(CONFIG.build.focusCap, Math.max(share, CONFIG.build.focusAtLeast / lists.length));
  const weight = lists.map((_, i) => (i === focus ? own : (1 - own) / (lists.length - 1)));
  const taken = lists.map(() => 0);
  const total = lists.reduce((n, l) => n + l.length, 0);
  const out: Question[] = [];
  for (let step = 1; step <= total; step++) {
    let best = -1;
    let bestGap = -Infinity;
    for (let i = 0; i < lists.length; i++) {
      if (taken[i] >= lists[i].length) continue;
      // How far behind its share the group is. A tiny random amount settles ties.
      const gap = weight[i] * step - taken[i] + rand() * 1e-6;
      if (gap > bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    out.push(lists[best][taken[best]++]);
  }
  return out;
}

/**
 * Orders questions so that any prefix is spread across the groups.
 * Groups are formed by the first key function, then each group is spread evenly by the rest. With a focused shape,
 * the first level of groups is not even: one group takes a share of the quiz.
 */
function spread(
  pool: Question[],
  keyFns: KeyFn[],
  rand: Rand,
  history?: Map<string, History>,
  shape: Shape = { kind: "even" },
): Question[] {
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
  if (shape.kind === "focused") return focusedOrder(lists, Array.from(groups.keys()), shape.share, rand);
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
  /** How this quiz is shaped. It is decided at random when it is not given. */
  shape?: Shape;
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

const topicKey: KeyFn = (q) => q.topicId;

/**
 * Picks questions for a quiz, spread across the child groups of the scope:
 * tags for a topic, topics for a subject, subjects (then topics) for a category.
 * Most quizzes are spread evenly, and some are focused on one group (see `chooseShape`). Nothing here makes a group
 * appear, and mastery does not depend on it.
 * A question with several tags is put under one of them, picked at random for each quiz. Exempt tags are never a group,
 * so a question with only those has no group and fills in where there is room.
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
  shape = chooseShape(rand),
}: ComposeInput): Question[] {
  const topicIds = new Set(
    subtreeOf(nodes, scope.id)
      .filter((n) => n.kind === "topic")
      .map((n) => n.id),
  );
  const pool = questions.filter((q) => !q.deletedAt && topicIds.has(q.topicId));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const subjectKey: KeyFn = (q) => byId.get(q.topicId)?.parentId ?? "";
  // Each question is put under one of its tags for this quiz, so a question with several tags can count for any.
  const underTag = new Map<string, string>();
  for (const q of pool) {
    if (underTag.has(q.id)) continue;
    const tags = groupTags(q.tags);
    underTag.set(q.id, tags.length ? tags[Math.floor(rand() * tags.length)] : "");
  }
  const tagKey: KeyFn = (q) => underTag.get(q.id) ?? "";

  const levels: Record<NodeKind, KeyFn[]> = {
    topic: [tagKey],
    subject: [topicKey, tagKey],
    category: [subjectKey, topicKey, tagKey],
  };
  const take = Math.max(0, Math.min(length, pool.length));
  const ordered = spread(pool, levels[scope.kind], rand, history, shape);
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