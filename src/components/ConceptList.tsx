"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Concept, DraftQuestion, TreeNode } from "@/lib/db";
import { pathOf, subtreeOf } from "@/lib/tree";
import { useKeyIds } from "@/lib/aiKeys";
import { useProviders } from "@/lib/aiStore";
import { draftCounts } from "@/lib/concepts";
import { draftMany, type RunControl, type RunEvent } from "@/lib/runGeneration";
import InfoTip from "./InfoTip";
import RichText from "./RichText";

/** A short plain-text taste of a note, with pictures shown as [image]. */
const excerpt = (body: string) =>
  body
    .replace(/!\[[^\]]*\]\(img:[^)]*\)/g, "[image]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

type Filter = "all" | "new" | "drafted";

interface Props {
  nodes: TreeNode[];
  concepts: Concept[];
  drafts: DraftQuestion[];
  /** The category, subject, or topic chosen in the tree, or null for everything. */
  selected: TreeNode | null;
}

interface Progress {
  running: boolean;
  index: number;
  total: number;
  title: string;
  log: { id: string; title: string; kind: RunEvent["kind"]; text: string }[];
  summary: string;
}

/** The concept notes under the chosen part of the tree, searchable and readable in place. */
export default function ConceptList({ nodes, concepts, drafts, selected }: Props) {
  const providers = useProviders();
  const keyIds = useKeyIds();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [reading, setReading] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(4);
  const [redo, setRedo] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const control = useRef<RunControl>({ aborted: false });
  const allBox = useRef<HTMLInputElement>(null);

  const counts = draftCounts(drafts);
  const isDrafted = (id: string) => {
    const c = counts.get(id);
    return !!c && c.pending + c.accepted > 0;
  };

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
    .filter((c) => filter === "all" || (filter === "drafted") === isDrafted(c.id))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const newHref = selected?.kind === "topic" ? `/concept?topic=${selected.id}` : "/concept";

  // Picks only mean something for concepts that still exist.
  const chosen = concepts.filter((c) => picked.has(c.id));
  const alreadyDrafted = chosen.filter((c) => isDrafted(c.id));
  const toDraft = redo ? chosen : chosen.filter((c) => !isDrafted(c.id));
  const visiblePicked = visible.filter((c) => picked.has(c.id)).length;
  const running = progress?.running ?? false;
  const canRun = !!providers?.some((p) => p.enabled && p.type === "openai" && keyIds.includes(p.id));

  useEffect(() => {
    if (allBox.current) allBox.current.indeterminate = visiblePicked > 0 && visiblePicked < visible.length;
  }, [visiblePicked, visible.length]);

  const toggle = (id: string) =>
    setReading((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pickAll = (on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const c of visible) {
        if (on) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });

  async function run() {
    if (!providers || toDraft.length === 0) return;
    const queue = [...toDraft];
    control.current = { aborted: false };
    const log: Progress["log"] = [];
    setProgress({
      running: true,
      index: 0,
      total: queue.length,
      title: queue[0].title,
      log,
      summary: "",
    });
    let summary = "";
    try {
      const r = await draftMany({
        concepts: queue,
        providers,
        count,
        control: control.current,
        onStart: (c, i, total) => setProgress((p) => (p ? { ...p, index: i, total, title: c.title } : p)),
        onDone: (c, kind, text) => {
          log.push({ id: c.id, title: c.title, kind, text });
          setProgress((p) => (p ? { ...p, log: [...log] } : p));
        },
      });
      const parts = [`${r.finished} concept${r.finished === 1 ? "" : "s"} drafted`];
      if (r.stopped) {
        summary = `Stopped: ${r.stopped} ${r.remaining} concept${r.remaining === 1 ? "" : "s"} not reached. Run it again and the finished ones are skipped.`;
      } else if (control.current.aborted) {
        summary = `Stopped by you. ${parts[0]}, ${r.remaining} not reached. Run it again and the finished ones are skipped.`;
      } else {
        summary = `Done: ${parts[0]}. The questions are waiting for review inside each concept.`;
      }
    } catch (e) {
      summary = `Stopped: ${e instanceof Error ? e.message : "Drafting failed."}`;
    }
    // Concepts that were processed no longer need a pick; the rest stay ticked for another go.
    const reached = new Set(log.filter((l) => l.kind !== "stop").map((l) => l.id));
    setPicked((prev) => new Set([...prev].filter((id) => !reached.has(id))));
    setProgress((p) => (p ? { ...p, running: false, summary } : p));
  }

  return (
    <section aria-label="Concepts">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{selected ? pathOf(nodes, selected.id) : "All concepts"}</h1>
          <p className="text-sm text-muted">
            {visible.length} concept{visible.length === 1 ? "" : "s"}
          </p>
        </div>
        <select
          className="input w-44"
          aria-label="Show concepts"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
        >
          <option value="all">All concepts</option>
          <option value="new">Not drafted yet</option>
          <option value="drafted">Drafted</option>
        </select>
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

      {visible.length > 0 && (
        <div className="mb-3 space-y-2 rounded-md border border-line bg-surface px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                ref={allBox}
                type="checkbox"
                checked={visiblePicked === visible.length}
                onChange={(e) => pickAll(e.target.checked)}
                disabled={running}
              />
              Select all ({visible.length})
            </label>
            {chosen.length > 0 && (
              <>
                <span className="text-sm text-muted">{chosen.length} selected</span>
                <label className="flex items-center gap-2 text-sm">
                  Questions each
                  <input
                    type="number"
                    min={1}
                    max={8}
                    className="input w-16 py-1"
                    value={count}
                    disabled={running}
                    onChange={(e) => setCount(Math.min(8, Math.max(1, Math.round(Number(e.target.value)) || 1)))}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={redo}
                    disabled={running}
                    onChange={(e) => setRedo(e.target.checked)}
                  />
                  Also redo ones already drafted
                </label>
                <button
                  className="btn btn-primary"
                  disabled={running || toDraft.length === 0 || !canRun}
                  title={!canRun ? "Add an API key first" : undefined}
                  onClick={() => void run()}
                >
                  Draft with AI ({toDraft.length})
                </button>
                <InfoTip label="About drafting with AI">
                  The AI writes questions from each ticked concept, one concept at a time. Every question is checked by
                  a second model and then waits for you to review it inside the concept. Concepts that already have
                  drafts are skipped so the same ideas are not asked twice, unless you tick the redo box.
                </InfoTip>
              </>
            )}
          </div>
          {chosen.length > 0 && !redo && alreadyDrafted.length > 0 && (
            <p className="text-xs text-muted">
              {alreadyDrafted.length} already drafted, skipped.
              {toDraft.length === 0 && " Tick the redo box to draft them again."}
            </p>
          )}
          {chosen.length > 0 && !canRun && (
            <p className="text-xs text-muted">
              Drafting needs an API key. Add one in{" "}
              <Link href="/settings" className="underline">
                Settings
              </Link>
              .
            </p>
          )}
        </div>
      )}

      {progress && (
        <div
          role="status"
          aria-live="polite"
          className="mb-3 space-y-2 rounded-md border border-line border-l-4 border-l-accent bg-paper p-3 text-sm"
        >
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 font-medium">
              {progress.running ? (
                <>
                  Drafting {progress.index + 1} of {progress.total}:{" "}
                  <RichText text={progress.title} className="inline" />
                </>
              ) : (
                progress.summary
              )}
            </p>
            {progress.running ? (
              <button className="btn" onClick={() => (control.current.aborted = true)}>
                Stop
              </button>
            ) : (
              <button className="btn" onClick={() => setProgress(null)}>
                Close
              </button>
            )}
          </div>
          {progress.running && <p className="text-xs text-muted">Stop finishes the concept in progress, then halts.</p>}
          {progress.log.length > 0 && (
            <ul className="space-y-1">
              {progress.log.map((l) => (
                <li key={l.id} className="flex gap-2 text-xs">
                  <span className={l.kind === "ok" ? "text-good" : l.kind === "stop" ? "text-danger" : "text-muted"}>
                    {l.kind === "ok" ? "Done" : l.kind === "stop" ? "Stopped" : "Note"}
                  </span>
                  <span className="min-w-0">
                    <RichText text={l.title} className="inline" /> <span className="text-muted">{l.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
            const made = counts.get(c.id);
            return (
              <li key={c.id} className="px-3 py-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1.5"
                    aria-label={`Select ${c.title}`}
                    checked={picked.has(c.id)}
                    disabled={running}
                    onChange={() => pick(c.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      <RichText text={c.title} className="inline" />
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">{pathOf(nodes, c.topicId)}</p>
                    {!open && <p className="mt-1 line-clamp-2 text-sm text-muted">{excerpt(c.body)}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {c.tags.map((t) => (
                        <span key={t} className="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                          {t}
                        </span>
                      ))}
                      {made && made.pending + made.accepted > 0 ? (
                        <span className="text-xs">
                          <span className="font-medium text-muted">Drafted</span>
                          {made.pending > 0 && (
                            <span className="font-medium text-accent"> · {made.pending} to review</span>
                          )}
                          {made.accepted > 0 && <span className="text-muted"> · {made.accepted} accepted</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Not drafted yet</span>
                      )}
                    </div>
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