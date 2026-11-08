import { db, type BlueprintEntry } from "./db";
import { blueprintProblems } from "./blueprint";
import { now } from "./ids";

/** Saves the blueprint for a category, replacing any earlier one. Throws with the first problem found. */
export async function saveBlueprint(categoryId: string, totalItems: number, entries: BlueprintEntry[]): Promise<void> {
  const problems = blueprintProblems({ totalItems, entries });
  if (problems.length) throw new Error(problems[0]);
  const existing = await db.blueprints.get(categoryId);
  const t = now();
  await db.blueprints.put({
    id: categoryId,
    categoryId,
    totalItems,
    entries,
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  });
}

export async function deleteBlueprint(categoryId: string): Promise<void> {
  const t = now();
  await db.blueprints.update(categoryId, { deletedAt: t, updatedAt: t });
}