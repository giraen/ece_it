"use client";

import type { TreeNode } from "@/lib/db";
import { useNodes } from "@/lib/hooks";
import { childrenOf, KIND_LABEL } from "@/lib/tree";

function Branch({ node, depth, nodes }: { node: TreeNode; depth: number; nodes: TreeNode[] }) {
  return (
    <li>
      <div className="flex items-baseline gap-2 py-1" style={{ paddingLeft: depth * 20 }}>
        <span className="text-sm">{node.name}</span>
        <span className="text-xs text-muted">{KIND_LABEL[node.kind].toLowerCase()}</span>
      </div>
      <ul>
        {childrenOf(nodes, node.id).map((c) => (
          <Branch key={c.id} node={c} depth={depth + 1} nodes={nodes} />
        ))}
      </ul>
    </li>
  );
}

export default function BankPage() {
  const nodes = useNodes();

  if (!nodes) return <p className="text-sm text-muted">Loading…</p>;
  const roots = childrenOf(nodes, null);

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Bank</h1>
      {roots.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-6 text-sm text-muted">
          Nothing here yet. Next step: adding categories.
        </p>
      ) : (
        <ul className="rounded-md border border-line bg-surface p-3">
          {roots.map((r) => (
            <Branch key={r.id} node={r} depth={0} nodes={nodes} />
          ))}
        </ul>
      )}
    </div>
  );
}