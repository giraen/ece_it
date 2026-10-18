import { db } from "./db";
import { now } from "./ids";

/** Why a question is marked priority: it came from a review center (RC) quiz, from a book, or from somewhere else. */
export type PriorityReason = "rc" | "book" | "other";

export const PRIORITY_REASONS: { id: PriorityReason; label: string; short: string }[] = [
  { id: "rc", label: "From a review center (RC) quiz", short: "RC quiz" },
  { id: "book", label: "From a book", short: "Book" },
  { id: "other", label: "Other", short: "Other" },
];

/** A short name for a reason, such as "RC quiz". Empty when the question is not a priority. */
export function priorityShort(p: PriorityReason | undefined): string {
  return PRIORITY_REASONS.find((r) => r.id === p)?.short ?? "";
}

/** Marks questions as priority, or takes the mark off when `reason` is null. */
export async function setPriority(ids: string[], reason: PriorityReason | null): Promise<void> {
  const stamp = now();
  await db.transaction("rw", db.questions, async () => {
    for (const id of ids) {
      const q = await db.questions.get(id);
      if (!q || q.deletedAt) continue;
      await db.questions.update(id, { priority: reason ?? undefined, updatedAt: stamp });
    }
  });
}