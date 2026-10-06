import type { Blueprint, Concept, Question, TreeNode, Variant } from "./db";
import { subtreeOf } from "./tree";

const IMG = /img:([0-9a-f]{8,64})/g;

export function imageIdsIn(text: string): string[] {
  return Array.from(text.matchAll(IMG), (m) => m[1]);
}

export function imageIdsOfQuestion(q: Question): string[] {
  return [...imageIdsIn(q.stem), ...q.choices.flatMap((c) => imageIdsIn(c.text))];
}

export interface PackSelection {
  nodes: TreeNode[];
  questions: Question[];
  blueprints: Blueprint[];
  /** Approved AI variants of the questions in the pack, when asked for. */
  variants: Variant[];
  concepts: Concept[];
  imageIds: string[];
  /** Blueprints left out because they point at items that are not in the pack. */
  blueprintsSkipped: number;
}

/**
 * Picks what goes into a bank pack: the chosen scope, the tree above it so everything has a place,
 * the questions inside it, the images they use, and a blueprint only if everything it names is included.
 * `scopeId` null means the whole bank. Deleted records are never included.
 */
export function selectPackContent(
  nodes: TreeNode[],
  questions: Question[],
  blueprints: Blueprint[],
  scopeId: string | null,
  variants: Variant[] = [],
  includeVariants = false,
  concepts: Concept[] = [],
): PackSelection {
  const live = nodes.filter((n) => !n.deletedAt);
  let scopeNodes: TreeNode[];
  let ancestors: TreeNode[] = [];
  if (scopeId === null) {
    scopeNodes = live;
  } else {
    scopeNodes = subtreeOf(live, scopeId);
    const byId = new Map(live.map((n) => [n.id, n]));
    let cur = byId.get(scopeId);
    while (cur?.parentId) {
      const parent = byId.get(cur.parentId);
      if (!parent) break;
      ancestors.push(parent);
      cur = parent;
    }
    ancestors = ancestors.reverse();
  }

  const packNodes = [...ancestors, ...scopeNodes];
  const nodeIds = new Set(packNodes.map((n) => n.id));
  const topicIds = new Set(scopeNodes.filter((n) => n.kind === "topic").map((n) => n.id));
  const packQuestions = questions.filter((q) => !q.deletedAt && topicIds.has(q.topicId));

  // A blueprint belongs to a category, so it can only come along when that category is in the pack.
  const candidates = blueprints.filter((b) => !b.deletedAt && scopeNodes.some((n) => n.id === b.categoryId));
  const packBlueprints = candidates.filter((b) => b.entries.every((e) => nodeIds.has(e.nodeId)));

  const packConcepts = concepts.filter((c) => !c.deletedAt && topicIds.has(c.topicId));
  const packQuestionIds = new Set(packQuestions.map((q) => q.id));
  const packVariants = includeVariants
    ? variants.filter((v) => !v.deletedAt && v.status === "approved" && packQuestionIds.has(v.questionId))
    : [];
  const imageIds = Array.from(
    new Set([
      ...packQuestions.flatMap(imageIdsOfQuestion),
      ...packConcepts.flatMap((c) => imageIdsIn(c.body)),
      ...packVariants.flatMap((v) => [...imageIdsIn(v.stem), ...v.choices.flatMap((c) => imageIdsIn(c.text))]),
    ]),
  );
  return {
    nodes: packNodes,
    questions: packQuestions,
    blueprints: packBlueprints,
    variants: packVariants,
    concepts: packConcepts,
    imageIds,
    blueprintsSkipped: candidates.length - packBlueprints.length,
  };
}