import {
  checkProtected,
  conceptMessages,
  draftMessages,
  frameProblem,
  framesMessages,
  normalize,
  parseAnswer,
  parseConcept,
  parseFrames,
  protectTexts,
  restoreText,
  solveMessages,
  tokensIn,
} from "./aiText";
import { shuffle } from "./compose";
import type { Concept, DraftQuestion, ProviderConfig, Question, Variant } from "./db";
import { NoProviderError, type LlmRequest } from "./providers";
import { slotsIn } from "./slots";

/** A question is topped up when it has fewer than this many unseen approved variants (or approved wordings). */
export const TARGET_UNSEEN = 3;
/** How many variants to ask for at a time. */
export const BATCH = 5;

export interface GenDeps {
  /** Sends a request to the best available provider. Throws NoProviderError when none can answer. */
  ask: (req: LlmRequest) => Promise<{ content: string; provider: ProviderConfig }>;
  rand?: () => number;
  newId?: () => string;
  now?: () => number;
}

export interface GenResult {
  /** Every variant created or changed by this call, ready to be saved. */
  variants: Variant[];
  notes: string[];
  /** Set when the run had to stop early, for example because every provider was rate limited. */
  stopped?: string;
}

const letter = (i: number) => String.fromCharCode(65 + i);

/**
 * Has a model answer the question without seeing the key. Choices are shuffled first, so a habit of putting the
 * right answer in a particular place cannot fool the check. Returns the index in the ORIGINAL order, or null if unclear.
 */
async function solveBlind(
  stem: string,
  choices: string[],
  deps: GenDeps,
): Promise<{ index: number | null; provider: ProviderConfig }> {
  const prot = protectTexts([stem, ...choices]);
  const order = shuffle(
    choices.map((_, i) => i),
    deps.rand,
  );
  const shown = order.map((i) => prot.texts[1 + i]);
  const { content, provider } = await deps.ask({
    purpose: "solve",
    messages: solveMessages(prot.texts[0], shown, prot.tokens),
    temperature: 0,
    maxTokens: 3000,
  });
  const picked = parseAnswer(content, choices.length);
  return { index: picked === null ? null : order[picked], provider };
}

function stop(e: unknown): string {
  if (e instanceof NoProviderError) return e.message + (e.reasons.length ? ` (${e.reasons.join("; ")})` : "");
  return e instanceof Error ? e.message : "The request failed.";
}

const newVariant = (
  q: Question,
  deps: GenDeps,
  kind: Variant["kind"],
  stem: string,
  choices: Variant["choices"],
  correctChoiceId: string,
  provider: ProviderConfig,
  status: Variant["status"],
): Variant => {
  const t = (deps.now ?? Date.now)();
  return {
    id: (deps.newId ?? (() => crypto.randomUUID()))(),
    questionId: q.id,
    kind,
    status,
    stem,
    choices,
    correctChoiceId,
    provider: provider.name,
    model: provider.model,
    createdAt: t,
    updatedAt: t,
  };
};

/** Checks one stored concept variant. Returns it approved or discarded, or unchanged if the check was inconclusive. */
async function verifyConcept(v: Variant, deps: GenDeps): Promise<Variant> {
  const correct = v.choices.findIndex((c) => c.id === v.correctChoiceId);
  const { index } = await solveBlind(
    v.stem,
    v.choices.map((c) => c.text),
    deps,
  );
  const t = (deps.now ?? Date.now)();
  if (index === null) return v; // the model gave no clear answer; try again later
  if (index === correct) return { ...v, status: "approved", note: undefined, updatedAt: t };
  return {
    ...v,
    status: "discarded",
    note: `Failed the check: a model answered ${letter(index)} but the key says ${letter(correct)}.`,
    updatedAt: t,
  };
}

/** Writes new reworded versions of a standard question, checks each one blind, and keeps only those that pass. */
export async function generateConcept(
  q: Question,
  existing: Variant[],
  deps: GenDeps,
  count = BATCH,
): Promise<GenResult> {
  const out: GenResult = { variants: [], notes: [] };
  const choices = q.choices.map((c) => c.text);
  const correct = q.choices.findIndex((c) => c.id === q.correctChoiceId);

  // Before spending effort on variants, make sure the model can answer the original itself.
  const haveApproved = existing.some((v) => v.questionId === q.id && v.status === "approved" && !v.deletedAt);
  if (!haveApproved) {
    try {
      const { index } = await solveBlind(q.stem, choices, deps);
      if (index !== correct) {
        out.notes.push(
          "The model could not answer the original question correctly, so no variants were made. The question may be unclear, or the model too weak for it.",
        );
        return out;
      }
    } catch (e) {
      out.stopped = stop(e);
      return out;
    }
  }

  const prot = protectTexts([q.stem, ...choices]);
  const requiredImages = tokensIn(prot.texts[0]).filter((t) => t.startsWith("[[IMG"));
  let reply: { content: string; provider: ProviderConfig };
  try {
    reply = await deps.ask({
      purpose: "concept",
      messages: conceptMessages(prot.texts[0], prot.texts.slice(1), correct, prot.tokens, count),
      temperature: 0.8,
      maxTokens: 7000,
    });
  } catch (e) {
    out.stopped = stop(e);
    return out;
  }

  const seen = new Set([
    normalize(q.stem),
    ...existing.filter((v) => v.questionId === q.id && !v.deletedAt).map((v) => normalize(v.stem)),
  ]);
  const pending: Variant[] = [];
  for (const c of parseConcept(reply.content, choices.length)) {
    const bad = checkProtected([c.stem, ...c.choices], prot.tokens, requiredImages);
    if (bad) {
      out.notes.push(`Rejected a version: ${bad}.`);
      continue;
    }
    const stem = restoreText(c.stem, prot.tokens);
    if (seen.has(normalize(stem))) {
      out.notes.push("Rejected a version that repeated an existing wording.");
      continue;
    }
    seen.add(normalize(stem));
    const ids = c.choices.map(() => (deps.newId ?? (() => crypto.randomUUID()))());
    pending.push(
      newVariant(
        q,
        deps,
        "concept",
        stem,
        c.choices.map((text, i) => ({ id: ids[i], text: restoreText(text, prot.tokens) })),
        ids[c.correctIndex],
        reply.provider,
        "pending",
      ),
    );
  }
  if (pending.length === 0 && out.notes.length === 0) out.notes.push("The model returned no usable versions.");

  // Check each one. Anything we cannot check yet stays pending, so a rate limit loses nothing.
  for (let i = 0; i < pending.length; i++) {
    try {
      out.variants.push(await verifyConcept(pending[i], deps));
    } catch (e) {
      out.variants.push(...pending.slice(i));
      out.stopped = `Stopped before checking ${pending.length - i} version(s), which are saved as pending. ${stop(e)}`;
      break;
    }
  }
  return out;
}

/** Checks variants that were saved as pending, for example after a rate limit. */
export async function verifyPending(variants: Variant[], deps: GenDeps): Promise<GenResult> {
  const out: GenResult = { variants: [], notes: [] };
  for (const v of variants.filter((x) => x.kind === "concept" && x.status === "pending" && !x.deletedAt)) {
    try {
      const r = await verifyConcept(v, deps);
      if (r !== v) out.variants.push(r);
    } catch (e) {
      out.stopped = stop(e);
      break;
    }
  }
  return out;
}

/** Writes new wordings for a computation question. Code checks every slot, so approved wordings need no second opinion. */
export async function generateFrames(
  q: Question,
  existing: Variant[],
  deps: GenDeps,
  count = BATCH,
): Promise<GenResult> {
  const out: GenResult = { variants: [], notes: [] };
  const t = q.template;
  if (!t || !t.stems[0]) return out;

  const prot = protectTexts([t.stems[0]]);
  const used = new Set(slotsIn(t.stems[0]));
  const slots = [
    ...t.givens.map((g) => ({ name: g.name, unit: g.unit })),
    ...t.derived.map((d) => ({ name: d.name, unit: d.unit })),
  ].filter((s) => used.has(s.name));

  let reply: { content: string; provider: ProviderConfig };
  try {
    reply = await deps.ask({
      purpose: "frames",
      messages: framesMessages(prot.texts[0], slots, prot.tokens, count),
      temperature: 0.9,
      maxTokens: 4000,
    });
  } catch (e) {
    out.stopped = stop(e);
    return out;
  }

  const seen = new Set([
    ...t.stems.map(normalize),
    ...existing.filter((v) => v.questionId === q.id && !v.deletedAt).map((v) => normalize(v.stem)),
  ]);
  for (const frame of parseFrames(reply.content)) {
    const bad = frameProblem(frame, prot.texts[0], prot.tokens);
    if (bad) {
      out.notes.push(`Rejected a wording: ${bad}.`);
      continue;
    }
    const stem = restoreText(frame, prot.tokens);
    if (seen.has(normalize(stem))) {
      out.notes.push("Rejected a wording that repeated an existing one.");
      continue;
    }
    seen.add(normalize(stem));
    out.variants.push(newVariant(q, deps, "frame", stem, [], "", reply.provider, "approved"));
  }
  if (out.variants.length === 0 && out.notes.length === 0) out.notes.push("The model returned no usable wordings.");
  return out;
}

// ---------------------------------------------------------------------------------------------
// Drafting questions from a concept
// ---------------------------------------------------------------------------------------------

export interface DraftResult {
  /** Every draft created by this call. Discarded ones are kept so the same mistake is not repeated. */
  drafts: DraftQuestion[];
  notes: string[];
  stopped?: string;
}

/**
 * Drafts new questions from a study note. Each is checked by a second model that answers it without seeing the note.
 * Drafts that pass wait for the user to accept them. Nothing joins the bank by itself.
 */
export async function generateDrafts(
  concept: Concept,
  existing: DraftQuestion[],
  deps: GenDeps,
  count = 4,
): Promise<DraftResult> {
  const out: DraftResult = { drafts: [], notes: [] };
  const prot = protectTexts([concept.title, concept.body]);
  let reply: { content: string; provider: ProviderConfig };
  try {
    reply = await deps.ask({
      purpose: "concept",
      messages: draftMessages(prot.texts[0], prot.texts[1], prot.tokens, count),
      temperature: 0.7,
      maxTokens: 7000,
    });
  } catch (e) {
    out.stopped = stop(e);
    return out;
  }

  const seen = new Set(
    existing.filter((d) => d.conceptId === concept.id && !d.deletedAt).map((d) => normalize(d.stem)),
  );
  const fresh: DraftQuestion[] = [];
  for (const c of parseConcept(reply.content, 4, "questions")) {
    const bad = checkProtected([c.stem, ...c.choices], prot.tokens, []);
    if (bad) {
      out.notes.push(`Rejected a question: ${bad}.`);
      continue;
    }
    const stem = restoreText(c.stem, prot.tokens);
    if (seen.has(normalize(stem))) {
      out.notes.push("Rejected a question that repeated an earlier draft.");
      continue;
    }
    seen.add(normalize(stem));
    const ids = c.choices.map(() => (deps.newId ?? (() => crypto.randomUUID()))());
    const t = (deps.now ?? Date.now)();
    fresh.push({
      id: (deps.newId ?? (() => crypto.randomUUID()))(),
      conceptId: concept.id,
      topicId: concept.topicId,
      stem,
      choices: c.choices.map((text, i) => ({ id: ids[i], text: restoreText(text, prot.tokens) })),
      correctChoiceId: ids[c.correctIndex],
      provider: reply.provider.name,
      model: reply.provider.model,
      status: "pending",
      createdAt: t,
      updatedAt: t,
    });
  }
  if (fresh.length === 0 && out.notes.length === 0) out.notes.push("The model returned no usable questions.");

  for (let i = 0; i < fresh.length; i++) {
    const d = fresh[i];
    try {
      const correct = d.choices.findIndex((c) => c.id === d.correctChoiceId);
      const { index } = await solveBlind(
        d.stem,
        d.choices.map((c) => c.text),
        deps,
      );
      const t = (deps.now ?? Date.now)();
      if (index === correct)
        out.drafts.push({ ...d, note: "A second model, without the note, chose the same answer.", updatedAt: t });
      else if (index === null)
        out.drafts.push({ ...d, note: "The check was inconclusive. Read this one carefully.", updatedAt: t });
      else
        out.drafts.push({
          ...d,
          status: "discarded",
          note: `Failed the check: a second model answered ${letter(index)} but the key says ${letter(correct)}.`,
          updatedAt: t,
        });
    } catch (e) {
      out.drafts.push(...fresh.slice(i).map((x) => ({ ...x, note: "Not checked yet: no model was available." })));
      out.stopped = `Stopped before checking ${fresh.length - i} question(s), which are saved unchecked. ${stop(e)}`;
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// What needs topping up
// ---------------------------------------------------------------------------------------------

export interface TopUpItem {
  question: Question;
  kind: Variant["kind"];
  /** Approved variants (or wordings) that count toward the target. */
  have: number;
}

/**
 * Questions whose supply of fresh variants has run low, emptiest first.
 * For a standard question, "have" is approved variants never served in a quiz. For a computation question it is approved wordings.
 */
export function planTopUp(
  questions: Question[],
  variants: Variant[],
  servedVariantIds: Set<string>,
  usable: (q: Question) => boolean = () => true,
): TopUpItem[] {
  const out: TopUpItem[] = [];
  for (const q of questions) {
    if (q.deletedAt || !q.allowAi) continue;
    const mine = variants.filter((v) => v.questionId === q.id && v.status === "approved" && !v.deletedAt);
    if (q.type === "computation") {
      if (q.template && usable(q) && mine.filter((v) => v.kind === "frame").length < TARGET_UNSEEN) {
        out.push({ question: q, kind: "frame", have: mine.filter((v) => v.kind === "frame").length });
      }
    } else {
      const fresh = mine.filter((v) => v.kind === "concept" && !servedVariantIds.has(v.id)).length;
      if (fresh < TARGET_UNSEEN) out.push({ question: q, kind: "concept", have: fresh });
    }
  }
  return out.sort((a, b) => a.have - b.have);
}