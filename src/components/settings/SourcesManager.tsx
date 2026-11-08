"use client";

import { useMemo, useState } from "react";
import {
  KIND_NAMES,
  SOURCE_KINDS,
  deleteSource,
  mergeSource,
  saveSourceEverywhere,
  sourceLabel,
  useSourceUse,
  useSources,
  type Source,
} from "@/lib/sources";

type Draft = Omit<Source, "id" | "createdAt"> & { id?: string };
type Kind = Source["kind"];

const blank = (): Draft => ({ kind: "book", title: "", authors: "", edition: "", year: "", publisher: "", url: "" });

/** What each kind asks for. The stored record is the same for all of them. */
const FIELDS: Record<
  Kind,
  { key: "title" | "authors" | "edition" | "url"; label: string; placeholder: string; required?: boolean }[]
> = {
  quiz: [{ key: "title", label: "Quiz name", placeholder: "Calculus 1, Quiz 2", required: true }],
  book: [
    { key: "authors", label: "Author or authors", placeholder: "Gonzalez" },
    { key: "title", label: "Title", placeholder: "Electronics Vol. 2", required: true },
    { key: "edition", label: "Edition", placeholder: "2nd ed." },
  ],
  website: [
    { key: "title", label: "Website name", placeholder: "Khan Academy", required: true },
    { key: "url", label: "Link", placeholder: "https://", required: true },
  ],
  video: [
    { key: "title", label: "Video title", placeholder: "Introduction to conic sections", required: true },
    { key: "authors", label: "YouTube channel", placeholder: "Organic Chemistry Tutor" },
    { key: "url", label: "Link", placeholder: "https://", required: true },
  ],
  other: [
    { key: "title", label: "Name", placeholder: "Review notes, lecture handout", required: true },
    { key: "authors", label: "Made by", placeholder: "Prof. Reyes" },
    { key: "url", label: "Link (optional)", placeholder: "https://" },
  ],
};

function SourceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Draft;
  onSave: (d: Draft) => Promise<void>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = FIELDS[d.kind];

  async function save() {
    const missing = fields.find((f) => f.required && !d[f.key].trim());
    if (missing) return setError(`Fill in the ${missing.label.toLowerCase()}.`);
    setBusy(true);
    try {
      await onSave({
        ...d,
        title: d.title.trim(),
        authors: d.authors.trim(),
        edition: d.edition.trim(),
        url: d.url.trim(),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="group" aria-label="Source details" className="space-y-3 rounded-md border border-line bg-paper p-3">
      <p className="text-sm font-medium">{initial.id ? "Edit source" : "New source"}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kind of source">
        {SOURCE_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            aria-pressed={d.kind === k.kind}
            className={`rounded-full border px-3 py-1 text-sm ${
              d.kind === k.kind
                ? "border-accent bg-accent-soft font-medium text-accent"
                : "border-line text-muted hover:bg-surface"
            }`}
            onClick={() => {
              setD((cur) => ({ ...cur, kind: k.kind }));
              setError(null);
            }}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className={`text-xs font-medium ${f.key === "url" ? "sm:col-span-2" : ""}`}>
            {f.label}
            <input
              className="input mt-1 w-full"
              value={d[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => setD((cur) => ({ ...cur, [f.key]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">
        Shows as: <span className="text-ink">{sourceLabel(d) || "…"}</span>
      </p>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          Save source
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The saved sources: add, change, remove, or merge one into another. */
export default function SourcesManager() {
  const sources = useSources();
  const use = useSourceUse();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [mergeInto, setMergeInto] = useState("");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all");
  const [message, setMessage] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const list = useMemo(() => {
    const all = sources ?? [];
    return all
      .filter(
        (s) => (kindFilter === "all" || s.kind === kindFilter) && (!q || sourceLabel(s).toLowerCase().includes(q)),
      )
      .sort((a, b) => sourceLabel(a).localeCompare(sourceLabel(b)));
  }, [sources, q, kindFilter]);

  if (!sources || !use) return null;
  const kindsPresent = (["all", ...SOURCE_KINDS.map((k) => k.kind)] as const).filter(
    (k) => k === "all" || sources.some((s) => s.kind === k),
  );

  async function save(d: Draft) {
    const { changed } = await saveSourceEverywhere(d);
    setEditing(null);
    setMessage(
      changed > 0 ? `Saved. ${changed} question${changed === 1 ? "" : "s"} and notes now use the new name.` : "Saved.",
    );
  }

  const removingSource = sources.find((s) => s.id === removing);
  const removingUse = removingSource ? (use.get(removingSource.id) ?? 0) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input w-64"
          aria-label="Search sources"
          placeholder="Search sources"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {kindsPresent.length > 2 &&
          kindsPresent.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kindFilter === k}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                kindFilter === k ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
              }`}
              onClick={() => setKindFilter(k)}
            >
              {k === "all" ? "All" : KIND_NAMES[k].plural}
            </button>
          ))}
        <button
          type="button"
          className="btn btn-primary ml-auto"
          onClick={() => {
            setEditing(blank());
            setMessage(null);
          }}
        >
          New source
        </button>
      </div>

      {editing && (
        <SourceForm key={editing.id ?? "new"} initial={editing} onSave={save} onCancel={() => setEditing(null)} />
      )}

      {message && (
        <p role="status" className="text-sm text-good">
          {message}
        </p>
      )}

      {sources.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted">
          No sources yet. Add a past quiz, a book, a website, a video, or anything else like notes, then pick it when
          you add questions.
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">No source matches.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface text-sm">
          {list.map((s) => {
            const n = use.get(s.id) ?? 0;
            return (
              <li key={s.id} className="space-y-2 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">
                    {KIND_NAMES[s.kind].label}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{sourceLabel(s)}</span>
                  <span className="text-xs whitespace-nowrap text-muted">
                    {n} question{n === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    className="btn py-1"
                    aria-label={`Edit source ${sourceLabel(s)}`}
                    onClick={() => {
                      setEditing({ ...s });
                      setRemoving(null);
                      setMessage(null);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger py-1"
                    aria-label={`Remove source ${sourceLabel(s)}`}
                    onClick={() => {
                      setRemoving(removing === s.id ? null : s.id);
                      setMergeInto("");
                      setMessage(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
                {removing === s.id && (
                  <div className="space-y-2 rounded-md border border-line bg-paper p-3">
                    <p>
                      {removingUse > 0
                        ? `${removingUse} question${removingUse === 1 ? "" : "s"} use this source. You can keep their text as it is, or move them to another source.`
                        : "Nothing uses this source."}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-danger py-1"
                        onClick={async () => {
                          await deleteSource(s.id);
                          setRemoving(null);
                          setMessage("Removed. Questions that used it keep their text.");
                        }}
                      >
                        {removingUse > 0 ? "Remove and keep their text" : "Remove"}
                      </button>
                      {removingUse > 0 && sources.length > 1 && (
                        <>
                          <select
                            className="input w-72"
                            aria-label="Move the questions to"
                            value={mergeInto}
                            onChange={(e) => setMergeInto(e.target.value)}
                          >
                            <option value="">Move them to…</option>
                            {sources
                              .filter((o) => o.id !== s.id)
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {sourceLabel(o)}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            className="btn py-1"
                            disabled={!mergeInto}
                            onClick={async () => {
                              const moved = await mergeSource(s.id, mergeInto);
                              setRemoving(null);
                              setMessage(`Moved ${moved} question${moved === 1 ? "" : "s"} and removed the source.`);
                            }}
                          >
                            Move and remove
                          </button>
                        </>
                      )}
                      <button type="button" className="btn py-1" onClick={() => setRemoving(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}