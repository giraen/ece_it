/**
 * Every tunable number in one place. Change a value here, never in the logic.
 * See docs/SPEC.md ("Build order and constants").
 */
export const CONFIG = {
  /** Average credit a quiz must reach to pass for mastery. Below this is a fail. */
  passBar: 0.95,
  /** No child group (tag, topic, or subject) may fall below this credit. */
  childFloor: 0.5,
  /** A group only counts toward the floor once it has this many questions in the quiz. */
  minPerGroup: 2,
  /** Credit for a correct answer, by how sure the user was. */
  sureCredit: { sure: 1, not_sure: 0.6, wise_guess: 0.4, just_guessed: 0 },
  /** Speed factor: 1 up to the target, falling in a straight line to minFactor at minAtRatio times the target. */
  speed: { fullUntilRatio: 1, minFactor: 0.7, minAtRatio: 2 },
  /** Target seconds per question when the question has none of its own. */
  defaultTargetSec: { standard: 60, computation: 120 },
  /** Default number of questions when starting a quiz. */
  defaultLength: { topic: 15, subject: 30, category: 60 },
  /** Used in step 3: how long mastery lasts, in days. */
  masteryDays: { topic: 14, subject: 42, category: 84 },
  /** Used in step 3: hours a node stays locked after a failed quiz. */
  cooldownHours: 24,
} as const;
