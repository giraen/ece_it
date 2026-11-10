/**
 * Reading a memory card's answer as a number.
 *
 * An answer that is a number with a unit, such as "2.998 × 10^8 m/s", "746 W" or "30–300 MHz", gets its wrong choices
 * made fresh in each review (9.81 becomes 9.80, 9.82, 9.18…), so there is nothing to write or approve for it. Any other
 * answer, such as a formula or a sentence, needs wrong choices written once.
 */

/** One number as written: its digits and its power of ten. */
export interface WrittenNumber {
  /** The digits as typed, without a sign: "2.998", "746". */
  digits: string;
  negative: boolean;
  /** The power of ten written after it ("× 10^8", "e8"), or null when there is none. */
  exponent: number | null;
}

export interface NumberAnswer {
  /** One number, or two for a range such as 30–300 MHz. */
  values: WrittenNumber[];
  /** What follows the number, such as "m/s" or "MHz". May be empty. */
  unit: string;
}

const SUPERSCRIPT: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁻": "-",
  "⁺": "+",
};

/** Plain text from the LaTeX and symbols people write numbers with. */
function plain(text: string): string {
  return (
    text
      .replace(/\$/g, "")
      .replace(/\\(?:text|mathrm|mathit|operatorname)\{([^}]*)\}/g, "$1")
      .replace(/\\(?:times|cdot)/g, "×")
      .replace(/\\(?:,|;|:|!| )/g, " ")
      .replace(/~/g, " ")
      .replace(/\\mu\b/g, "µ")
      .replace(/\\Omega\b/g, "Ω")
      .replace(/\\(?:circ|degree)\b/g, "°")
      .replace(/\^\{([^}]*)\}/g, "^$1")
      // 10⁻²³ → 10^-23
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (m) => "^" + [...m].map((c) => SUPERSCRIPT[c]).join(""))
      .replace(/[−–—]/g, (c) => (c === "−" ? "-" : "–"))
      .replace(/\s+/g, " ")
      .trim()
  );
}

// A number with an optional power of ten: 2.998 × 10^8, 2.998x10^8, 2.998*10^8, 2.998e8, 1,055, -0.5, .5
const NUM = String.raw`(-)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(?:\s*(?:×|x|\*)\s*10\s*\^\s*([+-]?\d+)|[eE]([+-]?\d+))?`;
const SINGLE = new RegExp(`^${NUM}(?:\\s*(.*))?$`);
const RANGE = new RegExp(`^${NUM}\\s*(?:–|-|to)\\s*${NUM}(?:\\s*(.*))?$`);

/** A unit is short and is not a formula or a sentence. */
function isUnit(u: string): boolean {
  if (!u) return true;
  if (u.length > 16 || /[=<>]/.test(u)) return false;
  // "m/s", "J/K", "m/s^2", "kg·m²", "°C", "Ω", "dB", "rad/s", "N·m"
  return /^[A-Za-zµΩ°%·/^0-9\-\s().]+$/.test(u) && (u.match(/[A-Za-z]/g)?.length ?? 0) <= 10 && !/\s\w+\s\w+/.test(u);
}

const written = (sign: string | undefined, digits: string, e1?: string, e2?: string): WrittenNumber => ({
  digits: digits.replace(/,/g, ""),
  negative: !!sign,
  exponent: e1 !== undefined ? Number(e1) : e2 !== undefined ? Number(e2) : null,
});

/** The answer as a number with a unit, or null when it is something else (a formula, a word, a sentence). */
export function readNumberAnswer(answer: string): NumberAnswer | null {
  const t = plain(answer);
  if (!t) return null;
  const r = RANGE.exec(t);
  if (r) {
    const unit = (r[9] ?? "").trim();
    if (isUnit(unit)) return { values: [written(r[1], r[2], r[3], r[4]), written(r[5], r[6], r[7], r[8])], unit };
  }
  const m = SINGLE.exec(t);
  if (!m) return null;
  const unit = (m[5] ?? "").trim();
  if (!isUnit(unit)) return null;
  return { values: [written(m[1], m[2], m[3], m[4])], unit };
}

/** True when the answer is a number, so its wrong choices are made in each review. */
export const isNumberAnswer = (answer: string) => readNumberAnswer(answer) !== null;
