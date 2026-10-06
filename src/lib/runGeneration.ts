import { db, type Concept, type ProviderConfig, type Question, type Variant } from "./db";
import {
  generateConcept,
  generateDrafts,
  generateFrames,
  planTopUp,
  verifyPending,
  type GenDeps,
  type GenResult,
} from "./generator";
import { saveDrafts } from "./concepts";
import { makeAsk } from "./llmClient";
import { saveVariants } from "./aiStore";
import { servedVariantIds } from "./serve";

export interface RunEvent {
  kind: "info" | "ok" | "warn" | "stop";
  text: string;
}

export interface RunControl {
  aborted: boolean;
}

const preview = (q: Question) =>
  q.stem
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);

function summarize(r: GenResult): string {
  const a = r.variants.filter((v) => v.status === "approved").length;
  const d = r.variants.filter((v) => v.status === "discarded").length;
  const p = r.variants.filter((v) => v.status === "pending").length;
  return `${a} approved, ${d} discarded${p ? `, ${p} pending` : ""}`;
}

async function usableCheck(questions: Question[]) {
  if (!questions.some((q) => q.type === "computation")) return () => true;
  const comp = await import("./computation");
  return (q: Question) => comp.isUsable(q);
}

/**
 * Fills the variant cache in the background. First it checks anything left pending by an earlier rate limit,
 * then tops up the questions that have run low on fresh variants. Stops at the first sign that no provider can answer.
 */
export async function runGeneration(opts: {
  providers: ProviderConfig[];
  onEvent: (e: RunEvent) => void;
  control: RunControl;
  /** At most this many questions per run. */
  limit?: number;
}): Promise<{ questions: number; stopped?: string }> {
  const emit = opts.onEvent;
  const deps: GenDeps = { ask: makeAsk(opts.providers) };
  const questions = await db.questions.filter((q) => !q.deletedAt).toArray();
  let variants = await db.variants.filter((v) => !v.deletedAt).toArray();
  const attempts = await db.attempts.toArray();

  const pending = variants.filter((v) => v.status === "pending");
  if (pending.length) {
    emit({ kind: "info", text: `Checking ${pending.length} version(s) left pending earlier…` });
    const r = await verifyPending(variants, deps);
    await saveVariants(r.variants);
    variants = mergeInto(variants, r.variants);
    if (r.variants.length) emit({ kind: "ok", text: `Checked: ${summarize(r)}.` });
    if (r.stopped) {
      emit({ kind: "stop", text: r.stopped });
      return { questions: 0, stopped: r.stopped };
    }
  }

  const plan = planTopUp(questions, variants, servedVariantIds(attempts), await usableCheck(questions));
  if (plan.length === 0) {
    emit({ kind: "ok", text: "Every question already has enough fresh variants." });
    return { questions: 0 };
  }
  emit({ kind: "info", text: `${plan.length} question(s) need more variants.` });

  let done = 0;
  for (const item of plan.slice(0, opts.limit ?? 25)) {
    if (opts.control.aborted) {
      emit({ kind: "stop", text: "Stopped." });
      return { questions: done, stopped: "Stopped." };
    }
    const mine = variants.filter((v) => v.questionId === item.question.id);
    emit({ kind: "info", text: `${item.kind === "frame" ? "Wordings" : "Variants"} for: ${preview(item.question)}` });
    const r =
      item.kind === "frame"
        ? await generateFrames(item.question, mine, deps)
        : await generateConcept(item.question, mine, deps);
    await saveVariants(r.variants);
    variants = mergeInto(variants, r.variants);
    emit({ kind: r.variants.length ? "ok" : "warn", text: r.variants.length ? summarize(r) : "Nothing new was kept." });
    for (const n of r.notes.slice(0, 4)) emit({ kind: "warn", text: n });
    done++;
    if (r.stopped) {
      emit({ kind: "stop", text: r.stopped });
      return { questions: done, stopped: r.stopped };
    }
  }
  emit({ kind: "ok", text: `Finished ${done} question(s).` });
  return { questions: done };
}

/** Generates for one question, for the "Generate for this question" button in the editor. */
export async function generateForQuestion(
  q: Question,
  providers: ProviderConfig[],
  onEvent: (e: RunEvent) => void,
): Promise<GenResult> {
  const deps: GenDeps = { ask: makeAsk(providers) };
  const existing = await db.variants
    .where("questionId")
    .equals(q.id)
    .filter((v) => !v.deletedAt)
    .toArray();
  const r =
    q.type === "computation" ? await generateFrames(q, existing, deps) : await generateConcept(q, existing, deps);
  await saveVariants(r.variants);
  onEvent({
    kind: r.variants.length ? "ok" : "warn",
    text: r.variants.length ? summarize(r) : "Nothing new was kept.",
  });
  for (const n of r.notes.slice(0, 4)) onEvent({ kind: "warn", text: n });
  if (r.stopped) onEvent({ kind: "stop", text: r.stopped });
  return r;
}

function mergeInto(list: Variant[], changed: Variant[]): Variant[] {
  const byId = new Map(list.map((v) => [v.id, v]));
  for (const v of changed) byId.set(v.id, v);
  return Array.from(byId.values());
}