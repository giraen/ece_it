"use client";

import { useEffect, useRef, useState } from "react";
import { KIND_NAMES, SOURCE_KINDS, sourceLabel, splitReference, type Source } from "@/lib/bank/sources";

/** A question's source, for filtering: a saved source's id, a reference typed by hand, or none at all. */
export const NO_SOURCE = "none";
export const TYPED_SOURCE = "typed";

export function sourceKey(reference: string | undefined, sources: Source[]): string {
  if (!reference?.trim()) return NO_SOURCE;
  return splitReference(reference, sources).source?.id ?? TYPED_SOURCE;
}

/** One source in the list. */
function Row({
  k,
  text,
  n,
  title,
  value,
  onPick,
}: {
  k: string | null;
  text: string;
  n: number;
  title?: string;
  value: string | null;
  onPick: (k: string | null) => void;
}) {
  const on = (value ?? null) === k;
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      title={title ?? text}
      disabled={n === 0 && !on}
      onClick={() => onPick(k)}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-40 ${
        on ? "bg-accent-soft text-accent" : "hover:bg-paper"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <span className="num text-xs text-muted">{n}</span>
    </button>
  );
}

interface Props {
  sources: Source[];
  /** How many questions in view come from each source key. */
  counts: Map<string, number>;
  /** All the questions in view, for "All sources". */
  total: number;
  value: string | null;
  onChange: (key: string | null) => void;
}

/** The bank's source filter: a button that opens a list of sources, grouped by kind, to find and pick one. */
export default function SourceFilter({ sources, counts, total, value, onChange }: Props) {
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

  const label = (s: Source) => sourceLabel(s) || s.title;
  const chosen = value ? sources.find((s) => s.id === value) : undefined;
  const current =
    value === NO_SOURCE
      ? "No source"
      : value === TYPED_SOURCE
        ? "Typed references"
        : chosen
          ? label(chosen)
          : "All sources";

  const q = find.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);
  const pick = (key: string | null) => {
    onChange(key);
    setOpen(false);
    setFind("");
  };

  const groups = SOURCE_KINDS.map((k) => ({
    kind: k.kind,
    title: KIND_NAMES[k.kind].plural,
    list: sources
      .filter((s) => s.kind === k.kind && matches(label(s)))
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || label(a).localeCompare(label(b))),
  })).filter((g) => g.list.length > 0);
  const typed = counts.get(TYPED_SOURCE) ?? 0;
  const none = counts.get(NO_SOURCE) ?? 0;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="text-sm text-muted">Source</span>
      <div ref={box} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`btn max-w-[22rem] py-1 ${value ? "border-accent bg-accent-soft text-accent" : ""}`}
        >
          <span className="truncate">{current}</span> <span aria-hidden>▾</span>
        </button>
        {open && (
          <div className="absolute top-full left-0 z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-3 shadow-xl">
            <input
              ref={input}
              className="input mb-2 py-1.5 text-sm"
              placeholder="Find a source…"
              aria-label="Find a source"
              value={find}
              onChange={(e) => setFind(e.target.value)}
            />
            <div role="listbox" aria-label="Sources" className="scroll-thin max-h-80 space-y-2 overflow-y-auto">
              {!q && <Row value={value} onPick={pick} k={null} text="All sources" n={total} />}
              {groups.map((g) => (
                <div key={g.kind}>
                  <p className="px-2 pt-1 text-[11px] tracking-wide text-muted uppercase">{g.title}</p>
                  {g.list.map((s) => (
                    <Row key={s.id} value={value} onPick={pick} k={s.id} text={label(s)} n={counts.get(s.id) ?? 0} />
                  ))}
                </div>
              ))}
              {q && groups.length === 0 && <p className="px-2 py-1 text-sm text-muted">No source matches.</p>}
              {!q && (typed > 0 || none > 0) && (
                <div className="border-t border-line pt-2">
                  {typed > 0 && (
                    <Row
                      value={value}
                      onPick={pick}
                      k={TYPED_SOURCE}
                      text="Typed references"
                      n={typed}
                      title="References typed by hand that are not one of your saved sources"
                    />
                  )}
                  <Row value={value} onPick={pick} k={NO_SOURCE} text="No source" n={none} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {value && (
        <button type="button" className="text-sm underline underline-offset-2" onClick={() => pick(null)}>
          Clear source
        </button>
      )}
    </div>
  );
}
