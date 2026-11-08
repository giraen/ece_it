import type { Source } from "./sources";

/** Only a book has a "where in it" to type, which is its page. Past quizzes, websites and videos have none. */
export const hasWhere = (kind: Source["kind"]): boolean => kind === "book";

/** Keeps what a page can hold: numbers, and the comma, dash and space of a list or a range such as "34-35". */
export function pageOnly(typed: string): string {
  return typed.replace(/[^\d\s,–-]/g, "");
}

/**
 * Counts up the first number in a "where" text, so one start such as "p. 143" can run through a row of questions:
 * 143, 144, 145. Only the first number changes, so "p. 143, Problem 5" becomes "p. 144, Problem 5".
 * Text without a number is returned as it is.
 */
export function bumpWhere(where: string, step: number): string {
  return where.replace(/\d+/, (n) => String(Number(n) + step));
}

/** Numbers that can stand alone as a page: "34", "34-35", "34, 36". */
const PAGE_ONLY = /^\d[\d\s,–-]*$/;
/** An already written page: "p. 34", "p.34", "P 34". */
const WRITTEN_PAGE = /^p\.?\s*(\d[\d\s,–-]*)$/i;

/**
 * What to store for what was typed in a "where" box. For a book, a bare number is a page, so "34" becomes "p. 34".
 * Anything else, such as "p. 147, Problem 2" or "Problem 5", is kept as typed.
 */
export function whereFromInput(kind: Source["kind"], typed: string): string {
  const t = typed.trim();
  if (kind !== "book" || !t) return t;
  const written = WRITTEN_PAGE.exec(t);
  if (written) return `p. ${written[1].trim()}`;
  return PAGE_ONLY.test(t) ? `p. ${t}` : t;
}

/** What to show in a "where" box for a stored value. For a book, "p. 34" shows as just "34". */
export function whereForInput(kind: Source["kind"], stored: string): string {
  const t = stored.trim();
  if (kind !== "book") return stored;
  const written = WRITTEN_PAGE.exec(t);
  return written ? written[1].trim() : stored;
}