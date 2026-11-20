"use client";

import { useEffect, useRef, useState } from "react";
import type { TreeNode } from "@/lib/db";
import { categoriesOf } from "@/lib/bank/tree";

/** Where the lists look: everything, or one category, subject or topic. */
export type Within = { kind: "all" } | { kind: "category" | "subject" | "topic"; id: string };

/** One place in the list, indented by its level. */
function Row({
  label,
  depth,
  active,
  strong,
  onPick,
}: {
  label: string;
  depth: 0 | 1 | 2;
  active: boolean;
  strong: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onPick}
      style={{ paddingLeft: `${0.5 + depth}rem` }}
      className={`flex w-full items-center rounded-md py-1.5 pr-2 text-left text-sm ${
        active ? "bg-accent-soft text-accent" : "hover:bg-paper"
      } ${strong ? "font-medium" : ""}`}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}

interface Props {
  nodes: TreeNode[];
  /** Ids of the categories, subjects and topics that have answers. Others are left out of the list. */
  present: Set<string>;
  value: Within;
  onChange: (w: Within) => void;
}

/** A button that opens the category › subject › topic list, with a box to find one by name. */
export default function WithinPicker({ nodes, present, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const live = nodes.filter((n) => !n.deletedAt && present.has(n.id));
  const byOrder = (a: TreeNode, b: TreeNode) => a.order - b.order || a.name.localeCompare(b.name);
  const categories = live.filter((n) => n.kind === "category").sort(byOrder);
  const subjectsOf = (c: string) =>
    live.filter((n) => n.kind === "subject" && categoriesOf(n).includes(c)).sort(byOrder);
  const topicsOf = (s: string) => live.filter((n) => n.kind === "topic" && n.parentId === s).sort(byOrder);

  const current =
    value.kind === "all" ? "All categories" : (nodes.find((n) => n.id === value.id)?.name ?? "All categories");
  const q = find.trim().toLowerCase();
  const hit = (n: TreeNode) => !q || n.name.toLowerCase().includes(q);
  const pick = (w: Within) => {
    onChange(w);
    setOpen(false);
    setFind("");
  };
  const on = (id: string | null) => (value.kind === "all" ? id === null : value.id === id);

  // With a search, a subject shows when it or one of its topics matches, and a category when anything in it does.
  const rows: React.ReactNode[] = [];
  for (const c of categories) {
    const subs = subjectsOf(c.id)
      .map((s) => ({ s, topics: topicsOf(s.id).filter(hit) }))
      .filter(({ s, topics }) => hit(s) || topics.length > 0 || hit(c));
    if (!hit(c) && subs.length === 0) continue;
    rows.push(
      <Row
        key={c.id}
        label={c.name}
        depth={0}
        strong
        active={on(c.id)}
        onPick={() => pick({ kind: "category", id: c.id })}
      />,
    );
    for (const { s, topics } of subs) {
      rows.push(
        <Row
          key={`${c.id}-${s.id}`}
          label={s.name}
          depth={1}
          strong={false}
          active={on(s.id)}
          onPick={() => pick({ kind: "subject", id: s.id })}
        />,
      );
      for (const t of q ? topics : topicsOf(s.id))
        rows.push(
          <Row
            key={`${c.id}-${t.id}`}
            label={t.name}
            depth={2}
            strong={false}
            active={on(t.id)}
            onPick={() => pick({ kind: "topic", id: t.id })}
          />,
        );
    }
  }

  return (
    <div ref={box} className="relative flex items-center gap-2">
      <span className="text-sm text-muted">Within</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`btn max-w-[18rem] py-1 ${value.kind !== "all" ? "border-accent bg-accent-soft text-accent" : ""}`}
      >
        <span className="truncate">{current}</span> <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-3 shadow-xl">
          <input
            ref={input}
            className="input mb-2 py-1.5 text-sm"
            placeholder="Find a subject or topic…"
            aria-label="Find a subject or topic"
            value={find}
            onChange={(e) => setFind(e.target.value)}
          />
          <div role="listbox" aria-label="Where to look" className="scroll-thin max-h-80 overflow-y-auto">
            {!q && (
              <Row
                label="All categories"
                depth={0}
                strong={false}
                active={on(null)}
                onPick={() => pick({ kind: "all" })}
              />
            )}
            {rows}
            {q && rows.length === 0 && <p className="px-2 py-1 text-sm text-muted">Nothing matches.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
