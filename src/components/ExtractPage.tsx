"use client";

import { useState } from "react";
import Link from "next/link";
import type { Choice, DraftQuestion, TreeNode } from "@/lib/db";
import { newId, now } from "@/lib/ids";
import { useNodes, useQuestions, useTagSuggestions } from "@/lib/hooks";
import { updateDraft } from "@/lib/concepts";
import {
  STATUS_LABEL,
  combineReference,
  extractStatus,
  extractWarnings,
  findTopic,
  instructionsWithTopics,
  normName,
  parseExtract,
  parseTopicPath,
  sameStem,
  toDrafts,
  topicEntries,
  type ExtractStatus,
  type TopicEntry,
} from "@/lib/extract";
import {
  acceptPasted,
  applyTopicToProposals,
  createTopicPath,
  discardPasted,
  savePasted,
  setPastedTags,
  setPastedTopic,
  setProposedTopic,
  usePasted,
} from "@/lib/extractStore";
import { childrenOf, pathOf } from "@/lib/tree";
import { keepSourceOnly, useSources } from "@/lib/sources";
import { suggestWrongText, type Ask } from "@/lib/wrongChoices";
import ImageTextarea from "./ImageTextarea";
import InfoTip from "./InfoTip";
import ReferenceInput from "./ReferenceInput";
import RichText from "./RichText";
import SuggestWrong from "./SuggestWrong";
import TagInput from "./TagInput";
import ToolbarGroup from "./ToolbarGroup";
import TopicPicker from "./TopicPicker";

const MAX_CHOICES = 8;
const letter = (i: number) => String.fromCharCode(65 + i);

const SAMPLE = `Q: Which of the following lines is parallel to $3x - 2y + 6 = 0$?
A. $3x + 2y - 12 = 0$
B. $4x - 9y = 6$
C. $12x + 18y = 15$
D. $15x - 10y - 9 = 0$
Answer: D`;

const BADGE: Record<ExtractStatus, string> = {
  ready: "bg-good/10 text-good",
  "needs-answer": "bg-accent-soft text-accent",
  "needs-choices": "bg-accent-soft text-accent",
  "needs-topic": "bg-accent-soft text-accent",
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

/** The tags a waiting question will get, edited the same way as in the question editor. */
function CardTags({ d }: { d: DraftQuestion }) {
  const suggestions = useTagSuggestions(d.topicId || null);
  return (
    <div className="space-y-1 text-xs">
      <p className="text-muted">Tags</p>
      <TagInput value={d.tags ?? []} onChange={(tags) => void setPastedTags(d.id, tags)} suggestions={suggestions} />
    </div>
  );
}

/** The topic Claude recommended when it is not in the bank. It can be edited, created, or swapped for an existing topic. */
function Recommended({ d, nodes, entries }: { d: DraftQuestion; nodes: TreeNode[]; entries: TopicEntry[] }) {
  const [text, setText] = useState(d.proposedTopic ?? "");
  const [busy, setBusy] = useState(false);
  const live = nodes.filter((n) => !n.deletedAt);
  const parts = parseTopicPath(text);
  const cat = parts ? live.find((n) => n.kind === "category" && normName(n.name) === normName(parts[0])) : undefined;
  const subject =
    cat && parts ? childrenOf(live, cat.id).find((n) => normName(n.name) === normName(parts[1])) : undefined;

  async function commit() {
    const t = text.trim();
    if (t === (d.proposedTopic ?? "")) return;
    const hit = t ? findTopic(entries, t) : null;
    if (hit) await setPastedTopic([d.id], hit);
    else await setProposedTopic(d.id, t);
  }

  async function create() {
    setBusy(true);
    try {
      const id = await createTopicPath(text);
      if (id) await applyTopicToProposals(text, id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1 rounded border border-line bg-paper p-2">
      <label className="block text-xs font-medium">
        Claude recommends this topic, which is not in your bank yet
        <input
          className="input mt-1 w-full"
          value={text}
          placeholder="Category > Subject > Topic"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
          }}
        />
      </label>
      {parts && cat ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted">
            Creates {subject ? "" : `the subject “${parts[1]}” and `}the topic “{parts[2]}” under {cat.name}.
          </span>
          <button type="button" className="btn btn-primary py-1" disabled={busy} onClick={() => void create()}>
            Create it
          </button>
        </div>
      ) : (
        <p className="text-muted">
          {parts
            ? `There is no category called “${parts[0]}”. Fix the name above, or press Change to pick a topic you have.`
            : "Write it as Category > Subject > Topic to create it, or press Change to pick a topic you have."}
        </p>
      )}
      {d.topicId && (
        <button type="button" className="underline" onClick={() => void setPastedTopic([d.id], d.topicId)}>
          Ignore the recommendation and keep {pathOf(nodes, d.topicId)}
        </button>
      )}
    </div>
  );
}

function Inner({ pasted, nodes }: { pasted: DraftQuestion[]; nodes: TreeNode[] }) {
  const sources = useSources();
  const questions = useQuestions();
  const allTags = useTagSuggestions(null);
  const [text, setText] = useState("");
  const [defaultTopic, setDefaultTopic] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<ExtractStatus | "all">("all");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!sources || !questions) return null;

  const entries = topicEntries(nodes);
  const instructions = instructionsWithTopics(nodes, allTags);
  const isDuplicate = (d: DraftQuestion) =>
    d.topicId !== "" && questions.some((q) => q.topicId === d.topicId && sameStem(q.stem, d.stem));
  const rows = pasted.map((d) => ({ d, status: extractStatus(d) }));
  const chosen = selected.filter((id) => pasted.some((d) => d.id === id));
  const count = (s: ExtractStatus) => rows.filter((r) => r.status === s).length;
  const shown = rows.filter((r) => filter === "all" || r.status === filter);
  const addable = rows.filter((r) => r.status === "ready" && !isDuplicate(r.d));

  async function copy() {
    try {
      await navigator.clipboard.writeText(instructions);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage({ ok: false, text: "Copying was blocked. Open “Show the instructions” and copy them from there." });
    }
  }

  async function read() {
    const parsed = parseExtract(text);
    if (parsed.length === 0)
      return setMessage({ ok: false, text: "No questions were found. Check that the text follows the format." });
    const sourceOnly = reference.trim() ? keepSourceOnly(reference, sources ?? []) : "";
    const drafts = toDrafts(parsed, {
      defaultTopicId: defaultTopic ?? "",
      findTopic: (t) => findTopic(entries, t),
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
    await acceptPasted(d.id);
  }

  async function moveSelected() {
    if (!moveTo || chosen.length === 0) return;
    await setPastedTopic(chosen, moveTo);
    setMessage({
      ok: true,
      text: `Moved ${chosen.length} question${chosen.length === 1 ? "" : "s"} to ${pathOf(nodes, moveTo)}.`,
    });
    setSelected([]);
  }

  const creatable = Array.from(
    new Map(
      rows
        .map((r) => r.d.proposedTopic)
        .filter((t): t is string => !!t)
        .filter((t) => {
          const parts = parseTopicPath(t);
          return (
            !!parts &&
            nodes.some((n) => !n.deletedAt && n.kind === "category" && normName(n.name) === normName(parts[0]))
          );
        })
        .map((t) => [normName(t), t] as const),
    ).values(),
  );

  async function createAllRecommended() {
    setBusy(true);
    try {
      let made = 0;
      for (const t of creatable) {
        const id = await createTopicPath(t);
        if (id) {
          await applyTopicToProposals(t, id);
          made++;
        }
      }
      setMessage({ ok: true, text: `Created or matched ${made} recommended topic${made === 1 ? "" : "s"}.` });
    } finally {
      setBusy(false);
    }
  }

  async function addAll() {
    setBusy(true);
    try {
      let n = 0;
      for (const r of addable) if (await acceptPasted(r.d.id)) n++;
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
    { id: "needs-topic", label: "Needs topic", n: count("needs-topic") },
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
              <li>
                A Tags line, such as “Tags: series, formulas”, tags that question. You can change tags on each question
                below.
              </li>
              <li>The Answer line is optional. You can mark the answer here instead.</li>
              <li>The choices are optional. If you give only an answer, you add the wrong choices here.</li>
              <li>An answer key at the end, such as “Answers: 1.B 2.C 3.A”, is matched by number.</li>
              <li>There is no source unless you pick one below. A Ref line, if you add one, is added to it.</li>
              <li>
                The Topic line, such as “Topic: ELEX &gt; Circuits &gt; Basics”, puts that question in its own topic.
                Claude recommends one for each question. If it is not in your bank yet, you can edit it and create it,
                or pick a topic you have.
              </li>
            </ul>
          </div>
        </details>
        <details className="text-sm">
          <summary className="cursor-pointer underline">Show the instructions</summary>
          <textarea
            readOnly
            aria-label="Instructions for Claude"
            className="input mt-2 h-48 w-full font-mono text-xs"
            value={instructions}
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
          <p className="text-sm font-medium">Default topic (optional)</p>
          <p className="mb-1 text-xs text-muted">
            For questions with no Topic line. You can change the topic of any question below.
          </p>
          <TopicPicker nodes={nodes} value={defaultTopic} onChange={setDefaultTopic} />
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
                disabled={busy || addable.length === 0}
                onClick={() => void addAll()}
              >
                Add all ready ({addable.length})
              </button>
              {creatable.length > 0 && (
                <button className="btn py-1" disabled={busy} onClick={() => void createAllRecommended()}>
                  Create the recommended topics ({creatable.length})
                </button>
              )}
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
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={shown.length > 0 && shown.every((r) => chosen.includes(r.d.id))}
                  onChange={(e) => setSelected(e.target.checked ? shown.map((r) => r.d.id) : [])}
                />
                Select all shown
              </label>
              {chosen.length > 0 && <span className="text-muted">{chosen.length} selected</span>}
            </div>
            {chosen.length > 0 && (
              <div
                className="space-y-2 rounded-md border border-line bg-paper p-3"
                role="group"
                aria-label="Move selected"
              >
                <p className="text-sm font-medium">Move the selected questions to</p>
                <TopicPicker nodes={nodes} value={moveTo} onChange={setMoveTo} />
                <button className="btn btn-primary py-1" disabled={!moveTo} onClick={() => void moveSelected()}>
                  Move {chosen.length}
                </button>
              </div>
            )}
            <ul className="space-y-2">
              {shown.map(({ d, status }, i) => {
                const warnings = extractWarnings(d);
                const dup = isDuplicate(d);
                return (
                  <li key={d.id} className="space-y-2 rounded-md border border-line bg-surface p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        aria-label={`Select question ${i + 1}`}
                        checked={chosen.includes(d.id)}
                        onChange={(e) =>
                          setSelected((cur) => (e.target.checked ? [...cur, d.id] : cur.filter((x) => x !== d.id)))
                        }
                      />
                      <span className="text-muted">{i + 1}</span>
                      <span className={`rounded px-1.5 py-0.5 font-medium ${BADGE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                      {dup && (
                        <span className="rounded bg-danger/10 px-1.5 py-0.5 text-danger">Already in this topic?</span>
                      )}
                      {d.reference && <span className="text-muted">{d.reference}</span>}
                    </div>
                    <div className="space-y-1 text-xs">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-muted">Topic:</span>
                        <span className={d.topicId ? "" : "text-danger"}>
                          {d.topicId ? pathOf(nodes, d.topicId) : "none yet"}
                        </span>
                        <button
                          type="button"
                          className="underline"
                          aria-label={`Change topic of question ${i + 1}`}
                          onClick={() => setChanging(changing === d.id ? null : d.id)}
                        >
                          {changing === d.id ? "Done" : "Change"}
                        </button>
                      </p>
                      {d.proposedTopic && <Recommended key={d.id} d={d} nodes={nodes} entries={entries} />}
                      {changing === d.id && (
                        <TopicPicker
                          nodes={nodes}
                          value={d.topicId || null}
                          onChange={(id) => {
                            if (id) void setPastedTopic([d.id], id);
                          }}
                        />
                      )}
                    </div>
                    <CardTags d={d} />
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
                        {status === "needs-topic" && (
                          <p className="text-xs text-muted">
                            Settle the topic above: create the recommended one, or press Change.
                          </p>
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
                            disabled={status !== "ready"}
                            title={status !== "ready" ? "Finish this question first" : undefined}
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