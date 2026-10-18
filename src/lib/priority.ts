import { db } from "./db";
import { now } from "./ids";

/** Marks questions as priority, or takes the mark off. */
export async function setPriority(ids: string[], on: boolean): Promise<void> {
  const stamp = now();
  await db.transaction("rw", db.questions, async () => {
    for (const id of ids) {
      const q = await db.questions.get(id);
      if (!q || q.deletedAt) continue;
      await db.questions.update(id, { priority: on ? true : undefined, updatedAt: stamp });
    }
  });
}