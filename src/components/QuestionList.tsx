"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Question, TreeNode } from "@/lib/db";
import { renameTag } from "@/lib/questions";
import { pathOf, subtreeOf } from "@/lib/tree";
import { usePagination } from "@/lib/usePagination";
import Pagination from "./Pagination";
import Reference from "./Reference";
import RichText from "./RichText";
import SelectionBar from "./SelectionBar";

/** Pictures become a short marker, so a row stays compact. */
function listText(stem: string): string {
  return stem.replace(/!\[[^\]]*\]\(img:[^)]*\)/g, "[image]").trim();
}

interface Props {
  nodes: TreeNode[];
  questions: Question[];
  selected: TreeNode | null;
}

export default function QuestionList({ nodes, questions, selected }: Props) {
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [priorityOnly, setPriorityOnly] = useState(false);

  // Everything under the selected node, or the whole bank when nothing is selected.
  const topicIds = new Set(
    (selected ? subtreeOf(nodes, selected.id) : nodes).filter((n) => n.kind === "topic").map((n) => n.id),
  );
  const inScope = questions.filter((q) => topicIds.has(q.topicId));

  // The tags in view, counted without regard to capital letters.
  const tagIndex = new Map<string, { label: string; count: number }>();
  for (const q of inScope) {
    for (const t of q.tags) {
      const key = t.toLowerCase();
      const cur = tagIndex.get(key);
      if (cur) cur.count += 1;
      else tagIndex.set(key, { label: t, count: 1 });
    }
  }
  // The tag row is only shown inside a subject or a topic, where the list of tags is short enough to use.
  const showTags = selected?.kind === "subject" || selected?.kind === "topic";
  // A filter on a tag that is not in this view is ignored, so changing the selection cannot leave you with an empty list.
  const activeKey = showTags && tagFilter && tagIndex.has(tagFilter) ? tagFilter : null;

  // The priority filter is ignored when nothing in view is a priority, so it can never leave you with an empty list.
  const priorityCount = inScope.filter((q) => q.priority).length;
  const activePriority = priorityOnly && priorityCount > 0;

  const needle = search.trim().toLowerCase();
  const visible = inScope
    .filter((q) => !activePriority || q.priority)
    .filter((q) => !activeKey || q.tags.some((t) => t.toLowerCase() === activeKey))
    .filter(
      (q) =>
        !needle ||
        q.stem.toLowerCase().includes(needle) ||
        (q.reference ?? "").toLowerCase().includes(needle) ||
        q.tags.some((t) => t.toLowerCase().includes(needle)),
    )
    // Newest created first. Editing a question no longer moves it to the top.
    .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));

  const top = useRef<HTMLElement>(null);
  const { page, pages, setPage, reset, pageItems, pageSize } = usePagination(visible);
  const goTo = (n: number) => {
    setPage(n);
    top.current?.scrollIntoView({ block: "start" });
  };

  // Only questions you can see count as selected, so a hidden one is never changed by accident.
  const pickedIds = visible.filter((q) => picked.has(q.id)).map((q) => q.id);
  const pagePicked = pageItems.filter((q) => picked.has(q.id)).length;
  const allPicked = pageItems.length > 0 && pagePicked === pageItems.length;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function rename() {
    if (!activeKey) return;
    const from = tagIndex.get(activeKey)!.label;
    const to = window.prompt(`Rename the tag "${from}" in this view to:`, from);
    if (!to || !to.trim() || to.trim() === from) return;
    await renameTag(Array.from(topicIds), from, to);
    setTagFilter(to.trim().toLowerCase());
    reset();
  }

  const newHref = selected?.kind === "topic" ? `/editor?topic=${selected.id}` : "/editor";

  return (
    <section aria-label="Questions" ref={top} className="scroll-mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{selected ? pathOf(nodes, selected.id) : "All questions"}</h1>
          <p className="text-sm text-muted">
            {inScope.length} question{inScope.length === 1 ? "" : "s"}
            {visible.length !== inScope.length && `, ${visible.length} shown`}
          </p>
        </div>
        <input
          className="input w-56"
          placeholder="Search questions, tags and references"
          aria-label="Search questions, tags and references"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            reset();
          }}
        />
        <Link href={selected ? `/settings?scope=${selected.id}#backup` : "/settings#backup"} className="btn">
          Share pack
        </Link>
        <Link href={newHref} className="btn btn-primary">
          New question
        </Link>
      </div>

      {(priorityCount > 0 || (showTags && tagIndex.size > 0)) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {priorityCount > 0 && (
            <button
              aria-pressed={activePriority}
              onClick={() => {
                setPriorityOnly(!activePriority);
                reset();
              }}
              className={`rounded px-2 py-0.5 text-sm font-medium ${
                activePriority
                  ? "bg-priority-solid text-on-priority"
                  : "bg-priority-soft text-priority hover:bg-priority-solid/60"
              }`}
            >
              Priority <span className="opacity-70">{priorityCount}</span>
            </button>
          )}
          {showTags && tagIndex.size > 0 && (
            <>
              <span className={`text-sm text-muted ${priorityCount > 0 ? "ml-2" : ""}`}>Tags</span>
              {Array.from(tagIndex.entries())
                .sort((a, b) => a[1].label.localeCompare(b[1].label))
                .map(([key, v]) => (
                  <button
                    key={key}
                    aria-pressed={activeKey === key}
                    onClick={() => {
                      setTagFilter(activeKey === key ? null : key);
                      reset();
                    }}
                    className={`rounded px-2 py-0.5 text-sm ${
                      activeKey === key ? "bg-accent text-white" : "bg-accent-soft text-accent hover:bg-accent/15"
                    }`}
                  >
                    {v.label} <span className="opacity-70">{v.count}</span>
                  </button>
                ))}
              {activeKey && (
                <button className="ml-1 text-sm underline underline-offset-2" onClick={() => void rename()}>
                  Rename tag
                </button>
              )}
            </>
          )}
        </div>
      )}
      {!showTags && tagIndex.size > 0 && (
        <p className="mb-3 text-sm text-muted">Pick a subject or topic to filter by tag.</p>
      )}

      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-6 text-sm text-muted">
          {inScope.length === 0
            ? "No questions here yet. Choose New question to write the first one."
            : "No questions match the search or filters."}
        </p>
      ) : (
        <div>
          <Pagination page={page} pages={pages} total={visible.length} pageSize={pageSize} onChange={goTo} />
          <div className="rounded-md border border-line bg-surface">
            <label className="flex items-center gap-3 border-b border-line px-3 py-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={allPicked}
                onChange={() =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    for (const q of pageItems) {
                      if (allPicked) next.delete(q.id);
                      else next.add(q.id);
                    }
                    return next;
                  })
                }
              />
              Select all on this page
              {pages > 1 && (
                <button
                  type="button"
                  className="ml-2 underline underline-offset-2"
                  onClick={(e) => {
                    e.preventDefault();
                    setPicked(new Set(visible.map((q) => q.id)));
                  }}
                >
                  Select all {visible.length}
                </button>
              )}
            </label>
            <ul className="divide-y divide-line">
              {pageItems.map((q) => (
                <li key={q.id} className="flex items-start gap-3 px-3 py-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    aria-label="Select question"
                    checked={picked.has(q.id)}
                    onChange={() => toggle(q.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <RichText text={listText(q.stem) || "(no text)"} className="line-clamp-2 text-[15px]" />
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {q.type === "computation" && (
                        <span className="mr-2 rounded border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink">
                          Dynamic
                        </span>
                      )}
                      {q.priority && (
                        <span className="mr-2 rounded bg-priority-soft px-1.5 py-0.5 text-[11px] font-medium text-priority">
                          Priority
                        </span>
                      )}
                      {pathOf(nodes, q.topicId)}
                    </p>
                    <Reference text={q.reference} className="mt-0.5 truncate" />
                    {q.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {q.tags.map((t) => (
                          <span key={t} className="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Link href={`/editor?id=${q.id}`} className="btn">
                    Edit
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Pagination page={page} pages={pages} total={visible.length} pageSize={pageSize} onChange={goTo} />
        </div>
      )}

      <SelectionBar
        ids={pickedIds}
        questions={questions}
        visibleCount={visible.length}
        onSelectAll={() => setPicked(new Set(visible.map((q) => q.id)))}
        onClear={() => setPicked(new Set())}
      />
    </section>
  );
}