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