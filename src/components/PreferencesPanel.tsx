"use client";

import { useState } from "react";
import { CONFIG } from "@/lib/config";
import {
  MASTERY_BAR_MAX,
  MASTERY_BAR_MIN,
  cleanMasteryBar,
  saveMasteryBar,
  savePriorityFirst,
  useMasteryBar,
  usePriorityFirst,
} from "@/lib/preferences";

export default function PreferencesPanel() {
  const bar = useMasteryBar();
  const priorityFirst = usePriorityFirst();
  const saved = Math.round(bar * 100);
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(saved);
  const valid = cleanMasteryBar(shown) !== null;

  async function commit() {
    if (text === null) return;
    if (cleanMasteryBar(text) !== null) {
      await saveMasteryBar(text);
      setText(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="mastery-bar" className="text-sm font-medium">
            Mastery bar
          </label>
          <input
            id="mastery-bar"
            type="number"
            min={MASTERY_BAR_MIN}
            max={MASTERY_BAR_MAX}
            step={1}
            className="input w-24"
            value={shown}
            aria-invalid={!valid}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
            }}
          />
          <span className="text-sm text-muted">%</span>
        </div>
        {!valid && (
          <p role="alert" className="text-sm text-danger">
            Use a whole number from {MASTERY_BAR_MIN} to {MASTERY_BAR_MAX}. It has to be above the{" "}
            {Math.round(CONFIG.minimumPass * 100)}% minimum to pass.
          </p>
        )}
        <p className="text-sm text-muted">
          A quiz passes, and can award mastery, when its average credit reaches this bar. It applies to quizzes you take
          from now on. Quizzes you already took keep the bar they were scored with. The graph on the Analytics tab shows
          this bar as a dashed green line, and the {Math.round(CONFIG.minimumPass * 100)}% minimum to pass as a fixed
          red line.
        </p>
      </div>

      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={priorityFirst} onChange={(e) => void savePriorityFirst(e.target.checked)} />
          Priority questions first
        </label>
        <p className="text-sm text-muted">
          Questions you marked as priority, such as ones from a review center quiz or a book, are picked before the
          others in each topic. A priority question you already got right waits behind new and missed questions, so the
          same few do not fill every quiz. Turn this off to treat every question the same.
        </p>
      </div>
    </div>
  );
}