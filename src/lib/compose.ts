import type { NodeKind, Question, TreeNode } from "./db";
import { subtreeOf } from "./tree";

export type Rand = () => number;

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
 * Orders questions so that any prefix is spread evenly across the groups.
 * Groups are formed by the first key function, then each group is spread by the rest.
 */
function spread(pool: Question[], keyFns: KeyFn[], rand: Rand): Question[] {
  if (keyFns.length === 0) return shuffle(pool, rand);
  const [keyFn, ...rest] = keyFns;
  const groups = new Map<string, Question[]>();
  for (const q of pool) {
    const k = keyFn(q);
    const g = groups.get(k);
    if (g) g.push(q);
    else groups.set(k, [q]);
  }
  const lists = Array.from(groups.values()).map((g) => spread(g, rest, rand));
  const next = lists.map(() => 0);
  const out: Question[] = [];
  while (out.length < pool.length) {
    for (const i of shuffle(lists.map((_, idx) => idx), rand)) {
      if (next[i] < lists[i].length) out.push(lists[i][next[i]++]);
    }
  }
  return out;
}

export interface ComposeInput {
  nodes: TreeNode[];
  questions: Question[];
  scope: TreeNode;
  length: number;
  rand?: Rand;
}

const tagKey: KeyFn = (q) => q.tags[0]?.toLowerCase() ?? "";
const topicKey: KeyFn = (q) => q.topicId;

/**
 * Picks questions for a quiz, spread across the child groups of the scope:
 * tags for a topic, topics for a subject, subjects (then topics) for a category.
 * Returns the picks in a shuffled order. If the pool is smaller than `length`, returns the whole pool.
 */
export function composeQuiz({ nodes, questions, scope, length, rand = Math.random }: ComposeInput): Question[] {
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
  return shuffle(spread(pool, levels[scope.kind], rand).slice(0, take), rand);
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
