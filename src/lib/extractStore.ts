import { useLiveQuery } from "dexie-react-hooks";
import { db, type DraftQuestion } from "./db";
import { EXTRACT_CONCEPT, extractStatus, normName, parseTopicPath } from "./extract";
import { newId, now } from "./ids";
import { normalizeTags, saveQuestion } from "./questions";
import { saveDrafts } from "./concepts";
import { createNode } from "./nodes";
import { childrenOf } from "./tree";

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
 * Adds a pasted question to the bank, in the topic it carries. Empty choice boxes are dropped.
 * It uses the draft as it is stored now, and only a complete question that is still waiting is added.
 */
export async function acceptPasted(draftId: string): Promise<boolean> {
  return db.transaction("rw", db.drafts, db.questions, db.variants, async () => {
    const d = await db.drafts.get(draftId);
    if (!d || d.deletedAt || d.status !== "pending") return false;
    const choices = d.choices.filter((c) => c.text.trim()).map((c) => ({ ...c, text: c.text.trim() }));
    if (
      extractStatus({
        stem: d.stem,
        choices,
        correctChoiceId: d.correctChoiceId,
        topicId: d.topicId,
        proposedTopic: d.proposedTopic,
      }) !== "ready"
    )
      return false;
    const t = now();
    const questionId = newId();
    await saveQuestion({
      id: questionId,
      type: "standard",
      topicId: d.topicId,
      stem: d.stem.trim(),
      choices,
      correctChoiceId: d.correctChoiceId,
      tags: normalizeTags(d.tags ?? []),
      ...(d.reference?.trim() ? { reference: d.reference.trim() } : {}),
      ...(d.priority ? { priority: d.priority } : {}),
      ...(d.allowAi ? { allowAi: true } : {}),
      createdAt: t,
      updatedAt: t,
    });
    await db.drafts.update(d.id, {
      status: "accepted",
      questionId,
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

/** Gives pasted questions a topic. This settles any recommended topic they had. */
export async function setPastedTopic(ids: string[], topicId: string): Promise<void> {
  const t = now();
  await db.transaction("rw", db.drafts, async () => {
    for (const id of ids) await db.drafts.update(id, { topicId, proposedTopic: undefined, updatedAt: t });
  });
}

/** Replaces the tags a waiting question will get. */
export async function setPastedTags(id: string, tags: string[]): Promise<void> {
  await db.drafts.update(id, { tags: normalizeTags(tags), updatedAt: now() });
}

/** Changes the topic Claude recommended for a question, or drops the recommendation when the text is empty. */
export async function setProposedTopic(id: string, text: string): Promise<void> {
  await db.drafts.update(id, { proposedTopic: text.trim() || undefined, updatedAt: now() });
}

/**
 * Creates the topic that text names, and the subject above it if that is new too. Names that already exist are reused.
 * Returns the topic's id, or null if the category does not exist.
 */
export async function createTopicPath(text: string): Promise<string | null> {
  const parts = parseTopicPath(text);
  if (!parts) return null;
  const all = await db.nodes.filter((n) => !n.deletedAt).toArray();
  const cat = all.find((n) => n.kind === "category" && normName(n.name) === normName(parts[0]));
  if (!cat) return null;
  const subject = childrenOf(all, cat.id).find((n) => normName(n.name) === normName(parts[1]));
  const subjectId = subject?.id ?? (await createNode("subject", cat.id, parts[1]));
  const fresh = await db.nodes.filter((n) => !n.deletedAt).toArray();
  const topic = childrenOf(fresh, subjectId).find((n) => normName(n.name) === normName(parts[2]));
  return topic?.id ?? (await createNode("topic", subjectId, parts[2]));
}

/** Puts every waiting question that recommended this topic into it. */
export async function applyTopicToProposals(text: string, topicId: string): Promise<number> {
  const t = now();
  return db.transaction("rw", db.drafts, async () => {
    const hit = await db.drafts
      .where("conceptId")
      .equals(EXTRACT_CONCEPT)
      .filter(
        (d) =>
          !d.deletedAt && d.status === "pending" && !!d.proposedTopic && normName(d.proposedTopic) === normName(text),
      )
      .toArray();
    for (const d of hit) await db.drafts.update(d.id, { topicId, proposedTopic: undefined, updatedAt: t });
    return hit.length;
  });
}

/** Puts discarded pasted questions back among the waiting ones. */
export async function restorePasted(ids: string[]): Promise<void> {
  const t = now();
  await db.transaction("rw", db.drafts, async () => {
    for (const id of ids) {
      const d = await db.drafts.get(id);
      if (d && d.status === "discarded")
        await db.drafts.update(id, { status: "pending", note: undefined, updatedAt: t });
    }
  });
}

/** Changes fields on several waiting questions at once. A field set to undefined is taken off. */
export async function patchPasted(items: { id: string; patch: Partial<DraftQuestion> }[]): Promise<void> {
  const t = now();
  await db.transaction("rw", db.drafts, async () => {
    for (const { id, patch } of items) await db.drafts.update(id, { ...patch, updatedAt: t });
  });
}