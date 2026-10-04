import { db, type Question } from "./db";
import { now } from "./ids";

export async function saveQuestion(q: Question): Promise<void> {
  await db.questions.put({ ...q, updatedAt: now() });
}

export async function deleteQuestions(ids: string[]): Promise<void> {
  const t = now();
  await db.transaction("rw", db.questions, async () => {
    for (const id of ids) await db.questions.update(id, { deletedAt: t, updatedAt: t });
  });
}

function sameTag(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (t && !out.some((x) => sameTag(x, t))) out.push(t);
  }
  return out;
}

export async function addTag(ids: string[], tag: string): Promise<void> {
  const t = tag.trim();
  if (!t) return;
  const stamp = now();
  await db.transaction("rw", db.questions, async () => {
    for (const id of ids) {
      const q = await db.questions.get(id);
      if (!q || q.deletedAt) continue;
      await db.questions.update(id, {
        tags: normalizeTags([...q.tags, t]),
        updatedAt: stamp,
      });
    }
  });
}

export async function removeTag(ids: string[], tag: string): Promise<void> {
  const stamp = now();
  await db.transaction("rw", db.questions, async () => {
    for (const id of ids) {
      const q = await db.questions.get(id);
      if (!q || q.deletedAt) continue;
      await db.questions.update(id, {
        tags: q.tags.filter((x) => !sameTag(x, tag)),
        updatedAt: stamp,
      });
    }
  });
}

/** Rename a tag on every question in the given topics. */
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
