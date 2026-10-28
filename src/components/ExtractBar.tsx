"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DraftQuestion, Question, TreeNode } from "@/lib/db";
import { patchPasted, setPastedTopic } from "@/lib/extractStore";
import { normalizeTags } from "@/lib/questions";
import { joinReference, sourceLabel, splitReference, type Source } from "@/lib/sources";
import { tagSections, tagUsage } from "@/lib/tagUsage";
import { bumpWhere, hasWhere, pageOnly, whereFromInput } from "@/lib/where";
import ReferenceInput from "./ReferenceInput";
import TopicPicker from "./TopicPicker";

export interface Toast {
  message: string;
  undo: () => Promise<void>;
}

interface Props {
  /** The selected questions that are still waiting. */
  chosen: DraftQuestion[];
  sources: Source[];
  nodes: TreeNode[];
  /** Every question in the bank, so tag suggestions can show how much each tag is used. */
  questions: Question[];
  /** Questions are discarded by the page, so the cards can slide away first. */
  onDiscard: (ids: string[]) => void;
  onClear: () => void;
  /** Shows a message with an Undo button. */
  say: (message: string, undo: () => Promise<void>) => void;
  toast: Toast | null;
  onToastDone: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border border-b-2 border-line bg-surface px-1 font-sans">{children}</kbd>;
}

/**
 * The bar that floats at the bottom of the review list while questions are selected.
 * It moves them, changes their tags or source, sets the page they came from in a book, marks AI reword, or
 * discards them.
 */
export default function ExtractBar({
  chosen,
  sources,
  nodes,
  questions,
  onDiscard,
  onClear,
  say,
  toast,
  onToastDone,
}: Props) {
  const [open, setOpen] = useState<"move" | "where" | "tags" | "source" | null>(null);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(-1);
  const [sourceText, setSourceText] = useState("");
  const [where, setWhere] = useState("");
  const [countUp, setCountUp] = useState(false);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const tagField = useRef<HTMLInputElement>(null);

  const n = chosen.length;
  const shown = n > 0;
  const allAi = shown && chosen.every((d) => d.allowAi);

  // Only a question from a saved book has a page to set.
  const withSource = chosen.flatMap((d) => {
    const { source } = splitReference(d.reference ?? "", sources);
    return source && hasWhere(source.kind) ? [{ d, source }] : [];
  });
  const text = where.trim();
  const preview = countUp
    ? withSource
        .slice(0, 3)
        .map((_, k) => bumpWhere(text, k))
        .join("  ·  ") + (withSource.length > 3 ? "  …" : "")
    : `Each gets “${text}”.`;

  // Tags on the selected questions: how many of them carry each one.
  const onSelected = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const d of chosen) {
      for (const t of new Set(normalizeTags(d.tags ?? []))) {
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

  // With nothing selected there is nothing to act on, so a panel left open is closed right away.
  if (!shown && (open || where || draft || sourceText)) {
    setOpen(null);
    setWhere("");
    setDraft("");
    setSourceText("");
  }

  useEffect(() => {
    if (!shown) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      const typingElsewhere =
        !!el &&
        ((el instanceof HTMLInputElement && !/^(checkbox|radio|button)$/.test(el.type)) ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT") &&
        !root.current?.contains(el);
      if (typingElsewhere) return;
      if (open) setOpen(null);
      else onClear();
    }
    function onDown(e: MouseEvent) {
      if (open && !(e.target as HTMLElement).closest("[data-extract-pop]")) setOpen(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [shown, open, onClear]);

  /** Applies a change to every selected question, and offers to undo it. */
  async function change(
    message: string,
    items: { id: string; patch: Partial<DraftQuestion> }[],
    keys: (keyof DraftQuestion)[],
  ) {
    const before = items.map(({ id }) => {
      const d = chosen.find((x) => x.id === id)!;
      return { id, patch: Object.fromEntries(keys.map((k) => [k, d[k]])) as Partial<DraftQuestion> };
    });
    await patchPasted(items);
    say(message, () => patchPasted(before));
  }

  async function addTags(text: string) {
    const parts = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setDraft("");
    setActive(-1);
    tagField.current?.focus();
    await change(
      `Added “${parts.join(", ")}” to ${plural(n, "question")}`,
      chosen.map((d) => ({ id: d.id, patch: { tags: normalizeTags([...(d.tags ?? []), ...parts]) } })),
      ["tags"],
    );
  }

  const takeTag = (tag: string) =>
    change(
      `Removed “${tag}” from ${plural(n, "question")}`,
      chosen.map((d) => ({ id: d.id, patch: { tags: (d.tags ?? []).filter((t) => !same(t, tag)) } })),
      ["tags"],
    );

  async function applySource() {
    const text = sourceText.trim();
    const { source: next, where: nextWhere } = splitReference(text, sources);
    const items = chosen.map((d) => {
      // Choosing the source a question already has keeps its own page.
      const cur = splitReference(d.reference ?? "", sources);
      const keep = next && !nextWhere && cur.source?.id === next.id ? cur.where : nextWhere;
      return { id: d.id, patch: { reference: next ? joinReference(sourceLabel(next), keep) : text || undefined } };
    });
    setOpen(null);
    setSourceText("");
    await change(
      text ? `Set the source on ${plural(n, "question")}` : `Source removed from ${plural(n, "question")}`,
      items,
      ["reference"],
    );
  }

  const toggleAi = () =>
    change(
      allAi ? `AI reword turned off for ${plural(n, "question")}` : `AI reword turned on for ${plural(n, "question")}`,
      chosen.map((d) => ({ id: d.id, patch: { allowAi: allAi ? undefined : true } })),
      ["allowAi"],
    );

  async function applyWhere() {
    if (!text || withSource.length === 0) return;
    const items = withSource.map(({ d, source }, k) => ({
      id: d.id,
      patch: {
        reference: joinReference(sourceLabel(source), whereFromInput(source.kind, countUp ? bumpWhere(text, k) : text)),
      },
    }));
    setOpen(null);
    setWhere("");
    await change(`Set the page on ${plural(items.length, "question")}`, items, ["reference"]);
  }

  async function move() {
    if (!moveTo) return;
    const ids = chosen.map((d) => d.id);
    const before = chosen.map((d) => ({ id: d.id, topicId: d.topicId, proposedTopic: d.proposedTopic }));
    await setPastedTopic(ids, moveTo);
    setOpen(null);
    setMoveTo(null);
    say(`Moved ${plural(ids.length, "question")}`, () =>
      patchPasted(before.map(({ id, ...patch }) => ({ id, patch }))),
    );
  }

  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-accent-soft";
  const pop =
    "absolute bottom-full left-1/2 mb-3 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 shadow-xl";

  return (
    <>
      {shown && <div aria-hidden className="h-20" />}
      <div className="pointer-events-none sticky bottom-4 z-30 h-0">
        <div ref={root} className="absolute bottom-0 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
          <div role="status" aria-live="polite" className="pointer-events-auto">
            {toast && !open && (
              <div className="flex items-center gap-3 rounded-lg bg-ink py-2 pr-2 pl-4 text-sm whitespace-nowrap text-paper shadow-lg">
                <span>{toast.message}</span>
                <button
                  className="rounded px-2 py-0.5 font-semibold underline underline-offset-2 hover:bg-paper/15"
                  onClick={async () => {
                    const undo = toast.undo;
                    onToastDone();
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
            <span className="min-w-[5.5rem] text-sm font-semibold">{n} selected</span>
            <button
              aria-label="Clear selection"
              title="Clear selection (Esc)"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-accent-soft hover:text-ink"
              onClick={onClear}
            >
              ✕
            </button>
            <span aria-hidden className="mx-1.5 h-5 w-px bg-line" />

            <div className="relative" data-extract-pop>
              <button
                aria-expanded={open === "move"}
                aria-haspopup="dialog"
                className={`${btn} ${open === "move" ? "bg-accent-soft" : ""}`}
                onClick={() => setOpen(open === "move" ? null : "move")}
              >
                Move <span aria-hidden>▾</span>
              </button>
              {open === "move" && (
                <div role="dialog" aria-label="Move the selected questions" className={`${pop} w-[32rem]`}>
                  <p className="mb-2 text-[11px] tracking-wide text-muted uppercase">Move the {n} selected to</p>
                  <TopicPicker nodes={nodes} value={moveTo} onChange={setMoveTo} />
                  <button className="btn btn-primary mt-3" disabled={!moveTo} onClick={() => void move()}>
                    Move {n}
                  </button>
                </div>
              )}
            </div>

            <div className="relative" data-extract-pop>
              <button
                aria-expanded={open === "tags"}
                aria-haspopup="dialog"
                className={`${btn} ${open === "tags" ? "bg-accent-soft" : ""}`}
                onClick={() => {
                  setOpen(open === "tags" ? null : "tags");
                  setDraft("");
                  setActive(-1);
                  window.setTimeout(() => tagField.current?.focus(), 0);
                }}
              >
                Tags <span aria-hidden>▾</span>
              </button>
              {open === "tags" && (
                <div role="dialog" aria-label="Tags on the selected questions" className={`${pop} w-80`}>
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
                            onClick={() => void takeTag(t.label)}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  <input
                    ref={tagField}
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
                        void addTags(active >= 0 && rows[active] ? rows[active].text : draft);
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
                          onClick={() => void addTags(r.text)}
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

            <div className="relative" data-extract-pop>
              <button
                aria-expanded={open === "source"}
                aria-haspopup="dialog"
                className={`${btn} ${open === "source" ? "bg-accent-soft" : ""}`}
                onClick={() => {
                  setOpen(open === "source" ? null : "source");
                  setSourceText("");
                }}
              >
                Source <span aria-hidden>▾</span>
              </button>
              {open === "source" && (
                <div role="dialog" aria-label="Source, for the selected questions" className={`${pop} w-[32rem]`}>
                  <p className="mb-2 text-[11px] tracking-wide text-muted uppercase">Source, for the {n} selected</p>
                  <ReferenceInput id="extract-bar-source" value={sourceText} onChange={setSourceText} dropUp />
                  <button className="btn btn-primary mt-3" onClick={() => void applySource()}>
                    {sourceText.trim() ? `Set on ${n}` : `Remove the source from ${n}`}
                  </button>
                  <p className="mt-1.5 text-xs text-muted">
                    A question that already has the chosen source keeps its own page.
                  </p>
                </div>
              )}
            </div>

            <div className="relative" data-extract-pop>
              <button
                aria-expanded={open === "where"}
                aria-haspopup="dialog"
                className={`${btn} ${open === "where" ? "bg-accent-soft" : ""}`}
                onClick={() => {
                  setOpen(open === "where" ? null : "where");
                  window.setTimeout(() => field.current?.focus(), 0);
                }}
              >
                Page <span aria-hidden>▾</span>
              </button>
              {open === "where" && (
                <div role="dialog" aria-label="Page, for the selected questions" className={`${pop} w-80`}>
                  <p className="mb-2 text-[11px] tracking-wide text-muted uppercase">
                    Page, for {withSource.length === n ? `the ${n}` : `${withSource.length} of the ${n}`} selected
                  </p>
                  <div className="flex gap-2">
                    <input
                      ref={field}
                      className="input"
                      aria-label="Page, for the selected questions"
                      placeholder="143"
                      value={where}
                      onChange={(e) => setWhere(pageOnly(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void applyWhere();
                        }
                      }}
                    />
                    <button
                      className="btn btn-primary"
                      disabled={!text || withSource.length === 0}
                      onClick={() => void applyWhere()}
                    >
                      Set
                    </button>
                  </div>
                  <label className="mt-2.5 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={countUp} onChange={(e) => setCountUp(e.target.checked)} />
                    Count up the first number for each next question
                  </label>
                  <p className="mt-1.5 text-xs text-muted">
                    {withSource.length === 0
                      ? "None of these is from a saved book, so there is no page to set."
                      : text
                        ? preview
                        : "Questions that are not from a saved book are skipped."}
                  </p>
                </div>
              )}
            </div>

            <button
              aria-pressed={allAi}
              className={`${btn} ${allAi ? "bg-accent-soft text-accent" : ""}`}
              onClick={() => void toggleAi()}
            >
              {allAi ? "✦ Remove AI reword" : "✦ AI reword"}
            </button>

            <span aria-hidden className="mx-1.5 h-5 w-px bg-line" />
            <button
              className={`${btn} text-danger hover:bg-danger/10`}
              onClick={() => onDiscard(chosen.map((d) => d.id))}
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    </>
  );
}