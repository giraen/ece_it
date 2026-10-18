"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { normalizeTags } from "@/lib/questions";
import { tagSections, tagUsage, type TagRow, type TagUsage } from "@/lib/tagUsage";

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Tags to offer while typing, in the order to show them. */
  suggestions: string[];
  /** The topic being edited. When given, the empty panel splits into "Used on this topic" and "Everything else". */
  topicId?: string | null;
}

const EMPTY: TagUsage = { counts: new Map(), here: new Set() };

/** Puts the part of a tag that matches what was typed in bold. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <b className="font-semibold text-accent">{text.slice(at, at + query.length)}</b>
      {text.slice(at + query.length)}
    </>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded border border-b-2 border-line bg-surface px-1 font-sans">{children}</kbd>;
}

export default function TagInput({ value, onChange, suggestions, topicId }: Props) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const usage =
    useLiveQuery(
      async () => tagUsage(await db.questions.filter((q) => !q.deletedAt).toArray(), topicId ?? null),
      [topicId],
    ) ?? EMPTY;

  const sections = useMemo(
    () => tagSections({ suggestions, value, draft, usage, topicScoped: topicId !== undefined }),
    [suggestions, value, draft, usage, topicId],
  );
  const rows = useMemo(() => sections.flatMap((s) => s.rows), [sections]);
  const showPanel = open && rows.length > 0;
  const query = draft.trim().toLowerCase();
  const optionId = (i: number) => `${listId}-option-${i}`;

  // Keep the highlighted row in view while moving with the arrow keys.
  useEffect(() => {
    if (active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function commit() {
    const parts = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) onChange(normalizeTags([...value, ...parts]));
    setDraft("");
    setActive(-1);
  }

  function pick(row: TagRow) {
    onChange(normalizeTags([...value, row.text]));
    setDraft("");
    setActive(-1);
    input.current?.focus();
  }

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface p-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25"
        onClick={() => input.current?.focus()}
      >
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded bg-accent-soft px-2 py-0.5 text-sm text-accent"
          >
            {t}
            <button
              type="button"
              aria-label={`Remove tag ${t}`}
              className="text-accent/70 hover:text-accent"
              onClick={() => onChange(value.filter((x) => x !== t))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={input}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && active >= 0 ? optionId(active) : undefined}
          value={draft}
          aria-label="Add a tag"
          placeholder={value.length ? "" : "Type a tag, then press Enter"}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setDraft(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              if (rows.length === 0) return;
              e.preventDefault();
              setOpen(true);
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((a) => (a < 0 ? (step === 1 ? 0 : rows.length - 1) : (a + step + rows.length) % rows.length));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (showPanel && active >= 0 && rows[active]) pick(rows[active]);
              else commit();
            } else if (e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape" && showPanel) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setActive(-1);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => {
            commit();
            setOpen(false);
          }}
          className="min-w-40 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      </div>

      {showPanel && (
        // Pressing inside the panel must not take focus from the field, or the panel would close before the click lands.
        <div
          className="absolute top-full right-0 left-0 z-30 mt-1.5 overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div id={listId} role="listbox" aria-label="Tag suggestions" className="max-h-64 overflow-y-auto py-1">
            {sections.map((section, si) => {
              const start = sections.slice(0, si).reduce((n, s) => n + s.rows.length, 0);
              return (
                <div key={section.title || "create"} role="presentation">
                  {section.title && (
                    <p
                      className={`px-3 pt-2 pb-1 text-[11px] tracking-wide text-muted uppercase ${
                        si > 0 ? "mt-1 border-t border-line" : ""
                      }`}
                    >
                      {section.title}
                    </p>
                  )}
                  {section.rows.map((r, ri) => {
                    const i = start + ri;
                    return (
                      <div
                        key={`${r.kind}-${r.text}`}
                        id={optionId(i)}
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => pick(r)}
                        className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
                          i === active ? "bg-accent-soft" : ""
                        }`}
                      >
                        {r.kind === "create" ? (
                          <>
                            <span
                              aria-hidden
                              className="inline-flex size-[18px] items-center justify-center rounded border border-dashed border-accent text-xs leading-none text-accent"
                            >
                              +
                            </span>
                            <span>
                              Create tag <b className="font-semibold">&ldquo;{r.text}&rdquo;</b>
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="min-w-0 truncate">
                              <Highlight text={r.text} query={query} />
                            </span>
                            <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">
                              {r.count} {r.count === 1 ? "question" : "questions"}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div aria-hidden className="flex gap-3.5 border-t border-line bg-paper px-3 py-1.5 text-[11px] text-muted">
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> move
            </span>
            <span>
              <Kbd>Enter</Kbd> add
            </span>
            <span>
              <Kbd>Esc</Kbd> close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}