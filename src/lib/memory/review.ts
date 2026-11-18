"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type CardEvent, type MemoryCard, type Sureness } from "@/lib/db";
import { newId, now } from "@/lib/ids";
import { loadExam } from "./exam";
import { cardDecks, inDeck } from "./cards";
import { answeredToday } from "./daily";
import {
  EMPTY_STATE,
  cardStates,
  examPlan,
  isDue,
  planUnlocks,
  startOfDay,
  stageOf,
  type CardState,
  type ExamPlan,
} from "./schedule";

/** Everything a review needs, read once. */
export interface MemoryData {
  cards: MemoryCard[];
  events: CardEvent[];
  states: Map<string, CardState>;
  exam: ExamPlan | null;
}

export async function loadMemory(): Promise<MemoryData> {
  const [cards, events, setting] = await Promise.all([
    db.cards.filter((c) => !c.deletedAt).toArray(),
    db.cardEvents.toArray(),
    loadExam(),
  ]);
  return { cards, events, states: cardStates(events), exam: examPlan(setting.month, setting.date) };
}

/** The same, kept up to date. */
export function useMemory(): MemoryData | undefined {
  return useLiveQuery(() => loadMemory(), []);
}

/** How many of a deck's cards were unlocked since midnight. */
function unlockedToday(deck: MemoryCard[], events: CardEvent[], nowMs: number): number {
  const ids = new Set(deck.map((c) => c.id));
  const from = startOfDay(nowMs);
  return new Set(events.filter((e) => e.type === "unlock" && e.at >= from && ids.has(e.cardId)).map((e) => e.cardId))
    .size;
}

export interface DeckSummary {
  /** The decks counted: one, or the ones in the mixed deck. */
  categoryIds: string[];
  total: number;
  /** Answered before and due now. */
  due: number;
  /** Unlocked and never answered, plus the ones that would open at the start of a review now. */
  fresh: number;
  learned: number;
  remembering: number;
  locked: number;
  /** Cards unlocked so far, at any stage: what an incognito review can go over. */
  open: number;
  /** With an exam set: cards a day that must open to see every card in time. */
  perDay: number | null;
  /** Of `fresh`, how many open early to keep pace with the exam. */
  extra: number;
}

/**
 * The counts for a deck, or for several together, for the Activity page. A card shared between decks counts in each
 * deck, and once when they are counted together. Nothing is written.
 */
export function summarize(data: MemoryData, deckIds: string | string[], nowMs: number): DeckSummary {
  const ids = typeof deckIds === "string" ? [deckIds] : deckIds;
  const cards = data.cards.filter((c) => ids.some((id) => inDeck(c, id)));
  // The cards each deck would open now. A shared card one deck opens is not opened again by another.
  const opening = new Set<string>();
  let extra = 0;
  let perDay: number | null = null;
  for (const id of ids) {
    const deck = data.cards.filter((c) => inDeck(c, id));
    const plan = planUnlocks(deck, data.states, data.exam, nowMs, unlockedToday(deck, data.events, nowMs));
    const before = opening.size;
    for (const c of plan.cards) opening.add(c.id);
    extra += Math.min(plan.extra, opening.size - before);
    if (plan.perDay !== null) perDay = (perDay ?? 0) + plan.perDay;
  }
  const s = { due: 0, fresh: opening.size, learned: 0, remembering: 0, open: 0, locked: -opening.size };
  for (const c of cards) {
    const st = data.states.get(c.id);
    const stage = stageOf(st);
    if (stage === "locked") s.locked++;
    else s.open++;
    if (stage === "new") s.fresh++;
    else if (stage !== "locked" && isDue(st, nowMs)) s.due++;
    if (stage === "learned") s.learned++;
    if (stage === "remembering") s.remembering++;
  }
  return { categoryIds: ids, total: cards.length, ...s, perDay, extra };
}

function logUnlocks(cards: MemoryCard[], t: number): CardEvent[] {
  return cards.map((c) => ({ id: newId(), cardId: c.id, at: t, type: "unlock" as const, updatedAt: t }));
}

export interface Session {
  /** Card ids in the order they come up. */
  queue: string[];
  /** Cards opened as the session started. */
  opened: number;
  /** Of those, how many opened early to keep pace with the exam. */
  extra: number;
  /** Cards not due yet, added to fill up the daily review. */
  early?: string[];
}

/**
 * Starts a review of the given decks: opens the new cards each deck has earned (and any the exam pace needs), then
 * lines up what is due. Cards seen before come first, oldest due first; new cards follow in deck order.
 *
 * Incognito, nothing opens and nothing is written: every card already unlocked comes up, the due ones first, then
 * the rest by when they would be due.
 */
export async function startSession(categoryIds: string[], incognito = false): Promise<Session> {
  const t = now();
  const data = await loadMemory();
  if (incognito) {
    const open = data.cards.filter(
      (c) => categoryIds.some((id) => inDeck(c, id)) && stageOf(data.states.get(c.id)) !== "locked",
    );
    const dueAt = (c: MemoryCard) => data.states.get(c.id)?.dueAt ?? 0;
    open.sort((a, b) => dueAt(a) - dueAt(b) || a.categoryId.localeCompare(b.categoryId) || a.order - b.order);
    return { queue: open.map((c) => c.id), opened: 0, extra: 0 };
  }
  let opened = 0;
  let extra = 0;
  const unlocks: CardEvent[] = [];
  let states = data.states;
  for (const id of categoryIds) {
    const deck = data.cards.filter((c) => inDeck(c, id));
    const events = [...data.events, ...unlocks];
    // A shared card the deck before opened counts here as opened today.
    const plan = planUnlocks(deck, states, data.exam, t, unlockedToday(deck, events, t));
    unlocks.push(...logUnlocks(plan.cards, t));
    opened += plan.cards.length;
    extra += plan.extra;
    if (plan.cards.length) states = cardStates([...data.events, ...unlocks]);
  }
  if (unlocks.length) await db.cardEvents.bulkPut(unlocks);

  const inDecks = data.cards.filter((c) => categoryIds.some((id) => inDeck(c, id)));
  const seen = inDecks
    .filter((c) => stageOf(states.get(c.id)) !== "new" && isDue(states.get(c.id), t))
    .sort((a, b) => (states.get(a.id)!.dueAt ?? 0) - (states.get(b.id)!.dueAt ?? 0));
  const fresh = inDecks
    .filter((c) => stageOf(states.get(c.id)) === "new")
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.order - b.order);
  // Mixed decks take turns, so one deck's new cards do not all come in a row. A shared card goes with its own deck when
  // that deck is in the mix, or else with the first deck of the mix it is in.
  const deckOf = (c: MemoryCard) => cardDecks(c).find((d) => categoryIds.includes(d));
  const byDeck = categoryIds.map((id) => fresh.filter((c) => deckOf(c) === id));
  const interleaved: MemoryCard[] = [];
  for (let i = 0; byDeck.some((d) => i < d.length); i++) for (const d of byDeck) if (d[i]) interleaved.push(d[i]);
  return { queue: [...seen, ...interleaved].map((c) => c.id), opened, extra };
}

/**
 * Cards that can fill up the daily review: unlocked and seen before, not due, and not answered yet today, so one day
 * never asks the same card twice. Soonest due first.
 */
export function earlyCards(data: MemoryData, nowMs: number, skip: Set<string> = new Set()): MemoryCard[] {
  const from = startOfDay(nowMs);
  const today = new Set(
    data.events.filter((e) => e.type === "answer" && !e.deletedAt && e.at >= from).map((e) => e.cardId),
  );
  return data.cards
    .filter((c) => !skip.has(c.id) && !today.has(c.id))
    .filter((c) => {
      const st = data.states.get(c.id);
      const stage = stageOf(st);
      return stage !== "locked" && stage !== "new" && !isDue(st, nowMs);
    })
    .sort((a, b) => (data.states.get(a.id)?.dueAt ?? 0) - (data.states.get(b.id)?.dueAt ?? 0));
}

/**
 * The daily review, from every deck. It is everything due and every new card earned, like any review; when that is
 * fewer than the goal still to go today, unlocked cards due soonest fill it up. Those are answered early: a right
 * answer leaves them as they are, a wrong one sends them back to box 1. `more` asks for a whole goal again, for when
 * today's is already met.
 */
export async function startDaily(size: number, incognito = false, more = false): Promise<Session> {
  const decks = (await db.nodes.toArray())
    .filter((n) => n.kind === "category" && !n.deletedAt)
    .sort((a, b) => a.order - b.order)
    .map((n) => n.id);
  const t = now();
  const before = await loadMemory();
  const want = incognito || more ? size : Math.max(0, size - answeredToday(before.events, t));
  const s = await startSession(decks, incognito);
  // Incognito goes over unlocked cards, due ones first; the goal is how many.
  if (incognito) return { ...s, queue: s.queue.slice(0, Math.max(want, 1)) };
  if (s.queue.length >= want) return s;

  const data = await loadMemory();
  const early = earlyCards(data, t, new Set(s.queue))
    .filter((c) => decks.some((d) => inDeck(c, d)))
    .slice(0, want - s.queue.length)
    .map((c) => c.id);
  return { ...s, queue: [...s.queue, ...early], early };
}

export interface AnswerResult {
  correct: boolean;
  sureness: Sureness;
  before: CardState;
  after: CardState;
  /** New cards this answer opened (the card reached box 3 for the first time). */
  opened: MemoryCard[];
  /** False when incognito: the card stays as it was. */
  recorded: boolean;
  /** Answered before it was due, in the daily review. */
  early: boolean;
}

/** Saves one answer, and opens a new card in the deck when this one reached box 3 for the first time. */
export async function answerCard(
  card: MemoryCard,
  correct: boolean,
  sureness: Sureness,
  picked: string,
  incognito = false,
  early = false,
): Promise<AnswerResult> {
  const t = now();
  const data = await loadMemory();
  if (incognito) {
    const same = data.states.get(card.id) ?? EMPTY_STATE;
    return { correct, sureness, before: same, after: same, opened: [], recorded: false, early };
  }
  const event: CardEvent = {
    id: newId(),
    cardId: card.id,
    at: t,
    type: "answer",
    correct,
    sureness,
    picked,
    ...(early ? { early: true } : {}),
    updatedAt: t,
  };
  const events = [...data.events, event];
  const states = cardStates(events);
  const before = data.states.get(card.id) ?? EMPTY_STATE;
  const after = states.get(card.id)!;

  let opened: MemoryCard[] = [];
  if (after.reachedRemembering && !before.reachedRemembering) {
    // The new card opens in the deck this card was made in.
    const deck = data.cards.filter((c) => inDeck(c, card.categoryId));
    // Only the card this answer earned: the exam pace is settled when a review starts.
    opened = planUnlocks(deck, states, null, t, 0).cards.slice(0, 1);
  }
  await db.cardEvents.bulkPut([event, ...logUnlocks(opened, t)]);
  return { correct, sureness, before, after, opened, recorded: true, early };
}
