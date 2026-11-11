import type { CardEvent, MemoryCard, Sureness } from "@/lib/db";

/**
 * Spaced repetition for memory cards.
 *
 * A card climbs six boxes. Each box has its own gap before the card comes back: 1, 3, 7, 14, 30 and 60 days.
 * - Right and sure: up one box. Right at the 60-day box makes the card learned; a learned card comes back every 90 days.
 * - Right but not sure, or guessing: stays in its box and comes back sooner (half the gap; a pure guess, tomorrow).
 * - Wrong: back to box 1, tomorrow. A learned card that is missed is no longer learned.
 *
 * Nothing is stored about a card's box: it is worked out from its events, in time order. So reviews made on two
 * devices simply add up when they sync.
 */

export const DAY = 86_400_000;

/** The gap, in days, for boxes 1 to 6. */
export const BOX_DAYS = [1, 3, 7, 14, 30, 60] as const;
export const TOP_BOX = BOX_DAYS.length;
/** How often a learned card comes back. */
export const LEARNED_DAYS = 90;
/** From this box on a card counts as remembering, and reaching it unlocks a new card. */
export const REMEMBERING_BOX = 3;
/** How many cards a deck starts with. */
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

/** Every card's state, worked out from the log. */
export function cardStates(events: CardEvent[]): Map<string, CardState> {
  const out = new Map<string, CardState>();
  const sorted = events.filter((e) => !e.deletedAt).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  for (const e of sorted) {
    const s = out.get(e.cardId) ?? EMPTY_STATE;
    if (e.type === "unlock") out.set(e.cardId, { ...s, unlocked: true });
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
 * Which cards of one deck to unlock now. A deck starts with 10; each card that has reached box 3 opens one more.
 * With an exam set, enough extra cards open each day for every card to have appeared three weeks before it.
 * `unlockedToday` is how many of this deck's cards were unlocked since midnight, so the pace is not counted twice.
 */
export function planUnlocks(
  deck: MemoryCard[],
  states: Map<string, CardState>,
  exam: ExamPlan | null,
  nowMs: number,
  unlockedToday: number,
): UnlockPlan {
  const ordered = [...deck].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const locked = ordered.filter((c) => !states.get(c.id)?.unlocked);
  const unlocked = ordered.length - locked.length;
  const earned = ordered.filter((c) => states.get(c.id)?.reachedRemembering).length;
  const natural = Math.max(0, FIRST_UNLOCKED + earned - unlocked);

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
