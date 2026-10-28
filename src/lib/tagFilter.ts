/** Filtering the Bank by several tags at once. A question must carry all of the chosen tags. */

const key = (t: string) => t.toLowerCase();

/** The filter for questions that have no tag at all. It stands alone, since a question with no tag matches no other. */
export const UNTAGGED = "-untagged-";

/** True when the question has every one of the chosen tags (compared without regard to capital letters). */
export function hasAllTags(tags: string[], chosen: string[]): boolean {
  if (chosen.length === 0) return true;
  const have = new Set(tags.map(key));
  return chosen.every((k) => have.has(k));
}

/** True when the question passes the chosen filter: it has all the chosen tags, or none at all for "untagged". */
export function matchesTags(tags: string[], chosen: string[]): boolean {
  return chosen.includes(UNTAGGED) ? tags.length === 0 : hasAllTags(tags, chosen);
}

/** Adds the tag to the chosen ones, or takes it out when it is already chosen. "Untagged" replaces the others. */
export function toggleTag(chosen: string[], tag: string): string[] {
  const k = key(tag);
  if (k === UNTAGGED) return chosen.includes(UNTAGGED) ? [] : [UNTAGGED];
  const rest = chosen.filter((x) => x !== UNTAGGED);
  return rest.includes(k) ? rest.filter((x) => x !== k) : [...rest, k];
}

/**
 * For each tag in view, how many questions you would see with it added to the chosen tags.
 * The questions are those already narrowed by the chosen tags, so a tag that can no longer match anything is absent.
 */
export function narrowedCounts(
  inScope: { tags: string[] }[],
  chosen: string[],
): { counts: Map<string, number>; shown: number } {
  const counts = new Map<string, number>();
  let shown = 0;
  for (const q of inScope) {
    if (!matchesTags(q.tags, chosen)) continue;
    shown += 1;
    for (const k of new Set(q.tags.map(key))) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return { counts, shown };
}