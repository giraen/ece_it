import { useLiveQuery } from "dexie-react-hooks";
import { db, type Concept, type DraftQuestion } from "./db";
import { newId, now } from "./ids";
import { normalizeTags, saveQuestion } from "./questions";

/** Saves a concept note, cleaning up its tags and stamping the time. */
export async function saveConcept(c: Concept): Promise<void> {
  await db.concepts.put({ ...c, tags: normalizeTags(c.tags), updatedAt: now() });
}

/**
 * Deletes a concept note. Like everything else, it is kept as a deleted record so backups can merge it.
 * Questions already accepted from it stay in the bank, and drafts still waiting for review are discarded.
 */
export async function deleteConcept(id: string): Promise<void> {
  const t = now();
  await db.transaction("rw", db.concepts, db.drafts, async () => {
    await db.concepts.update(id, { deletedAt: t, updatedAt: t });
    const open = await db.drafts
      .where("conceptId")
      .equals(id)
      .filter((d) => !d.deletedAt && d.status === "pending")
      .toArray();
    for (const d of open) {
      await db.drafts.update(d.id, { status: "discarded", note: "The concept was deleted.", updatedAt: t });
    }
  });
}

/** The questions an AI drafted from one concept, kept up to date. */
export function useDraftsFor(conceptId: string): DraftQuestion[] | undefined {
  return useLiveQuery(
    () =>
      db.drafts
        .where("conceptId")
        .equals(conceptId)
        .filter((d) => !d.deletedAt)
        .toArray(),
    [conceptId],
  );
}

/** Every draft, for showing how many are waiting on each concept. */
export function useDrafts(): DraftQuestion[] | undefined {
  return useLiveQuery(() => db.drafts.filter((d) => !d.deletedAt).toArray(), []);
}

export async function saveDrafts(list: DraftQuestion[]): Promise<void> {
  if (list.length) await db.drafts.bulkPut(list);
}

export async function updateDraft(id: string, patch: Partial<DraftQuestion>): Promise<void> {
  await db.drafts.update(id, { ...patch, updatedAt: now() });
}

/**
 * Turns a draft into a real question in the concept's topic, with the concept's tags, and marks the draft accepted.
 * It uses the draft as it is stored now, so edits made by hand are kept, and a draft can only be accepted once.
 */
export async function acceptDraft(draftId: string, concept: Concept): Promise<string | null> {
  return db.transaction("rw", db.drafts, db.questions, db.variants, async () => {
    const d = await db.drafts.get(draftId);
    if (!d || d.deletedAt || d.status !== "pending") return null;
    const t = now();
    const questionId = newId();
    await saveQuestion({
      id: questionId,
      topicId: concept.topicId,
      type: "standard",
      stem: d.stem,
      choices: d.choices,
      correctChoiceId: d.correctChoiceId,
      tags: concept.tags,
      createdAt: t,
      updatedAt: t,
    });
    await db.drafts.update(d.id, { status: "accepted", questionId, note: "Added to the question bank.", updatedAt: t });
    return questionId;
  });
}