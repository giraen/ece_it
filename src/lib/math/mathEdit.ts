/**
 * Pure text-editing helpers for the toolbar above the editor boxes. Each one takes the current text and selection
 * and returns the new text and the new selection, so they are easy to test and the box only has to apply the result.
 */

export interface Edit {
  text: string;
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------------------------
// Where is the cursor?
// ---------------------------------------------------------------------------------------------

function findClose(text: string, from: number, block: boolean): number {
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      i++;
      continue;
    }
    // An inline formula cannot run across a blank line.
    if (!block && c === "\n" && /^\n[ \t]*\n/.test(text.slice(i))) return -1;
    if (c === "$" && (!block || text[i + 1] === "$")) return i;
  }
  return -1;
}

/** True when the position is inside a $...$ or $$...$$ formula. An unclosed dollar sign does not count. */
export function insideMath(text: string, pos: number): boolean {
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "$") {
      const block = text[i + 1] === "$";
      const open = i + (block ? 2 : 1);
      const close = findClose(text, open, block);
      if (close === -1) {
        i = open;
        continue;
      }
      if (pos >= open && pos <= close) return true;
      i = close + (block ? 2 : 1);
      continue;
    }
    i++;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Maths snippets
// ---------------------------------------------------------------------------------------------

/**
 * A snippet is typed maths with ‹placeholders›. The first placeholder is where selected text goes, or what is
 * selected after inserting so you can type over it. Placeholders are removed from the text that is inserted.
 */
function parseTemplate(t: string): { plain: string; ranges: [number, number][] } {
  let plain = "";
  const ranges: [number, number][] = [];
  const re = /‹([^›]*)›/g;
  let last = 0;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    plain += t.slice(last, m.index);
    ranges.push([plain.length, plain.length + m[1].length]);
    plain += m[1];
    last = m.index + m[0].length;
  }
  plain += t.slice(last);
  return { plain, ranges };
}

/**
 * Inserts a maths snippet. Inside a formula it goes in as it is. Elsewhere it is wrapped in dollar signs.
 * Selected text replaces the first placeholder (in brackets when `group` is set and it is more than a plain word).
 */
export function insertMath(text: string, s: number, e: number, template: string, group = false): Edit {
  const { plain, ranges } = parseTemplate(template);
  const selected = text.slice(s, e);
  let body = plain;
  let sel: [number, number];

  if (selected && ranges.length) {
    const [a, b] = ranges[0];
    const piece = group && /[^A-Za-z0-9_.]/.test(selected) ? `(${selected})` : selected;
    body = plain.slice(0, a) + piece + plain.slice(b);
    const shift = piece.length - (b - a);
    sel = ranges[1] ? [ranges[1][0] + shift, ranges[1][1] + shift] : [body.length, body.length];
  } else if (ranges.length) {
    sel = ranges[0];
  } else {
    sel = [body.length, body.length];
  }

  const wrap = !insideMath(text, s);
  const open = wrap ? "$" : "";
  const close = wrap ? "$" : "";
  const inserted = open + body + close;
  return {
    text: text.slice(0, s) + inserted + text.slice(e),
    start: s + open.length + sel[0],
    end: s + open.length + sel[1],
  };
}

// ---------------------------------------------------------------------------------------------
// Text formatting
// ---------------------------------------------------------------------------------------------

/** Wraps the selection in marks such as ** or `. Wrapping again removes them. With nothing selected it inserts a placeholder. */
export function wrapSelection(
  text: string,
  s: number,
  e: number,
  left: string,
  right: string,
  placeholder: string,
): Edit {
  const selected = text.slice(s, e);
  if (selected && text.slice(s - left.length, s) === left && text.slice(e, e + right.length) === right) {
    return {
      text: text.slice(0, s - left.length) + selected + text.slice(e + right.length),
      start: s - left.length,
      end: e - left.length,
    };
  }
  if (
    selected &&
    selected.startsWith(left) &&
    selected.endsWith(right) &&
    selected.length >= left.length + right.length
  ) {
    const inner = selected.slice(left.length, selected.length - right.length);
    return { text: text.slice(0, s) + inner + text.slice(e), start: s, end: s + inner.length };
  }
  const inner = selected || placeholder;
  return {
    text: text.slice(0, s) + left + inner + right + text.slice(e),
    start: s + left.length,
    end: s + left.length + inner.length,
  };
}

/** A link: the selection becomes the link text and the address is selected, ready to type. */
export function insertLink(text: string, s: number, e: number): Edit {
  const label = text.slice(s, e) || "link text";
  const url = "https://";
  const out = `[${label}](${url})`;
  const start = s + label.length + 3;
  return { text: text.slice(0, s) + out + text.slice(e), start, end: start + url.length };
}

function lineRange(text: string, s: number, e: number): [number, number] {
  const from = text.lastIndexOf("\n", s - 1) + 1;
  const nl = text.indexOf("\n", e > s ? e - 1 : e);
  return [from, nl === -1 ? text.length : nl];
}

const BULLET = /^(\s*)([-*+]) (\[[ xX]\] )?/;
const NUMBER = /^(\s*)(\d+)\. /;

/**
 * Turns the selected lines into a list, quote or checklist. Doing it again on lines that already have it takes it off.
 */
export function prefixLines(text: string, s: number, e: number, kind: "bullet" | "number" | "quote" | "check"): Edit {
  const [from, to] = lineRange(text, s, e);
  const lines = text.slice(from, to).split("\n");
  const marks: Record<typeof kind, RegExp> = {
    bullet: /^(\s*)[-*+] (?!\[[ xX]\] )/,
    number: /^(\s*)\d+\. /,
    quote: /^(\s*)> ?/,
    check: /^(\s*)[-*+] \[[ xX]\] /,
  };
  const all = lines.filter((l) => l.trim()).every((l) => marks[kind].test(l));
  let n = 0;
  const out = lines.map((l) => {
    if (!l.trim()) return l;
    if (all) return l.replace(marks[kind], "$1");
    const bare = l.replace(/^(\s*)(?:[-*+] (?:\[[ xX]\] )?|\d+\. |> ?)/, "$1");
    n++;
    const lead = /^\s*/.exec(bare)?.[0] ?? "";
    const rest = bare.slice(lead.length);
    if (kind === "bullet") return `${lead}- ${rest}`;
    if (kind === "check") return `${lead}- [ ] ${rest}`;
    if (kind === "quote") return `${lead}> ${rest}`;
    return `${lead}${n}. ${rest}`;
  });
  const joined = out.join("\n");
  return { text: text.slice(0, from) + joined + text.slice(to), start: from, end: from + joined.length };
}

/** Cycles the heading level of the current line: none, ##, ###, none. */
export function cycleHeading(text: string, s: number, e: number): Edit {
  const [from, to] = lineRange(text, s, e);
  const line = text.slice(from, to);
  const m = /^(#{1,6}) /.exec(line);
  const rest = m ? line.slice(m[0].length) : line;
  const level = m ? m[1].length : 0;
  const next = level === 0 || level === 1 ? "## " : level === 2 ? "### " : "";
  const out = next + rest;
  return { text: text.slice(0, from) + out + text.slice(to), start: from + next.length, end: from + out.length };
}

/** A small table, placed on its own lines. */
export function insertTable(text: string, s: number, e: number): Edit {
  const table = "| Name | Value |\n| --- | --- |\n| a | 1 |\n| b | 2 |";
  const before = text.slice(0, s);
  const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const after = text.slice(e);
  const trail = after === "" || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const start = s + lead.length + 2;
  return { text: before + lead + table + trail + after, start, end: start + 4 };
}

// ---------------------------------------------------------------------------------------------
// Keyboard help for lists
// ---------------------------------------------------------------------------------------------

/**
 * Enter at the end of a list line starts the next item. Enter on an empty item ends the list.
 * Returns null when the cursor is not at the end of a list line, so the key works as usual.
 */
export function continueList(text: string, pos: number): Edit | null {
  const from = text.lastIndexOf("\n", pos - 1) + 1;
  const nl = text.indexOf("\n", pos);
  const to = nl === -1 ? text.length : nl;
  if (pos !== to) return null;
  const line = text.slice(from, to);
  const b = BULLET.exec(line);
  const n = NUMBER.exec(line);
  const m = b ?? n;
  if (!m) return null;
  if (line.length === m[0].length) {
    return { text: text.slice(0, from) + text.slice(to), start: from, end: from };
  }
  let next: string;
  if (b) next = `${b[1]}${b[2]} ${b[3] ? "[ ] " : ""}`;
  else next = `${n![1]}${Number(n![2]) + 1}. `;
  return {
    text: text.slice(0, pos) + "\n" + next + text.slice(pos),
    start: pos + 1 + next.length,
    end: pos + 1 + next.length,
  };
}

/** Tab on a list line indents it (so it nests under the line above). Shift+Tab takes it back. Null for other lines. */
export function indentList(text: string, s: number, e: number, outdent: boolean): Edit | null {
  const [from, to] = lineRange(text, s, e);
  const lines = text.slice(from, to).split("\n");
  if (!lines.every((l) => !l.trim() || BULLET.test(l) || NUMBER.test(l))) return null;
  const out = lines.map((l) => {
    if (!l.trim()) return l;
    if (!outdent) return "   " + l;
    return l.replace(/^( {1,3}|\t)/, "");
  });
  const joined = out.join("\n");
  const delta = joined.length - (to - from);
  return {
    text: text.slice(0, from) + joined + text.slice(to),
    start: Math.max(from, s + (outdent ? Math.min(0, delta) : 3)),
    end: e + delta,
  };
}