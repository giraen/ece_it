import type { Source } from "./sources";

/** What the "where in it" box is called for each kind of source. */
export const WHERE_LABEL: Record<Source["kind"], string> = {
  book: "Page / problem",
  website: "Section",
  notes: "Slide / week",
  other: "Where",
};

/**
 * Counts up the first number in a "where" text, so one start such as "p. 143" can run through a row of questions:
 * 143, 144, 145. Only the first number changes, so "p. 143, Problem 5" becomes "p. 144, Problem 5".
 * Text without a number is returned as it is.
 */
export function bumpWhere(where: string, step: number): string {
  return where.replace(/\d+/, (n) => String(Number(n) + step));
}