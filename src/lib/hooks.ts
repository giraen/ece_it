"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Question, type TreeNode } from "./db";

/** The categories, subjects, and topics, kept up to date. `undefined` for a moment while the first read happens. */
export function useNodes(): TreeNode[] | undefined {
  return useLiveQuery(() => db.nodes.filter((n) => !n.deletedAt).toArray(), []);
}

/** Every saved question, kept up to date. */
export function useQuestions(): Question[] | undefined {
  return useLiveQuery(() => db.questions.filter((q) => !q.deletedAt).toArray(), []);
}