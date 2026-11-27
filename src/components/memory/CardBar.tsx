"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CardPlace, TreeNode } from "@/lib/db";
import { categoriesOf } from "@/lib/bank/tree";

export interface Toast {
  message: string;
  undo: () => Promise<void>;
}

/** A short message with Undo, shared by a page and its selection bar. */
export function useUndoToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const say = useCallback((message: string, undo: () => Promise<void>) => {
    window.clearTimeout(timer.current);
    setToast({ message, undo });
    timer.current = window.setTimeout(() => setToast(null), 7000);
  }, []);
  const dismiss = useCallback(() => setToast(null), []);
  return { toast, say, dismiss };
}

/** Undoes a change. */
type Undo = () => Promise<void>;

interface Props {
  /** The selected items in view, with their tags. */
  chosen: { id: string; tags: string[] }[];
  /** Tags to offer, most useful first. */
  suggestions: string[];
  /** How many items the list is showing, for "Select all". */
  visibleCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onAddTags: (ids: string[], tags: string[]) => Promise<Undo>;
  onRemoveTag: (ids: string[], tag: string) => Promise<Undo>;
  /** Delete (asks first) in the bank, or Discard (no asking: it can be undone) in Extract. */
  remove: { label: "Delete" | "Discard"; ask: boolean; run: (ids: string[]) => Promise<Undo> };
  /** Moving to a deck and subject. Left out where moving is done elsewhere. */
  move?: { nodes: TreeNode[]; run: (ids: string[], place: CardPlace) => Promise<Undo> };
  /** Joining the selected cards into one card with variants. `first` is the prompt of the card that is kept. */
  join?: { first: string; run: () => Promise<Undo> };
  toast: Toast | null;
  say: (message: string, undo: Undo) => void;
  dismiss: () => void;
}

const plural = (n: number) => `${n} card${n === 1 ? "" : "s"}`;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border border-b-2 border-line bg-surface px-1 font-sans">{children}</kbd>;
}

/**
 * The bar that floats at the bottom of a list of memory cards while some are selected, as it does for questions.
 * It changes their tags, moves them, or deletes or discards them. Each change can be undone from the message above it.
 */
export default function CardBar({
  chosen,
  suggestions,
  visibleCount,
  onSelectAll,
  onClear,
  onAddTags,
  onRemoveTag,
  remove,
  move,
  join,
  toast,
  say,
  dismiss,
}: Props) {
  const [open, setOpen] = useState<"tags" | "move" | "join" | null>(null);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(-1);
  const [deck, setDeck] = useState("");
  const [subject, setSubject] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  const n = chosen.length;
  const ids = chosen.map((c) => c.id);
  const shown = n > 0;

  // Tags on the selected items: how many of them carry each one.
  const onSelected = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const c of chosen)
      for (const t of new Set(c.tags)) {
        const k = t.toLowerCase();
        const cur = m.get(k);
        if (cur) cur.count += 1;
        else m.set(k, { label: t, count: 1 });
      }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [chosen]);

  // Suggestions that match what is typed and are not already on every selected item, then "Create tag".
  const rows = useMemo(() => {
    const q = draft.trim().toLowerCase();
    const onAll = new Set(onSelected.filter((t) => t.count === n).map((t) => t.label.toLowerCase()));
    const hits = suggestions
      .filter((t) => !onAll.has(t.toLowerCase()) && (!q || t.toLowerCase().includes(q)))
      .slice(0, q ? 8 : 5)
      .map((text) => ({ kind: "tag" as const, text }));
    const create = q && !suggestions.some((t) => same(t, q)) && !onAll.has(q);
    return create ? [...hits, { kind: "create" as const, text: draft.trim() }] : hits;
  }, [draft, suggestions, onSelected, n]);

  // With nothing selected there is nothing to act on, so panels and the question are reset right away.
  if (!shown && (open || asking || draft)) {
    setOpen(null);
    setAsking(false);
    setDraft("");
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
      if (open && !(e.target as HTMLElement).closest("[data-card-pop]")) setOpen(null);
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
    const undo = await onAddTags(ids, parts);
    setDraft("");
    setActive(-1);
    input.current?.focus();
    say(`Added “${parts.join(", ")}” to ${plural(n)}`, undo);
  }

  async function take(tag: string) {
    const undo = await onRemoveTag(ids, tag);
    say(`Removed “${tag}” from ${plural(n)}`, undo);
  }

  async function drop() {
    const count = n;
    const undo = await remove.run(ids);
    setAsking(false);
    onClear();
    say(`${plural(count)} ${remove.label === "Delete" ? "deleted" : "discarded"}`, undo);
  }

  async function moveTo() {
    if (!move || !deck) return;
    const undo = await move.run(ids, subject ? { categoryId: deck, subjectId: subject } : { categoryId: deck });
    setOpen(null);
    const name = (id: string) => move.nodes.find((x) => x.id === id)?.name ?? "";
    say(`Moved ${plural(n)} to ${subject ? `${name(deck)} › ${name(subject)}` : name(deck)}`, undo);
  }

  async function joinUp() {
    if (!join) return;
    const count = n;
    const undo = await join.run();
    setOpen(null);
    onClear();
    say(`${count} cards joined into one with ${count} variants`, undo);
  }

  const categories = (move?.nodes ?? [])
    .filter((x) => x.kind === "category" && !x.deletedAt)
    .sort((a, b) => a.order - b.order);
  const subjects = (move?.nodes ?? []).filter(
    (x) => x.kind === "subject" && !x.deletedAt && !!deck && categoriesOf(x).includes(deck),
  );

  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-accent-soft";
  const pop =
    "absolute bottom-full left-1/2 mb-3 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 whitespace-normal shadow-xl";

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
                    dismiss();
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
            aria-label="Selected cards"
            aria-hidden={!shown}
            inert={!shown}
            className={`flex items-center gap-1 rounded-xl border border-line bg-surface py-1.5 pr-2 pl-4 whitespace-nowrap shadow-xl transition-[opacity,transform,visibility] duration-200 ${
              shown ? "pointer-events-auto visible translate-y-0 opacity-100" : "invisible translate-y-4 opacity-0"
            }`}
          >
            {asking ? (
              <>
                <span className="mr-3 text-sm font-semibold">Delete {plural(n)}?</span>
                <button ref={cancel} className={btn} onClick={() => setAsking(false)}>
                  Cancel
                </button>
                <button
                  className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-paper hover:opacity-90"
                  onClick={() => void drop()}
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

                {move && (
                  <div className="relative" data-card-pop>
                    <button
                      aria-expanded={open === "move"}
                      aria-haspopup="dialog"
                      className={`${btn} ${open === "move" ? "bg-accent-soft" : ""}`}
                      onClick={() => {
                        setOpen(open === "move" ? null : "move");
                        setDeck("");
                        setSubject("");
                      }}
                    >
                      Deck <span aria-hidden>▾</span>
                    </button>
                    {open === "move" && (
                      <div role="dialog" aria-label="Deck for the selected cards" className={`${pop} w-80`}>
                        <p className="mb-2 text-[11px] tracking-wide text-muted uppercase">
                          Move the {n === 1 ? "selected card" : `${n} selected`} to
                        </p>
                        <div className="space-y-2">
                          <select
                            className="input"
                            aria-label="Deck"
                            value={deck}
                            onChange={(e) => {
                              setDeck(e.target.value);
                              setSubject("");
                            }}
                          >
                            <option value="">Choose a deck</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <select
                            className="input"
                            aria-label="Subject"
                            value={subject}
                            disabled={!deck}
                            onChange={(e) => setSubject(e.target.value)}
                          >
                            <option value="">No subject</option>
                            {subjects.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button className="btn btn-primary mt-3" disabled={!deck} onClick={() => void moveTo()}>
                          Move {n}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {join && n >= 2 && (
                  <div className="relative" data-card-pop>
                    <button
                      aria-expanded={open === "join"}
                      aria-haspopup="dialog"
                      className={`${btn} ${open === "join" ? "bg-accent-soft" : ""}`}
                      onClick={() => setOpen(open === "join" ? null : "join")}
                    >
                      Make variants
                    </button>
                    {open === "join" && (
                      <div role="dialog" aria-label="Make variants" className={`${pop} w-80 text-sm`}>
                        <p className="mb-1 text-[11px] tracking-wide text-muted uppercase">Join {n} cards into one</p>
                        <p>
                          They become variants of the first card you picked, which keeps its place, box and history:
                        </p>
                        <p className="my-2 line-clamp-2 rounded-md bg-paper px-2 py-1.5 font-medium">{join.first}</p>
                        <p className="text-xs text-muted">
                          The others are removed as cards, so their own progress no longer counts. Their tags join the
                          first card&apos;s.
                        </p>
                        <button className="btn btn-primary mt-3" onClick={() => void joinUp()}>
                          Make {n} variants
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="relative" data-card-pop>
                  <button
                    aria-expanded={open === "tags"}
                    aria-haspopup="dialog"
                    className={`${btn} ${open === "tags" ? "bg-accent-soft" : ""}`}
                    onClick={() => {
                      setOpen(open === "tags" ? null : "tags");
                      setDraft("");
                      setActive(-1);
                      window.setTimeout(() => input.current?.focus(), 0);
                    }}
                  >
                    Tags <span aria-hidden>▾</span>
                  </button>
                  {open === "tags" && (
                    <div role="dialog" aria-label="Tags on the selected cards" className={`${pop} w-80`}>
                      <p className="mb-2 text-[11px] tracking-wide text-muted uppercase">
                        Tags on the {n === 1 ? "selected card" : `${n} selected`}
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
                                aria-label={`Remove tag ${t.label} from all selected cards`}
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
                        aria-label="Add a tag to the selected cards"
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
                                <span className="min-w-0 truncate">{r.text}</span>
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

                <span aria-hidden className="mx-1.5 h-5 w-px bg-line" />
                <button
                  className={`${btn} text-danger hover:bg-danger/10`}
                  onClick={() => (remove.ask ? setAsking(true) : void drop())}
                >
                  {remove.label}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
