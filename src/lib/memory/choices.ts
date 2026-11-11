import type { MemoryCard } from "@/lib/db";
import { readNumberAnswer, type NumberAnswer, type WrittenNumber } from "./answer";
import { WRONG_CHOICES } from "./cards";

/**
 * The choices a review shows for a card: the answer and three wrong ones that look almost the same.
 *
 * For a number, the wrong ones are made here each time, so they never go stale and nothing needs approving:
 * one digit nudged (9.81 → 9.82), two digits swapped (9.81 → 9.18), or the power of ten off by one (10^8 → 10^9).
 * The answer is written the same way as the wrong ones, so its look gives nothing away.
 */

export interface ReviewChoice {
  text: string;
  correct: boolean;
}

/** A small random number source, so a test can repeat a draw. */
export type Rand = () => number;

function shuffle<T>(list: T[], rand: Rand): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Positions of the digits in "2.998" that may change: not the leading one when that would make a zero. */
const digitSpots = (digits: string) => [...digits].map((c, i) => (/\d/.test(c) ? i : -1)).filter((i) => i >= 0);

/** Near misses of one written number. */
function nearMisses(n: WrittenNumber): WrittenNumber[] {
  const out: WrittenNumber[] = [];
  const spots = digitSpots(n.digits);
  const set = (i: number, d: string) => n.digits.slice(0, i) + d + n.digits.slice(i + 1);
  const ok = (digits: string) => !/^0\d/.test(digits) && /[1-9]/.test(digits);

  // The last digit, and the one before it, one up or one down.
  for (const i of spots.slice(-2)) {
    const d = Number(n.digits[i]);
    for (const step of [1, -1]) {
      const nd = d + step;
      if (nd >= 0 && nd <= 9 && ok(set(i, String(nd)))) out.push({ ...n, digits: set(i, String(nd)) });
    }
  }
  // Two neighbouring digits swapped, when they differ. The leading digit stays, so the size looks the same.
  for (let k = 1; k + 1 < spots.length; k++) {
    const [i, j] = [spots[k], spots[k + 1]];
    if (n.digits[i] === n.digits[j]) continue;
    const swapped = [...n.digits];
    [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
    if (ok(swapped.join(""))) out.push({ ...n, digits: swapped.join("") });
  }
  // The power of ten one off.
  if (n.exponent !== null) {
    out.push({ ...n, exponent: n.exponent + 1 }, { ...n, exponent: n.exponent - 1 });
  } else if (spots.length === 1) {
    // A lone digit has few near misses: add the neighbours further out.
    const d = Number(n.digits);
    for (const v of [d + 2, d - 2, d * 10]) if (v > 0) out.push({ ...n, digits: String(v) });
  }
  // The sign, when there is one.
  if (n.negative) out.push({ ...n, negative: false });
  return out;
}

/** How a number is shown in a review: LaTeX, with the unit as text after it. */
function showNumber(n: WrittenNumber): string {
  const sign = n.negative ? "-" : "";
  return n.exponent === null ? `${sign}${n.digits}` : `${sign}${n.digits} \\times 10^{${n.exponent}}`;
}

const SUP: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/** "m/s^2" → "m/s²", so a unit reads right as plain text. */
const showUnit = (u: string) => u.replace(/\^\{?(-?\d+)\}?/g, (_, p: string) => [...p].map((c) => SUP[c]).join(""));

export function showNumberAnswer(a: NumberAnswer): string {
  const value = a.values.map(showNumber).join(" \\text{–} ");
  return `$${value}$${a.unit ? ` ${showUnit(a.unit)}` : ""}`;
}

const key = (a: NumberAnswer) => showNumberAnswer(a);

/** Three wrong numbers near the answer, all different. */
export function wrongNumbers(a: NumberAnswer, rand: Rand): NumberAnswer[] {
  const candidates: NumberAnswer[] = [];
  a.values.forEach((v, i) => {
    for (const m of nearMisses(v)) candidates.push({ ...a, values: a.values.map((x, j) => (j === i ? m : x)) });
  });
  // A range can also have both ends shifted the same way: 30–300 → 300–3000.
  if (a.values.length === 2 && a.values.every((v) => v.exponent === null)) {
    const times = (v: WrittenNumber, f: number) => ({ ...v, digits: String(Number(v.digits) * f) });
    candidates.push({ ...a, values: a.values.map((v) => times(v, 10)) });
    if (a.values.every((v) => Number(v.digits) % 10 === 0)) {
      candidates.push({ ...a, values: a.values.map((v) => ({ ...v, digits: String(Number(v.digits) / 10) })) });
    }
  }
  const seen = new Set([key(a)]);
  const out: NumberAnswer[] = [];
  for (const c of shuffle(candidates, rand)) {
    if (out.length === WRONG_CHOICES) break;
    if (seen.has(key(c))) continue;
    seen.add(key(c));
    out.push(c);
  }
  return out;
}

/** The choices for one review of a card, shuffled. */
export function reviewChoices(card: MemoryCard, rand: Rand = Math.random): ReviewChoice[] {
  const num = readNumberAnswer(card.answer);
  if (num) {
    return shuffle(
      [
        { text: showNumberAnswer(num), correct: true },
        ...wrongNumbers(num, rand).map((w) => ({ text: showNumberAnswer(w), correct: false })),
      ],
      rand,
    );
  }
  const wrong = shuffle(
    card.wrong.filter((w) => w.trim()),
    rand,
  ).slice(0, WRONG_CHOICES);
  return shuffle([{ text: card.answer, correct: true }, ...wrong.map((text) => ({ text, correct: false }))], rand);
}
