"use client";

import { useState } from "react";
import Link from "next/link";
import type { Concept, TreeNode } from "@/lib/db";
import { pathOf, subtreeOf } from "@/lib/tree";
import RichText from "./RichText";

/** A short plain-text taste of a note, with pictures shown as [image]. */
const excerpt = (body: string) =>
  body
    .replace(/!\[[^\]]*\]\(img:[^)]*\)/g, "[image]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

interface Props {
  nodes: TreeNode[];
  concepts: Concept[];
  /** The category, subject, or topic chosen in the tree, or null for everything. */
  selected: TreeNode | null;
}

/** The concept notes under the chosen part of the tree, searchable and readable in place. */
export default function ConceptList({ nodes, concepts, selected }: Props) {
  const [search, setSearch] = useState("");
  const [reading, setReading] = useState<Set<string>>(new Set());

  const topicIds = new Set(
    (selected ? subtreeOf(nodes, selected.id) : nodes).filter((n) => n.kind === "topic").map((n) => n.id),
  );
  const needle = search.trim().toLowerCase();
  const visible = concepts
    .filter((c) => topicIds.has(c.topicId))
    .filter(
      (c) =>
        !needle ||
        c.title.toLowerCase().includes(needle) ||
        c.body.toLowerCase().includes(needle) ||
        c.tags.some((t) => t.toLowerCase().includes(needle)),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const newHref = selected?.kind === "topic" ? `/concept?topic=${selected.id}` : "/concept";

  const toggle = (id: string) =>
    setReading((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-label="Concepts">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{selected ? pathOf(nodes, selected.id) : "All concepts"}</h1>
          <p className="text-sm text-muted">
            {visible.length} concept{visible.length === 1 ? "" : "s"}
          </p>
        </div>
        <input
          className="input w-56"
          placeholder="Search concepts"
          aria-label="Search concepts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Link href={newHref} className="btn btn-primary">
          New concept
        </Link>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-6 text-sm text-muted">
          {concepts.length === 0
            ? "No concepts yet. A concept is a short note on one idea, like crosstalk. Choose New concept to write the first one."
            : "No concepts match here."}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {visible.map((c) => {
            const open = reading.has(c.id);
            return (
              <li key={c.id} className="px-3 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      <RichText text={c.title} className="inline" />
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">{pathOf(nodes, c.topicId)}</p>
                    {!open && <p className="mt-1 line-clamp-2 text-sm text-muted">{excerpt(c.body)}</p>}
                    {c.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <span key={t} className="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn"
                    aria-expanded={open}
                    aria-label={`${open ? "Hide" : "Read"} ${c.title}`}
                    onClick={() => toggle(c.id)}
                  >
                    {open ? "Hide" : "Read"}
                  </button>
                  <Link href={`/concept?id=${c.id}`} className="btn" aria-label={`Edit ${c.title}`}>
                    Edit
                  </Link>
                </div>
                {open && (
                  <div className="mt-3 rounded-md border border-line border-l-4 border-l-accent bg-paper p-4">
                    <RichText text={c.body} className="text-[15px] leading-relaxed" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}