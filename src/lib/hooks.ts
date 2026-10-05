"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Question, type TreeNode } from "./db";
import { imageUrl } from "./images";
import { suggestTags } from "./questions";

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

/** Tags to suggest while typing: this topic's tags first, then the rest of the bank's. */
export function useTagSuggestions(topicId: string | null): string[] {
  const tags = useLiveQuery(
    async () => suggestTags(await db.questions.filter((q) => !q.deletedAt).toArray(), topicId),
    [topicId],
  );
  return tags ?? [];
}