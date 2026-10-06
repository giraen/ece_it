"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
   import { db, type Blueprint, type Concept, type Question, type QuizAttempt, type TreeNode, type Variant } from "./db";
import { imageUrl } from "./images";
import { suggestTags } from "./questions";
import { now } from "./ids";

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

/** One quiz attempt. `undefined` while loading, `null` if it does not exist. */
export function useAttempt(id: string | null): QuizAttempt | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.attempts.get(id)) ?? null) : null), [id]);
}

/** Every quiz attempt that has not been deleted. */
export function useAttempts(): QuizAttempt[] | undefined {
  return useLiveQuery(() => db.attempts.filter((a) => !a.deletedAt).toArray(), []);
}

/** The current time in ms, refreshed every 30 seconds so countdowns and expiry dates stay current. */
export function useNow(intervalMs = 30_000): number {
  const [t, setT] = useState(now);
  useEffect(() => {
    const id = window.setInterval(() => setT(now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return t;
}

 /** Mock blueprints, kept up to date. They are only used for backups and packs for now. */
export function useBlueprints(): Blueprint[] | undefined {
  return useLiveQuery(() => db.blueprints.filter((b) => !b.deletedAt).toArray(), []);
}

/** AI-written variants of questions, kept up to date. */
export function useVariants(): Variant[] | undefined {
  return useLiveQuery(() => db.variants.filter((v) => !v.deletedAt).toArray(), []);
}

/** Concept notes, kept up to date. */
export function useConcepts(): Concept[] | undefined {
  return useLiveQuery(() => db.concepts.filter((c) => !c.deletedAt).toArray(), []);
}