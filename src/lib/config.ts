/**
 * Every tunable number in one place. Change a value here, never in the logic.
 */
export const CONFIG = {
  /** The mastery bar when none is set in Settings: the average credit a quiz must reach to pass for mastery. */
  passBar: 0.95,
  /** The fixed minimum to pass. The graph draws it as a line, and the mastery bar can never be set at or below it. */
  minimumPass: 0.75,
  /**
   * Tags that say what kind of question it is, not what it covers. A quiz never picks one of them as a group to
   * spread or focus on, and the Bank lists the questions that have only these tags first. Written in lower case.
   */
  exemptTags: ["concept", "solving"],
  /**
   * How a topic or subject quiz is shaped. Each quiz is either spread evenly across its groups (topics in a subject
   * quiz, tags in a topic quiz) or focused: one group takes a share of the quiz and the rest is spread evenly.
   * No group is required to appear, and mastery never depends on it.
   */
  build: {
    /** The chance that a quiz is spread evenly. Otherwise it is focused. */
    evenShare: 0.85,
    /** A focused quiz gives its one group between these shares of the quiz. */
    focusShare: { min: 0.3, max: 0.4 },
    /**
     * With few groups an even share is already big (half with two groups), so the focused group gets at least this many
     * times the even share, and never more than `focusCap` of the quiz.
     */
    focusAtLeast: 1.5,
    focusCap: 0.6,
  },
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
  /** The most times one question may appear in a single quiz. */
  maxRepeats: 10,
  /** Computation questions: two answer choices closer than this (as a fraction) trigger a re-roll. */
  minChoiceSpacing: 0.02,
  /** Computation questions: how many times to re-roll before a template is called unusable. */
  maxRolls: 50,
  /** How long mastery lasts, in days. */
  masteryDays: { topic: 14, subject: 42, category: 84 },
  /** Hours a node stays locked after a failed quiz. */
  cooldownHours: 24,
} as const;