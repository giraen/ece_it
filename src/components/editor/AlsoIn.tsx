"use client";

import type { CardPlace, TreeNode } from "@/lib/db";
import { categoriesOf } from "@/lib/bank/tree";
import InfoTip from "@/components/ui/InfoTip";

interface Props {
  /** The other places, as chosen so far. */
  value: CardPlace[];
  onChange: (next: CardPlace[]) => void;
  /** Where the card is made. A row naming the same place is pointed out, and dropped when saved. */
  home: CardPlace;
  nodes: TreeNode[];
  /** Keeps ids unique when several cards are on one page. */
  idPrefix: string;
  compact?: boolean;
}

/**
 * Sharing a memory card to other subjects, in its own deck or another, such as the electron's charge in both
 * GEAS › Physics and ELEX › Electromagnetics. It stays one card: it is reviewed once and counts everywhere it is.
 */
export default function AlsoIn({ value, onChange, home, nodes, idPrefix, compact = false }: Props) {
  const categories = nodes.filter((n) => n.kind === "category" && !n.deletedAt).sort((a, b) => a.order - b.order);
  const subjectsIn = (deck: string) =>
    nodes
      .filter((n) => n.kind === "subject" && !n.deletedAt && categoriesOf(n).includes(deck))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const set = (i: number, p: CardPlace) => onChange(value.map((x, j) => (j === i ? p : x)));
  const isHome = (p: CardPlace) =>
    p.categoryId === home.categoryId && (!p.subjectId || (p.subjectId ?? "") === (home.subjectId ?? ""));
  const repeats = (p: CardPlace, i: number) =>
    value.some((q, j) => j < i && q.categoryId === p.categoryId && (q.subjectId ?? "") === (p.subjectId ?? ""));

  function add() {
    // Usually the fact is needed in another deck, so a new row starts in the first deck that is not the card's.
    const deck = categories.find((c) => c.id !== home.categoryId) ?? categories[0];
    if (deck) onChange([...value, { categoryId: deck.id }]);
  }

  return (
    <fieldset className="space-y-2">
      <legend className={`flex items-center gap-1 ${compact ? "text-xs text-muted" : "text-sm font-medium"}`}>
        Also in (optional)
        {!compact && (
          <InfoTip>
            Share the card to other subjects that need it, in this deck or another: the charge of an electron belongs in
            both GEAS › Physics and ELEX › Electromagnetics. It stays one card. You review it once, and it counts in
            every deck and subject it is in.
          </InfoTip>
        )}
      </legend>
      {value.map((p, i) => {
        const note = isHome(p) ? "That is where the card already is." : repeats(p, i) ? "Already listed above." : null;
        return (
          <div key={i} className="space-y-1">
            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
              <select
                id={`${idPrefix}-also-deck-${i}`}
                aria-label={`Also in, deck ${i + 1}`}
                className="input min-w-0 flex-1 py-1.5"
                value={p.categoryId}
                onChange={(e) => {
                  const keep = nodes.find((n) => n.id === p.subjectId);
                  const deck = e.target.value;
                  set(i, keep && categoriesOf(keep).includes(deck) ? { ...p, categoryId: deck } : { categoryId: deck });
                }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Also in, subject ${i + 1}`}
                className="input min-w-0 flex-[2] py-1.5"
                value={p.subjectId ?? ""}
                onChange={(e) =>
                  set(i, e.target.value ? { ...p, subjectId: e.target.value } : { categoryId: p.categoryId })
                }
              >
                <option value="">The whole deck, no subject</option>
                {subjectsIn(p.categoryId).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn shrink-0 py-1.5"
                aria-label={`Remove place ${i + 1}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
            {note && <p className="text-xs text-muted">{note} It is left out when saved.</p>}
          </div>
        );
      })}
      <button type="button" className={`btn ${compact ? "py-1 text-xs" : "py-1.5"}`} onClick={add}>
        + Share to another subject
      </button>
    </fieldset>
  );
}
