import { db } from "@/lib/db";
import { ensureCategories } from "@/lib/bank/categories";
import { clearCooldowns } from "@/lib/ai/llmClient";
import { imageIdsIn } from "./share";

export type ResetKind = "progress" | "bank" | "everything";

export interface ResetCounts {
  quizzes: number;
  questions: number;
  concepts: number;
  drafts: number;
  cards: number;
  variants: number;
  images: number;
  blueprints: number;
  /** Subjects and topics. The four fixed categories are not counted. */
  nodes: number;
}

/** How much each reset would remove, for the confirmation text. */
export async function resetCounts(): Promise<ResetCounts> {
  const live = <T extends { deletedAt?: number }>(r: T) => !r.deletedAt;
  const [quizzes, questions, concepts, drafts, cards, variants, images, blueprints, nodes] = await Promise.all([
    db.attempts.filter(live).count(),
    db.questions.filter(live).count(),
    db.concepts.filter(live).count(),
    db.drafts.filter(live).count(),
    db.cards.filter(live).count(),
    db.variants.filter(live).count(),
    db.images.count(),
    db.blueprints.filter(live).count(),
    db.nodes.filter((n) => !n.deletedAt && !(n.kind === "category" && n.fixed)).count(),
  ]);
  return { quizzes, questions, concepts, drafts, cards, variants, images, blueprints, nodes };
}

/**
 * Deletes every quiz and every memory review. Mastery, results, analytics, locks, and memory boxes are all worked
 * out from those, so they reset too.
 */
export async function resetProgress(): Promise<void> {
  await db.transaction("rw", [db.attempts, db.cardEvents, db.incognitoAttempts], async () => {
    await db.attempts.clear();
    await db.cardEvents.clear();
    await db.incognitoAttempts.clear();
  });
}

/**
 * Deletes every question, concept, draft, AI variant, memory card, and picture. Subjects, topics, and quiz history
 * stay.
 */
export async function emptyBank(): Promise<void> {
  const tables = [
    db.attempts,
    db.questions,
    db.concepts,
    db.drafts,
    db.variants,
    db.images,
    db.cards,
    db.cardEvents,
    db.cardDrafts,
  ];
  await db.transaction("rw", tables, async () => {
    // Old results keep their own copy of each question, so pictures they still show are kept.
    const keep = new Set<string>();
    await db.attempts.each((a) => {
      for (const it of a.items) {
        for (const id of [...imageIdsIn(it.stem), ...it.choices.flatMap((c) => imageIdsIn(c.text))]) keep.add(id);
      }
    });
    await db.questions.clear();
    await db.concepts.clear();
    await db.drafts.clear();
    await db.variants.clear();
    await db.cards.clear();
    await db.cardEvents.clear();
    await db.cardDrafts.clear();
    await db.images.filter((i) => !keep.has(i.id)).delete();
  });
}

/** Back to a first launch: only the four fixed categories remain. The theme is kept. */
export async function eraseEverything(removeKeys: boolean): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.attempts,
      db.questions,
      db.concepts,
      db.drafts,
      db.variants,
      db.images,
      db.blueprints,
      db.settings,
      db.nodes,
      db.cards,
      db.cardEvents,
      db.cardDrafts,
      db.incognitoAttempts,
    ],
    async () => {
      await db.attempts.clear();
      await db.questions.clear();
      await db.concepts.clear();
      await db.drafts.clear();
      await db.variants.clear();
      await db.images.clear();
      await db.blueprints.clear();
      await db.settings.clear();
      await db.cards.clear();
      await db.cardEvents.clear();
      await db.cardDrafts.clear();
      await db.incognitoAttempts.clear();
      await db.nodes.filter((n) => !(n.kind === "category" && n.fixed)).delete();
    },
  );
  await ensureCategories();
  try {
    localStorage.removeItem("ece:lastBackupAt");
  } catch {
    // ignore
  }
  clearCooldowns();
  if (removeKeys) {
    // Where aiKeys.ts keeps them: this tab and, if the user chose to remember them, this device.
    for (const area of [window.sessionStorage, window.localStorage]) {
      try {
        area.removeItem("ece:aiKeys");
      } catch {
        // ignore
      }
    }
    try {
      localStorage.removeItem("ece:aiRememberKeys");
    } catch {
      // ignore
    }
  }
}
