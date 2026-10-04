"use client";

import { useId, useState } from "react";
import { normalizeTags } from "@/lib/questions";

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Tags already used in this topic. */
  suggestions: string[];
}

export default function TagInput({ value, onChange, suggestions }: Props) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function commit() {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange(normalizeTags([...value, ...parts]));
    setDraft("");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface p-1.5">
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
          list={listId}
          value={draft}
          aria-label="Add a tag"
          placeholder={value.length ? "" : "Type a tag, then press Enter"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={commit}
          className="min-w-40 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
        <datalist id={listId}>
          {suggestions
            .filter((s) => !value.includes(s))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
      </div>
    </div>
  );
}
