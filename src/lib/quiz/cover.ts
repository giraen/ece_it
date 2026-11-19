import { useLiveQuery } from "dexie-react-hooks";
import { db, type Choice, type Question } from "@/lib/db";
import { now } from "@/lib/ids";
import { isNumberAnswer } from "@/lib/memory/answer";

/**
 * Covering the choices on solving problems, so you work the answer out before you see the options instead of picking
 * the one that looks right. The choices show when you press Show choices (or Space).
 *
 * On Auto, a question counts as a solving problem when it is a computation question, or when every choice is a number
 * (with or without a unit) or a formula. Choices such as "None of the above" are not counted either way. A question
 * can be set to always or never cover in the editor, for word answers or numbers that are only recalled.
 */

/** Choices that say nothing about what kind of answer the rest are. */
const FILLER = /^(none of (the|these)|all of (the|these)|both |neither |cannot be determined|not enough|insufficient)/i;

/** Maths names that are not words, so a formula written with them still reads as a formula. */
const MATH_WORDS = new Set([
  "sin",
  "cos",
  "tan",
  "sec",
  "csc",
  "cot",
  "sinh",
  "cosh",
  "tanh",
  "log",
  "ln",
  "exp",
  "sqrt",
  "frac",
  "left",
  "right",
  "cdot",
  "times",
  "theta",
  "omega",
  "alpha",
  "beta",
  "gamma",
  "delta",
  "lambda",
  "sigma",
  "zeta",
  "tau",
  "phi",
  "angle",
  "infty",
  "text",
  "mathrm",
]);

/** A formula or an expression, such as $v(t) = 5e^{-2t}$ or 10/(s^2+2s+10), rather than words. */
export function isFormula(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const inMath = /\$[^$]+\$/.test(t);
  const outside = t.replace(/\$[^$]*\$/g, " ");
  // Words outside the maths (four letters or more, and not a maths name) make it a sentence, not a formula.
  const words = (outside.match(/[A-Za-z]{4,}/g) ?? []).filter((w) => !MATH_WORDS.has(w.toLowerCase()));
  if (words.length > 0) return false;
  if (inMath) return /[A-Za-z]/.test(t.replace(/\\[A-Za-z]+/g, ""));
  // Typed without $: it needs an operator and a letter, as in V = IR or 10/(s^2+2s+10).
  return /[=^/*]/.test(t) && /[A-Za-z]/.test(t);
}

/** Whether these choices look like the answers to a solving problem. */
export function looksSolving(type: Question["type"], choices: Pick<Choice, "text">[]): boolean {
  if (type === "computation") return true;
  const real = choices.map((c) => c.text.trim()).filter((t) => t && !FILLER.test(t.replace(/\$/g, "")));
  if (real.length < 2) return false;
  // Plain years, as in "In what year…", are recalled, not solved.
  if (real.every((t) => /^(1[5-9]|20)\d\d$/.test(t))) return false;
  return real.every((t) => isNumberAnswer(t)) || real.every((t) => isFormula(t) || isNumberAnswer(t));
}

/** Whether a question's choices are covered, setting aside the switch in Preferences. */
export function coversChoices(q: Pick<Question, "type" | "coverChoices">, choices: Pick<Choice, "text">[]): boolean {
  if (q.coverChoices === "always") return true;
  if (q.coverChoices === "never") return false;
  return looksSolving(q.type, choices);
}

// ---------------------------------------------------------------------------------------------
// The switch in Preferences: on unless turned off. Saved with your settings, so it syncs.
// ---------------------------------------------------------------------------------------------

const KEY = "coverChoices";

export async function loadCoverChoices(): Promise<boolean> {
  const row = await db.settings.get(KEY);
  return row && !row.deletedAt ? row.value !== false : true;
}

export function useCoverChoices(): boolean | undefined {
  return useLiveQuery(() => loadCoverChoices(), []);
}

export async function saveCoverChoices(on: boolean): Promise<void> {
  await db.settings.put({ id: KEY, value: on, updatedAt: now() });
}
