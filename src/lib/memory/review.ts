"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type CardEvent, type MemoryCard, type Sureness } from "@/lib/db";
import { newId, now } from "@/lib/ids";
import { loadExam } from "./exam";
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
  categoryId: string;
  total: number;
  /** Answered before and due now. */
  due: number;
  /** Unlocked and never answered, plus the ones that would open at the start of a review now. */
  fresh: number;
  learned: number;
  remembering: number;
  locked: number;
  /** With an exam set: cards a day that must open to see every card in time. */
  perDay: number | null;
  /** Of `fresh`, how many open early to keep pace with the exam. */
  extra: number;
}

/** A deck's counts for the Activity page. Nothing is written. */
export function summarize(data: MemoryData, categoryId: string, nowMs: number): DeckSummary {
  const deck = data.cards.filter((c) => c.categoryId === categoryId);
  const plan = planUnlocks(deck, data.states, data.exam, nowMs, unlockedToday(deck, data.events, nowMs));
  const s = { due: 0, fresh: plan.cards.length, learned: 0, remembering: 0 };
  for (const c of deck) {
    const st = data.states.get(c.id);
    const stage = stageOf(st);
    if (stage === "new") s.fresh++;
    else if (isDue(st, nowMs)) s.due++;
    if (stage === "learned") s.learned++;
    if (stage === "remembering") s.remembering++;
  }
  return { categoryId, total: deck.length, ...s, locked: plan.locked, perDay: plan.perDay, extra: plan.extra };
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
}

/**
 * Starts a review of the given decks: opens the new cards each deck has earned (and any the exam pace needs), then
 * lines up what is due. Cards seen before come first, oldest due first; new cards follow in deck order.
 */
export async function startSession(categoryIds: string[]): Promise<Session> {
  const t = now();
  const data = await loadMemory();
  let opened = 0;
  let extra = 0;
  const unlocks: CardEvent[] = [];
  for (const id of categoryIds) {
    const deck = data.cards.filter((c) => c.categoryId === id);
    const plan = planUnlocks(deck, data.states, data.exam, t, unlockedToday(deck, data.events, t));
    unlocks.push(...logUnlocks(plan.cards, t));
    opened += plan.cards.length;
    extra += plan.extra;
  }
  if (unlocks.length) await db.cardEvents.bulkPut(unlocks);
  const states = cardStates([...data.events, ...unlocks]);

  const inDecks = data.cards.filter((c) => categoryIds.includes(c.categoryId));
  const seen = inDecks
    .filter((c) => stageOf(states.get(c.id)) !== "new" && isDue(states.get(c.id), t))
    .sort((a, b) => (states.get(a.id)!.dueAt ?? 0) - (states.get(b.id)!.dueAt ?? 0));
  const fresh = inDecks
    .filter((c) => stageOf(states.get(c.id)) === "new")
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.order - b.order);
  // Mixed decks take turns, so one deck's new cards do not all come in a row.
  const byDeck = categoryIds.map((id) => fresh.filter((c) => c.categoryId === id));
  const interleaved: MemoryCard[] = [];
  for (let i = 0; byDeck.some((d) => i < d.length); i++) for (const d of byDeck) if (d[i]) interleaved.push(d[i]);
  return { queue: [...seen, ...interleaved].map((c) => c.id), opened, extra };
}

export interface AnswerResult {
  correct: boolean;
  sureness: Sureness;
  before: CardState;
  after: CardState;
  /** New cards this answer opened (the card reached box 3 for the first time). */
  opened: MemoryCard[];
}

/** Saves one answer, and opens a new card in the deck when this one reached box 3 for the first time. */
export async function answerCard(
  card: MemoryCard,
  correct: boolean,
  sureness: Sureness,
  picked: string,
): Promise<AnswerResult> {
  const t = now();
  const data = await loadMemory();
  const event: CardEvent = {
    id: newId(),
    cardId: card.id,
    at: t,
    type: "answer",
    correct,
    sureness,
    picked,
    updatedAt: t,
  };
  const events = [...data.events, event];
  const states = cardStates(events);
  const before = data.states.get(card.id) ?? EMPTY_STATE;
  const after = states.get(card.id)!;

  let opened: MemoryCard[] = [];
  if (after.reachedRemembering && !before.reachedRemembering) {
    const deck = data.cards.filter((c) => c.categoryId === card.categoryId);
    // Only the card this answer earned: the exam pace is settled when a review starts.
    opened = planUnlocks(deck, states, null, t, 0).cards.slice(0, 1);
  }
  await db.cardEvents.bulkPut([event, ...logUnlocks(opened, t)]);
  return { correct, sureness, before, after, opened };
}
