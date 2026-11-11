"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type CardKind, type MemoryCard, type TreeNode } from "@/lib/db";
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
