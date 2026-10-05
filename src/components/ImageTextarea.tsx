"use client";

import { useRef, useState } from "react";
import { storeImage } from "@/lib/images";

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

/** A text box that turns pasted, dropped, or chosen images into ![](img:id) at the cursor. */
export default function ImageTextarea({ value, onChange, rows = 4, placeholder, label }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div>
      <textarea
        ref={ref}
        aria-label={label}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
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
        className="input font-mono"
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