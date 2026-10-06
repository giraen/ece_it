import { db, type NodeKind, type TreeNode } from "./db";
import { newId, now } from "./ids";
import { CHILD_KIND, categoriesOf, childrenOf, subtreeOf } from "./tree";

export async function createNode(
  kind: NodeKind,
  parentId: string | null,
  name: string,
): Promise<string> {
  const clean = name.trim();
  if (!clean) throw new Error("Name cannot be empty.");
  const all = await db.nodes.filter((n) => !n.deletedAt).toArray();
  const siblings = childrenOf(all, parentId);
  const t = now();
  const id = newId();
  await db.nodes.add({
    id,
    kind,
    parentId,
    // A new subject starts in one category. It can be shared with others afterwards.
    parentIds: kind === "subject" && parentId ? [parentId] : undefined,
    name: clean,
    order: siblings.length,
    createdAt: t,
    updatedAt: t,
  });
  return id;
}

export async function renameNode(id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Error("Name cannot be empty.");
  await db.nodes.update(id, { name: clean, updatedAt: now() });
}

/** Swap order with the previous (-1) or next (+1) sibling in the list it is shown in (`parentId`). */
export async function moveNode(id: string, dir: -1 | 1, parentId: string | null): Promise<void> {
  const all = await db.nodes.filter((n) => !n.deletedAt).toArray();
  const sibs = childrenOf(all, parentId);
  const i = sibs.findIndex((n) => n.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sibs.length) return;
  const reordered = [...sibs];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  const t = now();
  await db.transaction("rw", db.nodes, async () => {
    for (let k = 0; k < reordered.length; k++) {
      if (reordered[k].order !== k) {
        await db.nodes.update(reordered[k].id, { order: k, updatedAt: t });
      }
    }
  });
}

/** Chooses which categories a subject belongs to. At least one is needed. */
export async function setSubjectCategories(subjectId: string, categoryIds: string[]): Promise<void> {
  const ids = Array.from(new Set(categoryIds));
  if (ids.length === 0) throw new Error("A subject must belong to at least one category.");
  await db.nodes.update(subjectId, { parentIds: ids, parentId: ids[0], updatedAt: now() });
}

/** Takes a shared subject out of one category. It stays in the others. */
export async function unlinkSubject(subjectId: string, categoryId: string): Promise<void> {
  const node = await db.nodes.get(subjectId);
  if (!node) return;
  await setSubjectCategories(subjectId, categoriesOf(node).filter((c) => c !== categoryId));
}

/** How many questions deleting this node would remove. */
export async function countQuestionsUnder(id: string): Promise<number> {
  const all = await db.nodes.filter((n) => !n.deletedAt).toArray();
  const topicIds = new Set(
    subtreeOf(all, id)
      .filter((n) => n.kind === "topic")
      .map((n) => n.id),
  );
  return db.questions.filter((q) => !q.deletedAt && topicIds.has(q.topicId)).count();
}

/** How many concept notes deleting this node would remove. */
export async function countConceptsUnder(id: string): Promise<number> {
  const all = await db.nodes.filter((n) => !n.deletedAt).toArray();
  const topicIds = new Set(
    subtreeOf(all, id)
      .filter((n) => n.kind === "topic")
      .map((n) => n.id),
  );
  return db.concepts.filter((c) => !c.deletedAt && topicIds.has(c.topicId)).count();
}

/** Soft-deletes the node, everything below it, and the questions in those topics. */
export async function deleteNode(id: string): Promise<void> {
  const all = await db.nodes.filter((n) => !n.deletedAt).toArray();
  const sub = subtreeOf(all, id);
  const ids = new Set(sub.map((n) => n.id));
  const t = now();
  await db.transaction("rw", db.nodes, db.questions, db.concepts, async () => {
    for (const n of sub) await db.nodes.update(n.id, { deletedAt: t, updatedAt: t });
    const qs = await db.questions.filter((q) => !q.deletedAt && ids.has(q.topicId)).toArray();
    for (const q of qs) await db.questions.update(q.id, { deletedAt: t, updatedAt: t });
    const cs = await db.concepts.filter((c) => !c.deletedAt && ids.has(c.topicId)).toArray();
    for (const c of cs) await db.concepts.update(c.id, { deletedAt: t, updatedAt: t });
  });
}

export function childKindOf(kind: NodeKind): NodeKind | null {
  return CHILD_KIND[kind];
}

export type { TreeNode };