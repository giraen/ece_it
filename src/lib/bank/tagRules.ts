import { CONFIG } from "./config";

const EXEMPT = new Set<string>(CONFIG.exemptTags);

/** True for a tag that says what kind of question it is, such as "solving", so it is not a group to cover. */
export const isExemptTag = (tag: string): boolean => EXEMPT.has(tag.trim().toLowerCase());

/** The tags that count as a group of their own: all but the exempt ones, in lower case. */
export const groupTags = (tags: readonly string[]): string[] =>
  tags.filter((t) => !isExemptTag(t)).map((t) => t.toLowerCase());

/** A question that has tags, and every one of them is exempt. */
export const hasOnlyExemptTags = (tags: readonly string[]): boolean => tags.length > 0 && tags.every(isExemptTag);

/**
 * Puts the questions that have only exempt tags first, and keeps the order of the others. It is used when the Bank is
 * filtered by an exempt tag, so the questions that are just "solving" are easy to spot.
 */
export function exemptOnlyFirst<T extends { tags: readonly string[] }>(list: readonly T[]): T[] {
  return [...list.filter((q) => hasOnlyExemptTags(q.tags)), ...list.filter((q) => !hasOnlyExemptTags(q.tags))];
}