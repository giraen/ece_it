"use client";

import { useState } from "react";
import type { NodeKind, TreeNode } from "@/lib/db";
import { createNode } from "@/lib/nodes";
import { childrenOf, KIND_LABEL } from "@/lib/tree";

interface SelectProps {
  kind: NodeKind;
  options: TreeNode[];
  value: string | null;
  disabled?: boolean;
  onSelect: (id: string | null) => void;
  /** Leave out to hide the "+ New…" choice. Categories are fixed, so they never offer it. */
  onCreate?: (name: string) => Promise<void>;
}

function NodeSelect({ kind, options, value, disabled, onSelect, onCreate }: SelectProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const label = KIND_LABEL[kind];

  async function submit() {
    if (!name.trim() || !onCreate) return;
    try {
      await onCreate(name);
      setName("");
      setAdding(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add.");
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {adding ? (
        <div>
          <input
            autoFocus
            className="input"
            value={name}
            placeholder={`New ${label.toLowerCase()} name`}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submit();
              } else if (e.key === "Escape") {
                setAdding(false);
              }
            }}
          />
          <div className="mt-1 flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void submit()}>
              Add {label.toLowerCase()}
            </button>
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
          {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        </div>
      ) : (
        <select
          className="input"
          value={value ?? ""}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => {
            if (e.target.value === "__new__") setAdding(true);
            else onSelect(e.target.value || null);
          }}
        >
          <option value="">Select a {label.toLowerCase()}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          {onCreate && <option value="__new__">+ New {label.toLowerCase()}…</option>}
        </select>
      )}
    </div>
  );
}

/** Works out the category and subject a topic belongs to. A shared subject opens under its first category. */
function ancestry(nodes: TreeNode[], topicId: string | null) {
  const topic = topicId ? nodes.find((n) => n.id === topicId) : undefined;
  const subject = topic?.parentId ? nodes.find((n) => n.id === topic.parentId) : undefined;
  return { catId: subject?.parentId ?? null, subId: subject?.id ?? null };
}

interface Props {
  nodes: TreeNode[];
  value: string | null;
  onChange: (topicId: string | null) => void;
}

/** Category, subject, and topic selects. Subjects and topics can be created on the spot. */
export default function TopicPicker({ nodes, value, onChange }: Props) {
  const [sel, setSel] = useState(() => ancestry(nodes, value));

  const categories = childrenOf(nodes, null);
  const subjects = sel.catId ? childrenOf(nodes, sel.catId) : [];
  const topics = sel.subId ? childrenOf(nodes, sel.subId) : [];

  return (
    <div className="flex flex-wrap gap-3">
      <NodeSelect
        kind="category"
        options={categories}
        value={sel.catId}
        onSelect={(id) => {
          setSel({ catId: id, subId: null });
          onChange(null);
        }}
      />
      <NodeSelect
        kind="subject"
        options={subjects}
        value={sel.subId}
        disabled={!sel.catId}
        onSelect={(id) => {
          setSel({ catId: sel.catId, subId: id });
          onChange(null);
        }}
        onCreate={async (name) => {
          if (!sel.catId) return;
          const id = await createNode("subject", sel.catId, name);
          setSel({ catId: sel.catId, subId: id });
          onChange(null);
        }}
      />
      <NodeSelect
        kind="topic"
        options={topics}
        value={value}
        disabled={!sel.subId}
        onSelect={onChange}
        onCreate={async (name) => {
          if (!sel.subId) return;
          onChange(await createNode("topic", sel.subId, name));
        }}
      />
    </div>
  );
}