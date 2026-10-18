/** How the tags are used across the bank, and which ones the suggestion panel should show. */

export interface TagUsage {
  /** For each tag (lower case): how many questions carry it. */
  counts: Map<string, number>;
  /** Tags (lower case) used by at least one question in the current topic. */
  here: Set<string>;
}

export interface TagRow {
  kind: "tag" | "create";
  text: string;
  /** How many questions use the tag. Always 0 for a row that would create a new tag. */
  count: number;
}

export interface TagSection {
  title: string;
  rows: TagRow[];
}

const key = (t: string) => t.trim().toLowerCase();

/** Counts each tag once per question, and notes which tags the given topic already uses. */
export function tagUsage(questions: { topicId: string; tags: string[] }[], topicId: string | null): TagUsage {
  const counts = new Map<string, number>();
  const here = new Set<string>();
  for (const q of questions) {
    for (const k of new Set(q.tags.map(key).filter(Boolean))) {
      counts.set(k, (counts.get(k) ?? 0) + 1);
      if (topicId !== null && q.topicId === topicId) here.add(k);
    }
  }
  return { counts, here };
}

interface SectionArgs {
  /** Every tag to offer, in the order they should appear: this topic's first, then the most used. */
  suggestions: string[];
  /** Tags already on the question. They are not offered again. */
  value: string[];
  /** What has been typed so far. */
  draft: string;
  usage: TagUsage;
  /** True when the field knows its topic, so tags can be split into "this topic" and "everything else". */
  topicScoped: boolean;
  /** The most tag rows to show, so a very large bank stays quick. */
  limit?: number;
  /** The most rows to show before anything is typed. Defaults to `limit`. */
  emptyLimit?: number;
}

/**
 * The rows for the suggestion panel.
 * With nothing typed: the topic's tags (most used first), then everything else. When typing: tags containing the
 * text, the ones that start with it first, and a "create" row unless the text is already a tag.
 */
export function tagSections({
  suggestions,
  value,
  draft,
  usage,
  topicScoped,
  limit = 40,
  emptyLimit,
}: SectionArgs): TagSection[] {
  const chosen = new Set(value.map(key));
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const s of suggestions) {
    const k = key(s);
    if (!k || chosen.has(k) || seen.has(k)) continue;
    seen.add(k);
    candidates.push(s.trim());
  }
  const row = (text: string): TagRow => ({ kind: "tag", text, count: usage.counts.get(key(text)) ?? 0 });
  const q = key(draft);

  if (q) {
    const hits = candidates.filter((t) => key(t).includes(q));
    const starts = hits.filter((t) => key(t).startsWith(q));
    const rest = hits.filter((t) => !key(t).startsWith(q));
    const sections: TagSection[] = [];
    const matching = [...starts, ...rest].slice(0, limit).map(row);
    if (matching.length) sections.push({ title: "Matching tags", rows: matching });
    if (!chosen.has(q) && !candidates.some((t) => key(t) === q)) {
      sections.push({ title: "", rows: [{ kind: "create", text: draft.trim(), count: 0 }] });
    }
    return sections;
  }

  // With nothing typed, only the first few are shown. Typing searches all of them.
  const cap = emptyLimit ?? limit;
  const here = topicScoped ? candidates.filter((t) => usage.here.has(key(t))) : [];
  if (here.length === 0) {
    const all = candidates.slice(0, cap).map(row);
    return all.length ? [{ title: "Suggestions", rows: all }] : [];
  }
  const sorted = [...here].sort(
    (a, b) => (usage.counts.get(key(b)) ?? 0) - (usage.counts.get(key(a)) ?? 0) || a.localeCompare(b),
  );
  const others = candidates.filter((t) => !usage.here.has(key(t)));
  const sections: TagSection[] = [{ title: "Used on this topic", rows: sorted.slice(0, cap).map(row) }];
  const room = Math.max(0, cap - sections[0].rows.length);
  if (others.length && room > 0) sections.push({ title: "Everything else", rows: others.slice(0, room).map(row) });
  return sections;
}