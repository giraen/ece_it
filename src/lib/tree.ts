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

export function childrenOf(nodes: TreeNode[], parentId: string | null): TreeNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/** The node itself plus every descendant. */
export function subtreeOf(nodes: TreeNode[], rootId: string): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    out.push(n);
    for (const c of childrenOf(nodes, id)) walk(c.id);
  };
  walk(rootId);
  return out;
}

/** "Elex > Circuits > DC analysis" */
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
