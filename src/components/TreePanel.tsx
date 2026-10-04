"use client";

import { useState } from "react";
import type { Question, TreeNode } from "@/lib/db";
import {
  childKindOf,
  countQuestionsUnder,
  createNode,
  deleteNode,
  moveNode,
  renameNode,
} from "@/lib/nodes";
import { childrenOf, KIND_LABEL, subtreeOf } from "@/lib/tree";

type Editing = { mode: "add"; parentId: string | null } | { mode: "rename"; id: string } | null;

interface Ctx {
  nodes: TreeNode[];
  counts: Map<string, number>;
  selectedId: string | null;
  collapsed: Set<string>;
  editing: Editing;
  onSelect: (id: string | null) => void;
  toggle: (id: string) => void;
  setEditing: (e: Editing) => void;
  addChild: (parentId: string | null, name: string) => Promise<void>;
  remove: (node: TreeNode) => Promise<void>;
}

function InlineInput({
  initial = "",
  placeholder,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  placeholder: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="min-w-0 flex-1"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await onSubmit(value);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save.");
        }
      }}
    >
      <div className="flex gap-1">
        <input
          autoFocus
          className="input py-1"
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
        />
        <button className="btn py-1" type="submit">
          Save
        </button>
        <button className="btn py-1" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </form>
  );
}

function Branch({ node, depth, ctx }: { node: TreeNode; depth: number; ctx: Ctx }) {
  const kids = childrenOf(ctx.nodes, node.id);
  const collapsed = ctx.collapsed.has(node.id);
  const childKind = childKindOf(node.kind);
  const selected = ctx.selectedId === node.id;
  const renaming = ctx.editing?.mode === "rename" && ctx.editing.id === node.id;
  const adding = ctx.editing?.mode === "add" && ctx.editing.parentId === node.id;
  const count = ctx.counts.get(node.id) ?? 0;
  const small = "rounded px-1.5 py-0.5 text-xs text-muted hover:bg-line/60 hover:text-ink";

  return (
    <li>
      <div
        className={`group relative flex items-center gap-1 rounded-md py-1 pr-1 ${
          selected ? "bg-accent-soft" : "hover:bg-paper"
        }`}
        style={{ paddingLeft: depth * 16 + 4 }}
      >
        {kids.length > 0 ? (
          <button
            className="w-5 text-xs text-muted"
            aria-label={collapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
            onClick={() => ctx.toggle(node.id)}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        ) : (
          <span className="w-5" />
        )}
        {renaming ? (
          <InlineInput
            initial={node.name}
            placeholder={`${KIND_LABEL[node.kind]} name`}
            onSubmit={async (name) => {
              await renameNode(node.id, name);
              ctx.setEditing(null);
            }}
            onCancel={() => ctx.setEditing(null)}
          />
        ) : (
          <>
            <button
              className={`min-w-0 flex-1 truncate text-left text-sm ${selected ? "font-medium" : ""}`}
              onClick={() => ctx.onSelect(node.id)}
            >
              {node.name}
            </button>
            <span className="text-xs text-muted tabular-nums">{count}</span>
            <span className="absolute top-1/2 right-1 flex -translate-y-1/2 gap-0.5 rounded-md bg-surface px-0.5 opacity-0 shadow-sm ring-1 ring-line group-focus-within:opacity-100 group-hover:opacity-100">
              {childKind && (
                <button
                  className={small}
                  aria-label={`Add ${childKind} to ${node.name}`}
                  title={`Add ${childKind}`}
                  onClick={() => ctx.setEditing({ mode: "add", parentId: node.id })}
                >
                  +
                </button>
              )}
              <button
                className={small}
                aria-label={`Move ${node.name} up`}
                title="Move up"
                onClick={() => void moveNode(node.id, -1)}
              >
                ↑
              </button>
              <button
                className={small}
                aria-label={`Move ${node.name} down`}
                title="Move down"
                onClick={() => void moveNode(node.id, 1)}
              >
                ↓
              </button>
              <button
                className={small}
                aria-label={`Rename ${node.name}`}
                title="Rename"
                onClick={() => ctx.setEditing({ mode: "rename", id: node.id })}
              >
                ✎
              </button>
              <button
                className={`${small} hover:text-danger`}
                aria-label={`Delete ${node.name}`}
                title="Delete"
                onClick={() => void ctx.remove(node)}
              >
                ✕
              </button>
            </span>
          </>
        )}
      </div>
      {adding && childKind && (
        <div className="py-1 pr-1" style={{ paddingLeft: (depth + 1) * 16 + 24 }}>
          <InlineInput
            placeholder={`New ${childKind} name`}
            onSubmit={(name) => ctx.addChild(node.id, name)}
            onCancel={() => ctx.setEditing(null)}
          />
        </div>
      )}
      {!collapsed && kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <Branch key={k.id} node={k} depth={depth + 1} ctx={ctx} />
          ))}
        </ul>
      )}
    </li>
  );
}

interface Props {
  nodes: TreeNode[];
  questions: Question[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function TreePanel({ nodes, questions, selectedId, onSelect }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const counts = new Map<string, number>();
  for (const q of questions) {
    let id: string | null = q.topicId;
    while (id) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      id = byId.get(id)?.parentId ?? null;
    }
  }

  const ctx: Ctx = {
    nodes,
    counts,
    selectedId,
    collapsed,
    editing,
    onSelect,
    toggle: (id) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    setEditing,
    addChild: async (parentId, name) => {
      const parent = parentId ? byId.get(parentId) : undefined;
      const kind = parent ? childKindOf(parent.kind) : "category";
      if (!kind) return;
      await createNode(kind, parentId, name);
      if (parentId) {
        setCollapsed((prev) => {
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      }
      setEditing(null);
    },
    remove: async (node) => {
      const n = await countQuestionsUnder(node.id);
      const what = KIND_LABEL[node.kind].toLowerCase();
      const ok = window.confirm(
        `Delete the ${what} "${node.name}" and everything inside it? ` +
          `This also deletes ${n} question${n === 1 ? "" : "s"}.`,
      );
      if (!ok) return;
      const hitsSelection =
        selectedId !== null && subtreeOf(nodes, node.id).some((x) => x.id === selectedId);
      await deleteNode(node.id);
      if (hitsSelection) onSelect(null);
    },
  };

  const roots = childrenOf(nodes, null);

  return (
    <nav aria-label="Categories, subjects, and topics" className="rounded-md border border-line bg-surface p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <button
          className={`rounded px-1.5 py-1 text-sm ${selectedId === null ? "font-medium" : "text-muted"} hover:bg-paper`}
          onClick={() => onSelect(null)}
        >
          All questions
        </button>
        <button className="btn py-1" onClick={() => setEditing({ mode: "add", parentId: null })}>
          Add category
        </button>
      </div>
      {editing?.mode === "add" && editing.parentId === null && (
        <div className="px-1 py-1">
          <InlineInput
            placeholder="New category name"
            onSubmit={(name) => ctx.addChild(null, name)}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}
      {roots.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted">
          Nothing here yet. Add a category, such as GEAS, ESAT, Elex, or Math.
        </p>
      ) : (
        <ul>
          {roots.map((r) => (
            <Branch key={r.id} node={r} depth={0} ctx={ctx} />
          ))}
        </ul>
      )}
    </nav>
  );
}
