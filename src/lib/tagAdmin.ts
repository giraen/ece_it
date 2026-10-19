import { db } from "./db";
import { now } from "./ids";
import { normalizeTags } from "./questions";

/** One tag as the tag manager lists it. Capital letters do not make a different tag. */
export interface TagStat {
  /** The tag in lower case. */
  key: string;
  /** The spelling shown: the one used most. */
  label: string;
  /** Every spelling found, when there is more than one. */
  spellings: string[];
  questions: number;
  notes: number;
  topics: number;
}

const keyOf = (t: string) => t.trim().toLowerCase();

/** Counts every tag across questions and notes. Only questions can have a tag in a topic, so topics are counted from them. */
export function tagStats(questions: { topicId: string; tags: string[] }[], notes: { tags: string[] }[]): TagStat[] {
  const map = new Map<string, { spell: Map<string, number>; questions: number; notes: number; topics: Set<string> }>();
  const get = (k: string) => {
    let e = map.get(k);
    if (!e) map.set(k, (e = { spell: new Map(), questions: 0, notes: 0, topics: new Set() }));
    return e;
  };
  for (const q of questions) {
    for (const t of new Set(q.tags.map((x) => x.trim()).filter(Boolean))) {
      const e = get(keyOf(t));
      e.spell.set(t, (e.spell.get(t) ?? 0) + 1);
      e.questions += 1;
      e.topics.add(q.topicId);
    }
  }
  for (const n of notes) {
    for (const t of new Set(n.tags.map((x) => x.trim()).filter(Boolean))) {
      const e = get(keyOf(t));
      e.spell.set(t, (e.spell.get(t) ?? 0) + 1);
      e.notes += 1;
    }
  }
  return Array.from(map.entries()).map(([key, e]) => {
    const spellings = Array.from(e.spell.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([s]) => s);
    return { key, label: spellings[0], spellings, questions: e.questions, notes: e.notes, topics: e.topics.size };
  });
}

/** What a record's tags were before a change, so the change can be undone. */
export interface TagSnapshot {
  table: "questions" | "concepts" | "drafts";
  id: string;
  tags: string[] | undefined;
}

type Change = (tags: string[]) => string[];

/** Applies a change to the tags of every question, note, and waiting question that has the tag. */
async function rewrite(key: string, change: Change): Promise<TagSnapshot[]> {
  const stamp = now();
  const before: TagSnapshot[] = [];
  const has = (tags: string[] | undefined) => !!tags && tags.some((t) => keyOf(t) === key);
  await db.transaction("rw", [db.questions, db.concepts, db.drafts], async () => {
    for (const q of await db.questions.filter((x) => !x.deletedAt && has(x.tags)).toArray()) {
      before.push({ table: "questions", id: q.id, tags: q.tags });
      await db.questions.update(q.id, { tags: change(q.tags), updatedAt: stamp });
    }
    for (const c of await db.concepts.filter((x) => !x.deletedAt && has(x.tags)).toArray()) {
      before.push({ table: "concepts", id: c.id, tags: c.tags });
      await db.concepts.update(c.id, { tags: change(c.tags), updatedAt: stamp });
    }
    for (const d of await db.drafts.filter((x) => !x.deletedAt && x.status === "pending" && has(x.tags)).toArray()) {
      before.push({ table: "drafts", id: d.id, tags: d.tags });
      await db.drafts.update(d.id, { tags: change(d.tags ?? []), updatedAt: stamp });
    }
  });
  return before;
}

/** Renames a tag everywhere. If the new name is already a tag, the two become one. */
export function renameTagEverywhere(fromKey: string, to: string): Promise<TagSnapshot[]> {
  const target = to.trim();
  if (!target) return Promise.resolve([]);
  return rewrite(fromKey, (tags) => normalizeTags(tags.map((t) => (keyOf(t) === fromKey ? target : t))));
}

/** Takes a tag off everything that has it. */
export function deleteTagEverywhere(key: string): Promise<TagSnapshot[]> {
  return rewrite(key, (tags) => tags.filter((t) => keyOf(t) !== key));
}

/** Puts the tags back as they were. */
export async function restoreTags(before: TagSnapshot[]): Promise<void> {
  const stamp = now();
  await db.transaction("rw", [db.questions, db.concepts, db.drafts], async () => {
    for (const b of before) {
      if (b.table === "questions") await db.questions.update(b.id, { tags: b.tags ?? [], updatedAt: stamp });
      else if (b.table === "concepts") await db.concepts.update(b.id, { tags: b.tags ?? [], updatedAt: stamp });
      else await db.drafts.update(b.id, { tags: b.tags, updatedAt: stamp });
    }
  });
}