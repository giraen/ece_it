"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CardKind, MemoryCard, TreeNode } from "@/lib/db";
import { useTagSuggestions } from "@/lib/hooks";
import { confirmAction } from "@/lib/ui/dialog";
import { categoriesOf } from "@/lib/bank/tree";
import { suggestWrongText, type Ask } from "@/lib/ai/wrongChoices";
import { CARD_KINDS, WRONG_CHOICES, cardProblem, cardSubject, deleteCard, saveCard } from "@/lib/memory/cards";
import { isNumberAnswer } from "@/lib/memory/answer";
import { reviewChoices } from "@/lib/memory/choices";
import ImageTextarea from "./ImageTextarea";
import ToolbarGroup from "./ToolbarGroup";
import SuggestWrong from "./SuggestWrong";
import TagInput from "./TagInput";
import RichText from "@/components/ui/RichText";
import InfoTip from "@/components/ui/InfoTip";

const LETTERS = "ABCD";

interface Props {
  /** The card being edited, or null for a new one. */
  initial: MemoryCard | null;
  /** The deck a new card starts in. */
  defaultDeck: string | null;
  /** The subject a new card starts in. */
  defaultSubject: string | null;
  nodes: TreeNode[];
}

const MATH_TIP =
  "Maths goes between dollar signs, like $x^2$, the same as in questions. The buttons above the box insert it for you, and you can paste or drop a picture.";

/** The editor for a memory card: the same tools as the question editor, for a prompt, its answer, and near misses. */
export default function CardEditor({ initial, defaultDeck, defaultSubject, nodes }: Props) {
  const router = useRouter();
  const categories = useMemo(
    () => nodes.filter((n) => n.kind === "category").sort((a, b) => a.order - b.order),
    [nodes],
  );
  const [deck, setDeck] = useState(initial?.categoryId ?? defaultDeck ?? categories[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(
    () => (initial ? cardSubject(initial, new Map(nodes.map((n) => [n.id, n]))) : defaultSubject) ?? "",
  );
  const [kind, setKind] = useState<CardKind>(initial?.kind ?? "constant");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [wrong, setWrong] = useState<string[]>(() =>
    [...(initial?.wrong ?? []), ...Array(WRONG_CHOICES).fill("")].slice(0, WRONG_CHOICES),
  );
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [errors, setErrors] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draw, setDraw] = useState(0);
  const suggestions = useTagSuggestions(null);

  const number = isNumberAnswer(answer);

  // The subjects in the chosen deck.
  const subjects = useMemo(
    () =>
      nodes
        .filter((n) => n.kind === "subject" && !n.deletedAt && categoriesOf(n).includes(deck))
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    [nodes, deck],
  );

  // What a review would show. A number answer gets new near misses each time, so the preview can draw again.
  const preview = useMemo(() => {
    void draw;
    if (!answer.trim()) return [];
    if (!number && wrong.every((w) => !w.trim())) return [{ text: answer, correct: true }];
    return reviewChoices({
      id: "",
      categoryId: deck,
      kind,
      prompt,
      answer,
      wrong,
      order: 0,
      createdAt: 0,
      updatedAt: 0,
    });
  }, [answer, wrong, number, deck, kind, prompt, draw]);

  const emptyWrong = wrong.filter((w) => !w.trim()).length;
  const suggestBlock = !prompt.trim()
    ? "Write the prompt first."
    : !answer.trim()
      ? "Write the answer first."
      : emptyWrong === 0
        ? "Every wrong choice is filled in. Empty the ones you want replaced."
        : null;

  async function suggest(ask: Ask, count: number): Promise<number> {
    const others = wrong.filter((w) => w.trim());
    const list = await suggestWrongText({ ask, stem: prompt, correct: answer, others, count });
    setWrong((ws) => {
      let k = 0;
      return ws.map((w) => (!w.trim() && k < list.length ? list[k++] : w));
    });
    return list.length;
  }

  async function save(another: boolean) {
    const problem = cardProblem({ categoryId: deck, prompt, answer, wrong });
    setErrors(problem);
    setNotice(null);
    if (problem) return;
    setSaving(true);
    try {
      await saveCard({ id: initial?.id, categoryId: deck, subjectId, kind, prompt, answer, wrong, tags });
      if (another) {
        // The next card usually shares the deck, subject, kind and tags.
        setPrompt("");
        setAnswer("");
        setWrong(Array(WRONG_CHOICES).fill(""));
        setNotice("Saved. Ready for the next card.");
      } else router.push("/bank?tab=memory");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial) return;
    if (!(await confirmAction({ title: "Delete this card?", confirmLabel: "Delete", danger: true }))) return;
    await deleteCard(initial.id);
    router.push("/bank?tab=memory");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <h1 className="text-xl font-semibold">{initial ? "Edit memory card" : "New memory card"}</h1>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <label htmlFor="card-deck" className="block font-medium">
              Deck
            </label>
            <select
              id="card-deck"
              className="input"
              value={deck}
              onChange={(e) => {
                setDeck(e.target.value);
                // A shared subject can stay; any other belongs to the old deck.
                const subject = nodes.find((n) => n.id === subjectId);
                if (!subject || !categoriesOf(subject).includes(e.target.value)) setSubjectId("");
              }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 text-sm">
            <label htmlFor="card-subject" className="block font-medium">
              Subject (optional)
            </label>
            <select
              id="card-subject"
              className="input"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">None</option>
              {subjects.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium">Kind</legend>
          <div className="flex flex-wrap gap-1.5">
            {CARD_KINDS.map((k) => (
              <label
                key={k.id}
                className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                  kind === k.id ? "border-accent bg-accent-soft font-medium text-accent" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name="card-kind"
                  className="sr-only"
                  checked={kind === k.id}
                  onChange={() => setKind(k.id)}
                />
                {k.label}
              </label>
            ))}
          </div>
        </fieldset>

        <ToolbarGroup>
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center gap-1">
                <span className="text-sm font-medium">Prompt</span>
                <InfoTip>{MATH_TIP}</InfoTip>
              </div>
              <ImageTextarea
                label="Prompt"
                value={prompt}
                onChange={setPrompt}
                rows={2}
                placeholder="Speed of light in a vacuum"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1">
                <span className="text-sm font-medium">Answer</span>
                <InfoTip>
                  A number with a unit, such as $2.998 \times 10^8$ m/s, 746 W, or a range such as 30–300 MHz, gets its
                  wrong choices made fresh in each review. Anything else needs three wrong choices below.
                </InfoTip>
              </div>
              <ImageTextarea
                label="Answer"
                value={answer}
                onChange={setAnswer}
                rows={2}
                placeholder="$2.998 \times 10^8$ m/s"
              />
            </div>

            <fieldset>
              <legend className="mb-1 text-sm font-medium">Wrong choices</legend>
              {number ? (
                <p className="rounded-md bg-accent-soft p-3 text-sm">
                  The answer is a number, so close wrong choices are made fresh in each review: a digit off, the power
                  of ten off by one, or a near value. There is nothing to write. The preview shows one draw.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted">
                    Make them nearly right: a flipped sign, a swapped variable, a missing factor, or one key word
                    changed.
                  </p>
                  {wrong.map((w, i) => (
                    <ImageTextarea
                      key={i}
                      label={`Wrong choice ${i + 1}`}
                      value={w}
                      onChange={(v) => setWrong((ws) => ws.map((x, j) => (j === i ? v : x)))}
                      rows={2}
                      placeholder={`Wrong choice ${i + 1}`}
                    />
                  ))}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <SuggestWrong blocked={suggestBlock} count={emptyWrong} onSuggest={suggest} />
                  </div>
                </div>
              )}
            </fieldset>
          </div>
        </ToolbarGroup>

        <div>
          <div className="mb-1 flex items-center gap-1">
            <span className="text-sm font-medium">Tags</span>
            <InfoTip>
              Optional. The same tags your questions use, such as &ldquo;skin effect&rdquo;, so cards and questions on
              one idea can be found together. Press Enter or a comma to add one.
            </InfoTip>
          </div>
          <TagInput value={tags} onChange={setTags} suggestions={suggestions} topicId={null} limit={8} emptyLimit={3} />
        </div>

        {errors && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
            {errors}
          </p>
        )}
        {notice && <p className="text-sm text-good">{notice}</p>}

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={saving} onClick={() => void save(false)}>
            {initial ? "Save changes" : "Save card"}
          </button>
          {!initial && (
            <button className="btn" disabled={saving} onClick={() => void save(true)}>
              Save and add another
            </button>
          )}
          <Link href="/bank?tab=memory" className="btn">
            Cancel
          </Link>
          {initial && (
            <button className="btn btn-danger ml-auto" onClick={() => void remove()}>
              Delete card
            </button>
          )}
        </div>
      </div>

      <aside aria-label="Preview">
        <div className="sticky top-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted">Preview, as in a review</h2>
            {number && (
              <button className="text-sm text-accent underline" onClick={() => setDraw((d) => d + 1)}>
                Draw again
              </button>
            )}
          </div>
          <div className="rounded-md border border-line border-l-4 border-l-accent bg-surface p-5">
            {prompt.trim() ? (
              <RichText text={prompt} className="text-lg font-semibold" />
            ) : (
              <p className="text-sm text-muted">The prompt appears here as you type.</p>
            )}
            {preview.length > 0 && (
              <ol className="mt-4 space-y-2">
                {preview.map((c, i) => (
                  <li
                    key={i}
                    className={`flex gap-3 rounded-md border px-3 py-2 ${c.correct ? "border-good bg-good/5" : "border-line"}`}
                  >
                    <span className="w-5 shrink-0 font-medium text-muted">{LETTERS[i]}</span>
                    <RichText text={c.text} className="min-w-0 flex-1 text-[15px]" />
                    {c.correct && <span className="text-xs font-medium text-good">Answer</span>}
                  </li>
                ))}
              </ol>
            )}
            {tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1" aria-label="Tags">
                {tags.map((t) => (
                  <span key={t} className="rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
