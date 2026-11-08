"use client";

import { useCallback, useContext, useLayoutEffect, useRef, useState } from "react";
import { storeImage } from "@/lib/images";
import { continueList, indentList, wrapSelection, type Edit } from "@/lib/mathEdit";
import MathToolbar from "./MathToolbar";
import { ToolbarGroupContext } from "./ToolbarGroup";

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  label: string;
}

function imagesFromItems(items: DataTransferItemList): File[] {
  const out: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}

function imagesFromFiles(files: FileList): File[] {
  return Array.from(files).filter((f) => f.type.startsWith("image/"));
}

/**
 * A text box that turns pasted, dropped, or chosen images into ![](img:id) at the cursor.
 * A toolbar floats above it while it is being used, to insert formatting and maths.
 * Inside a ToolbarGroup there is one shared toolbar at the top of the group instead.
 */
export default function ImageTextarea({ value, onChange, rows = 4, placeholder, label }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const group = useContext(ToolbarGroupContext);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Where the selection should go once the new text has been drawn.
  const pending = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    const sel = pending.current;
    const el = ref.current;
    if (!sel || !el) return;
    pending.current = null;
    el.focus();
    el.setSelectionRange(sel.start, sel.end);
  }, [value]);

  function apply(edit: Edit | null): boolean {
    const el = ref.current;
    if (!edit || !el) return false;
    if (edit.text === el.value) {
      el.setSelectionRange(edit.start, edit.end);
      return true;
    }
    pending.current = { start: edit.start, end: edit.end };
    onChange(edit.text);
    return true;
  }

  function run(action: (text: string, s: number, e: number) => Edit) {
    const el = ref.current;
    if (el) apply(action(el.value, el.selectionStart, el.selectionEnd));
  }

  // The shared toolbar calls this, so it always works on the latest text and the latest onChange.
  const latest = useRef(run);
  useLayoutEffect(() => {
    latest.current = run;
  });
  const forGroup = useCallback((action: (text: string, s: number, e: number) => Edit) => latest.current(action), []);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && !e.altKey && (e.key === "b" || e.key === "B")) {
      e.preventDefault();
      apply(wrapSelection(el.value, el.selectionStart, el.selectionEnd, "**", "**", "bold"));
    } else if (mod && !e.shiftKey && !e.altKey && (e.key === "i" || e.key === "I")) {
      e.preventDefault();
      apply(wrapSelection(el.value, el.selectionStart, el.selectionEnd, "*", "*", "italic"));
    } else if (e.key === "Enter" && !e.shiftKey && !mod && !e.altKey && !e.nativeEvent.isComposing) {
      if (el.selectionStart === el.selectionEnd && apply(continueList(el.value, el.selectionStart))) e.preventDefault();
    } else if (e.key === "Tab" && !mod && !e.altKey) {
      if (apply(indentList(el.value, el.selectionStart, el.selectionEnd, e.shiftKey))) e.preventDefault();
    }
  }

  async function insert(files: File[]) {
    const el = ref.current;
    if (!el || files.length === 0) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setBusy(true);
    setError(null);
    try {
      let md = "";
      for (const f of files) md += `![](img:${await storeImage(f)})`;
      const cur = el.value;
      onChange(cur.slice(0, start) + md + cur.slice(end));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group relative">
      {/* The toolbar floats above the box while it is in use. It must not push the page around,
          or a click on a button below would land on the wrong thing when the box loses focus. */}
      {!group && (
        <div className="absolute inset-x-0 bottom-full z-20 mb-1 hidden rounded-md border border-line bg-surface p-1 shadow-lg group-focus-within:block">
          <MathToolbar run={run} />
        </div>
      )}
      <textarea
        ref={ref}
        aria-label={label}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => group?.setActive(forGroup, label)}
        onPaste={(e) => {
          const files = imagesFromItems(e.clipboardData.items);
          if (files.length) {
            e.preventDefault();
            void insert(files);
          }
        }}
        onDrop={(e) => {
          const files = imagesFromFiles(e.dataTransfer.files);
          if (files.length) {
            e.preventDefault();
            void insert(files);
          }
        }}
        style={{ minHeight: `${rows * 1.25 + 1}rem` }}
        className="input resize-y font-mono"
      />
      <div className="mt-1 flex items-center gap-3 text-xs text-muted">
        <button
          type="button"
          className="underline underline-offset-2 hover:text-ink"
          onClick={() => picker.current?.click()}
        >
          Add image
        </button>
        <span>or paste or drop one here</span>
        {busy && <span>Saving image…</span>}
        {error && <span className="text-danger">{error}</span>}
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void insert(files);
          }}
        />
      </div>
    </div>
  );
}