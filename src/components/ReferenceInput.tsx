"use client";

import { useState } from "react";
import {
  SOURCE_KINDS,
  deleteSource,
  joinReference,
  saveSource,
  sourceLabel,
  splitReference,
  useSources,
} from "@/lib/sources";
import type { Source } from "@/lib/sources";

const NONE = "__none";
const TYPED = "__typed";
const NEW = "__new";

type Draft = Omit<Source, "id" | "createdAt"> & { id?: string };

const blank = (): Draft => ({ kind: "book", title: "", authors: "", edition: "", year: "", publisher: "", url: "" });

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** The id of the dropdown, so a label can point at it. */
  id: string;
}

/**
 * Where a question or note came from. Pick a saved source and type only the page or problem, or type a reference
 * by hand. A source is saved once and reused. The finished text is what gets stored on the question or note.
 */
export default function ReferenceInput({ value, onChange, id }: Props) {
  const sources = useSources();
  const [typed, setTyped] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!sources) return null;
  const { source, where } = splitReference(value, sources);
  const mode = typed ? TYPED : source ? source.id : value.trim() ? TYPED : NONE;

  function pick(next: string) {
    setError(null);
    if (next === NEW) {
      setEditing(blank());
    } else if (next === NONE) {
      setTyped(false);
      onChange("");
    } else if (next === TYPED) {
      setTyped(true);
    } else {
      const s = sources?.find((x) => x.id === next);
      if (s) {
        setTyped(false);
        onChange(sourceLabel(s));
      }
    }
  }

  async function save() {
    if (!editing) return;
    if (!editing.title.trim()) return setError("A source needs a title.");
    const wasLabelOf = editing.id ? sources?.find((s) => s.id === editing.id) : undefined;
    const saved = await saveSource(editing);
    setEditing(null);
    setError(null);
    // Pick the new source, or keep the one in use pointing at its new name.
    if (!wasLabelOf || (source && source.id === saved.id)) {
      const w = source && source.id === saved.id ? where : "";
      onChange(joinReference(sourceLabel(saved), w));
      setTyped(false);
    }
  }

  const field = "input w-full";
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setEditing((d) => (d ? { ...d, [k]: v } : d));
  const hint = SOURCE_KINDS.find((k) => k.kind === editing?.kind)?.where ?? "";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select id={id} className="input min-w-64 flex-1" value={mode} onChange={(e) => pick(e.target.value)}>
          <option value={NONE}>No source</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {sourceLabel(s)}
            </option>
          ))}
          <option value={TYPED}>Type it myself</option>
          <option value={NEW}>+ New source…</option>
        </select>
        {sources.length > 0 && (
          <button type="button" className="btn" onClick={() => setManaging((m) => !m)}>
            {managing ? "Done" : "Manage sources"}
          </button>
        )}
      </div>

      {source && (
        <input
          className="input w-full"
          aria-label="Where in the source"
          placeholder={`Where in it, such as ${SOURCE_KINDS.find((k) => k.kind === source.kind)?.where ?? "page 12"}`}
          value={where}
          onChange={(e) => onChange(joinReference(sourceLabel(source), e.target.value))}
        />
      )}

      {mode === TYPED && (
        <input
          className={field}
          aria-label="Reference text"
          placeholder="Gonzalez, Electronics Vol. 2, p. 143"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {managing && !editing && (
        <ul className="divide-y divide-line rounded-md border border-line bg-paper text-sm">
          {sources.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">{sourceLabel(s)}</span>
              <button
                type="button"
                className="btn py-1"
                aria-label={`Edit source ${sourceLabel(s)}`}
                onClick={() => setEditing({ ...s })}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn-danger py-1"
                aria-label={`Remove source ${sourceLabel(s)}`}
                onClick={() => {
                  if (
                    window.confirm("Remove this source from the list? Questions that already use it keep their text.")
                  )
                    void deleteSource(s.id);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div role="group" aria-label="Source details" className="space-y-2 rounded-md border border-line bg-paper p-3">
          <p className="text-sm font-medium">{editing.id ? "Edit source" : "New source"}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium">
              Kind
              <select
                className="input mt-1 w-full"
                value={editing.kind}
                onChange={(e) => set("kind", e.target.value as Source["kind"])}
              >
                {SOURCE_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              Title
              <input
                className="input mt-1 w-full"
                value={editing.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Electronics Vol. 2"
              />
            </label>
            <label className="text-xs font-medium">
              Author or authors
              <input
                className="input mt-1 w-full"
                value={editing.authors}
                onChange={(e) => set("authors", e.target.value)}
                placeholder="Gonzalez"
              />
            </label>
            <label className="text-xs font-medium">
              Edition
              <input
                className="input mt-1 w-full"
                value={editing.edition}
                onChange={(e) => set("edition", e.target.value)}
                placeholder="3rd ed."
              />
            </label>
            <label className="text-xs font-medium">
              Year
              <input
                className="input mt-1 w-full"
                value={editing.year}
                onChange={(e) => set("year", e.target.value)}
                placeholder="2019"
              />
            </label>
            <label className="text-xs font-medium">
              Publisher
              <input
                className="input mt-1 w-full"
                value={editing.publisher}
                onChange={(e) => set("publisher", e.target.value)}
                placeholder="Pearson"
              />
            </label>
          </div>
          <label className="block text-xs font-medium">
            Web address (optional)
            <input
              className="input mt-1 w-full"
              value={editing.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://"
            />
          </label>
          <p className="text-xs text-muted">
            Shows as: <span className="text-ink">{sourceLabel(editing) || "…"}</span>. You add the page or problem (
            {hint}) on each question.
          </p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void save()}>
              Save source
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditing(null);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}