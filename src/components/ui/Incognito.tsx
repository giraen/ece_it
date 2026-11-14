"use client";

import { setIncognito, useIncognito } from "@/lib/incognito";

/** The incognito switch. The same switch shows on Quiz, Activity, and Settings. */
export function IncognitoSwitch({ className = "" }: { className?: string }) {
  const on = useIncognito();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setIncognito(!on)}
      className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm ${
        on ? "border-priority/50 bg-priority-soft font-medium text-priority" : "border-line text-muted hover:bg-paper"
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? "bg-priority" : "bg-track"}`}
      >
        <span
          className={`absolute top-0.5 size-3 rounded-full bg-surface shadow-sm transition-[left] ${on ? "left-3.5" : "left-0.5"}`}
        />
      </span>
      Incognito
    </button>
  );
}

/** Said wherever incognito changes what happens next. */
export function IncognitoNote({ what }: { what: "quiz" | "review" | "both" }) {
  const on = useIncognito();
  if (!on) return null;
  const text =
    what === "quiz"
      ? "Incognito: this quiz will not be saved. It does not count toward mastery, locks, results history, or analytics, and it does not sync. You see the results once, and they are gone when you start another incognito quiz."
      : what === "review"
        ? "Incognito: you can practise any card you have unlocked, due or not. Answers are not saved, so no card moves box, nothing new unlocks, and nothing syncs."
        : "Incognito is on for this device. Quizzes and memory reviews you start are not saved: nothing counts toward mastery, analytics, or memory boxes, and nothing syncs.";
  return (
    <p role="status" className="rounded-md border border-priority/40 bg-priority-soft p-3 text-sm text-priority">
      {text}
    </p>
  );
}

/** A small label for an incognito quiz or review. */
export function IncognitoTag() {
  return (
    <span className="ml-2 rounded border border-priority/40 bg-priority-soft px-1.5 py-0.5 align-middle text-xs font-normal text-priority">
      Incognito
    </span>
  );
}
