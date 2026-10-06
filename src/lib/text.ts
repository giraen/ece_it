/** How much text a question may hold. Generous for real use, small enough to stop an accidental giant paste. */
export const LIMITS = {
  stem: 5000,
  choice: 1000,
  tag: 40,
} as const;

// Control characters, zero-width characters, and the "reverse direction" marks that can make text display backwards.
// Tab and new line are kept.
const HIDDEN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/** Tidies text before it is saved: one kind of line break, no hidden characters, no spaces around it. */
export function cleanText(s: string): string {
  return s.replace(/\r\n?/g, "\n").replace(HIDDEN, "").normalize("NFC").trim();
}

export type Segment = { kind: "text" | "inline" | "display"; value: string };

export interface Split {
  segments: Segment[];
  /** A $ or $$ that never found its partner. It is shown as a plain dollar sign. */
  lone: boolean;
  /** Formulas that hold ordinary words, such as the "$5 ... $6" in "costs $5 and later $6". They are shown as plain text. */
  prose: boolean;
}

// A formula almost never holds two long words in a row. If one does, ordinary text was probably caught between two $ signs.
// Commands like \text{...} and \mathrm{...} are left out of the check, because words are expected there.
const looksLikeWords = (tex: string) =>
  /[A-Za-z]{3,}[ \t]+[A-Za-z]{3,}/.test(tex.replace(/\\[a-zA-Z]+\*?(\{[^{}]*\})?/g, ""));

/** Finds the next $ or $$ at or after `from` that is not written as \$. */
function find(text: string, from: number, delim: "$" | "$$"): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text.startsWith(delim, i)) {
      // For a single $, do not take half of a $$.
      if (delim === "$" && text[i + 1] === "$") {
        i++;
        continue;
      }
      return i;
    }
  }
  return -1;
}

/**
 * Splits text into plain text and formulas. The rules are simple:
 * $...$ is a formula in the line, $$...$$ is a formula on its own line, and \$ is a plain dollar sign.
 * Everything else is plain text, shown exactly as typed.
 */
export function splitMath(text: string): Split {
  const segments: Segment[] = [];
  let lone = false;
  let prose = false;
  let plain = "";
  const flush = () => {
    if (plain) segments.push({ kind: "text", value: plain });
    plain = "";
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\" && text[i + 1] === "$") {
      plain += "$";
      i++;
    } else if (c === "$") {
      const display = text[i + 1] === "$";
      const delim = display ? "$$" : "$";
      const end = find(text, i + delim.length, delim);
      const tex = end < 0 ? "" : text.slice(i + delim.length, end);
      if (end < 0 || !tex.trim()) {
        // No partner, or nothing between them: keep the dollar signs as they were typed.
        if (end < 0) lone = true;
        plain += delim;
        i += delim.length - 1;
      } else if (!display && looksLikeWords(tex)) {
        prose = true;
        plain += "$" + tex + "$";
        i = end;
      } else {
        flush();
        segments.push({ kind: display ? "display" : "inline", value: tex.trim() });
        i = end + delim.length - 1;
      }
    } else {
      plain += c;
    }
  }
  flush();

  // A formula on its own line already breaks the line, so drop one line break on each side of it.
  segments.forEach((s, i) => {
    if (s.kind !== "display") return;
    const before = segments[i - 1];
    const after = segments[i + 1];
    if (before?.kind === "text") before.value = before.value.replace(/\n$/, "");
    if (after?.kind === "text") after.value = after.value.replace(/^\n/, "");
  });
  return { segments: segments.filter((s) => s.kind !== "text" || s.value !== ""), lone, prose };
}

/**
 * A note for the person writing, or null if the text is fine. It never blocks saving.
 * Covers a $ that would swallow ordinary text, and formula symbols used outside of $ signs.
 */
export function textProblem(text: string): string | null {
  const { segments, lone, prose } = splitMath(text);
  if (lone) {
    return "There is a lone $ here. It is shown as a dollar sign. For a formula, put it between two $ signs, like $x^2$.";
  }
  if (prose) {
    return "Some words sit between two $ signs, so they are shown as plain text. For a dollar sign type \\$, and for a formula use $x^2$.";
  }
  const outside = segments.filter((s) => s.kind === "text").map((s) => s.value);
  if (outside.some((t) => /\\[a-zA-Z]{2,}|[_^]\{/.test(t))) {
    return "This looks like a formula outside of $ signs. Put formulas between $ signs, like $R_1$. Otherwise it is shown exactly as typed.";
  }
  return null;
}