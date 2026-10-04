"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Question, type TreeNode } from "./db";
import { imageUrl } from "./images";

/** Live, non-deleted tree nodes. `undefined` while the first read is in flight. */
export function useNodes(): TreeNode[] | undefined {
  return useLiveQuery(() => db.nodes.filter((n) => !n.deletedAt).toArray(), []);
}

/** Live, non-deleted questions. */
export function useQuestions(): Question[] | undefined {
  return useLiveQuery(() => db.questions.filter((q) => !q.deletedAt).toArray(), []);
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
    const set = new Set<string>();
    for (const q of qs) for (const t of q.tags) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [topicId]);
  return tags ?? [];
}

/** Object URL for a stored image. `null` until loaded or if missing. */
export function useImageUrl(id: string | null): string | null {
  const url = useLiveQuery(() => (id ? imageUrl(id) : Promise.resolve(null)), [id]);
  return url ?? null;
}
