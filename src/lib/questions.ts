function sameTag(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Trims tags, drops blanks, and drops repeats that differ only by capital letters. The first spelling wins. */
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (t && !out.some((x) => sameTag(x, t))) out.push(t);
  }
  return out;
}

/**
 * Tags to suggest while typing: the ones already used in this topic first, then every other tag in the bank,
 * most used first. "Series" and "series" are one tag, shown with the first spelling found.
 */
export function suggestTags(questions: { topicId: string; tags: string[] }[], topicId: string | null): string[] {
  const here = new Map<string, string>();
  const elsewhere = new Map<string, { spelling: string; count: number }>();
  for (const q of questions) {
    for (const raw of q.tags) {
      const t = raw.trim();
      const key = t.toLowerCase();
      if (!key) continue;
      if (q.topicId === topicId) {
        if (!here.has(key)) here.set(key, t);
      } else {
        const e = elsewhere.get(key);
        if (e) e.count++;
        else elsewhere.set(key, { spelling: t, count: 1 });
      }
    }
  }
  const first = Array.from(here.values()).sort((a, b) => a.localeCompare(b));
  const rest = Array.from(elsewhere.entries())
    .filter(([key]) => !here.has(key))
    .sort((a, b) => b[1].count - a[1].count || a[1].spelling.localeCompare(b[1].spelling))
    .map(([, e]) => e.spelling);
  return [...first, ...rest];
}