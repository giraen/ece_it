import { db, type Concept } from "./db";
import { now } from "./ids";
import { normalizeTags } from "./questions";

/** Saves a concept note, cleaning up its tags and stamping the time. */
export async function saveConcept(c: Concept): Promise<void> {
  await db.concepts.put({ ...c, tags: normalizeTags(c.tags), updatedAt: now() });
}

/** Deletes a concept note. Like everything else, it is kept as a deleted record so backups can merge it. */
export async function deleteConcept(id: string): Promise<void> {
  const t = now();
  await db.concepts.update(id, { deletedAt: t, updatedAt: t });
}