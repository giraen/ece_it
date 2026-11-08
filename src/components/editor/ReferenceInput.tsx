"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  KIND_NAMES,
  SOURCE_KINDS,
  joinReference,
  sourceLabel,
  splitReference,
  useSourceUse,
  useSources,
  type Source,
} from "@/lib/sources";
import { hasWhere, pageOnly, whereForInput, whereFromInput } from "@/lib/where";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** The id of the field, so a label can point at it. */
  id: string;
  /** Opens the list above the field instead of below it, for a field at the bottom of the screen. */
  dropUp?: boolean;
}

/** The sources shown before anything is typed: the three used most in each kind. */
const PER_KIND = 3;
/** The most sources shown while typing. */
const MOST_SHOWN = 8;

const KIND_ORDER: Source["kind"][] = SOURCE_KINDS.map((k) => k.kind);

interface Row {
  source: Source;
}

/**
 * Where a question or note came from. A dropdown of the saved sources: the top three of each kind to start with, and
 * typing searches all of them. Sources are made and changed in Settings. A book also gets a Page box.
 */
export default function ReferenceInput({ value, onChange, id, dropUp = false }: Props) {
  const sources = useSources();
  const use = useSourceUse();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const all = sources ?? [];
    const used = (s: Source) => use?.get(s.id) ?? 0;
    const byUse = (a: Source, b: Source) => used(b) - used(a) || sourceLabel(a).localeCompare(sourceLabel(b));
    const hits = q ? all.filter((s) => sourceLabel(s).toLowerCase().includes(q)).sort(byUse) : all;
    const list: { kind: Source["kind"]; rows: Row[] }[] = [];
    let shown = 0;
    for (const kind of KIND_ORDER) {
      let rows = hits.filter((s) => s.kind === kind).sort(byUse);
      if (q) rows = rows.slice(0, Math.max(0, MOST_SHOWN - shown));
      else rows = rows.slice(0, PER_KIND);
      shown += rows.length;
      if (rows.length) list.push({ kind, rows: rows.map((source) => ({ source })) });
    }
    return list;
  }, [sources, use, q]);
  const flat = groups.flatMap((g) => g.rows);

  if (!sources) return null;
  const { source, where } = splitReference(value, sources);
  const typedByHand = !source && value.trim() !== "";
  const shownText = source ? sourceLabel(source) : value;

  function pick(s: Source) {
    onChange(joinReference(sourceLabel(s), s.id === source?.id ? where : ""));
    setOpen(false);
    setQuery("");
    setActive(-1);
  }

  if (sources.length === 0 && !value.trim()) {
    return (
      <p id={id} className="rounded-md border border-dashed border-line px-3 py-2 text-sm text-muted">
        No sources saved yet.{" "}
        <Link href="/settings/sources" className="underline">
          Add one in Settings
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="flex items-center gap-1">
          <input
            ref={input}
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
            className="input min-w-64 flex-1"
            autoComplete="off"
            placeholder={open && shownText ? shownText : "Pick a source"}
            value={open ? query : shownText}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              setQuery("");
              setActive(-1);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                if (!flat.length) return;
                e.preventDefault();
                setOpen(true);
                const step = e.key === "ArrowDown" ? 1 : -1;
                setActive((a) => (a < 0 ? (step === 1 ? 0 : flat.length - 1) : (a + step + flat.length) % flat.length));
              } else if (e.key === "Enter") {
                if (open && active >= 0 && flat[active]) {
                  e.preventDefault();
                  pick(flat[active].source);
                }
              } else if (e.key === "Escape" && open) {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                setQuery("");
              }
            }}
          />
          {value.trim() && (
            <button
              type="button"
              className="btn"
              aria-label="Clear the source"
              title="Clear the source"
              onClick={() => {
                onChange("");
                setQuery("");
              }}
            >
              ✕
            </button>
          )}
        </div>

        {open && (
          // Pressing inside the list must not take focus from the field, or it would close before the click lands.
          <div
            className={`absolute right-0 left-0 z-30 overflow-hidden rounded-lg border border-line bg-surface shadow-lg ${
              dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
            }`}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div id={listId} role="listbox" aria-label="Sources" className="max-h-72 overflow-y-auto py-1">
              {flat.length === 0 && <p className="px-3 py-2 text-sm text-muted">No source matches.</p>}
              {groups.map((g) => (
                <div key={g.kind} role="presentation">
                  <p className="px-3 pt-2 pb-1 text-[11px] tracking-wide text-muted uppercase">
                    {KIND_NAMES[g.kind].plural}
                  </p>
                  {g.rows.map(({ source: s }) => {
                    const i = flat.findIndex((r) => r.source.id === s.id);
                    return (
                      <div
                        key={s.id}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={s.id === source?.id}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => pick(s)}
                        className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
                          i === active ? "bg-accent-soft" : ""
                        }`}
                      >
                        <span className="min-w-0 truncate">{sourceLabel(s)}</span>
                        {s.id === source?.id && <span className="ml-auto text-xs text-accent">Selected</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {typedByHand && !open && <p className="text-xs text-muted">Typed by hand, not a saved source.</p>}

      {source && hasWhere(source.kind) && (
        <PageBox
          kind={source.kind}
          stored={where}
          onChange={(next) => onChange(joinReference(sourceLabel(source), next))}
        />
      )}
    </div>
  );
}

/** The page of a book. A bare number is a page, so 34 is saved as "p. 34" and shows as 34. */
function PageBox({
  kind,
  stored,
  onChange,
}: {
  kind: Source["kind"];
  stored: string;
  onChange: (stored: string) => void;
}) {
  const shown = whereForInput(kind, stored);
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  return (
    <div className="flex w-fit items-center overflow-hidden rounded-md border border-line bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
      <span className="border-r border-line bg-paper px-2 py-1 text-xs whitespace-nowrap text-muted">Page</span>
      <input
        className="w-44 bg-transparent px-2 py-1 text-sm outline-none"
        aria-label="Page"
        placeholder="34"
        value={focused ? text : shown}
        onFocus={() => {
          setText(shown);
          setFocused(true);
        }}
        onChange={(e) => {
          const typed = pageOnly(e.target.value);
          setText(typed);
          onChange(whereFromInput(kind, typed));
        }}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}