import type { Blueprint, Concept, DraftQuestion, Question, QuizAttempt, SettingRow, TreeNode, Variant } from "./db";

/** Every table that travels in a full backup. */
export interface Tables {
  nodes: TreeNode[];
  questions: Question[];
  blueprints: Blueprint[];
  attempts: QuizAttempt[];
  variants: Variant[];
  settings: SettingRow[];
  concepts: Concept[];
  drafts: DraftQuestion[];
}

export interface MergeCounts {
  added: number;
  updated: number;
  unchanged: number;
  /** The copy here was newer, so it was kept. */
  keptLocal: number;
}

const zero = (): MergeCounts => ({ added: 0, updated: 0, unchanged: 0, keptLocal: 0 });

/**
 * Merges records that have an id and an updatedAt stamp. The newer stamp wins; ties keep what is here.
 * Deletions are records too (they carry deletedAt), so a newer deletion wins over an older edit.
 */
export function mergeById<T extends { id: string; updatedAt: number }>(
  local: T[],
  incoming: T[],
): { puts: T[]; counts: MergeCounts } {
  const byId = new Map(local.map((r) => [r.id, r]));
  const puts: T[] = [];
  const counts = zero();
  for (const inc of incoming) {
    const cur = byId.get(inc.id);
    if (!cur) {
      puts.push(inc);
      counts.added++;
    } else if (inc.updatedAt > cur.updatedAt) {
      puts.push(inc);
      counts.updated++;
    } else if (inc.updatedAt === cur.updatedAt) {
      counts.unchanged++;
    } else {
      counts.keptLocal++;
    }
  }
  return { puts, counts };
}

export interface BackupMergePlan {
  puts: Tables;
  counts: Record<keyof Tables, MergeCounts>;
}

/** Merge for a full backup. Mastery needs no rule of its own: it is worked out from the combined attempts. */
export function planBackupMerge(local: Tables, incoming: Tables): BackupMergePlan {
  const nodes = mergeById(local.nodes, incoming.nodes);
  const questions = mergeById(local.questions, incoming.questions);
  const blueprints = mergeById(local.blueprints, incoming.blueprints);
  const attempts = mergeById(local.attempts, incoming.attempts);
  const variants = mergeById(local.variants, incoming.variants);
  const settings = mergeById(local.settings, incoming.settings);
  const concepts = mergeById(local.concepts, incoming.concepts);
  const drafts = mergeById(local.drafts, incoming.drafts);
  return {
    puts: {
      nodes: nodes.puts,
      questions: questions.puts,
      blueprints: blueprints.puts,
      attempts: attempts.puts,
      variants: variants.puts,
      settings: settings.puts,
      concepts: concepts.puts,
      drafts: drafts.puts,
    },
    counts: {
      nodes: nodes.counts,
      questions: questions.counts,
      blueprints: blueprints.counts,
      attempts: attempts.counts,
      variants: variants.counts,
      settings: settings.counts,
      concepts: concepts.counts,
      drafts: drafts.counts,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Bank packs
// ---------------------------------------------------------------------------------------------

export interface PackData {
  nodes: TreeNode[];
  questions: Question[];
  blueprints: Blueprint[];
  /** Approved AI variants, if the sender chose to include them. */
  variants?: Variant[];
  concepts?: Concept[];
}

export interface PackOptions {
  /** "update": add new and update existing. "add_only": never touch a question or node already here. */
  mode: "update" | "add_only";
  /** Put pack nodes into existing ones with the same name instead of creating duplicates. */
  matchByName: boolean;
}

export interface NodeCounts {
  added: number;
  /** Already here, by id or by name. */
  existing: number;
}

export interface PackPlan {
  puts: Required<PackData>;
  counts: {
    category: NodeCounts;
    subject: NodeCounts;
    topic: NodeCounts;
    questions: MergeCounts;
    variants: MergeCounts;
    concepts: MergeCounts;
    /** One entry per blueprint in the pack. */
    blueprints: { added: number; updated: number; kept: number; skipped: number };
  };
  /** Pack node id -> id it ends up with here. */
  idMap: Map<string, string>;
}

const norm = (s: string) => s.trim().toLowerCase();

/** A stable fingerprint of a question's content, ignoring ids and stamps, for telling "same" from "edited". */
export function contentKey(q: Question, topicId: string): string {
  const {
    id: _id,
    createdAt: _c,
    updatedAt: _u,
    deletedAt: _d,
    topicId: _t,
    ...rest
  } = q as Question & Record<string, unknown>;
  void _id;
  void _c;
  void _u;
  void _d;
  void _t;
  const sorted = Object.keys(rest)
    .sort()
    .map((k) => [k, k === "tags" ? [...(rest.tags as string[])].sort() : (rest as Record<string, unknown>)[k]]);
  return JSON.stringify([topicId, sorted]);
}

/**
 * Works out what importing a bank pack would do, without changing anything.
 * It never touches attempts, so the recipient's stats and mastery stay exactly as they were.
 */
export function planPackImport(
  local: {
    nodes: TreeNode[];
    questions: Question[];
    blueprints: Blueprint[];
    variants?: Variant[];
    concepts?: Concept[];
  },
  pack: PackData,
  options: PackOptions,
): PackPlan {
  const liveNodes = local.nodes.filter((n) => !n.deletedAt);
  const localById = new Map(liveNodes.map((n) => [n.id, n]));
  const idMap = new Map<string, string>();
  const putNodes: TreeNode[] = [];
  const nodeCounts = {
    category: { added: 0, existing: 0 },
    subject: { added: 0, existing: 0 },
    topic: { added: 0, existing: 0 },
  } as PackPlan["counts"];

  // Parents before children, so a child can find where its parent landed.
  const depth = { category: 0, subject: 1, topic: 2 } as const;
  const ordered = [...pack.nodes].sort((a, b) => depth[a.kind] - depth[b.kind]);
  const nextOrder = new Map<string | null, number>();
  const siblingsOf = (parentId: string | null) => {
    if (!nextOrder.has(parentId)) {
      nextOrder.set(parentId, liveNodes.filter((n) => n.parentId === parentId).length);
    }
    return nextOrder;
  };

  for (const p of ordered) {
    const mappedParent = p.parentId === null ? null : (idMap.get(p.parentId) ?? undefined);
    if (mappedParent === undefined) continue; // parent missing from the pack: skip the orphan

    const sameId = localById.get(p.id);
    if (sameId && sameId.kind === p.kind) {
      idMap.set(p.id, sameId.id);
      nodeCounts[p.kind].existing++;
      if (options.mode === "update" && p.updatedAt > sameId.updatedAt && p.name !== sameId.name) {
        putNodes.push({ ...sameId, name: p.name, updatedAt: p.updatedAt });
      }
      continue;
    }
    if (options.matchByName) {
      const twin = liveNodes.find(
        (n) => n.kind === p.kind && n.parentId === mappedParent && norm(n.name) === norm(p.name),
      );
      if (twin) {
        idMap.set(p.id, twin.id);
        nodeCounts[p.kind].existing++;
        continue;
      }
    }
    const orders = siblingsOf(mappedParent);
    const order = orders.get(mappedParent) ?? 0;
    orders.set(mappedParent, order + 1);
    putNodes.push({ ...p, parentId: mappedParent, order, deletedAt: undefined });
    idMap.set(p.id, p.id);
    nodeCounts[p.kind].added++;
  }

  // Questions
  const localQ = new Map(local.questions.filter((q) => !q.deletedAt).map((q) => [q.id, q]));
  const putQuestions: Question[] = [];
  const qCounts = zero();
  // Variants were written for the pack's version of a question, so they only fit if that version is what ends up here.
  const variantsFit = new Set<string>();
  for (const q of pack.questions) {
    const topicId = idMap.get(q.topicId);
    if (!topicId) continue;
    const cur = localQ.get(q.id);
    const same = cur ? contentKey(cur, cur.topicId) === contentKey(q, topicId) : false;
    if (!cur) {
      putQuestions.push({ ...q, topicId, deletedAt: undefined });
      qCounts.added++;
      variantsFit.add(q.id);
    } else if (options.mode === "add_only") {
      qCounts.keptLocal++;
      if (same) variantsFit.add(q.id);
    } else if (same) {
      qCounts.unchanged++;
      variantsFit.add(q.id);
    } else if (q.updatedAt > cur.updatedAt) {
      putQuestions.push({ ...q, topicId, deletedAt: undefined });
      qCounts.updated++;
      variantsFit.add(q.id);
    } else {
      qCounts.keptLocal++;
    }
  }

  // Variants
  const localV = new Map((local.variants ?? []).filter((v) => !v.deletedAt).map((v) => [v.id, v]));
  const putVariants: Variant[] = [];
  const vCounts = zero();
  for (const v of pack.variants ?? []) {
    if (!variantsFit.has(v.questionId)) continue;
    const cur = localV.get(v.id);
    if (!cur) {
      putVariants.push({ ...v, deletedAt: undefined });
      vCounts.added++;
    } else if (options.mode === "add_only") {
      vCounts.keptLocal++;
    } else if (v.updatedAt > cur.updatedAt) {
      putVariants.push({ ...v, deletedAt: undefined });
      vCounts.updated++;
    } else if (v.updatedAt === cur.updatedAt) {
      vCounts.unchanged++;
    } else {
      vCounts.keptLocal++;
    }
  }

  // Concepts
  const localC = new Map((local.concepts ?? []).filter((c) => !c.deletedAt).map((c) => [c.id, c]));
  const putConcepts: Concept[] = [];
  const cCounts = zero();
  for (const c of pack.concepts ?? []) {
    const topicId = idMap.get(c.topicId);
    if (!topicId) continue;
    const cur = localC.get(c.id);
    if (!cur) {
      putConcepts.push({ ...c, topicId, deletedAt: undefined });
      cCounts.added++;
    } else if (options.mode === "add_only") {
      cCounts.keptLocal++;
    } else if (c.updatedAt > cur.updatedAt) {
      putConcepts.push({ ...c, topicId, deletedAt: undefined });
      cCounts.updated++;
    } else if (c.updatedAt === cur.updatedAt) {
      cCounts.unchanged++;
    } else {
      cCounts.keptLocal++;
    }
  }

  // Blueprints
  const localBp = new Map(local.blueprints.filter((b) => !b.deletedAt).map((b) => [b.categoryId, b]));
  const putBlueprints: Blueprint[] = [];
  const bpCounts = { added: 0, updated: 0, kept: 0, skipped: 0 };
  for (const b of pack.blueprints) {
    const categoryId = idMap.get(b.categoryId);
    const entries = b.entries.map((e) => ({ ...e, nodeId: idMap.get(e.nodeId) }));
    if (!categoryId || entries.some((e) => !e.nodeId)) {
      bpCounts.skipped++;
      continue;
    }
    const mapped: Blueprint = {
      ...b,
      id: categoryId,
      categoryId,
      entries: entries.map((e) => ({ ...e, nodeId: e.nodeId as string })),
      deletedAt: undefined,
    };
    const cur = localBp.get(categoryId);
    if (!cur) {
      putBlueprints.push(mapped);
      bpCounts.added++;
    } else if (options.mode === "update" && b.updatedAt > cur.updatedAt) {
      putBlueprints.push(mapped);
      bpCounts.updated++;
    } else {
      bpCounts.kept++;
    }
  }

  return {
    puts: {
      nodes: putNodes,
      questions: putQuestions,
      blueprints: putBlueprints,
      variants: putVariants,
      concepts: putConcepts,
    },
    counts: { ...nodeCounts, questions: qCounts, variants: vCounts, concepts: cCounts, blueprints: bpCounts },
    idMap,
  };
}