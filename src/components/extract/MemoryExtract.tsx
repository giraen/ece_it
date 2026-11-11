"use client";

import { useMemo, useRef, useState } from "react";
import type { CardDraft, CardKind, TreeNode } from "@/lib/db";
import { useNodes, useTagSuggestions } from "@/lib/hooks";
import { categoriesOf } from "@/lib/bank/tree";
import { suggestWrongText, type Ask } from "@/lib/ai/wrongChoices";
import { CARD_KINDS, WRONG_CHOICES, useCards } from "@/lib/memory/cards";
import { isNumberAnswer } from "@/lib/memory/answer";
import {
  CARD_SAMPLE,
  DRAFT_STATUS_LABEL,
  acceptCardDraft,
  cardInstructions,
  createDraftSubject,
  discardCardDrafts,
  draftStatus,
  parseCards,
  saveCardDrafts,
  toCardDrafts,
  updateCardDraft,
  useCardDrafts,
  type DraftStatus,
} from "@/lib/memory/extractCards";
import { confirmAction } from "@/lib/ui/dialog";
import { CATEGORY_STYLE, categoryKey } from "@/components/ui/CategoryChip";
import InfoTip from "@/components/ui/InfoTip";
import LoadingScreen from "@/components/layout/LoadingScreen";
import RichText from "@/components/ui/RichText";
import SuggestWrong from "@/components/editor/SuggestWrong";
import TagInput from "@/components/editor/TagInput";

const BADGE: Record<DraftStatus, string> = {
  ready: "bg-good/10 text-good",
  "needs-deck": "bg-accent-soft text-accent",
  "needs-wrong": "bg-accent-soft text-accent",
  duplicate: "bg-priority/10 text-priority",
  problem: "bg-danger/10 text-danger",
};

/** One read card, to check and fix before it goes in the bank. */
function DraftRow({
  d,
  status,
  nodes,
  categories,
}: {
  d: CardDraft;
  status: DraftStatus;
  nodes: TreeNode[];
  categories: TreeNode[];
}) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(d.prompt);
  const [answer, setAnswer] = useState(d.answer);
  const number = isNumberAnswer(d.answer);
  const wrong = [...d.wrong, ...Array(WRONG_CHOICES).fill("")].slice(0, WRONG_CHOICES);
  const emptyWrong = wrong.filter((w) => !w.trim()).length;
  const subjects = nodes.filter(
    (n) => n.kind === "subject" && !n.deletedAt && d.categoryId && categoriesOf(n).includes(d.categoryId),
  );
  const cat = categories.find((c) => c.id === d.categoryId);
  const key = categoryKey(cat?.name);
  const set = (patch: Partial<CardDraft>) => void updateCardDraft(d.id, patch);

  async function suggest(ask: Ask, count: number): Promise<number> {
    const list = await suggestWrongText({
      ask,
      stem: d.prompt,
      correct: d.answer,
      others: wrong.filter((w) => w.trim()),
      count,
    });
    let k = 0;
    set({ wrong: wrong.map((w) => (!w.trim() && k < list.length ? list[k++] : w)).filter((w) => w.trim()) });
    return list.length;
  }

  return (
    <li className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start gap-2">
        {key && <span aria-hidden="true" className={`mt-1.5 size-2.5 rounded-sm ${CATEGORY_STYLE[key].bar}`} />}
        <div className="min-w-0 flex-1 space-y-1">
          {editing ? (
            <div className="space-y-2">
              <input className="input" aria-label="Prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              <input className="input" aria-label="Answer" value={answer} onChange={(e) => setAnswer(e.target.value)} />
              <div className="flex gap-2">
                <button
                  className="btn py-1"
                  onClick={() => {
                    set({
                      prompt: prompt.trim(),
                      answer: answer.trim(),
                      wrong: isNumberAnswer(answer) ? [] : d.wrong,
                    });
                    setEditing(false);
                  }}
                >
                  Done
                </button>
                <button
                  className="btn py-1"
                  onClick={() => {
                    setPrompt(d.prompt);
                    setAnswer(d.answer);
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <RichText text={d.prompt || "No prompt"} className="font-medium" />
              <RichText text={d.answer || "No answer"} className="text-sm" />
            </>
          )}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[status]}`}>
          {DRAFT_STATUS_LABEL[status]}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select
          className="input"
          aria-label="Deck"
          value={d.categoryId ?? ""}
          onChange={(e) => {
            const id = e.target.value || undefined;
            const keep = nodes.find((n) => n.id === d.subjectId);
            set({ categoryId: id, subjectId: keep && id && categoriesOf(keep).includes(id) ? d.subjectId : undefined });
          }}
        >
          <option value="">Choose a deck</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Subject"
          value={d.subjectId ?? ""}
          disabled={!d.categoryId}
          onChange={(e) => set({ subjectId: e.target.value || undefined, newSubject: undefined })}
        >
          <option value="">{d.newSubject ? `New: ${d.newSubject}` : "No subject"}</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Kind"
          value={d.kind}
          onChange={(e) => set({ kind: e.target.value as CardKind })}
        >
          {CARD_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      {d.newSubject && d.categoryId && !d.subjectId && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">
            Claude recommends a new subject, &ldquo;{d.newSubject}&rdquo;, in{" "}
            {categories.find((c) => c.id === d.categoryId)?.name}.
          </span>
          <button className="btn py-1" onClick={() => void createDraftSubject(d)}>
            Create it
          </button>
        </p>
      )}

      {number ? (
        <p className="text-xs text-muted">A number: its wrong choices are made in each review.</p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs text-muted">Wrong choices</p>
          {!editing && emptyWrong === 0 ? (
            <ul className="space-y-1">
              {wrong.map((w, i) => (
                <li key={i} className="rounded-md border border-line px-3 py-1.5 text-sm">
                  <RichText text={w} />
                </li>
              ))}
            </ul>
          ) : (
            wrong.map((w, i) => (
              <input
                // Keyed by its text too, so choices the AI fills in show up.
                key={`${i}:${w}`}
                className="input py-1.5 text-sm"
                aria-label={`Wrong choice ${i + 1}`}
                placeholder={`Wrong choice ${i + 1}`}
                defaultValue={w}
                onBlur={(e) => {
                  if (e.target.value === w) return;
                  const next = wrong.map((x, j) => (j === i ? e.target.value : x));
                  set({ wrong: next.filter((x) => x.trim()) });
                }}
              />
            ))
          )}
          {emptyWrong > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <SuggestWrong
                compact
                blocked={!d.prompt.trim() || !d.answer.trim() ? "Write the prompt and answer first." : null}
                count={emptyWrong}
                onSuggest={suggest}
              />
            </div>
          )}
        </div>
      )}

      {d.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {d.tags.map((t) => (
            <span key={t} className="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <button className="btn btn-primary py-1" disabled={status !== "ready"} onClick={() => void acceptCardDraft(d)}>
          Add to bank
        </button>
        {!editing && (
          <button className="btn py-1" onClick={() => setEditing(true)}>
            Edit text
          </button>
        )}
        <button className="btn py-1 ml-auto" onClick={() => void discardCardDrafts([d.id])}>
          Discard
        </button>
      </div>
    </li>
  );
}

/** Extract › Memory cards: paste text in the card format, check the cards, and add them. */
export default function MemoryExtract() {
  const nodes = useNodes();
  const cards = useCards();
  const drafts = useCardDrafts();
  const tagHelp = useTagSuggestions(null);
  const pasteBox = useRef<HTMLTextAreaElement>(null);
  const [hasText, setHasText] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deck, setDeck] = useState("");
  const [bulkTags, setBulkTags] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<DraftStatus | "all">("all");
  const [busy, setBusy] = useState(false);

  const categories = useMemo(
    () => (nodes ?? []).filter((n) => n.kind === "category" && !n.deletedAt).sort((a, b) => a.order - b.order),
    [nodes],
  );
  if (!nodes || !cards || !drafts) return <LoadingScreen />;

  const instructions = cardInstructions(nodes, tagHelp);
  const rows = drafts.map((d) => ({ d, status: draftStatus(d, cards) }));
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const ready = rows.filter((r) => r.status === "ready");
  const count = (s: DraftStatus) => rows.filter((r) => r.status === s).length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(instructions);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({ ok: false, text: "Copying was blocked. Open “Show the instructions” and copy them from there." });
    }
  }

  async function read() {
    const text = pasteBox.current?.value ?? "";
    const parsed = parseCards(text);
    if (!parsed.length) {
      setMessage({ ok: false, text: "No cards found. Each card starts with a “Card:” line, as in the format." });
      return;
    }
    await saveCardDrafts(toCardDrafts(parsed, nodes!, { categoryId: deck || null, subjectId: null, tags: bulkTags }));
    if (pasteBox.current) pasteBox.current.value = "";
    setHasText(false);
    setMessage({ ok: true, text: `Read ${parsed.length} card${parsed.length === 1 ? "" : "s"}. Check them below.` });
  }

  async function addAll() {
    setBusy(true);
    try {
      for (const r of ready) await acceptCardDraft(r.d);
      setMessage({ ok: true, text: `Added ${ready.length} card${ready.length === 1 ? "" : "s"} to the bank.` });
    } finally {
      setBusy(false);
    }
  }

  async function discardAll() {
    if (
      !(await confirmAction({
        title: `Discard all ${drafts!.length} cards waiting here?`,
        confirmLabel: "Discard",
        danger: true,
      }))
    )
      return;
    await discardCardDrafts(drafts!.map((d) => d.id));
  }

  const filters: { id: DraftStatus | "all"; label: string; n: number }[] = [
    { id: "all", label: "All", n: rows.length },
    { id: "ready", label: "Ready", n: count("ready") },
    { id: "needs-wrong", label: "Needs wrong choices", n: count("needs-wrong") },
    { id: "needs-deck", label: "Needs a deck", n: count("needs-deck") },
    { id: "duplicate", label: "Already in the bank", n: count("duplicate") },
    { id: "problem", label: "Needs text", n: count("problem") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Extract memory cards</h1>
        <p className="mt-1 text-sm text-muted">
          Let Claude pull every constant, conversion, formula, principle, definition, unit and range out of your notes.
          Check the cards here, then add them to Bank › Memory.
        </p>
      </div>

      <section aria-label="Get the text" className="space-y-3 rounded-md border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">1. Get the cards in the format</h2>
          <InfoTip>
            Open a chat with Claude, attach your notes, PDF or pictures, and paste the instructions. Claude writes one
            card per fact, with near-miss wrong choices for formulas and statements. You can also type cards in the
            format yourself.
          </InfoTip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy instructions for Claude"}
          </button>
          <span className="text-sm text-muted">Paste them in a chat, with your notes attached.</span>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer underline">Show the format</summary>
          <div className="mt-2 space-y-2">
            <pre className="overflow-x-auto rounded border border-line bg-surface p-3 text-xs">{CARD_SAMPLE}</pre>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>Start each card with a Card line, and put a blank line between cards.</li>
              <li>A number answer needs no Wrong lines. Any other answer needs three.</li>
              <li>Deck and Subject are matched to your bank. A subject you do not have yet can be created below.</li>
              <li>Kind, Subject and Tags are optional.</li>
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
          ref={pasteBox}
          aria-label="Pasted cards"
          className="input h-56 w-full font-mono text-sm"
          placeholder={CARD_SAMPLE}
          onChange={(e) => setHasText(e.target.value.trim() !== "")}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="extract-deck" className="mb-1 block text-sm font-medium">
              Default deck (optional)
            </label>
            <select id="extract-deck" className="input" value={deck} onChange={(e) => setDeck(e.target.value)}>
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">For cards with no Deck line.</p>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">Tags for every card (optional)</p>
            <TagInput value={bulkTags} onChange={setBulkTags} suggestions={tagHelp} limit={8} emptyLimit={3} />
          </div>
        </div>
        <button className="btn btn-primary" disabled={!hasText} onClick={() => void read()}>
          Read it
        </button>
        {message && (
          <p role="status" className={`text-sm ${message.ok ? "text-good" : "text-danger"}`}>
            {message.text}
          </p>
        )}
      </section>

      <section aria-label="Cards to review" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">3. Check and add ({rows.length})</h2>
          {rows.length > 0 && (
            <>
              <button
                className="btn btn-primary py-1"
                disabled={busy || ready.length === 0}
                onClick={() => void addAll()}
              >
                Add all ready ({ready.length})
              </button>
              <button className="btn py-1" disabled={busy} onClick={() => void discardAll()}>
                Discard all
              </button>
            </>
          )}
        </div>
        {rows.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
            {filters
              .filter((f) => f.id === "all" || f.n > 0)
              .map((f) => (
                <button
                  key={f.id}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    filter === f.id ? "border-accent bg-accent-soft font-medium text-accent" : "border-line"
                  }`}
                >
                  {f.label} <span className="num text-xs">{f.n}</span>
                </button>
              ))}
          </div>
        )}
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">
            Cards you read appear here to check. They stay on this device until you add or discard them.
          </p>
        ) : (
          <ul className="space-y-3">
            {shown.map(({ d, status }) => (
              <DraftRow key={d.id} d={d} status={status} nodes={nodes} categories={categories} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
