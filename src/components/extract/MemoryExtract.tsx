"use client";

import { useMemo, useRef, useState } from "react";
import { db, type CardDraft, type CardKind, type MemoryCard, type TreeNode } from "@/lib/db";
import { useNodes } from "@/lib/hooks";
import { categoriesOf } from "@/lib/bank/tree";
import { suggestWrongText, type Ask } from "@/lib/ai/wrongChoices";
import { CARD_KINDS, WRONG_CHOICES, useCardTagSuggestions, useCards, variantCount } from "@/lib/memory/cards";
import { isNumberAnswer } from "@/lib/memory/answer";
import {
  CARD_SAMPLE,
  DRAFT_STATUS_LABEL,
  acceptCardDraft,
  addDraftTags,
  cardInstructions,
  createAllDraftSubjects,
  createDraftSubject,
  discardCardDrafts,
  draftStatus,
  findDuplicate,
  findMain,
  moveCardDrafts,
  parseCards,
  removeDraftTag,
  restoreCardDrafts,
  saveCardDrafts,
  snapshotCardDrafts,
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
import AlsoIn from "@/components/editor/AlsoIn";
import TagInput from "@/components/editor/TagInput";
import CardBar, { useUndoToast } from "@/components/memory/CardBar";
import { motionReduced } from "@/lib/ui/motion";

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

const BADGE: Record<DraftStatus, string> = {
  ready: "bg-good/10 text-good",
  "needs-deck": "bg-accent-soft text-accent",
  "needs-wrong": "bg-accent-soft text-accent",
  duplicate: "bg-priority/10 text-priority",
  problem: "bg-danger/10 text-danger",
  "waits-main": "bg-accent-soft text-accent",
  "needs-main": "bg-priority/10 text-priority",
};

/** How a card leaves the list: it slides right, then the cards below move up. */
type Leaving = { h: number; phase: "out" | "collapse" };

/** One read card, to check and fix before it goes in the bank. Laid out like a question in Extract. */
function DraftRow({
  d,
  number: index,
  status,
  nodes,
  categories,
  tags,
  twin,
  main,
  selected,
  onSelect,
  leaving,
  onAdd,
  onDiscard,
}: {
  d: CardDraft;
  number: number;
  status: DraftStatus;
  nodes: TreeNode[];
  categories: TreeNode[];
  tags: string[];
  /** The card in the bank with the same prompt, when this looks like a repeat. */
  twin?: MemoryCard;
  /** For a variant: the card in the bank it joins. */
  main?: MemoryCard;
  selected: boolean;
  onSelect: (on: boolean) => void;
  leaving?: Leaving;
  onAdd: () => void;
  onDiscard: () => void;
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
    <li
      id={`card-draft-${d.id}`}
      style={
        leaving
          ? {
              height: leaving.phase === "collapse" ? 0 : leaving.h,
              ...(leaving.phase === "collapse"
                ? { marginBottom: 0, paddingTop: 0, paddingBottom: 0, borderTopWidth: 0, borderBottomWidth: 0 }
                : {}),
            }
          : undefined
      }
      className={`mb-2 space-y-2 rounded-md border bg-surface p-3 transition-[transform,opacity,height,margin,padding,border-width] duration-200 motion-reduce:transition-none ${
        selected ? "border-accent ring-2 ring-accent/25" : "border-line"
      } ${leaving ? "translate-x-16 overflow-hidden opacity-0" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input
          type="checkbox"
          aria-label={`Select card ${index}`}
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
        />
        <span className="text-muted">{index}</span>
        <span className={`rounded px-1.5 py-0.5 font-medium ${BADGE[status]}`}>{DRAFT_STATUS_LABEL[status]}</span>
        {key && (
          <span className="flex items-center gap-1 text-muted">
            <span aria-hidden="true" className={`size-2 rounded-sm ${CATEGORY_STYLE[key].bar}`} />
            {cat?.name}
          </span>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <label className="block space-y-1 text-xs">
            <span className="text-muted">Prompt</span>
            <input className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </label>
          <label className="block space-y-1 text-xs">
            <span className="text-muted">Answer</span>
            <input className="input" value={answer} onChange={(e) => setAnswer(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button
              className="btn btn-primary py-1"
              onClick={() => {
                set({ prompt: prompt.trim(), answer: answer.trim(), wrong: isNumberAnswer(answer) ? [] : d.wrong });
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
        <div className="space-y-1">
          {d.prompt ? (
            <RichText text={d.prompt} className="text-[15px] font-medium" />
          ) : (
            <p className="text-sm text-muted">No prompt.</p>
          )}
          <div className="rounded border border-good bg-good/5 px-2 py-1 text-sm">
            {d.answer ? <RichText text={d.answer} /> : <span className="text-muted">No answer.</span>}
          </div>
        </div>
      )}

      {d.variantOf ? (
        <div className="space-y-1.5 rounded-md border border-accent/40 bg-accent-soft/40 p-2 text-xs">
          <p className="text-muted">Variant of</p>
          {main ? (
            <>
              <RichText text={main.prompt} className="text-sm font-medium" />
              <p className="text-muted">
                Added, it joins this card as variant {variantCount(main) + 1}, sharing its deck, subject and box.
              </p>
            </>
          ) : (
            <p className="text-sm">&ldquo;{d.variantOf}&rdquo;</p>
          )}
          {status === "waits-main" && (
            <p className="text-muted">Its main card is still waiting here. Add it first, or use Add all ready.</p>
          )}
          {status === "needs-main" && <p className="text-priority">No card in your bank or here has that prompt.</p>}
          {!main && (
            <button className="underline" onClick={() => set({ variantOf: undefined })}>
              Make it its own card
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <select
              className="input py-1.5"
              aria-label="Deck"
              value={d.categoryId ?? ""}
              onChange={(e) => {
                const id = e.target.value || undefined;
                const keep = nodes.find((n) => n.id === d.subjectId);
                set({
                  categoryId: id,
                  subjectId: keep && id && categoriesOf(keep).includes(id) ? d.subjectId : undefined,
                });
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
              className="input py-1.5"
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
              className="input py-1.5"
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
              <button className="btn btn-primary py-1" onClick={() => void createDraftSubject(d)}>
                Create it
              </button>
            </p>
          )}

          <AlsoIn
            compact
            value={d.also ?? []}
            onChange={(next) => set({ also: next.length ? next : undefined })}
            home={{ categoryId: d.categoryId ?? "", subjectId: d.subjectId }}
            nodes={nodes}
            idPrefix={`draft-${d.id}`}
          />
          {(d.alsoMissing ?? []).map((text) => (
            <p key={text} className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>
                Also named &ldquo;{text}&rdquo;, which is not in your bank, so it is left out. Share it above if it
                means one of yours.
              </span>
              <button
                className="underline"
                onClick={() => {
                  const rest = (d.alsoMissing ?? []).filter((x) => x !== text);
                  set({ alsoMissing: rest.length ? rest : undefined });
                }}
              >
                Dismiss
              </button>
            </p>
          ))}
        </>
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

      <div className="space-y-1 text-xs">
        <p className="text-muted">Tags</p>
        <TagInput value={d.tags} onChange={(next) => set({ tags: next })} suggestions={tags} limit={8} emptyLimit={3} />
      </div>

      {status === "needs-deck" && <p className="text-xs text-muted">Choose a deck above.</p>}
      {status === "needs-wrong" && (
        <p className="text-xs text-muted">Fill in the wrong choices above, or let AI suggest them.</p>
      )}
      {status === "duplicate" && twin && (
        <div className="space-y-1 rounded-md border border-priority/40 bg-priority/5 p-2 text-xs">
          <p className="text-priority">This deck already has a card with the same prompt. Its answer:</p>
          <RichText text={twin.answer} className="text-sm" />
          <p className="text-muted">
            If it is the same fact, discard this one. If it is different, add it anyway, ideally after editing the
            prompt so the two are easy to tell apart.
          </p>
        </div>
      )}
      {!editing && (
        <div className="flex gap-2">
          <button
            className="btn btn-primary py-1"
            disabled={status !== "ready" && status !== "duplicate"}
            title={status !== "ready" && status !== "duplicate" ? "Finish this card first" : undefined}
            onClick={onAdd}
          >
            {status === "duplicate" ? "Add anyway" : "Add to the memory bank"}
          </button>
          <button className="btn py-1" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="btn btn-danger py-1" onClick={onDiscard}>
            Discard
          </button>
        </div>
      )}
    </li>
  );
}

/** Extract › Memory cards: paste text in the card format, check the cards, and add them. */
export default function MemoryExtract() {
  const nodes = useNodes();
  const cards = useCards();
  const drafts = useCardDrafts();
  const tagHelp = useCardTagSuggestions();
  const pasteBox = useRef<HTMLTextAreaElement>(null);
  const [hasText, setHasText] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deck, setDeck] = useState("");
  const [bulkTags, setBulkTags] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<DraftStatus | "all">("all");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<Record<string, Leaving>>({});
  const { toast, say, dismiss } = useUndoToast();

  const categories = useMemo(
    () => (nodes ?? []).filter((n) => n.kind === "category" && !n.deletedAt).sort((a, b) => a.order - b.order),
    [nodes],
  );
  if (!nodes || !cards || !drafts) return <LoadingScreen />;

  const instructions = cardInstructions(nodes, tagHelp);
  const rows = drafts.map((d) => ({ d, status: draftStatus(d, cards, drafts) }));
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const ready = rows.filter((r) => r.status === "ready");
  // Variants whose main card is among the ready ones: Add all ready adds them right after it.
  const following = rows.filter((r) => r.status === "waits-main");
  const count = (s: DraftStatus) => rows.filter((r) => r.status === s).length;
  const chosen = selected.filter((id) => drafts.some((d) => d.id === id));
  const creatable = new Set(
    drafts.filter((d) => d.newSubject && d.categoryId && !d.subjectId).map((d) => `${d.categoryId}/${d.newSubject}`),
  ).size;

  /** Slides the cards away, lets the rest move up, and only then makes the change. */
  async function leave(ids: string[], run: () => Promise<void>) {
    const start: Record<string, Leaving> = {};
    for (const id of ids) {
      const el = document.getElementById(`card-draft-${id}`);
      if (el) start[id] = { h: el.offsetHeight, phase: "out" };
    }
    if (Object.keys(start).length === 0 || motionReduced()) {
      await run();
      return;
    }
    setLeaving(start);
    await sleep(170);
    setLeaving((cur) => Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, { ...v, phase: "collapse" }])));
    await sleep(260);
    await run();
    window.setTimeout(() => setLeaving({}), 300);
  }

  /** Discards cards at once, with Undo, as questions do. */
  async function discard(ids: string[]): Promise<() => Promise<void>> {
    const before = await snapshotCardDrafts(ids);
    await leave(ids, () => discardCardDrafts(ids));
    setSelected((cur) => cur.filter((x) => !ids.includes(x)));
    return () => restoreCardDrafts(before);
  }

  /** Runs a change to many drafts and hands back its undo. */
  async function change(ids: string[], run: () => Promise<void>): Promise<() => Promise<void>> {
    const before = await snapshotCardDrafts(ids);
    await run();
    return () => restoreCardDrafts(before);
  }

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
      let added = ready.length;
      await leave(
        ready.map((r) => r.d.id),
        async () => {
          for (const r of ready) await acceptCardDraft(r.d);
          // Variants waiting for a main card added just now join it.
          const bank = await db.cards.filter((c) => !c.deletedAt).toArray();
          for (const r of following) {
            const fresh = await db.cardDrafts.get(r.d.id);
            if (fresh && draftStatus(fresh, bank) === "ready") {
              await acceptCardDraft(fresh);
              added++;
            }
          }
        },
      );
      const left = count("duplicate");
      setMessage({
        ok: true,
        text: `Added ${added} card${added === 1 ? "" : "s"} to the bank.${
          left
            ? ` ${left} looked like ${left === 1 ? "a card" : "cards"} already there and ${left === 1 ? "was" : "were"} left for you to check.`
            : ""
        }`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function discardAll() {
    if (
      !(await confirmAction({
        title: `Throw away all ${drafts!.length} cards waiting here?`,
        confirmLabel: "Clear all",
        danger: true,
      }))
    )
      return;
    const undo = await discard(drafts!.map((d) => d.id));
    say(`${drafts!.length} card${drafts!.length === 1 ? "" : "s"} cleared`, undo);
  }

  async function createAll() {
    setBusy(true);
    try {
      const made = await createAllDraftSubjects();
      setMessage({ ok: true, text: `Created ${made} subject${made === 1 ? "" : "s"}.` });
    } finally {
      setBusy(false);
    }
  }

  const filters: { id: DraftStatus | "all"; label: string; n: number }[] = [
    { id: "all", label: "All", n: rows.length },
    { id: "ready", label: "Ready", n: count("ready") },
    { id: "needs-wrong", label: "Needs wrong choices", n: count("needs-wrong") },
    { id: "needs-deck", label: "Needs a deck", n: count("needs-deck") },
    { id: "duplicate", label: "Already in the bank?", n: count("duplicate") },
    { id: "waits-main", label: "Waits for its main card", n: count("waits-main") },
    { id: "needs-main", label: "Main card not found", n: count("needs-main") },
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
            card per fact, with near-miss wrong choices for formulas and statements, and variants for a fact worth
            asking more than one way. You can also type cards in the format yourself.
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
              <li>
                An Also line, such as “Also: ELEX › Electromagnetics”, files the same card in another deck or subject
                too. It stays one card.
              </li>
              <li>
                A Variant of line, copying another card&apos;s prompt, makes the card a variant of that one: the same
                fact asked another way. It joins that card, in your bank or waiting here, instead of being a new card.
              </li>
              <li>A card that looks like one already in its deck is marked “Already in the bank?”.</li>
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
              {creatable > 0 && (
                <button className="btn py-1" disabled={busy} onClick={() => void createAll()}>
                  Create the recommended subjects ({creatable})
                </button>
              )}
              <button className="btn btn-danger py-1" disabled={busy} onClick={() => void discardAll()}>
                Clear all
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
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    filter === f.id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
                  }`}
                >
                  {f.label} {f.n}
                </button>
              ))}
          </div>
        )}
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">
            Cards you read appear here to check. They stay on this device until you add or discard them.
          </p>
        ) : (
          <>
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
            <ul>
              {shown.map(({ d, status }, i) => (
                <DraftRow
                  key={d.id}
                  d={d}
                  number={i + 1}
                  status={status}
                  nodes={nodes}
                  categories={categories}
                  tags={tagHelp}
                  twin={status === "duplicate" ? findDuplicate(d, cards) : undefined}
                  main={d.variantOf ? findMain(d, cards) : undefined}
                  selected={chosen.includes(d.id)}
                  onSelect={(on) => setSelected((cur) => (on ? [...cur, d.id] : cur.filter((x) => x !== d.id)))}
                  leaving={leaving[d.id]}
                  onAdd={() => void leave([d.id], () => acceptCardDraft(d))}
                  onDiscard={() => void discard([d.id]).then((undo) => say("1 card discarded", undo))}
                />
              ))}
            </ul>
          </>
        )}
        <CardBar
          chosen={drafts.filter((d) => chosen.includes(d.id)).map((d) => ({ id: d.id, tags: d.tags }))}
          suggestions={tagHelp}
          visibleCount={shown.length}
          onSelectAll={() => setSelected(shown.map((r) => r.d.id))}
          onClear={() => setSelected([])}
          onAddTags={(ids, tags) => change(ids, () => addDraftTags(ids, tags))}
          onRemoveTag={(ids, tag) => change(ids, () => removeDraftTag(ids, tag))}
          move={{ nodes, run: (ids, place) => change(ids, () => moveCardDrafts(ids, place)) }}
          remove={{ label: "Discard", ask: false, run: discard }}
          toast={toast}
          say={say}
          dismiss={dismiss}
        />
      </section>
    </div>
  );
}
