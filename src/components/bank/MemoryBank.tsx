"use client";

import { useMemo, useState } from "react";
import type { CardKind, MemoryCard, TreeNode } from "@/lib/db";
import { categoriesOf, pathOf } from "@/lib/bank/tree";
import {
  CARD_KINDS,
  KIND_LABEL,
  WRONG_CHOICES,
  cardProblem,
  deleteCard,
  restoreCard,
  saveCard,
} from "@/lib/memory/cards";
import { isNumberAnswer } from "@/lib/memory/answer";
import { usePagination } from "@/lib/ui/usePagination";
import { CATEGORY_STYLE, categoryKey } from "@/components/ui/CategoryChip";
import Pagination from "@/components/ui/Pagination";
import RichText from "@/components/ui/RichText";
import InfoTip from "@/components/ui/InfoTip";

interface Props {
  nodes: TreeNode[];
  cards: MemoryCard[];
}

/** What the editor holds while you write. */
interface Draft {
  id?: string;
  categoryId: string;
  topicId: string;
  kind: CardKind;
  prompt: string;
  answer: string;
  wrong: string[];
  reference: string;
}

const blank = (categoryId: string, kind: CardKind = "constant"): Draft => ({
  categoryId,
  topicId: "",
  kind,
  prompt: "",
  answer: "",
  wrong: Array(WRONG_CHOICES).fill(""),
  reference: "",
});

const toDraft = (c: MemoryCard): Draft => ({
  id: c.id,
  categoryId: c.categoryId,
  topicId: c.topicId ?? "",
  kind: c.kind,
  prompt: c.prompt,
  answer: c.answer,
  wrong: [...c.wrong, ...Array(WRONG_CHOICES).fill("")].slice(0, Math.max(WRONG_CHOICES, c.wrong.length)),
  reference: c.reference ?? "",
});

/** The editor for one card: new, or one picked from the list. */
function CardEditor({
  draft,
  setDraft,
  categories,
  nodes,
  onDone,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  categories: TreeNode[];
  nodes: TreeNode[];
  onDone: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const number = isNumberAnswer(draft.answer);
  const problem = cardProblem(draft);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  // Topics under the chosen deck's category, by their full path.
  const topics = useMemo(() => {
    const subjects = new Set(
      nodes.filter((n) => n.kind === "subject" && categoriesOf(n).includes(draft.categoryId)).map((n) => n.id),
    );
    return nodes
      .filter((n) => n.kind === "topic" && n.parentId && subjects.has(n.parentId))
      .map((n) => ({ id: n.id, path: pathOf(nodes, n.id).split(" › ").slice(1).join(" › ") }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [nodes, draft.categoryId]);

  async function save(another: boolean) {
    setTried(true);
    if (problem) return;
    setBusy(true);
    try {
      await saveCard({
        id: draft.id,
        categoryId: draft.categoryId,
        topicId: draft.topicId || undefined,
        kind: draft.kind,
        prompt: draft.prompt,
        answer: draft.answer,
        wrong: draft.wrong,
        reference: draft.reference,
      });
      if (another) {
        setDraft(blank(draft.categoryId, draft.kind));
        setTried(false);
      } else onDone(draft.id ? "Saved the card." : "Added the card.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!draft.id) return;
    await deleteCard(draft.id);
    onDone("Deleted the card.");
  }

  return (
    <section aria-label={draft.id ? "Edit card" : "New card"} className="card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{draft.id ? "Edit card" : "New card"}</h2>
        <button className="text-sm text-muted underline" onClick={() => onDone(null)}>
          Close
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Deck</span>
          <select
            className="input"
            value={draft.categoryId}
            onChange={(e) => set({ categoryId: e.target.value, topicId: "" })}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Kind</span>
          <select className="input" value={draft.kind} onChange={(e) => set({ kind: e.target.value as CardKind })}>
            {CARD_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Prompt</span>
        <textarea
          className="input"
          rows={2}
          placeholder="Speed of light in a vacuum"
          value={draft.prompt}
          onChange={(e) => set({ prompt: e.target.value })}
        />
      </label>

      <div className="space-y-1 text-sm">
        <span className="flex items-center gap-1">
          <label htmlFor="card-answer" className="font-medium">
            Answer
          </label>
          <InfoTip>
            Write maths with LaTeX between dollar signs, such as $2.998 \times 10^8$ m/s. A number with a unit, or a
            range such as 30–300 MHz, gets its wrong choices made fresh in each review.
          </InfoTip>
        </span>
        <input
          id="card-answer"
          className="input"
          placeholder="$2.998 \times 10^8$ m/s"
          value={draft.answer}
          onChange={(e) => set({ answer: e.target.value })}
        />
      </div>

      {(draft.prompt.trim() || draft.answer.trim()) && (
        <div className="space-y-1 rounded-md bg-paper p-3 text-sm">
          <p className="eyebrow">Preview</p>
          {draft.prompt.trim() && <RichText text={draft.prompt} className="font-medium" />}
          {draft.answer.trim() && <RichText text={draft.answer} />}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Wrong choices</p>
        {number ? (
          <p className="rounded-md bg-accent-soft p-3 text-sm">
            The answer is a number, so close wrong choices are made fresh in each review (a digit off, the power of ten
            off by one, or a near value). There is nothing to write.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Make them nearly right: a flipped sign, a swapped variable, a missing factor, or one key word changed.
            </p>
            {draft.wrong.map((w, i) => (
              <input
                key={i}
                className="input"
                aria-label={`Wrong choice ${i + 1}`}
                placeholder={`Wrong choice ${i + 1}`}
                value={w}
                onChange={(e) => set({ wrong: draft.wrong.map((x, j) => (j === i ? e.target.value : x)) })}
              />
            ))}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Topic (optional)</span>
          <select className="input" value={draft.topicId} onChange={(e) => set({ topicId: e.target.value })}>
            <option value="">None</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.path}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Source (optional)</span>
          <input
            className="input"
            placeholder="Book, page, or note"
            value={draft.reference}
            onChange={(e) => set({ reference: e.target.value })}
          />
        </label>
      </div>

      {tried && problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy} onClick={() => void save(false)}>
          {draft.id ? "Save" : "Add card"}
        </button>
        {!draft.id && (
          <button className="btn" disabled={busy} onClick={() => void save(true)}>
            Add and write another
          </button>
        )}
        {draft.id && (
          <button className="btn btn-danger ml-auto" disabled={busy} onClick={() => void remove()}>
            Delete
          </button>
        )}
      </div>
    </section>
  );
}

/** Bank › Memory: the memory cards, one deck per category, and the editor for them. */
export default function MemoryBank({ nodes, cards }: Props) {
  const categories = useMemo(
    () => nodes.filter((n) => n.kind === "category").sort((a, b) => a.order - b.order),
    [nodes],
  );
  const [deck, setDeck] = useState<string | null>(null);
  const [kind, setKind] = useState<CardKind | "">("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ text: string; undoId?: string } | null>(null);

  const inDeck = deck ? cards.filter((c) => c.categoryId === deck) : cards;
  const q = search.trim().toLowerCase();
  const shown = inDeck
    .filter((c) => !kind || c.kind === kind)
    .filter((c) => !q || `${c.prompt} ${c.answer} ${c.wrong.join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.order - b.order);
  const { page, pages, setPage, reset, pageItems, pageSize } = usePagination(shown);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";

  const pickDeck = (id: string | null) => {
    setDeck(id);
    reset();
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <nav aria-label="Decks" className="flex flex-col gap-1 max-lg:flex-row max-lg:flex-wrap">
        {[{ id: null as string | null, name: "All decks" }, ...categories].map((c) => {
          const count = c.id ? cards.filter((x) => x.categoryId === c.id).length : cards.length;
          const key = categoryKey(c.name);
          const on = deck === c.id;
          return (
            <button
              key={c.id ?? "all"}
              aria-current={on ? "true" : undefined}
              onClick={() => pickDeck(c.id)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                on ? "bg-accent-soft font-medium text-accent" : "hover:bg-paper"
              }`}
            >
              {key && <span aria-hidden="true" className={`size-2.5 rounded-sm ${CATEGORY_STYLE[key].bar}`} />}
              <span className="flex-1">{c.name}</span>
              <span className={`num text-xs ${on ? "" : "text-muted"}`}>{count}</span>
            </button>
          );
        })}
      </nav>

      <div className={`grid items-start gap-6 ${draft ? "xl:grid-cols-[minmax(0,1fr)_26rem]" : ""}`}>
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input min-w-48 flex-1"
              aria-label="Search cards"
              placeholder={deck ? `Search ${catName(deck)} cards` : "Search cards"}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                reset();
              }}
            />
            <select
              className="input w-auto"
              aria-label="Kind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as CardKind | "");
                reset();
              }}
            >
              <option value="">All kinds</option>
              {CARD_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.plural}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              onClick={() => {
                setMessage(null);
                setDraft(blank(deck ?? categories[0]?.id ?? ""));
              }}
            >
              Add card
            </button>
          </div>

          {message && (
            <p role="status" className="flex items-center gap-3 text-sm text-accent">
              {message.text}
              {message.undoId && (
                <button
                  className="underline"
                  onClick={() => {
                    void restoreCard(message.undoId!);
                    setMessage({ text: "Brought the card back." });
                  }}
                >
                  Undo
                </button>
              )}
            </p>
          )}

          {shown.length === 0 ? (
            <p className="card p-6 text-sm text-muted">
              {cards.length === 0
                ? "No memory cards yet. Add the constants, conversions, formulas, principles, definitions, units and ranges you need to know by heart."
                : "No cards match."}
            </p>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="px-4 py-2.5 font-medium">Prompt</th>
                    <th className="px-4 py-2.5 font-medium">Answer</th>
                    <th className="px-4 py-2.5 font-medium">Kind</th>
                    <th className="px-4 py-2.5 font-medium">Wrong choices</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => {
                    const key = categoryKey(catName(c.categoryId));
                    return (
                      <tr
                        key={c.id}
                        className={`cursor-pointer border-t border-line hover:bg-paper ${
                          draft?.id === c.id ? "bg-accent-soft" : ""
                        }`}
                        onClick={() => {
                          setMessage(null);
                          setDraft(toDraft(c));
                        }}
                      >
                        <td className="px-4 py-2.5">
                          <button
                            className="flex items-start gap-2 text-left"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMessage(null);
                              setDraft(toDraft(c));
                            }}
                          >
                            {!deck && key && (
                              <span
                                aria-label={catName(c.categoryId)}
                                className={`mt-1.5 size-2 shrink-0 rounded-sm ${CATEGORY_STYLE[key].bar}`}
                              />
                            )}
                            <RichText text={c.prompt} />
                          </button>
                        </td>
                        <td className="px-4 py-2.5">
                          <RichText text={c.answer} />
                        </td>
                        <td className="px-4 py-2.5 text-muted">{KIND_LABEL[c.kind]}</td>
                        <td className="px-4 py-2.5 text-muted">
                          {isNumberAnswer(c.answer) ? "Made each review" : `${c.wrong.length} written`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} pages={pages} total={shown.length} pageSize={pageSize} onChange={setPage} />
        </section>

        {draft && (
          <div className="xl:sticky xl:top-4">
            <CardEditor
              key={draft.id ?? "new"}
              draft={draft}
              setDraft={setDraft}
              categories={categories}
              nodes={nodes}
              onDone={(text) => {
                const id = draft.id;
                setDraft(null);
                if (text) setMessage({ text, undoId: text.startsWith("Deleted") ? id : undefined });
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
