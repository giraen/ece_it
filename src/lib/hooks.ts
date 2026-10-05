"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Question, type TreeNode } from "./db";
import { imageUrl } from "./images";

/** The categories, subjects, and topics, kept up to date. `undefined` for a moment while the first read happens. */
export function useNodes(): TreeNode[] | undefined {
  return useLiveQuery(() => db.nodes.filter((n) => !n.deletedAt).toArray(), []);
}

/** Every saved question, kept up to date. */
export function useQuestions(): Question[] | undefined {
  return useLiveQuery(() => db.questions.filter((q) => !q.deletedAt).toArray(), []);
}

/** The address of a stored picture, ready to show in an <img>. `null` while loading or if it is missing. */
export function useImageUrl(id: string | null): string | null {
  const url = useLiveQuery(() => (id ? imageUrl(id) : Promise.resolve(null)), [id]);
  return url ?? null;
}

/** Tags already used in a topic, for autocomplete. */
export function useTopicTags(topicId: string | null): string[] {
  const tags = useLiveQuery(async () => {
    if (!topicId) return [] as string[];
    const qs = await db.questions
      .where("topicId")
      .equals(topicId)
      .filter((q) => !q.deletedAt)
      .toArray();
    // "Series" and "series" are the same tag, so suggest it once, with the first spelling found.
    const seen = new Map<string, string>();
    for (const q of qs) for (const t of q.tags) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [topicId]);
  return tags ?? [];
}