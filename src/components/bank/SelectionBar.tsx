"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Question } from "@/lib/db";
import { restoreQuestions, snapshotQuestions } from "@/lib/bulk";
import { addTag, deleteQuestions, removeTag, setReferences } from "@/lib/questions";
import { joinReference, sourceLabel, splitReference, useSources } from "@/lib/sources";
import { tagSections, tagUsage } from "@/lib/tagUsage";
import ReferenceInput from "./ReferenceInput";

interface Props {
  /** The selected questions that are in view. */
  ids: string[];
  /** Every question in the bank, so tags stay current. */
  questions: Question[];
  /** How many questions the list is showing, for "Select all". */
  visibleCount: number;
  onSelectAll: () => void;
  onClear: () => void;
}

interface Toast {
  message: string;
  undo: () => Promise<void>;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border border-b-2 border-line bg-surface px-1 font-sans">{children}</kbd>;
}

/**
 * The bar that floats at the bottom of the question list while questions are selected.
 * It changes their tags or their source, or deletes them. Each change can be undone from a short message above
 * the bar.
 */
export default function SelectionBar({ ids, questions, visibleCount, onSelectAll, onClear }: Props) {
  const [open, setOpen] = useState<"tags" | "source" | null>(null);
  const tagsOpen = open === "tags";
  const [asking, setAsking] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const sources = useSources();
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(-1);
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  const n = ids.length;
  const shown = n > 0;
  const chosen = useMemo(() => {
    const byId = new Map(questions.map((q) => [q.id, q]));
    return ids.flatMap((id) => {
      const q = byId.get(id);
      return q ? [q] : [];
    });
  }, [ids, questions]);

  // Tags on the selected questions: how many of them carry each one.
  const onSelected = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const q of chosen) {
      for (const t of new Set(q.tags)) {
        const k = t.toLowerCase();
        const cur = m.get(k);
        if (cur) cur.count += 1;
        else m.set(k, { label: t, count: 1 });
      }
    }
    return Array.from(m.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [chosen]);

  // Suggestions: every tag in the bank that is not already on all of the selected questions.
  const usage = useMemo(() => tagUsage(questions, null), [questions]);
  const sections = useMemo(() => {
    const labels = new Map<string, string>();
    for (const q of questions) for (const t of q.tags) if (!labels.has(t.toLowerCase())) labels.set(t.toLowerCase(), t);
    const suggestions = Array.from(labels.entries())
      .sort((a, b) => (usage.counts.get(b[0]) ?? 0) - (usage.counts.get(a[0]) ?? 0) || a[1].localeCompare(b[1]))
      .map(([, label]) => label);
    const onAll = onSelected.filter((t) => t.count === n).map((t) => t.label);
    return tagSections({ suggestions, value: onAll, draft, usage, topicScoped: false, limit: 8, emptyLimit: 3 });
  }, [questions, usage, onSelected, n, draft]);
  const rows = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  function say(message: string, undo: () => Promise<void>) {
    window.clearTimeout(timer.current);
    setToast({ message, undo });
    timer.current = window.setTimeout(() => setToast(null), 7000);
  }
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // With nothing selected the panel and the question have nothing to act on, so they are reset right away.
  if (!shown && (open || asking || draft || sourceText)) {
    setOpen(null);
    setAsking(false);
    setDraft("");
    setSourceText("");
  }
  useEffect(() => {
    if (asking) cancel.current?.focus();
  }, [asking]);

  // Escape backs out one layer at a time. A click outside an open panel closes it.
  useEffect(() => {
    if (!shown) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      const field = el instanceof HTMLInputElement ? !/^(checkbox|radio|button)$/.test(el.type) : false;
      const typing =
        !!el && (field || el.tagName === "TEXTAREA" || el.tagName === "SELECT") && !root.current?.contains(el);
      if (typing) return;
      if (asking) setAsking(false);
      else if (open) setOpen(null);
      else onClear();
    }
    function onDown(e: MouseEvent) {
      if (open && !(e.target as HTMLElement).closest("[data-bar-pop]")) setOpen(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [shown, asking, open, onClear]);

  async function add(text: string) {
    const parts = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const before = await snapshotQuestions(ids);
    for (const t of parts) await addTag(ids, t);
    setDraft("");
    setActive(-1);
    input.current?.focus();
    say(`Added “${parts.join(", ")}” to ${plural(n, "question")}`, () => restoreQuestions(before));
  }

  async function take(tag: string) {
    const before = await snapshotQuestions(ids);
    await removeTag(ids, tag);
    say(`Removed “${tag}” from ${plural(n, "question")}`, () => restoreQuestions(before));
  }

  async function applySource() {
    const text = sourceText.trim();
    const list = sources ?? [];
    const { source: next, where: nextWhere } = splitReference(text, list);
    const items = chosen.map((q) => {
      // Choosing the source a question already has keeps its own page.
      const cur = splitReference(q.reference ?? "", list);
      const keep = next && !nextWhere && cur.source?.id === next.id ? cur.where : nextWhere;
      return { id: q.id, reference: next ? joinReference(sourceLabel(next), keep) : text || undefined };
    });
    const before = await snapshotQuestions(ids);
    await setReferences(items);
    setOpen(null);
    setSourceText("");
    say(text ? `Set the source on ${plural(n, "question")}` : `Source removed from ${plural(n, "question")}`, () =>
      restoreQuestions(before),
    );
  }

  async function remove() {
    const before = await snapshotQuestions(ids);
    const count = n;
    await deleteQuestions(ids);
    setAsking(false);
    onClear();
    say(`${plural(count, "question")} deleted`, () => restoreQuestions(before));
  }

  const iconBtn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-accent-soft";
  const pop =
    "absolute bottom-full left-1/2 mb-3 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 shadow-xl";

  return (
    <>
      {/* Room under the last row, so the bar never covers it. */}
      {shown && <div aria-hidden className="h-20" />}
      <div className="pointer-events-none sticky bottom-4 z-30 h-0">
        <div ref={root} className="absolute bottom-0 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
          <div role="status" aria-live="polite" className="pointer-events-auto">
            {toast && (
              <div className="flex items-center gap-3 rounded-lg bg-ink py-2 pr-2 pl-4 text-sm whitespace-nowrap text-paper shadow-lg">
                <span>{toast.message}</span>
                <button
                  className="rounded px-2 py-0.5 font-semibold underline underline-offset-2 hover:bg-paper/15"
                  onClick={async () => {
                    const undo = toast.undo;
                    setToast(null);
                    await undo();
                  }}
                >
                  Undo
                </button>
              </div>
            )}
          </div>

          <div
            role="toolbar"
            aria-label="Selected questions"
            aria-hidden={!shown}
            inert={!shown}
            className={`flex items-center gap-1 rounded-xl border border-line bg-surface py-1.5 pr-2 pl-4 whitespace-nowrap shadow-xl transition-[opacity,transform,visibility] duration-200 ${
              shown ? "pointer-events-auto visible translate-y-0 opacity-100" : "invisible translate-y-4 opacity-0"
            }`}
          >
            {asking ? (
              <>
                <span className="mr-3 text-sm font-semibold">Delete {plural(n, "question")}?</span>
                <button ref={cancel} className={iconBtn} onClick={() => setAsking(false)}>
                  Cancel
                </button>
                <button
                  className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90"
                  onClick={() => void remove()}
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <span className="min-w-[5.5rem] text-sm font-semibold">{n} selected</span>
                <button
                  aria-label="Clear selection"
                  title="Clear selection (Esc)"
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-accent-soft hover:text-ink"
                  onClick={onClear}
                >
                  ✕
                </button>
                {n < visibleCount && (
                  <button className="rounded-md px-2 py-1 text-sm text-accent hover:underline" onClick={onSelectAll}>
                    Select all {visibleCount}
                  </button>
                )}
                <span aria-hidden className="mx-1.5 h-5 w-px bg-line" />
                <div className="relative" data-bar-pop>
                  <button
                    aria-expanded={tagsOpen}
                    aria-haspopup="dialog"
                    className={`${iconBtn} ${tagsOpen ? "bg-accent-soft" : ""}`}
                    onClick={() => {
                      setOpen(tagsOpen ? null : "tags");
                      setDraft("");
                      setActive(-1);
                      window.setTimeout(() => input.current?.focus(), 0);
                    }}
                  >
                    Tags <span aria-hidden>▾</span>
                  </button>
                  {tagsOpen && (
                    <div
                      role="dialog"
                      aria-label="Tags on the selected questions"
                      className="absolute bottom-full left-1/2 mb-3 w-80 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 shadow-xl"
                    >
                      <p className="mb-2 text-[11px] tracking-wide text-muted uppercase">
                        Tags on the {n === 1 ? "selected question" : `${n} selected`}
                      </p>
                      <div className="mb-2.5 flex flex-wrap gap-1.5">
                        {onSelected.length === 0 && <span className="text-sm text-muted">No tags yet.</span>}
                        {onSelected.map((t) => {
                          const partial = t.count < n;
                          return (
                            <span
                              key={t.label}
                              className={`inline-flex items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 text-sm ${
                                partial ? "border border-dashed border-line text-muted" : "bg-accent-soft text-accent"
                              }`}
                            >
                              {t.label}
                              {partial && (
                                <span className="text-[11px] opacity-80">
                                  {t.count} of {n}
                                </span>
                              )}
                              <button
                                aria-label={`Remove tag ${t.label} from all selected questions`}
                                title="Remove from all selected"
                                className="size-5 rounded leading-none opacity-70 hover:bg-accent/15 hover:opacity-100"
                                onClick={() => void take(t.label)}
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                      <input
                        ref={input}
                        className="input"
                        aria-label="Add a tag to the selected questions"
                        placeholder={n === 1 ? "Add a tag…" : `Add a tag to all ${n}…`}
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          setActive(-1);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                            if (!rows.length) return;
                            e.preventDefault();
                            const step = e.key === "ArrowDown" ? 1 : -1;
                            setActive((a) =>
                              a < 0 ? (step === 1 ? 0 : rows.length - 1) : (a + step + rows.length) % rows.length,
                            );
                          } else if (e.key === "Enter") {
                            e.preventDefault();
                            void add(active >= 0 && rows[active] ? rows[active].text : draft);
                          }
                        }}
                      />
                      {rows.length > 0 && (
                        <div role="listbox" aria-label="Tag suggestions" className="mt-2 max-h-44 overflow-y-auto">
                          {rows.map((r, i) => (
                            <div
                              key={`${r.kind}-${r.text}`}
                              role="option"
                              aria-selected={i === active}
                              onMouseEnter={() => setActive(i)}
                              onClick={() => void add(r.text)}
                              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                                i === active ? "bg-accent-soft" : ""
                              }`}
                            >
                              {r.kind === "create" ? (
                                <span>
                                  Create tag <b className="font-semibold">&ldquo;{r.text}&rdquo;</b>
                                </span>
                              ) : (
                                <>
                                  <span className="min-w-0 truncate">{r.text}</span>
                                  <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">
                                    {r.count} {r.count === 1 ? "question" : "questions"}
                                  </span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <p aria-hidden className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                        <span>
                          <Kbd>Enter</Kbd> add to all
                        </span>
                        <span>
                          <Kbd>×</Kbd> remove from all
                        </span>
                        <span>
                          <Kbd>Esc</Kbd> close
                        </span>
                      </p>
                    </div>
                  )}
                </div>

                <div className="relative" data-bar-pop>
                  <button
                    aria-expanded={open === "source"}
                    aria-haspopup="dialog"
                    className={`${iconBtn} ${open === "source" ? "bg-accent-soft" : ""}`}
                    onClick={() => {
                      setOpen(open === "source" ? null : "source");
                      setSourceText("");
                    }}
                  >
                    Source <span aria-hidden>▾</span>
                  </button>
                  {open === "source" && (
                    <div role="dialog" aria-label="Source, for the selected questions" className={`${pop} w-[32rem]`}>
                      <p className="mb-2 text-[11px] tracking-wide text-muted uppercase">
                        Source, for the {n === 1 ? "selected question" : `${n} selected`}
                      </p>
                      <ReferenceInput id="selection-bar-source" value={sourceText} onChange={setSourceText} dropUp />
                      <button className="btn btn-primary mt-3" onClick={() => void applySource()}>
                        {sourceText.trim() ? `Set on ${n}` : `Remove the source from ${n}`}
                      </button>
                      <p className="mt-1.5 text-xs whitespace-normal text-muted">
                        A question that already has the chosen source keeps its own page.
                      </p>
                    </div>
                  )}
                </div>

                <span aria-hidden className="mx-1.5 h-5 w-px bg-line" />
                <button className={`${iconBtn} text-danger hover:bg-danger/10`} onClick={() => setAsking(true)}>
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}