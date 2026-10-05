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
  setSubjectCategories,
  unlinkSubject,
} from "@/lib/nodes";
import { categoriesOf, childrenOf, KIND_LABEL, subtreeOf } from "@/lib/tree";

// `at` identifies one place in the tree. A shared subject appears under several categories, so its id alone is not enough.
type Editing =
  | { mode: "add"; at: string; parentId: string }
  | { mode: "rename"; at: string; id: string }
  | { mode: "share"; at: string; id: string }
  | null;

interface Ctx {
  nodes: TreeNode[];
  categories: TreeNode[];
  counts: Map<string, number>;
  selectedId: string | null;
  collapsed: Set<string>;
  editing: Editing;
  onSelect: (id: string | null) => void;
  toggle: (id: string) => void;
  setEditing: (e: Editing) => void;
  addChild: (parentId: string, name: string) => Promise<void>;
  remove: (node: TreeNode, parent: TreeNode | null) => Promise<void>;
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

/** Tick the categories a subject belongs to. A subject in more than one category is shared. */
function SharePanel({
  node,
  categories,
  onSave,
  onCancel,
}: {
  node: TreeNode;
  categories: TreeNode[];
  onSave: (ids: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(categoriesOf(node)));
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="my-1 rounded-md border border-line bg-paper p-2 text-sm">
      <p className="mb-1 text-xs text-muted">Which categories use &ldquo;{node.name}&rdquo;?</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {categories.map((c) => (
          <label key={c.id} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={checked.has(c.id)}
              onChange={(e) =>
                setChecked((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(c.id);
                  else next.delete(c.id);
                  return next;
                })
              }
            />
            {c.name}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      <div className="mt-2 flex gap-1">
        <button
          className="btn py-1"
          onClick={async () => {
            try {
              await onSave(Array.from(checked));
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not save.");
            }
          }}
        >
          Save
        </button>
        <button className="btn py-1" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Branch({
  node,
  parent,
  depth,
  path,
  ctx,
}: {
  node: TreeNode;
  parent: TreeNode | null;
  depth: number;
  path: string;
  ctx: Ctx;
}) {
  const at = `${path}/${node.id}`;
  const kids = childrenOf(ctx.nodes, node.id);
  const collapsed = ctx.collapsed.has(node.id);
  const childKind = childKindOf(node.kind);
  const selected = ctx.selectedId === node.id;
  const renaming = ctx.editing?.mode === "rename" && ctx.editing.at === at;
  const adding = ctx.editing?.mode === "add" && ctx.editing.at === at;
  const sharing = ctx.editing?.mode === "share" && ctx.editing.at === at;
  const count = ctx.counts.get(node.id) ?? 0;
  const fixed = node.kind === "category" && node.fixed;
  const shared = node.kind === "subject" && categoriesOf(node).length > 1;
  const small = "rounded px-1.5 py-0.5 text-xs text-muted hover:bg-line/60 hover:text-ink";
  const parentId = parent?.id ?? null;

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
              className={`min-w-0 flex-1 truncate text-left text-sm ${selected || fixed ? "font-medium" : ""}`}
              onClick={() => ctx.onSelect(node.id)}
            >
              {node.name}
            </button>
            {shared && (
              <span
                className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent"
                title={`In ${categoriesOf(node)
                  .map((id) => ctx.categories.find((c) => c.id === id)?.name)
                  .filter(Boolean)
                  .join(", ")}`}
              >
                shared
              </span>
            )}
            <span className="text-xs text-muted tabular-nums">{count}</span>
            <span className="absolute top-1/2 right-1 flex -translate-y-1/2 gap-0.5 rounded-md bg-surface px-0.5 opacity-0 shadow-sm ring-1 ring-line group-focus-within:opacity-100 group-hover:opacity-100">
              {childKind && (
                <button
                  className={small}
                  aria-label={`Add ${childKind} to ${node.name}`}
                  title={`Add ${childKind}`}
                  onClick={() => ctx.setEditing({ mode: "add", at, parentId: node.id })}
                >
                  +
                </button>
              )}
              {!fixed && (
                <>
                  <button className={small} aria-label={`Move ${node.name} up`} title="Move up" onClick={() => void moveNode(node.id, -1, parentId)}>
                    ↑
                  </button>
                  <button className={small} aria-label={`Move ${node.name} down`} title="Move down" onClick={() => void moveNode(node.id, 1, parentId)}>
                    ↓
                  </button>
                  <button className={small} aria-label={`Rename ${node.name}`} title="Rename" onClick={() => ctx.setEditing({ mode: "rename", at, id: node.id })}>
                    ✎
                  </button>
                </>
              )}
              {node.kind === "subject" && (
                <button
                  className={small}
                  aria-label={`Share ${node.name} with other categories`}
                  title="Choose categories"
                  onClick={() => ctx.setEditing({ mode: "share", at, id: node.id })}
                >
                  ⇄
                </button>
              )}
              {!fixed && (
                <button className={`${small} hover:text-danger`} aria-label={`Delete ${node.name}`} title="Delete" onClick={() => void ctx.remove(node, parent)}>
                  ✕
                </button>
              )}
            </span>
          </>
        )}
      </div>
      {sharing && (
        <div style={{ paddingLeft: depth * 16 + 24 }}>
          <SharePanel
            node={node}
            categories={ctx.categories}
            onSave={async (ids) => {
              await setSubjectCategories(node.id, ids);
              ctx.setEditing(null);
            }}
            onCancel={() => ctx.setEditing(null)}
          />
        </div>
      )}
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
            <Branch key={k.id} node={k} parent={node} depth={depth + 1} path={at} ctx={ctx} />
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
  const categories = childrenOf(nodes, null);

  // A question counts toward its topic, its subject, and every category that subject belongs to.
  const counts = new Map<string, number>();
  const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const q of questions) {
    const topic = byId.get(q.topicId);
    if (!topic) continue;
    bump(topic.id);
    const subject = topic.parentId ? byId.get(topic.parentId) : undefined;
    if (!subject) continue;
    bump(subject.id);
    for (const catId of categoriesOf(subject)) bump(catId);
  }

  const ctx: Ctx = {
    nodes,
    categories,
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
      const parent = byId.get(parentId);
      const kind = parent ? childKindOf(parent.kind) : null;
      if (!kind) return;
      await createNode(kind, parentId, name);
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
      setEditing(null);
    },
    remove: async (node, parent) => {
      // A shared subject is only taken out of this category. It stays in the others.
      if (node.kind === "subject" && parent && categoriesOf(node).length > 1) {
        const others = categoriesOf(node)
          .filter((id) => id !== parent.id)
          .map((id) => byId.get(id)?.name)
          .filter(Boolean)
          .join(", ");
        const ok = window.confirm(
          `Remove the subject "${node.name}" from ${parent.name}? It stays in ${others}, with its topics and questions.`,
        );
        if (ok) await unlinkSubject(node.id, parent.id);
        return;
      }
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

  return (
    <nav aria-label="Categories, subjects, and topics" className="rounded-md border border-line bg-surface p-2">
      <div className="mb-1 px-1">
        <button
          className={`rounded px-1.5 py-1 text-sm ${selectedId === null ? "font-medium" : "text-muted"} hover:bg-paper`}
          onClick={() => onSelect(null)}
        >
          All questions
        </button>
      </div>
      {categories.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted">Setting up the categories…</p>
      ) : (
        <ul>
          {categories.map((c) => (
            <Branch key={c.id} node={c} parent={null} depth={0} path="" ctx={ctx} />
          ))}
        </ul>
      )}
    </nav>
  );
}