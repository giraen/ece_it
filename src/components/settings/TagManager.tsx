"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  deleteTagEverywhere,
  renameTagEverywhere,
  restoreTags,
  tagStats,
  type TagSnapshot,
  type TagStat,
} from "@/lib/tagAdmin";

type Sort = "most" | "least" | "name";

const SORTS: { id: Sort; label: string }[] = [
  { id: "most", label: "Most used" },
  { id: "least", label: "Least used" },
  { id: "name", label: "Name" },
];

/** Tags are shown this many at a time, so a very large list stays quick. */
const STEP = 40;

const used = (t: TagStat) => t.questions + t.notes;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Every tag in the bank: rename one everywhere, merge two, or take one off everything. */
export default function TagManager() {
  const stats = useLiveQuery(async () => {
    const [questions, notes] = await Promise.all([
      db.questions.filter((q) => !q.deletedAt).toArray(),
      db.concepts.filter((c) => !c.deletedAt).toArray(),
    ]);
    return tagStats(questions, notes);
  }, []);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [limit, setLimit] = useState(STEP);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; undo: TagSnapshot[] } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const q = search.trim().toLowerCase();
  const list = useMemo(() => {
    const all = (stats ?? []).filter((t) => !q || t.key.includes(q));
    const by: Record<Sort, (a: TagStat, b: TagStat) => number> = {
      most: (a, b) => used(b) - used(a) || a.label.localeCompare(b.label),
      least: (a, b) => used(a) - used(b) || a.label.localeCompare(b.label),
      name: (a, b) => a.label.localeCompare(b.label),
    };
    return all.sort(by[sort]);
  }, [stats, q, sort]);

  if (!stats) return null;
  const keys = new Set(stats.map((t) => t.key));
  const mixed = stats.filter((t) => t.spellings.length > 1);

  function say(message: string, undo: TagSnapshot[]) {
    window.clearTimeout(timer.current);
    setToast({ message, undo });
    timer.current = window.setTimeout(() => setToast(null), 8000);
  }

  async function rename(t: TagStat, to: string) {
    const target = to.trim();
    // The same name is only a change when it unifies different capital letters.
    if (!target || (target === t.label && t.spellings.length === 1)) {
      setRenaming(null);
      return;
    }
    const merged = keys.has(target.toLowerCase()) && target.toLowerCase() !== t.key;
    const before = await renameTagEverywhere(t.key, target);
    setRenaming(null);
    say(
      target === t.label
        ? `Now “${target}” everywhere`
        : merged
          ? `Merged “${t.label}” into “${target}”`
          : `Renamed “${t.label}” to “${target}”`,
      before,
    );
  }

  async function remove(t: TagStat) {
    const before = await deleteTagEverywhere(t.key);
    setDeleting(null);
    say(`Removed “${t.label}” from ${plural(before.length, "item")}`, before);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input w-64"
          aria-label="Search tags"
          placeholder="Search tags"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(STEP);
          }}
        />
        <div role="group" aria-label="Sort tags" className="inline-flex overflow-hidden rounded-md border border-line">
          {SORTS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={sort === s.id}
              onClick={() => setSort(s.id)}
              className={`px-3 py-1 text-sm ${i > 0 ? "border-l border-line" : ""} ${
                sort === s.id ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-paper"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-muted">{plural(stats.length, "tag")}</span>
      </div>

      {mixed.length > 0 && (
        <div className="rounded-md border border-line bg-paper p-3 text-sm">
          <p className="font-medium">Same tag, different capital letters</p>
          <ul className="mt-2 space-y-1.5">
            {mixed.map((t) => (
              <li key={t.key} className="flex flex-wrap items-center gap-2">
                <span className="text-muted">{t.spellings.join(", ")}</span>
                <button type="button" className="btn py-1" onClick={() => void rename(t, t.label)}>
                  Use “{t.label}” everywhere
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {list.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted">
          {stats.length === 0 ? "No tags yet. A tag appears here once a question has it." : "No tag matches."}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface text-sm">
          {list.slice(0, limit).map((t) => (
            <li key={t.key} className="space-y-2 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-accent-soft px-2 py-0.5 text-accent">{t.label}</span>
                <span className="min-w-0 flex-1 text-xs text-muted">
                  {plural(t.questions, "question")}
                  {t.notes > 0 && `, ${plural(t.notes, "note")}`}
                  {t.topics > 0 && ` · ${plural(t.topics, "topic")}`}
                </span>
                <button
                  type="button"
                  className="btn py-1"
                  aria-label={`Rename tag ${t.label}`}
                  onClick={() => {
                    setRenaming(renaming === t.key ? null : t.key);
                    setName(t.label);
                    setDeleting(null);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="btn btn-danger py-1"
                  aria-label={`Delete tag ${t.label}`}
                  onClick={() => {
                    setDeleting(deleting === t.key ? null : t.key);
                    setRenaming(null);
                  }}
                >
                  Delete
                </button>
              </div>
              {renaming === t.key && (
                <div className="space-y-1.5 rounded-md border border-line bg-paper p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      autoFocus
                      className="input w-64"
                      aria-label={`New name for ${t.label}`}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void rename(t, name);
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                    <button type="button" className="btn btn-primary py-1" onClick={() => void rename(t, name)}>
                      Rename
                    </button>
                    <button type="button" className="btn py-1" onClick={() => setRenaming(null)}>
                      Cancel
                    </button>
                  </div>
                  {name.trim() && name.trim().toLowerCase() !== t.key && keys.has(name.trim().toLowerCase()) && (
                    <p className="text-xs text-muted">That tag already exists, so the two will become one.</p>
                  )}
                </div>
              )}
              {deleting === t.key && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-paper p-3">
                  <p className="mr-2">
                    Take “{t.label}” off {plural(used(t), "question or note")}? The questions stay.
                  </p>
                  <button type="button" className="btn btn-danger py-1" onClick={() => void remove(t)}>
                    Delete tag
                  </button>
                  <button type="button" className="btn py-1" onClick={() => setDeleting(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {list.length > limit && (
        <button type="button" className="btn" onClick={() => setLimit((n) => n + STEP)}>
          Show {Math.min(STEP, list.length - limit)} more
        </button>
      )}

      <div role="status" aria-live="polite" className="min-h-9">
        {toast && (
          <div className="inline-flex items-center gap-3 rounded-lg bg-ink py-2 pr-2 pl-4 text-sm text-paper shadow-lg">
            <span>{toast.message}</span>
            <button
              className="rounded px-2 py-0.5 font-semibold underline underline-offset-2 hover:bg-paper/15"
              onClick={async () => {
                const undo = toast.undo;
                setToast(null);
                await restoreTags(undo);
              }}
            >
              Undo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}