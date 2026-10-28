"use client";

import { useState } from "react";
import { CONFIG } from "@/lib/config";
import { MASTERY_BAR_MAX, MASTERY_BAR_MIN, cleanMasteryBar, saveMasteryBar, useMasteryBar } from "@/lib/preferences";
import { setFullMotion, useFullMotion } from "@/lib/motion";
import { syncRules } from "@/lib/recheck";
import InfoTip from "./InfoTip";

export default function PreferencesPanel() {
  const bar = useMasteryBar();
  const fullMotion = useFullMotion();
  const saved = Math.round(bar * 100);
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(saved);
  const valid = cleanMasteryBar(shown) !== null;

  async function commit() {
    if (text === null) return;
    if (cleanMasteryBar(text) !== null) {
      await saveMasteryBar(text);
      setText(null);
      // Quizzes still counting toward mastery are judged again by the new bar.
      void syncRules();
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1">
            <label htmlFor="mastery-bar" className="text-sm font-medium">
              Mastery bar
            </label>
            <InfoTip>
              A quiz passes, and can award mastery, when its average credit reaches this bar. When you change it, the
              quizzes whose mastery could still be running are rechecked against the new bar. The graph on the Analytics
              tab shows this bar as a dashed green line, and the {Math.round(CONFIG.minimumPass * 100)}% minimum to pass
              as a fixed red line.
            </InfoTip>
          </span>
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
      </div>

      <div className="flex items-center gap-1">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={fullMotion} onChange={(e) => setFullMotion(e.target.checked)} />
          Always play animations
        </label>
        <InfoTip>
          If your computer is set to reduce motion, this app plays no animation, so the chart lines and sliding cards do
          not move. Turn this on to play them anyway. It is saved in this browser.
        </InfoTip>
      </div>
    </div>
  );
}