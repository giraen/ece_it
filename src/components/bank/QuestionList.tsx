"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Question, TreeNode } from "@/lib/db";
import { renameTag } from "@/lib/bank/questions";
import { askText } from "@/lib/ui/dialog";
import { pathOf, subtreeOf } from "@/lib/bank/tree";
import { UNTAGGED, matchesTags, narrowedCounts, toggleTag } from "@/lib/bank/tagFilter";
import { exemptOnlyFirst, isExemptTag } from "@/lib/bank/tagRules";
import { usePagination } from "@/lib/ui/usePagination";
import Pagination from "@/components/ui/Pagination";
import Reference from "@/components/editor/Reference";
import RichText from "@/components/ui/RichText";
import SelectionBar from "./SelectionBar";
import SourceFilter, { sourceKey } from "./SourceFilter";
import { useSources } from "@/lib/bank/sources";

/** Pictures become a short marker, so a row stays compact. */
function listText(stem: string): string {
  return stem.replace(/!\[[^\]]*\]\(img:[^)]*\)/g, "[image]").trim();
}

interface Props {
  nodes: TreeNode[];
  questions: Question[];
  selected: TreeNode | null;
  /** Only to look through, as on a phone: no selecting, editing or new questions. A question opens to show its choices. */
  viewOnly?: boolean;
}

export default function QuestionList({ nodes, questions, selected, viewOnly = false }: Props) {
  const [opened, setOpened] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // The chosen tags live in the address (?tag=series&tag=formulas), so a refresh or a copied link keeps them.
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tagFilter = params.getAll("tag").map((t) => t.toLowerCase());
  const setTagFilter = (keys: string[]) => {
    const next = new URLSearchParams(params.toString());
    next.delete("tag");
    // A different set of tags starts again at the first page.
    next.delete("page");
    for (const k of keys) next.append("tag", k);
    const text = next.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  };
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // The source picked lives in the address too (?source=…).
  const sourceFilter = params.get("source");
  const setSourceFilter = (key: string | null) => {
    const next = new URLSearchParams(params.toString());
    next.delete("source");
    next.delete("page");
    if (key) next.set("source", key);
    const text = next.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  };
  const sources = useSources() ?? [];

  // Everything under the selected node, or the whole bank when nothing is selected.
  const topicIds = new Set(
    (selected ? subtreeOf(nodes, selected.id) : nodes).filter((n) => n.kind === "topic").map((n) => n.id),
  );
  const inScope = questions.filter((q) => topicIds.has(q.topicId));
  // Each question's source, worked out once. The source list counts what the search and tags leave in view.
  const keyOf = new Map(inScope.map((q) => [q.id, sourceKey(q.reference, sources)]));
  const sourced = sourceFilter ? inScope.filter((q) => keyOf.get(q.id) === sourceFilter) : inScope;

  // The tags in view, counted without regard to capital letters.
  const tagIndex = new Map<string, { label: string; count: number }>();
  for (const q of sourced) {
    for (const t of q.tags) {
      const key = t.toLowerCase();
      const cur = tagIndex.get(key);
      if (cur) cur.count += 1;
      else tagIndex.set(key, { label: t, count: 1 });
    }
  }
  // The tag row is only shown inside a subject or a topic, where the list of tags is short enough to use.
  const showTags = selected?.kind === "subject" || selected?.kind === "topic";
  const untaggedCount = sourced.filter((q) => q.tags.length === 0).length;
  // Tags that are not in this view are ignored, so changing the selection cannot leave you with an empty list.
  const activeKeys = showTags ? tagFilter.filter((k) => (k === UNTAGGED ? untaggedCount > 0 : tagIndex.has(k))) : [];
  const untaggedOn = activeKeys.includes(UNTAGGED);
  // With tags chosen, each tag shows how many questions you would get by adding it.
  const narrowed = narrowedCounts(sourced, activeKeys);

  const needle = search.trim().toLowerCase();
  const searched = (q: Question) =>
    !needle ||
    q.stem.toLowerCase().includes(needle) ||
    (q.reference ?? "").toLowerCase().includes(needle) ||
    q.tags.some((t) => t.toLowerCase().includes(needle));
  // How many questions each source would give, with the tags and search as they are.
  const sourceCounts = new Map<string, number>();
  const unsourced = inScope.filter((q) => matchesTags(q.tags, activeKeys) && searched(q));
  for (const q of unsourced) {
    const k = keyOf.get(q.id)!;
    sourceCounts.set(k, (sourceCounts.get(k) ?? 0) + 1);
  }
  const sorted = sourced
    .filter((q) => matchesTags(q.tags, activeKeys))
    .filter(searched)
    // Newest created first. Editing a question no longer moves it to the top.
    .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
  // Under a tag such as "solving", the questions that have only that kind of tag come first, so they stand out.
  const visible = activeKeys.some(isExemptTag) ? exemptOnlyFirst(sorted) : sorted;

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
    if (activeKeys.length !== 1 || untaggedOn) return;
    const from = tagIndex.get(activeKeys[0])!.label;
    const to = await askText({
      title: `Rename the tag "${from}"`,
      message: "It is renamed on the questions in this view.",
      label: "New name",
      initial: from,
      confirmLabel: "Rename",
    });
    if (!to || !to.trim() || to.trim() === from) return;
    await renameTag(Array.from(topicIds), from, to);
    setTagFilter([to.trim().toLowerCase()]);
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
          className={`input ${viewOnly ? "w-full sm:w-56" : "w-56"}`}
          placeholder="Search questions, tags and references"
          aria-label="Search questions, tags and references"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            reset();
          }}
        />
        {!viewOnly && (
          <>
            <Link href={selected ? `/settings?scope=${selected.id}#backup` : "/settings#backup"} className="btn">
              Share pack
            </Link>
            <Link href={newHref} className="btn btn-primary">
              New question
            </Link>
          </>
        )}
      </div>

      {showTags && (tagIndex.size > 0 || untaggedCount > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-muted">Tags</span>
          {/* Questions with no tag at all. It is hidden once a tag is chosen, because it could not match anything. */}
          {untaggedCount > 0 && (activeKeys.length === 0 || untaggedOn) && (
            <button
              aria-pressed={untaggedOn}
              onClick={() => setTagFilter(toggleTag(activeKeys, UNTAGGED))}
              className={`rounded border border-dashed px-2 py-0.5 text-sm ${
                untaggedOn ? "border-accent bg-accent text-white" : "border-accent/50 text-accent hover:bg-accent/10"
              }`}
            >
              Untagged <span className="opacity-70">{untaggedCount}</span>
            </button>
          )}
          {Array.from(tagIndex.entries())
            .sort((a, b) => a[1].label.localeCompare(b[1].label))
            // Once a tag is chosen, tags that can no longer match anything are hidden, so the row gets shorter.
            .filter(([key]) => activeKeys.length === 0 || activeKeys.includes(key) || narrowed.counts.has(key))
            .map(([key, v]) => {
              const on = activeKeys.includes(key);
              const n = narrowed.counts.get(key) ?? 0;
              return (
                <button
                  key={key}
                  aria-pressed={on}
                  onClick={() => {
                    setTagFilter(toggleTag(activeKeys, key));
                  }}
                  className={`rounded px-2 py-0.5 text-sm ${
                    on ? "bg-accent text-white" : "bg-accent-soft text-accent hover:bg-accent/15"
                  }`}
                >
                  {v.label} <span className="opacity-70">{on ? narrowed.shown : n}</span>
                </button>
              );
            })}
          {activeKeys.length > 0 && (
            <button className="ml-1 text-sm underline underline-offset-2" onClick={() => setTagFilter([])}>
              Clear tags
            </button>
          )}
          {activeKeys.length === 1 && !untaggedOn && !viewOnly && (
            <button className="text-sm underline underline-offset-2" onClick={() => void rename()}>
              Rename tag
            </button>
          )}
          {activeKeys.length > 1 && <span className="text-xs text-muted">Questions with all {activeKeys.length}</span>}
        </div>
      )}
      {!showTags && tagIndex.size > 0 && (
        <p className="mb-3 text-sm text-muted">Pick a subject or topic to filter by tag.</p>
      )}
      {inScope.length > 0 && (
        <SourceFilter
          sources={sources}
          counts={sourceCounts}
          total={unsourced.length}
          value={sourceFilter}
          onChange={(k) => {
            setSourceFilter(k);
            reset();
          }}
        />
      )}

      {visible.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-6 text-sm text-muted">
          {inScope.length === 0
            ? viewOnly
              ? "No questions here yet."
              : "No questions here yet. Choose New question to write the first one."
            : "No questions match the search or filters."}
        </p>
      ) : (
        <div>
          <Pagination page={page} pages={pages} total={visible.length} pageSize={pageSize} onChange={goTo} />
          <div className="card">
            {!viewOnly && (
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
            )}
            <ul className="divide-y divide-line">
              {pageItems.map((q) => (
                <li key={q.id} className="flex items-start gap-3 px-3 py-3">
                  {!viewOnly && (
                    <input
                      type="checkbox"
                      className="mt-1"
                      aria-label="Select question"
                      checked={picked.has(q.id)}
                      onChange={() => toggle(q.id)}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {viewOnly ? (
                      <button
                        type="button"
                        aria-expanded={opened === q.id}
                        className="block w-full text-left"
                        onClick={() => setOpened(opened === q.id ? null : q.id)}
                      >
                        <RichText
                          text={opened === q.id ? q.stem : listText(q.stem) || "(no text)"}
                          className={`text-[15px] ${opened === q.id ? "" : "line-clamp-2"}`}
                        />
                      </button>
                    ) : (
                      <RichText text={listText(q.stem) || "(no text)"} className="line-clamp-2 text-[15px]" />
                    )}
                    {viewOnly && opened === q.id && (
                      <ol className="mt-2 space-y-1.5">
                        {q.choices.map((c, i) => {
                          const right = c.id === q.correctChoiceId;
                          return (
                            <li
                              key={c.id}
                              className={`flex gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                                right ? "border-good bg-good/10" : "border-line"
                              }`}
                            >
                              <span className="w-4 shrink-0 text-muted">{"ABCDEFGH"[i]}</span>
                              <RichText text={c.text} className="min-w-0 flex-1" />
                              {right && <span className="text-xs font-medium text-good">Answer</span>}
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {q.type === "computation" && (
                        <span className="mr-2 rounded border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink">
                          Dynamic
                        </span>
                      )}
                      {pathOf(nodes, q.topicId)}
                    </p>
                    <Reference text={q.reference} className="mt-0.5 truncate" />
                    {q.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {[...q.tags]
                          .sort((a, b) => a.localeCompare(b))
                          .map((t) => (
                            <span key={t} className="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                              {t}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                  {!viewOnly && (
                    <Link href={`/editor?id=${q.id}`} className="btn">
                      Edit
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <Pagination page={page} pages={pages} total={visible.length} pageSize={pageSize} onChange={goTo} />
        </div>
      )}

      {!viewOnly && (
        <SelectionBar
          ids={pickedIds}
          nodes={nodes}
          questions={questions}
          visibleCount={visible.length}
          onSelectAll={() => setPicked(new Set(visible.map((q) => q.id)))}
          onClear={() => setPicked(new Set())}
        />
      )}
    </section>
  );
}
