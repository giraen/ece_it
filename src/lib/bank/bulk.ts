import { db, type Question } from "./db";
import { now } from "./ids";

/** A copy of the given questions as they are now, so a bulk change can be undone. */
export async function snapshotQuestions(ids: string[]): Promise<Question[]> {
  const rows = await db.questions.bulkGet(ids);
  return rows.filter((q): q is Question => !!q);
}

/** Puts questions back the way a snapshot had them (including bringing back deleted ones). */
export async function restoreQuestions(snapshot: Question[]): Promise<void> {
  const stamp = now();
  await db.questions.bulkPut(snapshot.map((q) => ({ ...q, updatedAt: stamp })));
}