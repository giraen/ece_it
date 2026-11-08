import type { NodeKind, TreeNode } from "./db";

export const CHILD_KIND: Record<NodeKind, NodeKind | null> = {
  category: "subject",
  subject: "topic",
  topic: null,
};

export const KIND_LABEL: Record<NodeKind, string> = {
  category: "Category",
  subject: "Subject",
  topic: "Topic",
};

/** The categories a subject belongs to. A shared subject lists more than one. For other nodes, just the parent. */
export function categoriesOf(n: TreeNode): string[] {
  if (n.kind !== "subject") return n.parentId ? [n.parentId] : [];
  if (n.parentIds && n.parentIds.length > 0) return n.parentIds;
  return n.parentId ? [n.parentId] : [];
}

/** What sits directly under a node. A category holds every subject that lists it, shared or not. */
export function childrenOf(nodes: TreeNode[], parentId: string | null): TreeNode[] {
  const parent = parentId === null ? undefined : nodes.find((n) => n.id === parentId);
  const list =
    parent?.kind === "category"
      ? nodes.filter((n) => n.kind === "subject" && categoriesOf(n).includes(parent.id))
      : nodes.filter((n) => n.parentId === parentId);
  return list.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/** The node itself plus everything below it. A subject shared by two categories is counted once. */
export function subtreeOf(nodes: TreeNode[], rootId: string): TreeNode[] {
  const out: TreeNode[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    if (!n || seen.has(id)) return;
    seen.add(id);
    out.push(n);
    for (const c of childrenOf(nodes, id)) walk(c.id);
  };
  walk(rootId);
  return out;
}

/** "Elex > Circuits > DC analysis". A shared subject is shown under its first category. */
export function pathOf(nodes: TreeNode[], id: string): string {
  const parts: string[] = [];
  let cur: TreeNode | undefined = nodes.find((n) => n.id === id);
  while (cur) {
    parts.unshift(cur.name);
    const parentId: string | null = cur.parentId;
    cur = parentId ? nodes.find((n) => n.id === parentId) : undefined;
  }
  return parts.join(" › ");
}