import { db } from "./db";
import { now } from "./ids";

/** The four categories of the board exam. They are always there. */
export const FIXED_CATEGORIES = [
  { key: "geas", name: "GEAS" },
  { key: "esat", name: "ESAT" },
  { key: "elex", name: "ELEX" },
  { key: "math", name: "MATH" },
] as const;

/**
 * Makes sure the four fixed categories exist. Safe to run on every start.
 * A category you already made with one of these names is kept and adopted, so nothing is duplicated or lost.
 */
export async function ensureCategories(): Promise<void> {
  await db.transaction("rw", db.nodes, async () => {
    const existing = (await db.nodes.toArray()).filter((n) => n.kind === "category" && !n.deletedAt);
    const t = now();
    for (let i = 0; i < FIXED_CATEGORIES.length; i++) {
      const f = FIXED_CATEGORIES[i];
      const match = existing.find((c) => c.name.trim().toLowerCase() === f.name.toLowerCase());
      if (match) {
        if (!match.fixed || match.name !== f.name || match.order !== i) {
          await db.nodes.update(match.id, { fixed: true, name: f.name, order: i, updatedAt: t });
        }
      } else {
        await db.nodes.put({
          id: `fixed-${f.key}`,
          kind: "category",
          parentId: null,
          name: f.name,
          order: i,
          fixed: true,
          createdAt: t,
          updatedAt: t,
        });
      }
    }
  });
}