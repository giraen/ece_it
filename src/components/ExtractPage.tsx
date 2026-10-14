"use client";

import { useState } from "react";
import Link from "next/link";
import type { Choice, DraftQuestion, TreeNode } from "@/lib/db";
import { newId, now } from "@/lib/ids";
import { useNodes, useQuestions } from "@/lib/hooks";
import { updateDraft } from "@/lib/concepts";
import {
  EXTRACT_INSTRUCTIONS,
  STATUS_LABEL,
  combineReference,
  extractStatus,
  extractWarnings,
  parseExtract,
  sameStem,
  toDrafts,
  type ExtractStatus,
} from "@/lib/extract";
import { acceptPasted, discardPasted, savePasted, usePasted } from "@/lib/extractStore";
import { keepSourceOnly, useSources } from "@/lib/sources";
import { suggestWrongText, type Ask } from "@/lib/wrongChoices";
import ImageTextarea from "./ImageTextarea";
import InfoTip from "./InfoTip";
import ReferenceInput from "./ReferenceInput";
import RichText from "./RichText";
import SuggestWrong from "./SuggestWrong";
import ToolbarGroup from "./ToolbarGroup";
import TopicPicker from "./TopicPicker";

const MAX_CHOICES = 8;
const letter = (i: number) => String.fromCharCode(65 + i);

const SAMPLE = `Q: Which of the following lines is parallel to $3x - 2y + 6 = 0$?
A. $3x + 2y - 12 = 0$
B. $4x - 9y = 6$
C. $12x + 18y = 15$
D. $15x - 10y - 9 = 0$
Answer: D
Ref: p. 1, no. 1`;

const BADGE: Record<ExtractStatus, string> = {
  ready: "bg-good/10 text-good",
  "needs-answer": "bg-accent-soft text-accent",
  "needs-choices": "bg-accent-soft text-accent",
  problem: "bg-danger/10 text-danger",
};

function Edit({ d, onDone }: { d: DraftQuestion; onDone: () => void }) {
  const [stem, setStem] = useState(d.stem);
  const [choices, setChoices] = useState<Choice[]>(() => {
    const out = [...d.choices];
    // Room for wrong choices when only an answer was given.
    while (out.length < 4) out.push({ id: newId(), text: "" });
    return out;
  });
  const [correct, setCorrect] = useState(d.correctChoiceId);
  const [reference, setReference] = useState(d.reference ?? "");

  const emptyWrong = choices.filter((c) => !c.text.trim() && c.id !== correct);
  const correctText = choices.find((c) => c.id === correct)?.text.trim() ?? "";
  const block = !stem.trim()
    ? "Write the question first."
    : !correctText
      ? "Mark the correct choice and write it first."
      : emptyWrong.length === 0
        ? "Every choice is filled in. Empty the ones you want replaced."
        : null;

  async function suggest(ask: Ask, count: number): Promise<number> {
    const others = choices.filter((c) => c.id !== correct && c.text.trim()).map((c) => c.text.trim());
    const list = await suggestWrongText({ ask, stem, correct: correctText, others, count });
    setChoices((cs) => {
      let k = 0;
      return cs.map((c) => (!c.text.trim() && c.id !== correct && k < list.length ? { ...c, text: list[k++] } : c));
    });
    return list.length;
  }

  async function save() {
    const filled = choices.filter((c) => c.text.trim()).map((c) => ({ ...c, text: c.text.trim() }));
    await updateDraft(d.id, {
      stem: stem.trim(),
      choices: filled,
      correctChoiceId: filled.some((c) => c.id === correct) ? correct : "",
      reference: reference.trim() || undefined,
      note: "Edited by hand.",
    });
    onDone();
  }

  return (
    <div className="space-y-2">
      <ImageTextarea label="Question" value={stem} onChange={setStem} rows={3} />
      <ToolbarGroup>
        {choices.map((c, i) => (
          <div key={c.id} className="flex items-start gap-2">
            <input
              type="radio"
              name={`pc-${d.id}`}
              className="mt-2.5"
              aria-label={`Choice ${letter(i)} is correct`}
              checked={correct === c.id}
              onChange={() => setCorrect(c.id)}
            />
            <span className="mt-1.5 w-4 text-sm text-muted">{letter(i)}</span>
            <div className="flex-1">
              <ImageTextarea
                label={`Choice ${letter(i)}`}
                rows={2}
                value={c.text}
                onChange={(t) => setChoices((cs) => cs.map((x) => (x.id === c.id ? { ...x, text: t } : x)))}
              />
            </div>
            <button
              type="button"
              className="btn mt-1 py-1"
              aria-label={`Remove choice ${letter(i)}`}
              disabled={choices.length <= 2}
              onClick={() => {
                setChoices((cs) => cs.filter((x) => x.id !== c.id));
                if (correct === c.id) setCorrect("");
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </ToolbarGroup>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn py-1"
          disabled={choices.length >= MAX_CHOICES}
          onClick={() => setChoices((cs) => [...cs, { id: newId(), text: "" }])}
        >
          Add choice
        </button>
        <SuggestWrong blocked={block} count={emptyWrong.length} onSuggest={suggest} />
      </div>
      <label className="block text-xs font-medium">
        Source
        <input className="input mt-1 w-full" value={reference} onChange={(e) => setReference(e.target.value)} />
      </label>
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

function Inner({ pasted, nodes }: { pasted: DraftQuestion[]; nodes: TreeNode[] }) {
  const sources = useSources();
  const questions = useQuestions();
  const [text, setText] = useState("");
  const [topicId, setTopicId] = useState<string | null>(pasted[0]?.topicId ?? null);
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<ExtractStatus | "all">("all");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!sources || !questions) return null;

  const inTopic = topicId ? questions.filter((q) => q.topicId === topicId) : [];
  const isDuplicate = (d: DraftQuestion) => inTopic.some((q) => sameStem(q.stem, d.stem));
  const rows = pasted.map((d) => ({ d, status: extractStatus(d) }));
  const count = (s: ExtractStatus) => rows.filter((r) => r.status === s).length;
  const shown = rows.filter((r) => filter === "all" || r.status === filter);
  const addable = rows.filter((r) => r.status === "ready" && !isDuplicate(r.d));

  async function copy() {
    try {
      await navigator.clipboard.writeText(EXTRACT_INSTRUCTIONS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage({ ok: false, text: "Copying was blocked. Open “Show the instructions” and copy them from there." });
    }
  }

  async function read() {
    if (!topicId) return setMessage({ ok: false, text: "Pick a category, subject, and topic first." });
    const parsed = parseExtract(text);
    if (parsed.length === 0)
      return setMessage({ ok: false, text: "No questions were found. Check that the text follows the format." });
    const sourceOnly = reference.trim() ? keepSourceOnly(reference, sources ?? []) : "";
    const drafts = toDrafts(parsed, {
      topicId,
      reference: (own) => combineReference(own, reference, sourceOnly),
      at: now(),
    });
    await savePasted(drafts);
    const ready = drafts.filter((d) => extractStatus(d) === "ready").length;
    setText("");
    setFilter("all");
    setMessage({
      ok: true,
      text: `Read ${drafts.length} question${drafts.length === 1 ? "" : "s"}. ${ready} ready, ${drafts.length - ready} need something from you.`,
    });
  }

  async function addOne(d: DraftQuestion) {
    if (!topicId) return setMessage({ ok: false, text: "Pick a category, subject, and topic first." });
    await acceptPasted(d.id, topicId);
  }

  async function addAll() {
    if (!topicId) return setMessage({ ok: false, text: "Pick a category, subject, and topic first." });
    setBusy(true);
    try {
      let n = 0;
      for (const r of addable) if (await acceptPasted(r.d.id, topicId)) n++;
      const skipped = rows.filter((r) => r.status === "ready").length - addable.length;
      setMessage({
        ok: true,
        text: `Added ${n} question${n === 1 ? "" : "s"} to the bank.${skipped ? ` ${skipped} looked like duplicates and were left for you to check.` : ""}`,
      });
    } finally {
      setBusy(false);
    }
  }

  const chips: { id: ExtractStatus | "all"; label: string; n: number }[] = [
    { id: "all", label: "All", n: rows.length },
    { id: "ready", label: "Ready", n: count("ready") },
    { id: "needs-answer", label: "Needs answer", n: count("needs-answer") },
    { id: "needs-choices", label: "Needs choices", n: count("needs-choices") },
    { id: "problem", label: "Needs a question", n: count("problem") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Extract questions</h1>
        <p className="mt-1 text-sm text-muted">
          Paste questions as text instead of typing them one by one. Check them here, then add them to the bank.
        </p>
      </div>

      <section aria-label="Get the text" className="space-y-3 rounded-md border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">1. Get the text in the format</h2>
          <InfoTip>
            Open a chat with Claude, attach your PDF or pictures, paste the instructions, and Claude writes the
            questions in this format. You can also type or edit text in the format yourself.
          </InfoTip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy instructions for Claude"}
          </button>
          <span className="text-sm text-muted">Paste them in a chat, with your PDF or pictures attached.</span>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer underline">Show the format</summary>
          <div className="mt-2 space-y-2">
            <pre className="overflow-x-auto rounded border border-line bg-surface p-3 text-xs">{SAMPLE}</pre>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>Put a blank line between questions. Numbers such as 1. or 2) work in place of Q:.</li>
              <li>Put equations between $ signs, in the question and in the choices.</li>
              <li>The Answer line is optional. You can mark the answer here instead.</li>
              <li>The choices are optional. If you give only an answer, you add the wrong choices here.</li>
              <li>An answer key at the end, such as “Answers: 1.B 2.C 3.A”, is matched by number.</li>
              <li>The Ref line is optional and is added to the source you pick below.</li>
            </ul>
          </div>
        </details>
        <details className="text-sm">
          <summary className="cursor-pointer underline">Show the instructions</summary>
          <textarea
            readOnly
            aria-label="Instructions for Claude"
            className="input mt-2 h-48 w-full font-mono text-xs"
            value={EXTRACT_INSTRUCTIONS}
          />
        </details>
      </section>

      <section aria-label="Paste the text" className="space-y-3 rounded-md border border-line bg-paper p-4">
        <h2 className="font-medium">2. Paste it here</h2>
        <textarea
          aria-label="Pasted questions"
          className="input h-56 w-full font-mono text-sm"
          placeholder={SAMPLE}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div>
          <p className="mb-1 text-sm font-medium">Add them to</p>
          <TopicPicker nodes={nodes} value={topicId} onChange={setTopicId} />
        </div>
        <div>
          <label htmlFor="extract-reference" className="mb-1 block text-sm font-medium">
            Source
          </label>
          <ReferenceInput id="extract-reference" value={reference} onChange={setReference} />
        </div>
        <button className="btn btn-primary" disabled={!text.trim()} onClick={() => void read()}>
          Read it
        </button>
        {message && (
          <p role="status" className={`text-sm ${message.ok ? "text-good" : "text-danger"}`}>
            {message.text}
          </p>
        )}
      </section>

      <section aria-label="Questions to review" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">3. Check and add ({rows.length})</h2>
          {rows.length > 0 && (
            <>
              <button
                className="btn btn-primary py-1"
                disabled={busy || addable.length === 0 || !topicId}
                title={topicId ? undefined : "Pick a topic first"}
                onClick={() => void addAll()}
              >
                Add all ready ({addable.length})
              </button>
              <button
                className="btn btn-danger py-1"
                onClick={() => {
                  if (window.confirm(`Throw away all ${rows.length} questions waiting here?`))
                    void discardPasted(rows.map((r) => r.d.id));
                }}
              >
                Clear all
              </button>
            </>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting. Questions you read appear here until you add them.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
              {chips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={filter === c.id}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${filter === c.id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}
                  onClick={() => setFilter(c.id)}
                >
                  {c.label} {c.n}
                </button>
              ))}
            </div>
            <ul className="space-y-2">
              {shown.map(({ d, status }, i) => {
                const warnings = extractWarnings(d);
                const dup = isDuplicate(d);
                return (
                  <li key={d.id} className="space-y-2 rounded-md border border-line bg-surface p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted">{i + 1}</span>
                      <span className={`rounded px-1.5 py-0.5 font-medium ${BADGE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                      {dup && (
                        <span className="rounded bg-danger/10 px-1.5 py-0.5 text-danger">Already in this topic?</span>
                      )}
                      {d.reference && <span className="text-muted">{d.reference}</span>}
                    </div>
                    {editing === d.id ? (
                      <Edit d={d} onDone={() => setEditing(null)} />
                    ) : (
                      <>
                        {d.stem ? (
                          <RichText text={d.stem} className="text-[15px]" />
                        ) : (
                          <p className="text-sm text-muted">No question text.</p>
                        )}
                        <ol className="space-y-1" aria-label="Choices">
                          {d.choices.map((c, k) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                aria-label={`Mark choice ${letter(k)} as the answer`}
                                aria-pressed={c.id === d.correctChoiceId}
                                className={`flex w-full gap-2 rounded border px-2 py-1 text-left text-sm ${c.id === d.correctChoiceId ? "border-good bg-good/5" : "border-line hover:bg-paper"}`}
                                onClick={() => void updateDraft(d.id, { correctChoiceId: c.id })}
                              >
                                <span className="w-4 text-muted">{letter(k)}</span>
                                <RichText text={c.text} />
                              </button>
                            </li>
                          ))}
                        </ol>
                        {status === "needs-answer" && (
                          <p className="text-xs text-muted">Click the correct choice to mark it as the answer.</p>
                        )}
                        {status === "needs-choices" && (
                          <p className="text-xs text-muted">Press Edit to add the other choices.</p>
                        )}
                        {warnings.map((w) => (
                          <p key={w} className="text-xs text-danger">
                            {w}
                          </p>
                        ))}
                        {d.note && <p className="text-xs text-muted">{d.note}</p>}
                        <div className="flex gap-2">
                          <button
                            className="btn btn-primary py-1"
                            disabled={status !== "ready" || !topicId}
                            title={
                              status !== "ready"
                                ? "Finish this question first"
                                : !topicId
                                  ? "Pick a topic first"
                                  : undefined
                            }
                            onClick={() => void addOne(d)}
                          >
                            Add to the question bank
                          </button>
                          <button className="btn py-1" onClick={() => setEditing(d.id)}>
                            Edit
                          </button>
                          <button className="btn btn-danger py-1" onClick={() => void discardPasted([d.id])}>
                            Discard
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <p className="text-xs text-muted">
          Added questions are in the{" "}
          <Link href="/bank" className="underline">
            Bank
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

export default function ExtractPage() {
  const nodes = useNodes();
  const pasted = usePasted();
  if (!nodes || !pasted) return <p className="text-sm text-muted">Loading…</p>;
  return <Inner pasted={pasted} nodes={nodes} />;
}