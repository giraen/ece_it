import { db, type Question } from "./db";
import { now } from "./ids";

/** What a reworded variant depends on. If any of this changes, the variants no longer match the question. */
function answerKey(q: Question): string {
  return JSON.stringify([q.type, q.stem, q.choices, q.correctChoiceId, q.template]);
}

/** Saves a new or edited question. */
export async function saveQuestion(q: Question): Promise<void> {
  await db.transaction("rw", db.questions, db.variants, async () => {
    const before = await db.questions.get(q.id);
    const t = now();
    await db.questions.put({ ...q, updatedAt: t });
    if (before && answerKey(before) !== answerKey(q)) {
      // The question itself changed, so any AI rewordings written for the old version can no longer be trusted.
      const stale = await db.variants
        .where("questionId")
        .equals(q.id)
        .filter((v) => !v.deletedAt && v.status !== "discarded")
        .toArray();
      for (const v of stale) {
        await db.variants.update(v.id, {
          status: "discarded",
          note: "The question was edited after this was made.",
          updatedAt: t,
        });
      }
    }
  });
}

/** Deletes questions. They are hidden, not erased, so a backup merge can tell "deleted" from "never existed". */
export async function deleteQuestions(ids: string[]): Promise<void> {
  const t = now();
  await db.transaction("rw", db.questions, async () => {
    for (const id of ids) await db.questions.update(id, { deletedAt: t, updatedAt: t });
  });
}

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

/** Adds a tag to each of the questions. Questions that already have it are left as they are. */
export async function addTag(ids: string[], tag: string): Promise<void> {
  const t = tag.trim();
  if (!t) return;
  const stamp = now();
  await db.transaction("rw", db.questions, async () => {
    for (const id of ids) {
      const q = await db.questions.get(id);
      if (!q || q.deletedAt) continue;
      await db.questions.update(id, { tags: normalizeTags([...q.tags, t]), updatedAt: stamp });
    }
  });
}

/** Takes a tag off each of the questions, whatever its capital letters. */
export async function removeTag(ids: string[], tag: string): Promise<void> {
  const stamp = now();
  await db.transaction("rw", db.questions, async () => {
    for (const id of ids) {
      const q = await db.questions.get(id);
      if (!q || q.deletedAt) continue;
      await db.questions.update(id, { tags: q.tags.filter((x) => !sameTag(x, tag)), updatedAt: stamp });
    }
  });
}

/** Renames a tag on every question in the given topics. */
export async function renameTag(topicIds: string[], from: string, to: string): Promise<void> {
  const target = to.trim();
  if (!target) return;
  const topics = new Set(topicIds);
  const stamp = now();
  await db.transaction("rw", db.questions, async () => {
    const qs = await db.questions
      .filter((q) => !q.deletedAt && topics.has(q.topicId) && q.tags.some((x) => sameTag(x, from)))
      .toArray();
    for (const q of qs) {
      await db.questions.update(q.id, {
        tags: normalizeTags(q.tags.map((x) => (sameTag(x, from) ? target : x))),
        updatedAt: stamp,
      });
    }
  });
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