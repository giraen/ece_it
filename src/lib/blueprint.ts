import { CONFIG } from "./config";
import { composeQuiz, shuffle, type History, type Rand } from "./compose";
import type { Blueprint, Question, TreeNode } from "./db";
import { pathOf, subtreeOf } from "./tree";

/** Splits `total` across the percentages so the whole numbers add up to exactly `total` (largest remainder). */
export function allocate(total: number, percents: number[]): number[] {
  const sum = percents.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return percents.map(() => 0);
  const raw = percents.map((p) => (p / sum) * total);
  const base = raw.map(Math.floor);
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    base[i] += 1;
    left -= 1;
  }
  return base;
}

/** Reasons a blueprint cannot be saved. An empty list means it is fine. */
export function blueprintProblems(input: {
  totalItems: number;
  entries: { nodeId: string; percent: number }[];
}): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(input.totalItems) || input.totalItems < 1) {
    problems.push("The total number of items must be a whole number of 1 or more.");
  }
  if (input.entries.length === 0) problems.push("Add at least one entry.");
  if (input.entries.some((e) => !e.nodeId)) problems.push("Choose a subject or topic for every entry.");
  if (input.entries.some((e) => !Number.isFinite(e.percent) || e.percent <= 0)) {
    problems.push("Every percentage must be greater than 0.");
  }
  const ids = input.entries.map((e) => e.nodeId).filter(Boolean);
  if (new Set(ids).size !== ids.length) problems.push("The same subject or topic appears twice.");
  const sum = input.entries.reduce((s, e) => s + (Number.isFinite(e.percent) ? e.percent : 0), 0);
  if (input.entries.length > 0 && Math.abs(sum - 100) > 0.01) {
    problems.push(`Percentages add up to ${Math.round(sum * 100) / 100}, not 100.`);
  }
  return problems;
}

export interface EntryAllocation {
  entryId: string;
  nodeId: string;
  label: string;
  wanted: number;
  /** Questions the entry could draw on, after earlier entries took theirs. */
  available: number;
  picked: number;
}

export interface BlueprintQuiz {
  picks: { question: Question; entryId: string; entryName: string }[];
  allocations: EntryAllocation[];
  /** At least one entry could not be filled. */
  shortfall: boolean;
  eligible: boolean;
  reason?: string;
}

/**
 * Builds a mock board from a blueprint. Each entry draws its share from its own subject or topic.
 * A question is never used twice, even if two entries overlap.
 */
export function composeBlueprintQuiz({
  nodes,
  questions,
  blueprint,
  rand = Math.random,
  history,
}: {
  nodes: TreeNode[];
  questions: Question[];
  blueprint: Blueprint;
  rand?: Rand;
  history?: Map<string, History>;
}): BlueprintQuiz {
  const wanted = allocate(
    blueprint.totalItems,
    blueprint.entries.map((e) => e.percent),
  );
  const used = new Set<string>();
  const picks: BlueprintQuiz["picks"] = [];
  const allocations: EntryAllocation[] = [];

  blueprint.entries.forEach((entry, i) => {
    const node = nodes.find((n) => n.id === entry.nodeId);
    const label = node ? pathOf(nodes, node.id) : "(deleted)";
    if (!node) {
      allocations.push({ entryId: entry.id, nodeId: entry.nodeId, label, wanted: wanted[i], available: 0, picked: 0 });
      return;
    }
    const topicIds = new Set(
      subtreeOf(nodes, node.id)
        .filter((n) => n.kind === "topic")
        .map((n) => n.id),
    );
    const pool = questions.filter((q) => !q.deletedAt && topicIds.has(q.topicId) && !used.has(q.id));
    const chosen = composeQuiz({ nodes, questions: pool, scope: node, length: wanted[i], rand, history });
    for (const q of chosen) {
      used.add(q.id);
      picks.push({ question: q, entryId: entry.id, entryName: label });
    }
    allocations.push({
      entryId: entry.id,
      nodeId: node.id,
      label,
      wanted: wanted[i],
      available: pool.length,
      picked: chosen.length,
    });
  });

  const shortfall = allocations.some((a) => a.picked < a.wanted);
  let reason: string | undefined;
  if (shortfall) reason = "The bank has fewer questions than the blueprint asks for.";
  else if (picks.length < CONFIG.quiz.category.minItems) {
    reason = `Mastery needs at least ${CONFIG.quiz.category.minItems} questions in a category mock.`;
  } else {
    const thin = allocations.find((a) => a.available >= CONFIG.minPerGroup && a.picked < CONFIG.minPerGroup);
    if (thin) reason = `"${thin.label}" has fewer than ${CONFIG.minPerGroup} questions in this mock.`;
  }
  return { picks: shuffle(picks, rand), allocations, shortfall, eligible: !reason, reason };
}