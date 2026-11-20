"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type CardEvent, type MemoryCard, type Sureness } from "@/lib/db";
import { newId, now } from "@/lib/ids";
import { loadExam } from "./exam";
import { cardDecks, inDeck } from "./cards";
import { DAILY_MAX, DAILY_MIN, START_MAX, START_MIN, answeredToday, loadStartCards } from "./daily";
import {
  DAY,
  EMPTY_STATE,
  FIRST_UNLOCKED,
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
  /** How many cards each deck opens with. */
  start: number;
}

export async function loadMemory(): Promise<MemoryData> {
  const [cards, events, setting, start] = await Promise.all([
    db.cards.filter((c) => !c.deletedAt).toArray(),
    db.cardEvents.toArray(),
    loadExam(),
    loadStartCards(),
  ]);
  return { cards, events, states: cardStates(events), exam: examPlan(setting.month, setting.date), start };
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
    const plan = planUnlocks(deck, data.states, data.exam, nowMs, unlockedToday(deck, data.events, nowMs), data.start);
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
  /** The daily review: practice on the side, where a right answer changes nothing. */
  daily?: boolean;
  /** In the daily review, the locked cards brought in as a preview. */
  locked?: string[];
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
    const plan = planUnlocks(deck, states, data.exam, t, unlockedToday(deck, events, t), data.start);
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

/** About this share of a daily review is locked cards, as a preview of what is coming. */
export const DAILY_LOCKED_SHARE = 0.25;

/** Cards already answered in today's daily review: one day never asks the same card twice. */
function dailyDoneToday(data: MemoryData, nowMs: number): Set<string> {
  const from = startOfDay(nowMs);
  return new Set(
    data.events
      .filter((e) => e.type === "answer" && !e.deletedAt && (e.daily || e.early) && e.at >= from)
      .map((e) => e.cardId),
  );
}

const shuffled = <T>(list: T[]): T[] => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** How many cards the daily review could still bring today, from every deck. */
export function dailyLeft(data: MemoryData, nowMs: number, decks: string[]): number {
  const done = dailyDoneToday(data, nowMs);
  return data.cards.filter((c) => !done.has(c.id) && decks.some((d) => inDeck(c, d))).length;
}

/**
 * The daily review: practice on the side, from every deck. It does not care what is due or unlocked, and a right
 * answer changes nothing; only a miss counts, sending an unlocked card back to box 1 (see `applyDaily`). About a
 * quarter are locked cards, as a preview; the rest are unlocked cards, half the weakest (lowest box, most misses) and
 * half at random. Cards already done in today's daily review are left out. `more` asks for a whole goal again, for
 * when today's is already met; otherwise it brings what is left of the goal.
 */
export async function startDaily(size: number, incognito = false, more = false): Promise<Session> {
  const decks = (await db.nodes.toArray()).filter((n) => n.kind === "category" && !n.deletedAt).map((n) => n.id);
  const t = now();
  const data = await loadMemory();
  const done = dailyDoneToday(data, t);
  const want = incognito || more ? size : Math.max(0, size - answeredToday(data.events, t));
  const pool = data.cards.filter((c) => !done.has(c.id) && decks.some((d) => inDeck(c, d)));
  const isLocked = (c: MemoryCard) => stageOf(data.states.get(c.id)) === "locked";
  const locked = shuffled(pool.filter(isLocked));
  const open = pool.filter((c) => !isLocked(c));

  // A quarter locked when there are enough; whichever kind runs short, the other makes up the rest.
  let nLocked = Math.min(locked.length, Math.round(want * DAILY_LOCKED_SHARE));
  const nOpen = Math.min(open.length, want - nLocked);
  nLocked = Math.min(locked.length, want - nOpen);

  const st = (c: MemoryCard) => data.states.get(c.id) ?? EMPTY_STATE;
  const weakest = [...open].sort((a, b) => st(a).box - st(b).box || st(b).misses - st(a).misses || Math.random() - 0.5);
  const half = Math.ceil(nOpen / 2);
  const picked = weakest.slice(0, half);
  const taken = new Set(picked.map((c) => c.id));
  picked.push(...shuffled(open.filter((c) => !taken.has(c.id))).slice(0, nOpen - half));

  const preview = locked.slice(0, nLocked);
  return {
    queue: shuffled([...picked, ...preview]).map((c) => c.id),
    opened: 0,
    extra: 0,
    daily: true,
    locked: preview.map((c) => c.id),
  };
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
  /** Answered in the daily review. */
  daily: boolean;
}

/** Saves one answer, and opens a new card in the deck when this one reached box 3 for the first time. */
export async function answerCard(
  card: MemoryCard,
  correct: boolean,
  sureness: Sureness,
  picked: string,
  incognito = false,
  daily = false,
): Promise<AnswerResult> {
  const t = now();
  const data = await loadMemory();
  if (incognito) {
    const same = data.states.get(card.id) ?? EMPTY_STATE;
    return { correct, sureness, before: same, after: same, opened: [], recorded: false, daily };
  }
  const event: CardEvent = {
    id: newId(),
    cardId: card.id,
    at: t,
    type: "answer",
    correct,
    sureness,
    picked,
    ...(daily ? { daily: true } : {}),
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
    opened = planUnlocks(deck, states, null, t, 0, data.start).cards.slice(0, 1);
  }
  await db.cardEvents.bulkPut([event, ...logUnlocks(opened, t)]);
  return { correct, sureness, before, after, opened, recorded: true, daily };
}

/** Suggested settings, worked out from the exam date and the cards still to open. */
export interface MemorySuggestion {
  /** Days left until every card should have come up (three weeks before the exam). */
  daysLeft: number;
  /** Cards not opened yet, in every deck. */
  locked: number;
  /** The busiest deck's share of new cards a week, to spread its locked cards evenly. */
  perWeek: number;
  /** Cards each deck should start with: a week's share with the margin, and never fewer than the usual 10. */
  start: number;
  /** New cards a day across every deck. */
  newPerDay: number;
  /** Cards a day that just keep up: each new card comes back about five times in its first two months. */
  dailyNeed: number;
  /** The daily goal suggested: `dailyNeed` with the margin. */
  daily: number;
}

/** How many times a card comes back in the first two months: at 1, 3, 7, 14 and 30 days. */
const EARLY_REVIEWS = 5;
/** Suggestions aim this much above the bare pace, to stay ahead and leave room for more recall. */
export const SUGGEST_MARGIN = 0.25;
/** Suggestions are rounded up to a multiple of this: 39 → 40, 22 → 25. */
const ROUND_TO = 5;

/** Null when no exam is set, or every card has already come up. */
export function suggestCounts(data: MemoryData, nowMs: number): MemorySuggestion | null {
  if (!data.exam) return null;
  const daysLeft = Math.max(1, Math.round((data.exam.allSeenBy - startOfDay(nowMs)) / DAY));
  const decks = new Set(data.cards.flatMap((c) => cardDecks(c)));
  const isLocked = (c: MemoryCard) => stageOf(data.states.get(c.id)) === "locked";
  const locked = data.cards.filter(isLocked).length;
  if (!locked) return null;
  let perWeek = 0;
  for (const d of decks) {
    const n = data.cards.filter((c) => inDeck(c, d) && isLocked(c)).length;
    perWeek = Math.max(perWeek, Math.ceil(n / Math.max(1, daysLeft / 7)));
  }
  const newPerDay = locked / daysLeft;
  const dailyNeed = newPerDay * (1 + EARLY_REVIEWS);
  // The margin first, then the floor, then up to the next multiple of 5, kept within what the setting allows.
  const suggest = (need: number, floor: number, lo: number, hi: number) => {
    const n = Math.max(floor, need * (1 + SUGGEST_MARGIN));
    return Math.min(hi, Math.max(lo, Math.ceil(n / ROUND_TO - 1e-9) * ROUND_TO));
  };
  return {
    daysLeft,
    locked,
    perWeek,
    start: suggest(perWeek, FIRST_UNLOCKED, START_MIN, START_MAX),
    newPerDay: Math.ceil(newPerDay),
    dailyNeed: Math.ceil(dailyNeed),
    daily: suggest(dailyNeed, DAILY_MIN, DAILY_MIN, DAILY_MAX),
  };
}
