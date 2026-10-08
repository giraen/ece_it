"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { emptyBank, eraseEverything, resetCounts, resetProgress, type ResetCounts, type ResetKind } from "@/lib/reset";
import { formatDate } from "@/lib/format";
import { useLastBackup } from "@/lib/lastBackup";

const WORD = "RESET";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface Action {
  kind: ResetKind;
  title: string;
  text: string;
  button: string;
  /** What will be deleted, worked out from the live counts. */
  lines: (c: ResetCounts) => string[];
  /** What stays, shown in the confirmation. */
  keeps: string;
}

const ACTIONS: Action[] = [
  {
    kind: "progress",
    title: "Reset my progress",
    text: "Deletes every quiz you have taken. Results, mastery, analytics, and locks all start from zero. Your questions stay.",
    button: "Reset progress",
    lines: (c) => [
      plural(c.quizzes, "quiz", "quizzes") + " and all the results, mastery, and analytics built from them",
    ],
    keeps: "Your questions, concepts, subjects, topics, and settings stay.",
  },
  {
    kind: "bank",
    title: "Empty the question bank",
    text: "Deletes every question, concept, AI draft, AI-reworded version, and saved picture. Subjects, topics, and quiz history stay.",
    button: "Empty the bank",
    lines: (c) => [
      plural(c.questions, "question"),
      plural(c.concepts, "concept"),
      plural(c.drafts, "AI draft"),
      plural(c.variants, "AI-reworded version"),
      "saved pictures (except those old results still show)",
    ],
    keeps: "Your subjects, topics, quiz history, and settings stay.",
  },
  {
    kind: "everything",
    title: "Erase everything",
    text: "Deletes all of the above, plus blueprints, your subjects and topics, and AI settings. The app goes back to how it was on first launch.",
    button: "Erase everything",
    lines: (c) => [
      plural(c.quizzes, "quiz", "quizzes"),
      plural(c.questions, "question"),
      plural(c.concepts, "concept"),
      plural(c.nodes, "subject or topic", "subjects and topics"),
      plural(c.blueprints, "blueprint"),
      "AI provider settings and the backup reminder",
    ],
    keeps: "Only the four fixed categories (GEAS, ESAT, ELEX, MATH) and your light or dark theme stay.",
  },
];

function Confirm({
  action,
  counts,
  onClose,
}: {
  action: Action;
  counts: ResetCounts | undefined;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [removeKeys, setRemoveKeys] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const lastBackup = useLastBackup();

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      if (action.kind === "progress") await resetProgress();
      else if (action.kind === "bank") await emptyBank();
      else await eraseEverything(removeKeys);
      // A fresh load, so the page shows the empty state.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The reset did not finish.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        className="w-full max-w-md space-y-4 rounded-md border border-danger bg-surface p-5 shadow-lg"
      >
        <h2 id="reset-title" className="text-lg font-semibold text-danger">
          {action.title}
        </h2>
        <div className="space-y-2 text-sm">
          <p className="font-medium">This will permanently delete:</p>
          {counts ? (
            <ul className="list-disc space-y-0.5 pl-5">
              {action.lines(counts).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Counting…</p>
          )}
          <p className="text-muted">{action.keeps}</p>
        </div>
        <p className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm">
          <strong>This cannot be undone.</strong>{" "}
          {lastBackup
            ? `Your last full backup was on ${formatDate(lastBackup)}.`
            : "You have never made a full backup on this device."}{" "}
          Close this and make one under Backup and sharing first if you may want this data back.
        </p>
        {action.kind === "everything" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={removeKeys} onChange={(e) => setRemoveKeys(e.target.checked)} />
            Also remove my API keys from this device
          </label>
        )}
        <div>
          <label htmlFor="reset-word" className="mb-1 block text-sm">
            Type <strong className="font-mono">{WORD}</strong> to confirm.
          </label>
          <input
            id="reset-word"
            ref={input}
            className="input font-mono"
            autoComplete="off"
            value={typed}
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn border-danger bg-danger text-paper hover:bg-danger/90"
            disabled={busy || typed !== WORD}
            onClick={() => void run()}
          >
            {busy ? "Working…" : action.button}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Reset options for the data in this browser, in the style of a repository's "Danger Zone". */
export default function DangerZone() {
  const [open, setOpen] = useState<Action | null>(null);
  const counts = useLiveQuery(() => resetCounts(), []);

  return (
    <section aria-labelledby="danger-title" className="space-y-3">
      <h2 id="danger-title" className="text-lg font-semibold text-danger">
        Danger zone
      </h2>
      <div className="divide-y divide-danger/30 rounded-md border border-danger/60 bg-surface">
        {ACTIONS.map((a) => (
          <div key={a.kind} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 flex-1 basis-64">
              <p className="font-medium">{a.title}</p>
              <p className="text-sm text-muted">{a.text}</p>
            </div>
            <button
              className="btn border-danger text-danger hover:bg-danger hover:text-paper"
              onClick={() => setOpen(a)}
            >
              {a.button}
            </button>
          </div>
        ))}
      </div>
      {open && <Confirm action={open} counts={counts} onClose={() => setOpen(null)} />}
    </section>
  );
}