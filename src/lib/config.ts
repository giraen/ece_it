/**
 * Every tunable number in one place. Change a value here, never in the logic.
 */
export const CONFIG = {
  /** Average credit a quiz must reach to pass for mastery. Below this is a fail. */
  passBar: 0.95,
  /** No child group (tag, topic, or subject) may fall below this credit. */
  childFloor: 0.5,
  /** A group only counts toward the floor once it has this many questions in the quiz. */
  minPerGroup: 2,
  /** Credit for a correct answer, by how sure the user was. Time never changes it. */
  sureCredit: { sure: 1, wise_guess: 0.6, not_sure: 0.4, just_guessed: 0 },
  /**
   * How big a quiz is, and how long it gets. The time for one item is the total time divided by the number of items.
   * A topic quiz has a fixed 1 hour. For a subject or category quiz, the person chooses the items and the total time.
   * A quiz with fewer items than `minItems` can still be taken, but it cannot award mastery.
   */
  quiz: {
    topic: { minItems: 25, maxItems: 50, defaultItems: 30, totalMinutes: 60 },
    subject: { minItems: 50, defaultItems: 100 },
    category: { minItems: 50, defaultItems: 100 },
    /** When the person picks the number of items, the total time is suggested as items times this many seconds. */
    suggestedSecPerItem: 90,
  },
  /** Computation questions: two answer choices closer than this (as a fraction) trigger a re-roll. */
  minChoiceSpacing: 0.02,
  /** Computation questions: how many times to re-roll before a template is called unusable. */
  maxRolls: 50,
  /** How long mastery lasts, in days. */
  masteryDays: { topic: 14, subject: 42, category: 84 },
  /** Hours a node stays locked after a failed quiz. */
  cooldownHours: 24,
} as const;