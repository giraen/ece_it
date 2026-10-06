"use client";

import { useState } from "react";
import Link from "next/link";
import type { Concept, DraftQuestion } from "@/lib/db";
import { useKeyIds } from "@/lib/aiKeys";
import { useProviders } from "@/lib/aiStore";
import { acceptDraft, updateDraft, useDraftsFor } from "@/lib/concepts";
import { draftFromConcept, type RunEvent } from "@/lib/runGeneration";
import ImageTextarea from "./ImageTextarea";
import RichText from "./RichText";

const letter = (i: number) => String.fromCharCode(65 + i);

function Edit({ d, onDone }: { d: DraftQuestion; onDone: () => void }) {
  const [stem, setStem] = useState(d.stem);
  const [choices, setChoices] = useState(d.choices);
  const [correct, setCorrect] = useState(d.correctChoiceId);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!stem.trim()) return setError("Write the question.");
    if (choices.some((c) => !c.text.trim())) return setError("Fill in every choice.");
    if (!choices.some((c) => c.id === correct)) return setError("Mark the correct choice.");
    await updateDraft(d.id, { stem: stem.trim(), choices, correctChoiceId: correct, note: "Edited by hand." });
    onDone();
  }

  return (
    <div className="space-y-2">
      <ImageTextarea label="Draft question" value={stem} onChange={setStem} rows={3} />
      {choices.map((c, i) => (
        <div key={c.id} className="flex items-start gap-2">
          <input
            type="radio"
            name={`dc-${d.id}`}
            className="mt-2.5"
            aria-label={`Draft choice ${letter(i)} is correct`}
            checked={correct === c.id}
            onChange={() => setCorrect(c.id)}
          />
          <span className="mt-1.5 w-4 text-sm text-muted">{letter(i)}</span>
          <div className="flex-1">
            <ImageTextarea
              label={`Draft choice ${letter(i)}`}
              rows={2}
              value={c.text}
              onChange={(t) => setChoices((cs) => cs.map((x) => (x.id === c.id ? { ...x, text: t } : x)))}
            />
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={() => void save()}>
          Save changes
        </button>
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Questions an AI drafted from a concept. Nothing joins the bank until it is accepted here. */
export default function DraftReview({ concept }: { concept: Concept }) {
  const drafts = useDraftsFor(concept.id);
  const providers = useProviders();
  const keyIds = useKeyIds();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [showDone, setShowDone] = useState(false);

  if (!drafts || !providers) return null;
  const pending = drafts.filter((d) => d.status === "pending").sort((a, b) => a.createdAt - b.createdAt);
  const done = drafts.filter((d) => d.status !== "pending");
  const canRun = providers.some((p) => p.enabled && p.type === "openai" && keyIds.includes(p.id));

  async function generate() {
    setBusy(true);
    setEvents([]);
    try {
      await draftFromConcept(concept, providers as NonNullable<typeof providers>, (e) => setEvents((p) => [...p, e]));
    } catch (e) {
      setEvents([{ kind: "stop", text: e instanceof Error ? e.message : "Drafting failed." }]);
    } finally {
      setBusy(false);
    }
  }

  const card = (d: DraftQuestion) => (
    <li key={d.id} className="space-y-2 rounded-md border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded px-1.5 py-0.5 font-medium ${d.status === "pending" ? "bg-accent-soft text-accent" : d.status === "accepted" ? "bg-good/10 text-good" : "bg-line/60 text-muted"}`}
        >
          {d.status === "pending" ? "to review" : d.status}
        </span>
        <span className="text-muted">
          {d.provider} · {d.model}
        </span>
      </div>
      {editing === d.id ? (
        <Edit d={d} onDone={() => setEditing(null)} />
      ) : (
        <>
          <RichText text={d.stem} className="text-[15px]" />
          <ol className="space-y-1">
            {d.choices.map((c, i) => (
              <li
                key={c.id}
                className={`flex gap-2 rounded border px-2 py-1 text-sm ${c.id === d.correctChoiceId ? "border-good bg-good/5" : "border-line"}`}
              >
                <span className="w-4 text-muted">{letter(i)}</span>
                <RichText text={c.text} />
              </li>
            ))}
          </ol>
          {d.note && <p className="text-xs text-muted">{d.note}</p>}
          {d.status === "pending" && (
            <div className="flex gap-2">
              <button className="btn btn-primary py-1" onClick={() => void acceptDraft(d.id, concept)}>
                Add to the question bank
              </button>
              <button className="btn py-1" onClick={() => setEditing(d.id)}>
                Edit
              </button>
              <button
                className="btn btn-danger py-1"
                onClick={() => void updateDraft(d.id, { status: "discarded", note: "Discarded by hand." })}
              >
                Discard
              </button>
            </div>
          )}
        </>
      )}
    </li>
  );

  return (
    <section aria-label="Questions from this concept" className="space-y-3 rounded-md border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-medium">Questions from this concept</h2>
        <button
          className="btn py-1"
          disabled={busy || !canRun}
          title={canRun ? undefined : "Add an API key first"}
          onClick={() => void generate()}
        >
          {busy ? "Working…" : "Draft questions"}
        </button>
        <Link href="/settings#ai" className="text-sm underline">
          AI settings
        </Link>
      </div>
      <p className="text-xs text-muted">
        An AI drafts multiple-choice questions from this note. A second model then answers each one without seeing the
        note, and any it disagrees with are thrown away. What is left waits here for you. Check each one yourself before
        adding it.
      </p>
      {!canRun && (
        <p className="text-xs text-muted">
          No API key has been added, so nothing can be drafted. You can add one in Settings.
        </p>
      )}
      {events.length > 0 && (
        <ul className="space-y-0.5 text-sm" aria-label="Drafting result">
          {events.map((e, i) => (
            <li key={i} className={e.kind === "stop" ? "text-danger" : e.kind === "ok" ? "text-good" : "text-muted"}>
              {e.text}
            </li>
          ))}
        </ul>
      )}
      {pending.length === 0 ? (
        <p className="text-sm text-muted">No drafts waiting.</p>
      ) : (
        <ul className="space-y-2">{pending.map(card)}</ul>
      )}
      {done.length > 0 && (
        <div>
          <button className="text-sm underline" onClick={() => setShowDone((s) => !s)}>
            {showDone ? "Hide" : "Show"} {done.length} accepted or discarded
          </button>
          {showDone && <ul className="mt-2 space-y-2">{done.map(card)}</ul>}
        </div>
      )}
    </section>
  );
}