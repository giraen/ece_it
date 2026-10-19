"use client";

import { useEffect, useRef, useState } from "react";
import type { DraftQuestion, TreeNode } from "@/lib/db";
import { patchPasted, setPastedTopic } from "@/lib/extractStore";
import { joinReference, sourceLabel, splitReference, type Source } from "@/lib/sources";
import { bumpWhere, hasWhere, whereFromInput } from "@/lib/where";
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
  /** Questions are discarded by the page, so the cards can slide away first. */
  onDiscard: (ids: string[]) => void;
  onClear: () => void;
  /** Shows a message with an Undo button. */
  say: (message: string, undo: () => Promise<void>) => void;
  toast: Toast | null;
  onToastDone: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The bar that floats at the bottom of the review list while questions are selected.
 * It moves them, sets the page they came from in a book, marks priority and AI reword, or discards them.
 */
export default function ExtractBar({ chosen, sources, nodes, onDiscard, onClear, say, toast, onToastDone }: Props) {
  const [open, setOpen] = useState<"move" | "where" | null>(null);
  const [where, setWhere] = useState("");
  const [countUp, setCountUp] = useState(false);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const n = chosen.length;
  const shown = n > 0;
  const allPriority = shown && chosen.every((d) => d.priority);
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

  // With nothing selected there is nothing to act on, so a panel left open is closed right away.
  if (!shown && (open || where)) {
    setOpen(null);
    setWhere("");
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

  const togglePriority = () =>
    change(
      allPriority ? `Priority removed from ${plural(n, "question")}` : `${plural(n, "question")} marked priority`,
      chosen.map((d) => ({ id: d.id, patch: { priority: allPriority ? undefined : true } })),
      ["priority"],
    );
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
                      onChange={(e) => setWhere(e.target.value)}
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
              aria-pressed={allPriority}
              className={`${btn} ${allPriority ? "bg-priority-soft text-priority hover:bg-priority-solid/60" : ""}`}
              onClick={() => void togglePriority()}
            >
              {allPriority ? "★ Remove priority" : "☆ Priority"}
            </button>
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