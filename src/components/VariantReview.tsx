"use client";

import { useState } from "react";
import Link from "next/link";
import type { Question, Variant } from "@/lib/db";
import { slotsIn } from "@/lib/slots";
import { updateVariant, useProviders, useVariantsFor } from "@/lib/aiStore";
import { useKeyIds } from "@/lib/aiKeys";
import { generateForQuestion, type RunEvent } from "@/lib/runGeneration";
import ImageTextarea from "./ImageTextarea";
import RichText from "./RichText";
import InfoTip from "./InfoTip";

const letter = (i: number) => String.fromCharCode(65 + i);

function Edit({ v, q, onDone }: { v: Variant; q: Question; onDone: () => void }) {
  const [stem, setStem] = useState(v.stem);
  const [choices, setChoices] = useState(v.choices);
  const [correct, setCorrect] = useState(v.correctChoiceId);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!stem.trim()) return setError("Write the wording.");
    if (v.kind === "concept") {
      if (choices.some((c) => !c.text.trim())) return setError("Fill in every choice.");
      if (!choices.some((c) => c.id === correct)) return setError("Mark the correct choice.");
    } else {
      const known = new Set([
        ...(q.template?.givens ?? []).map((g) => g.name),
        ...(q.template?.derived ?? []).map((d) => d.name),
      ]);
      const bad = slotsIn(stem).find((s) => !known.has(s));
      if (bad) return setError(`{${bad}} is not a given or derived value of this question.`);
    }
    await updateVariant(v.id, {
      stem: stem.trim(),
      choices,
      correctChoiceId: correct,
      status: "approved",
      note: "Edited by hand.",
    });
    onDone();
  }

  return (
    <div className="space-y-2">
      <ImageTextarea label="Variant wording" value={stem} onChange={setStem} rows={3} />
      {v.kind === "concept" &&
        choices.map((c, i) => (
          <div key={c.id} className="flex items-start gap-2">
            <input
              type="radio"
              name={`vc-${v.id}`}
              className="mt-2.5"
              aria-label={`Variant choice ${letter(i)} is correct`}
              checked={correct === c.id}
              onChange={() => setCorrect(c.id)}
            />
            <span className="mt-1.5 w-4 text-sm text-muted">{letter(i)}</span>
            <div className="flex-1">
              <ImageTextarea
                label={`Variant choice ${letter(i)}`}
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
          Save and approve
        </button>
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const STATUS: Record<Variant["status"], string> = {
  approved: "bg-good/10 text-good",
  pending: "bg-accent-soft text-accent",
  discarded: "bg-line/60 text-muted",
};

/** Lists what the AI wrote for a question, with controls to approve, discard, or edit each one. */
export default function VariantReview({ question }: { question: Question }) {
  const variants = useVariantsFor(question.id);
  const providers = useProviders();
  const keyIds = useKeyIds();
  const [editing, setEditing] = useState<string | null>(null);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<RunEvent[]>([]);

  if (!variants || !providers) return null;
  const canRun = providers.some((p) => p.enabled && (p.type === "webllm" || keyIds.includes(p.id)));
  const live = variants.filter((v) => v.status !== "discarded").sort((a, b) => a.createdAt - b.createdAt);
  const discarded = variants.filter((v) => v.status === "discarded");

  async function generate() {
    setBusy(true);
    setEvents([]);
    try {
      await generateForQuestion(question, providers as NonNullable<typeof providers>, (e) =>
        setEvents((p) => [...p, e]),
      );
    } catch (e) {
      setEvents([{ kind: "stop", text: e instanceof Error ? e.message : "Generation failed." }]);
    } finally {
      setBusy(false);
    }
  }

  const row = (v: Variant) => (
    <li key={v.id} className="space-y-2 rounded-md border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded px-1.5 py-0.5 font-medium ${STATUS[v.status]}`}>{v.status}</span>
        <span className="text-muted">
          {v.kind === "frame" ? "wording" : "reworded question"} · {v.provider} · {v.model}
        </span>
      </div>
      {editing === v.id ? (
        <Edit v={v} q={question} onDone={() => setEditing(null)} />
      ) : (
        <>
          <RichText text={v.stem} className="text-[15px]" />
          {v.kind === "concept" && (
            <ol className="space-y-1">
              {v.choices.map((c, i) => (
                <li
                  key={c.id}
                  className={`flex gap-2 rounded border px-2 py-1 text-sm ${c.id === v.correctChoiceId ? "border-good bg-good/5" : "border-line"}`}
                >
                  <span className="w-4 text-muted">{letter(i)}</span>
                  <RichText text={c.text} />
                </li>
              ))}
            </ol>
          )}
          {v.note && <p className="text-xs text-muted">{v.note}</p>}
          <div className="flex gap-2">
            {v.status !== "approved" && (
              <button
                className="btn py-1"
                onClick={() => void updateVariant(v.id, { status: "approved", note: "Approved by hand." })}
              >
                Approve
              </button>
            )}
            <button className="btn py-1" onClick={() => setEditing(v.id)}>
              Edit
            </button>
            {v.status !== "discarded" && (
              <button
                className="btn btn-danger py-1"
                onClick={() => void updateVariant(v.id, { status: "discarded", note: "Discarded by hand." })}
              >
                Discard
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );

  return (
    <section aria-label="AI variants" className="space-y-3 rounded-md border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1">
          <h2 className="font-medium">AI variants of this question</h2>
          <InfoTip>
            {question.type === "computation"
              ? "For a computation question the AI writes new wordings. The numbers and answers always come from your formulas."
              : "Each reworded version is checked by a second, blind answer before it can be used in a quiz."}{" "}
            Editing the question itself discards its variants, since they were written for the old version.
          </InfoTip>
        </span>
        <button
          className="btn py-1"
          disabled={busy || !canRun}
          title={canRun ? undefined : "Add an API key first"}
          onClick={() => void generate()}
        >
          {busy ? "Working…" : "Generate for this question"}
        </button>
        <Link href="/settings#ai" className="text-sm underline">
          Settings
        </Link>
      </div>
      {!canRun && (
        <p className="text-xs text-muted">
          No API key has been added, so this question is shown as written. You can add one in Settings.
        </p>
      )}
      {events.length > 0 && (
        <ul className="space-y-0.5 text-sm" aria-label="Generation result">
          {events.map((e, i) => (
            <li key={i} className={e.kind === "stop" ? "text-danger" : e.kind === "ok" ? "text-good" : "text-muted"}>
              {e.text}
            </li>
          ))}
        </ul>
      )}
      {live.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="space-y-2">{live.map(row)}</ul>
      )}
      {discarded.length > 0 && (
        <div>
          <button className="text-sm underline" onClick={() => setShowDiscarded((s) => !s)}>
            {showDiscarded ? "Hide" : "Show"} {discarded.length} discarded
          </button>
          {showDiscarded && <ul className="mt-2 space-y-2">{discarded.map(row)}</ul>}
        </div>
      )}
    </section>
  );
}
