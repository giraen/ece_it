import { useLiveQuery } from "dexie-react-hooks";
import { db, type DraftQuestion } from "./db";
import { EXTRACT_CONCEPT, extractStatus } from "./extract";
import { newId, now } from "./ids";
import { saveQuestion } from "./questions";
import { saveDrafts } from "./concepts";

/** Questions read from pasted text that are waiting for review, in the order they were pasted. */
export function usePasted(): DraftQuestion[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.drafts
      .where("conceptId")
      .equals(EXTRACT_CONCEPT)
      .filter((d) => !d.deletedAt && d.status === "pending")
      .toArray();
    return all.sort((a, b) => a.createdAt - b.createdAt);
  }, []);
}

export { saveDrafts as savePasted };

/**
 * Adds a pasted question to the bank in the given topic. Empty choice boxes are dropped.
 * It uses the draft as it is stored now, and only a complete question that is still waiting is added.
 */
export async function acceptPasted(draftId: string, topicId: string): Promise<boolean> {
  return db.transaction("rw", db.drafts, db.questions, db.variants, async () => {
    const d = await db.drafts.get(draftId);
    if (!d || d.deletedAt || d.status !== "pending") return false;
    const choices = d.choices.filter((c) => c.text.trim()).map((c) => ({ ...c, text: c.text.trim() }));
    if (extractStatus({ stem: d.stem, choices, correctChoiceId: d.correctChoiceId }) !== "ready") return false;
    const t = now();
    const questionId = newId();
    await saveQuestion({
      id: questionId,
      topicId,
      type: "standard",
      stem: d.stem.trim(),
      choices,
      correctChoiceId: d.correctChoiceId,
      tags: [],
      ...(d.reference?.trim() ? { reference: d.reference.trim() } : {}),
      createdAt: t,
      updatedAt: t,
    });
    await db.drafts.update(d.id, {
      status: "accepted",
      questionId,
      topicId,
      note: "Added to the question bank.",
      updatedAt: t,
    });
    return true;
  });
}

export async function discardPasted(ids: string[]): Promise<void> {
  const t = now();
  await db.transaction("rw", db.drafts, async () => {
    for (const id of ids) await db.drafts.update(id, { status: "discarded", note: "Discarded by hand.", updatedAt: t });
  });
}