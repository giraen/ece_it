"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type CardKind, type CardPlace, type MemoryCard, type TreeNode } from "@/lib/db";
import { newId, now } from "@/lib/ids";
import { isNumberAnswer } from "./answer";
import { normalizeTags } from "@/lib/bank/questions";

/** The kinds of card, in the order they are offered. */
export const CARD_KINDS: { id: CardKind; label: string; plural: string }[] = [
  { id: "constant", label: "Constant", plural: "Constants" },
  { id: "conversion", label: "Conversion", plural: "Conversions" },
  { id: "formula", label: "Formula", plural: "Formulas" },
  { id: "principle", label: "Principle", plural: "Principles" },
  { id: "definition", label: "Definition", plural: "Definitions" },
  { id: "unit", label: "Unit and symbol", plural: "Units and symbols" },
  { id: "standard", label: "Standard and range", plural: "Standards and ranges" },
];

/** The subject a card is filed under. Cards saved before subjects were used name a topic, so its subject is used. */
export function cardSubject(card: MemoryCard, byId: Map<string, TreeNode>): string | undefined {
  if (card.subjectId) return card.subjectId;
  const topic = card.topicId ? byId.get(card.topicId) : undefined;
  return topic?.parentId ?? undefined;
}

/**
 * Every deck and subject a card is filed in: where it was made first, then the others it is shared to. Each place is
 * listed once.
 */
export function cardPlaces(card: MemoryCard, byId: Map<string, TreeNode>): CardPlace[] {
  return cleanPlaces([{ categoryId: card.categoryId, subjectId: cardSubject(card, byId) }, ...(card.also ?? [])]);
}

/** Places without repeats or blanks, in order. */
export function cleanPlaces(list: CardPlace[]): CardPlace[] {
  const out: CardPlace[] = [];
  const seen = new Set<string>();
  for (const p of list) {
    if (!p.categoryId) continue;
    const key = `${p.categoryId}/${p.subjectId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p.subjectId ? { categoryId: p.categoryId, subjectId: p.subjectId } : { categoryId: p.categoryId });
  }
  return out;
}

/** The decks a card counts in. */
export function cardDecks(card: MemoryCard): string[] {
  return [...new Set([card.categoryId, ...(card.also ?? []).map((p) => p.categoryId)])];
}

export const inDeck = (card: MemoryCard, deckId: string): boolean =>
  card.categoryId === deckId || (card.also ?? []).some((p) => p.categoryId === deckId);

export const inSubject = (card: MemoryCard, subjectId: string, byId: Map<string, TreeNode>): boolean =>
  cardSubject(card, byId) === subjectId || (card.also ?? []).some((p) => p.subjectId === subjectId);

export const KIND_LABEL = Object.fromEntries(CARD_KINDS.map((k) => [k.id, k.label])) as Record<CardKind, string>;

/** How many wrong choices a review shows next to the answer. */
export const WRONG_CHOICES = 3;

/** Every memory card that has not been deleted, kept up to date. */
export function useCards(): MemoryCard[] | undefined {
  return useLiveQuery(() => db.cards.filter((c) => !c.deletedAt).toArray(), []);
}

/** Why a card cannot be saved yet, or null when it is ready. */
export function cardProblem(c: Pick<MemoryCard, "prompt" | "answer" | "wrong" | "categoryId">): string | null {
  if (!c.categoryId) return "Choose a deck.";
  if (!c.prompt.trim()) return "Write the prompt.";
  if (!c.answer.trim()) return "Write the answer.";
  if (isNumberAnswer(c.answer)) return null;
  const wrong = c.wrong.map((w) => w.trim()).filter(Boolean);
  if (wrong.length < WRONG_CHOICES) {
    return `Write ${WRONG_CHOICES} wrong choices. The answer is not a number, so they cannot be made by themselves.`;
  }
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  if (new Set([c.answer, ...wrong].map(norm)).size < wrong.length + 1) {
    return "Each wrong choice must differ from the answer and from the others.";
  }
  return null;
}

/** A card's other places, without the place it was made in or repeats. Undefined when there are none. */
function sharedPlaces(input: Pick<MemoryCard, "categoryId" | "subjectId" | "also">): CardPlace[] | undefined {
  const homeSubject = input.subjectId || undefined;
  // Its own deck, alone or with its own subject, is already where it is.
  const others = cleanPlaces(input.also ?? []).filter(
    (p) => !(p.categoryId === input.categoryId && (!p.subjectId || p.subjectId === homeSubject)),
  );
  return others.length ? others : undefined;
}

export type CardInput = Omit<MemoryCard, "id" | "order" | "createdAt" | "updatedAt" | "deletedAt"> & { id?: string };

/**
 * Saves a card, new or edited. A new card goes to the back of its deck's queue of new cards. A number answer keeps
 * no written wrong choices, since those are made in each review.
 */
export async function saveCard(input: CardInput): Promise<MemoryCard> {
  const t = now();
  const clean = {
    ...input,
    prompt: input.prompt.trim(),
    answer: input.answer.trim(),
    tags: input.tags?.length ? normalizeTags(input.tags) : undefined,
    subjectId: input.subjectId || undefined,
    topicId: undefined,
    also: sharedPlaces(input),
    wrong: isNumberAnswer(input.answer) ? [] : input.wrong.map((w) => w.trim()).filter(Boolean),
  };
  return db.transaction("rw", db.cards, async () => {
    const old = input.id ? await db.cards.get(input.id) : undefined;
    if (old && !old.deletedAt) {
      const next: MemoryCard = { ...old, ...clean, id: old.id, updatedAt: t };
      await db.cards.put(next);
      return next;
    }
    let last = 0;
    await db.cards
      .where("categoryId")
      .equals(clean.categoryId)
      .each((c) => {
        last = Math.max(last, c.order);
      });
    const card: MemoryCard = { ...clean, id: newId(), order: last + 1, createdAt: t, updatedAt: t };
    await db.cards.put(card);
    return card;
  });
}

/** Deletes a card. Its review history stays in the log, so an undo brings its progress back too. */
export async function deleteCard(id: string): Promise<void> {
  const t = now();
  await db.cards.update(id, { deletedAt: t, updatedAt: t });
}

// ---------------------------------------------------------------------------------------------
// Changing many cards at once, from the bank's selection bar. Each change can be undone.
// ---------------------------------------------------------------------------------------------

const sameTag = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The cards as they are now, to put back with `restoreCards`. */
export async function snapshotCards(ids: string[]): Promise<MemoryCard[]> {
  return (await db.cards.bulkGet(ids)).filter((c): c is MemoryCard => !!c);
}

/** Puts cards back as they were. They count as changed now, so the old version wins when devices sync. */
export async function restoreCards(before: MemoryCard[]): Promise<void> {
  const t = now();
  await db.cards.bulkPut(before.map((c) => ({ ...c, updatedAt: t })));
}

async function patchCards(ids: string[], fn: (c: MemoryCard) => Partial<MemoryCard>): Promise<void> {
  const t = now();
  await db.transaction("rw", db.cards, async () => {
    const list = await snapshotCards(ids);
    await db.cards.bulkPut(list.map((c) => ({ ...c, ...fn(c), updatedAt: t })));
  });
}

export function addCardTags(ids: string[], tags: string[]): Promise<void> {
  return patchCards(ids, (c) => ({ tags: normalizeTags([...(c.tags ?? []), ...tags]) }));
}

export function removeCardTag(ids: string[], tag: string): Promise<void> {
  return patchCards(ids, (c) => ({ tags: (c.tags ?? []).filter((t) => !sameTag(t, tag)) }));
}

export function deleteCards(ids: string[]): Promise<void> {
  const t = now();
  return patchCards(ids, () => ({ deletedAt: t }));
}

/**
 * Tags to suggest for memory cards: the ones on cards first, most used first, then the ones on questions, so the
 * two banks share one set of tags.
 */
export function useCardTagSuggestions(): string[] {
  const tags = useLiveQuery(async () => {
    const counts = new Map<string, { label: string; n: number }>();
    for (const c of await db.cards.filter((c) => !c.deletedAt).toArray())
      for (const t of c.tags ?? []) {
        const k = t.toLowerCase();
        const cur = counts.get(k);
        if (cur) cur.n++;
        else counts.set(k, { label: t, n: 1 });
      }
    const fromCards = [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
    const out = fromCards.map((x) => x.label);
    for (const q of await db.questions.filter((q) => !q.deletedAt).toArray())
      for (const t of q.tags) {
        if (counts.has(t.toLowerCase())) continue;
        counts.set(t.toLowerCase(), { label: t, n: 0 });
        out.push(t);
      }
    return out;
  }, []);
  return tags ?? [];
}

/** Files cards in another deck and subject. The other places they are shared to stay. */
export function moveCards(ids: string[], place: CardPlace): Promise<void> {
  return patchCards(ids, (c) => ({
    categoryId: place.categoryId,
    subjectId: place.subjectId,
    topicId: undefined,
    // A share to where the card now lives would be a repeat.
    also: c.also?.filter(
      (p) => !(p.categoryId === place.categoryId && (p.subjectId ?? "") === (place.subjectId ?? "")),
    ),
  }));
}
