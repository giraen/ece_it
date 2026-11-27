"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type CardEvent, type MemoryCard, type Sureness } from "@/lib/db";
import { newId, now } from "@/lib/ids";
import { loadExam } from "./exam";
import { cardDecks, cardVariants, inDeck, variantCount } from "./cards";
import { DAILY_MAX, DAILY_MIN, START_MAX, START_MIN, answeredToday, loadSpreadHours, loadStartCards } from "./daily";
import {
  DAY,
  EMPTY_STATE,
  FIRST_UNLOCKED,
  cardStates,
  examPlan,
  isDue,
  nextVariant,
  planUnlocks,
  roundLevel,
  startOfDay,
  stageOf,
  type CardState,
  type ExamPlan,
  type NextVariant,
} from "./schedule";

/** Everything a review needs, read once. */
export interface MemoryData {
  cards: MemoryCard[];
  events: CardEvent[];
  states: Map<string, CardState>;
  exam: ExamPlan | null;
  /** How many cards each deck opens with. */
  start: number;
  /** How long a round of variants is spread over, in milliseconds. */
  spreadMs: number;
}

export async function loadMemory(): Promise<MemoryData> {
  const [cards, events, setting, start, spread] = await Promise.all([
    db.cards.filter((c) => !c.deletedAt).toArray(),
    db.cardEvents.toArray(),
    loadExam(),
    loadStartCards(),
    loadSpreadHours(),
  ]);
  return {
    cards,
    events,
    states: cardStates(events),
    exam: examPlan(setting.month, setting.date),
    start,
    spreadMs: spread * 3_600_000,
  };
}

/** The variant a card asks next in a deck review, and from when. */
export function nextOf(data: Pick<MemoryData, "states" | "spreadMs">, card: MemoryCard): NextVariant {
  return nextVariant(
    cardVariants(card).map((v) => v.id),
    data.states.get(card.id),
    data.spreadMs,
  );
}

/** Due, and its next variant's time has come. A card without variants is ready whenever it is due. */
export function isReady(data: Pick<MemoryData, "states" | "spreadMs">, card: MemoryCard, nowMs: number): boolean {
  return isDue(data.states.get(card.id), nowMs) && nextOf(data, card).at <= nowMs;
}

/** A variant waiting for its time later in a round. */
export interface Waiting {
  card: MemoryCard;
  variantId: string;
  at: number;
  /** Which of the round it is, from 1. */
  n: number;
  of: number;
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
  /** Variants waiting for their time in a round, soonest first. They are not counted in `due`. */
  later: Waiting[];
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
  const later: Waiting[] = [];
  for (const c of cards) {
    const st = data.states.get(c.id);
    const stage = stageOf(st);
    if (stage === "locked") s.locked++;
    else s.open++;
    if (stage === "new") s.fresh++;
    else if (stage !== "locked" && isDue(st, nowMs)) {
      const next = nextOf(data, c);
      if (next.at <= nowMs) s.due++;
      else later.push({ card: c, variantId: next.variantId, at: next.at, n: next.index + 1, of: next.of });
    }
    if (stage === "learned") s.learned++;
    if (stage === "remembering") s.remembering++;
  }
  later.sort((a, b) => a.at - b.at);
  return { categoryIds: ids, total: cards.length, ...s, perDay, extra, later };
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
  /** For cards with variants: the variant each one asks, by card id. */
  variants: Record<string, string>;
}

/** Which variant each card asks: the next of its round in a deck review. */
function deckVariants(data: MemoryData, ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of ids) {
    const card = data.cards.find((c) => c.id === id);
    if (card && variantCount(card) > 1) out[id] = nextOf(data, card).variantId;
  }
  return out;
}

export interface SessionOptions {
  /** Waiting variants come too, without waiting for their time. */
  takeNow?: boolean;
  /** Only these cards, such as one waiting variant taken now. */
  only?: string[];
}

/**
 * Starts a review of the given decks: opens the new cards each deck has earned (and any the exam pace needs), then
 * lines up what is due. Cards seen before come first, oldest due first; new cards follow in deck order.
 *
 * Incognito, nothing opens and nothing is written: every card already unlocked comes up, the due ones first, then
 * the rest by when they would be due.
 */
export async function startSession(
  categoryIds: string[],
  incognito = false,
  options: SessionOptions = {},
): Promise<Session> {
  const t = now();
  const data = await loadMemory();
  const only = options.only?.length ? new Set(options.only) : null;
  // Taking a waiting variant now: it is due already, only its time in the round is ahead.
  const ready = (c: MemoryCard) => (options.takeNow || only ? isDue(data.states.get(c.id), t) : isReady(data, c, t));
  if (only) {
    const queue = data.cards.filter((c) => only.has(c.id) && ready(c)).map((c) => c.id);
    return { queue, opened: 0, extra: 0, variants: deckVariants(data, queue) };
  }
  if (incognito) {
    const open = data.cards.filter(
      (c) => categoryIds.some((id) => inDeck(c, id)) && stageOf(data.states.get(c.id)) !== "locked",
    );
    const dueAt = (c: MemoryCard) => data.states.get(c.id)?.dueAt ?? 0;
    open.sort((a, b) => dueAt(a) - dueAt(b) || a.categoryId.localeCompare(b.categoryId) || a.order - b.order);
    const queue = open.map((c) => c.id);
    return { queue, opened: 0, extra: 0, variants: deckVariants(data, queue) };
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
    .filter((c) => stageOf(states.get(c.id)) !== "new" && ready(c))
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
  const queue = [...seen, ...interleaved].map((c) => c.id);
  return { queue, opened, extra, variants: deckVariants({ ...data, states }, queue) };
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
  // A card with variants asks one of them at random: practice, so no round.
  const variants: Record<string, string> = {};
  for (const c of [...picked, ...preview]) if (variantCount(c) > 1) variants[c.id] = shuffled(cardVariants(c))[0].id;
  return {
    queue: shuffled([...picked, ...preview]).map((c) => c.id),
    opened: 0,
    extra: 0,
    daily: true,
    locked: preview.map((c) => c.id),
    variants,
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
  /** For a card with variants, in a deck review: how its round stands after this answer. */
  round?: RoundResult;
  /** For a card with variants: how many it has. */
  variants?: number;
}

export interface RoundResult {
  /** Answered so far in the round, this one included, and right of those. */
  answered: number;
  right: number;
  of: number;
  /** The round is complete and has moved the card. */
  settled: boolean;
  /** For a settled round, how it went. */
  level?: ReturnType<typeof roundLevel>;
  /** For a round under way, when the next variant comes. */
  nextAt?: number;
}

/** Saves one answer, and opens a new card in the deck when this one reached box 3 for the first time. */
export async function answerCard(
  card: MemoryCard,
  /** The variant asked: the card's own id for its first one. */
  variantId: string,
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
    ...(variantCount(card) > 1 ? { variantId, variants: variantCount(card) } : {}),
    updatedAt: t,
  };
  const events = [...data.events, event];
  const states = cardStates(events);
  const before = data.states.get(card.id) ?? EMPTY_STATE;
  const after = states.get(card.id)!;

  let round: RoundResult | undefined;
  if (variantCount(card) > 1 && !daily) {
    const so = [...(before.round?.answers.filter((a) => a.variantId !== variantId) ?? []), { correct }];
    const right = so.filter((a) => a.correct).length;
    const of = variantCount(card);
    round = after.round
      ? { answered: so.length, right, of, settled: false, nextAt: nextOf({ ...data, states }, card).at }
      : { answered: so.length, right, of, settled: true, level: roundLevel(right, Math.max(of, so.length)) };
  }

  let opened: MemoryCard[] = [];
  if (after.reachedRemembering && !before.reachedRemembering) {
    // The new card opens in the deck this card was made in.
    const deck = data.cards.filter((c) => inDeck(c, card.categoryId));
    // Only the card this answer earned: the exam pace is settled when a review starts.
    opened = planUnlocks(deck, states, null, t, 0, data.start).cards.slice(0, 1);
  }
  await db.cardEvents.bulkPut([event, ...logUnlocks(opened, t)]);
  const variants = variantCount(card) > 1 ? variantCount(card) : undefined;
  return { correct, sureness, before, after, opened, recorded: true, daily, round, variants };
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
