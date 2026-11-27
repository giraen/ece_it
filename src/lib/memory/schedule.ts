import type { CardEvent, MemoryCard, Sureness } from "@/lib/db";

/**
 * Spaced repetition for memory cards.
 *
 * A card climbs six boxes. Each box has its own gap before the card comes back: 1, 3, 7, 14, 30 and 60 days.
 * - Right and sure: up one box. Right at the 60-day box makes the card learned; a learned card comes back every 4 weeks.
 * - Right but not sure, or guessing: stays in its box and comes back sooner (half the gap; a pure guess, tomorrow).
 * - Wrong: back to box 1, tomorrow. A learned card that is missed is no longer learned.
 *
 * A card with variants (the same fact asked other ways) is reviewed in rounds: each variant comes up once, spread over
 * the day, and when the last is answered the share right moves the card (see `applyRound`).
 *
 * Nothing is stored about a card's box: it is worked out from its events, in time order. So reviews made on two
 * devices simply add up when they sync.
 */

export const DAY = 86_400_000;

/** The gap, in days, for boxes 1 to 6. */
export const BOX_DAYS = [1, 3, 7, 14, 30, 60] as const;
export const TOP_BOX = BOX_DAYS.length;
/** How often a learned card comes back: every 4 weeks, to keep it fresh. */
export const LEARNED_DAYS = 28;
/** From this box on a card counts as remembering, and reaching it unlocks a new card. */
export const REMEMBERING_BOX = 3;
/** How many cards a deck starts with, unless changed in Settings (see `loadStartCards`). */
export const FIRST_UNLOCKED = 10;

export type Stage = "locked" | "new" | "learning" | "remembering" | "learned";

export interface CardState {
  /** Unlocked: it can appear in reviews. */
  unlocked: boolean;
  /** 0 for a card never answered, else 1 to 6. A learned card stays at 6. */
  box: number;
  learned: boolean;
  /** When it is due, or null for a card never answered (due at once once unlocked). */
  dueAt: number | null;
  /** Ever reached box 3. Each such card unlocks one more. */
  reachedRemembering: boolean;
  answers: number;
  misses: number;
  lastAt: number | null;
  /** Times it was missed in the daily review while still locked: a weak one, waiting to unlock. */
  lockedMisses: number;
  /** For a card with variants: the round under way, or null between rounds. */
  round: Round | null;
  /** For a card with variants: when each variant was last asked, by variant id. */
  variantSeen: Record<string, number>;
  /** The variant missed last, which opens the next round. */
  lastMissed: string | null;
}

/** A round of a card with variants: the variants answered so far, since the first of them. */
export interface Round {
  startedAt: number;
  /** How many variants the card has. */
  of: number;
  answers: { variantId: string; correct: boolean; sureness?: Sureness }[];
}

export const EMPTY_STATE: CardState = {
  unlocked: false,
  box: 0,
  learned: false,
  dueAt: null,
  reachedRemembering: false,
  answers: 0,
  misses: 0,
  lastAt: null,
  lockedMisses: 0,
  round: null,
  variantSeen: {},
  lastMissed: null,
};

/** Midnight at the start of the day `t` falls in, on this device's clock. */
export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The same time of day, `days` later, from the start of `t`'s day. A card due "in 1 day" is due all of tomorrow. */
const after = (t: number, days: number) => {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() + days);
  return d.getTime();
};

/** What one answer does to a card. */
export function applyAnswer(s: CardState, at: number, correct: boolean, sureness: Sureness | undefined): CardState {
  const next: CardState = { ...s, unlocked: true, answers: s.answers + 1, lastAt: at };
  if (!correct) {
    return { ...next, box: 1, learned: false, dueAt: after(at, BOX_DAYS[0]), misses: s.misses + 1 };
  }
  if (sureness === "sure") {
    if (s.learned || s.box === TOP_BOX) return { ...next, box: TOP_BOX, learned: true, dueAt: after(at, LEARNED_DAYS) };
    const box = s.box + 1;
    return {
      ...next,
      box,
      dueAt: after(at, BOX_DAYS[box - 1]),
      reachedRemembering: s.reachedRemembering || box >= REMEMBERING_BOX,
    };
  }
  // Right, but not sure of it: the box stays and it comes back sooner.
  const box = Math.max(1, s.box);
  const gap = s.learned ? LEARNED_DAYS : BOX_DAYS[box - 1];
  const days = sureness === "just_guessed" ? 1 : Math.max(1, Math.floor(gap / 2));
  return { ...next, box, dueAt: after(at, days) };
}

// ---------------------------------------------------------------------------------------------
// Cards with variants
// ---------------------------------------------------------------------------------------------

export type RoundLevel = "remembered" | "shaky" | "slipping" | "mostly" | "forgotten";

/**
 * How a round went, by its share of right answers, whatever the number of variants: the same levels as a quiz's bars,
 * 75% to pass and all of it to move up.
 */
export const ROUND_LEVELS: { level: RoundLevel; min: number; label: string; does: string }[] = [
  { level: "remembered", min: 1, label: "Remembered", does: "up one box" },
  { level: "shaky", min: 0.75, label: "Shaky", does: "stays in its box" },
  { level: "slipping", min: 0.5, label: "Slipping", does: "down one box" },
  { level: "mostly", min: 0.25, label: "Mostly forgotten", does: "down two boxes" },
  { level: "forgotten", min: 0, label: "Forgotten", does: "back to box 1" },
];

export function roundLevel(right: number, of: number): (typeof ROUND_LEVELS)[number] {
  const share = of > 0 ? right / of : 0;
  return ROUND_LEVELS.find((l) => share + 1e-9 >= l.min) ?? ROUND_LEVELS[ROUND_LEVELS.length - 1];
}

/** The box after a round that was not all right. Never below box 1. */
function boxAfter(box: number, right: number, of: number): number {
  const from = Math.max(1, box);
  const drop = { remembered: 0, shaky: 0, slipping: 1, mostly: 2, forgotten: from }[roundLevel(right, of).level];
  return Math.max(1, from - drop);
}

const SURE_ORDER: Sureness[] = ["sure", "wise_guess", "not_sure", "just_guessed"];
/** The least sure of the round's answers, which decides how far an all-right round moves. */
const leastSure = (list: (Sureness | undefined)[]): Sureness | undefined =>
  list.reduce<Sureness | undefined>(
    (w, x) => (x && (!w || SURE_ORDER.indexOf(x) > SURE_ORDER.indexOf(w)) ? x : w),
    undefined,
  );

/**
 * The end of a round. All right: the card moves as one sure (or unsure) answer would. Otherwise the share right sets
 * how far it falls (see `ROUND_LEVELS`), it comes back tomorrow, and a learned card is no longer learned.
 */
function settleRound(s: CardState, round: Round, at: number): CardState {
  const right = round.answers.filter((a) => a.correct).length;
  const of = Math.max(round.of, round.answers.length);
  const missed = round.answers.find((a) => !a.correct)?.variantId ?? null;
  const base = { ...s, round: null, lastMissed: missed };
  if (right >= of) {
    const moved = applyAnswer(base, at, true, leastSure(round.answers.map((a) => a.sureness)));
    // The answers were counted one by one already.
    return { ...moved, answers: s.answers, lastAt: s.lastAt };
  }
  return { ...base, box: boxAfter(s.box, right, of), learned: false, dueAt: after(at, BOX_DAYS[0]) };
}

/** One answer of a round, in a deck review. The round settles once every variant has been answered. */
function applyVariantAnswer(s: CardState, e: CardEvent): CardState {
  const variantId = e.variantId ?? e.cardId;
  const of = Math.max(2, e.variants ?? 2);
  const round: Round = s.round
    ? { ...s.round, of, answers: [...s.round.answers.filter((a) => a.variantId !== variantId)] }
    : { startedAt: e.at, of, answers: [] };
  round.answers.push({ variantId, correct: !!e.correct, sureness: e.sureness });
  const next: CardState = {
    ...s,
    unlocked: true,
    answers: s.answers + 1,
    misses: s.misses + (e.correct ? 0 : 1),
    lastAt: e.at,
    variantSeen: { ...s.variantSeen, [variantId]: e.at },
    round,
  };
  return round.answers.length >= of ? settleRound(next, round, e.at) : next;
}

/**
 * A daily-review miss on a card with variants: one variant missed of them all, so it falls by that share (a card with
 * 4 variants stays in its box, one with 2 drops one), and it is due at once, so its whole round comes up today.
 */
function applyDailyVariant(s: CardState, e: CardEvent): CardState {
  if (e.correct) return s;
  if (!s.unlocked) return { ...s, lockedMisses: s.lockedMisses + 1 };
  const of = Math.max(2, e.variants ?? 2);
  return {
    ...s,
    box: boxAfter(s.box, of - 1, of),
    learned: false,
    dueAt: e.at,
    answers: s.answers + 1,
    misses: s.misses + 1,
    lastAt: e.at,
    lastMissed: e.variantId ?? e.cardId,
  };
}

/** Every card's state, worked out from the log. */
/**
 * An answer in the daily review, which is practice on the side: a right answer changes nothing, so only deck reviews
 * move cards up. A miss sends an unlocked card back to box 1, due at once, so it comes up in its deck's review today.
 * A locked card has no box; its miss is only noted.
 */
export function applyDaily(s: CardState, at: number, correct: boolean): CardState {
  if (correct) return s;
  if (!s.unlocked) return { ...s, lockedMisses: s.lockedMisses + 1 };
  return { ...s, box: 1, learned: false, dueAt: at, answers: s.answers + 1, misses: s.misses + 1, lastAt: at };
}

export function cardStates(events: CardEvent[]): Map<string, CardState> {
  const out = new Map<string, CardState>();
  const sorted = events.filter((e) => !e.deletedAt).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  for (const e of sorted) {
    const s = out.get(e.cardId) ?? EMPTY_STATE;
    if (e.type === "unlock") out.set(e.cardId, { ...s, unlocked: true });
    else if ((e.variants ?? 1) > 1) out.set(e.cardId, e.daily ? applyDailyVariant(s, e) : applyVariantAnswer(s, e));
    else if (e.daily) out.set(e.cardId, applyDaily(s, e.at, !!e.correct));
    // Right before its day changes nothing, so reviewing early cannot rush a card through the boxes.
    else if (e.early && e.correct) out.set(e.cardId, { ...s, answers: s.answers + 1, lastAt: e.at });
    else out.set(e.cardId, applyAnswer(s, e.at, !!e.correct, e.sureness));
  }
  return out;
}

export function stageOf(s: CardState | undefined): Stage {
  if (!s || !s.unlocked) return "locked";
  if (s.learned) return "learned";
  if (s.box === 0) return "new";
  return s.box >= REMEMBERING_BOX ? "remembering" : "learning";
}

/** Due for review today: unlocked and never answered, or its day has come. */
export function isDue(s: CardState | undefined, nowMs: number): boolean {
  if (!s || !s.unlocked) return false;
  return s.dueAt === null || s.dueAt <= nowMs;
}

/** How long the variants of a round are spread over, from the first one, unless changed in Settings. */
export const SPREAD_DEFAULT_HOURS = 4;

export interface NextVariant {
  variantId: string;
  /** When it can come up: the card's due time for the first of a round, later ones spread after it. */
  at: number;
  /** Which of the round it is, from 0. */
  index: number;
  of: number;
}

/**
 * The variant a card asks next, and from when. A round opens with the variant missed last, else the one asked longest
 * ago, so the first one changes from round to round. The rest follow evenly over `spreadMs` from the round's start.
 */
export function nextVariant(variantIds: string[], s: CardState | undefined, spreadMs: number): NextVariant {
  const st = s ?? EMPTY_STATE;
  const due = st.dueAt ?? 0;
  if (variantIds.length <= 1) return { variantId: variantIds[0], at: due, index: 0, of: 1 };
  const done = new Set(st.round?.answers.map((a) => a.variantId) ?? []);
  let left = variantIds.filter((id) => !done.has(id));
  if (!left.length) left = variantIds;
  const seen = (id: string) => st.variantSeen[id] ?? -1;
  const pick =
    st.lastMissed && left.includes(st.lastMissed)
      ? st.lastMissed
      : [...left].sort((a, b) => seen(a) - seen(b) || variantIds.indexOf(a) - variantIds.indexOf(b))[0];
  const of = variantIds.length;
  if (!st.round) return { variantId: pick, at: due, index: 0, of };
  const index = Math.min(of - 1, done.size);
  return { variantId: pick, at: st.round.startedAt + (index * spreadMs) / (of - 1), index, of };
}

/** "tomorrow", "in 7 days", "in 3 months" */
export function whenText(dueAt: number, nowMs: number): string {
  const days = Math.round((startOfDay(dueAt) - startOfDay(nowMs)) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 45) return `in ${days} days`;
  return `in ${Math.round(days / 30)} months`;
}

// ---------------------------------------------------------------------------------------------
// Unlocking new cards
// ---------------------------------------------------------------------------------------------

/** The day the exam is planned for, and how far ahead every card should have been seen. */
export interface ExamPlan {
  /** The earlier of the exam month's first day and the exact date, when either is set. */
  target: number;
  /** Every card should be unlocked by this day. */
  allSeenBy: number;
}

/** Cards should all have appeared this long before the exam. */
export const SEEN_BEFORE_DAYS = 21;

/** From the exam month ("2027-04") and the exact date ("2027-04-20"), whichever comes first. */
export function examPlan(month: string | null, date: string | null): ExamPlan | null {
  const days: number[] = [];
  const m = month?.match(/^(\d{4})-(\d{2})$/);
  if (m) days.push(new Date(Number(m[1]), Number(m[2]) - 1, 1).getTime());
  const d = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (d) days.push(new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])).getTime());
  if (!days.length) return null;
  const target = Math.min(...days);
  return { target, allSeenBy: after(target, -SEEN_BEFORE_DAYS) };
}

export interface UnlockPlan {
  /** Cards to unlock now, in deck order. */
  cards: MemoryCard[];
  /** How many of them are extra, to keep pace with the exam. */
  extra: number;
  /** Locked cards left after this. */
  locked: number;
  /** With an exam set: how many cards a day must open from now on to see them all in time. */
  perDay: number | null;
}

/**
 * Which cards of one deck to unlock now. A deck starts with `start` cards (10 unless changed in Settings); each
 * card that has reached box 3 opens one more.
 * With an exam set, enough extra cards open each day for every card to have appeared three weeks before it.
 * `unlockedToday` is how many of this deck's cards were unlocked since midnight, so the pace is not counted twice.
 */
export function planUnlocks(
  deck: MemoryCard[],
  states: Map<string, CardState>,
  exam: ExamPlan | null,
  nowMs: number,
  unlockedToday: number,
  /** How many cards a deck opens with before any are earned. */
  start: number = FIRST_UNLOCKED,
): UnlockPlan {
  const ordered = [...deck].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const locked = ordered.filter((c) => !states.get(c.id)?.unlocked);
  const unlocked = ordered.length - locked.length;
  const earned = ordered.filter((c) => states.get(c.id)?.reachedRemembering).length;
  const natural = Math.max(0, start + earned - unlocked);

  let extra = 0;
  let perDay: number | null = null;
  if (exam && locked.length) {
    const daysLeft = Math.max(1, Math.round((exam.allSeenBy - startOfDay(nowMs)) / DAY));
    perDay = Math.ceil(locked.length / daysLeft);
    // Today's share, less what today has already opened (including the natural ones about to open).
    extra = Math.max(0, perDay - unlockedToday - natural);
  }
  const take = Math.min(locked.length, natural + extra);
  return {
    cards: locked.slice(0, take),
    extra: Math.min(extra, Math.max(0, take - natural)),
    locked: locked.length - take,
    perDay,
  };
}
