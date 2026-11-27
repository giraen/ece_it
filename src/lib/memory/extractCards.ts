"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type CardDraft, type CardKind, type CardPlace, type MemoryCard, type TreeNode } from "@/lib/db";
import { newId, now } from "@/lib/ids";
import { normalizeTags } from "@/lib/bank/questions";
import { categoriesOf } from "@/lib/bank/tree";
import { createNode } from "@/lib/bank/nodes";
import { isNumberAnswer } from "./answer";
import { CARD_KINDS, WRONG_CHOICES, addVariant, cardProblem, cardVariants, saveCard } from "./cards";

/**
 * Extract for memory cards: Claude reads your notes or a page and writes every fact worth memorising in a set
 * format; you paste that here, check the cards, and add them.
 */

export const CARD_SAMPLE = `Card: Speed of light in a vacuum
Answer: $2.998 \\times 10^8$ m/s
Kind: Constant
Deck: GEAS
Subject: Physics

Card: Charge of an electron
Answer: $-1.602 \\times 10^{-19}$ C
Kind: Constant
Deck: GEAS
Subject: Physics
Also: ELEX › Electromagnetics

Card: Skin depth of a good conductor
Answer: $\\delta = 1/\\sqrt{\\pi f \\mu \\sigma}$
Kind: Formula
Deck: ELEX
Subject: Electromagnetics
Wrong: $\\delta = 1/\\sqrt{2\\pi f \\mu \\sigma}$
Wrong: $\\delta = \\sqrt{\\pi f \\mu \\sigma}$
Wrong: $\\delta = 1/\\sqrt{\\pi f \\mu / \\sigma}$
Tags: skin effect

Card: Newton's first law of motion
Answer: A body stays at rest or in uniform motion unless a net force acts on it.
Kind: Principle
Deck: GEAS
Subject: Physics
Wrong: A body accelerates in the direction of the net force acting on it.
Wrong: Every action has an equal and opposite reaction.
Wrong: A body stays at rest or in uniform motion only while a net force acts on it.

Card: Newton's first law is also called the law of
Answer: Inertia
Variant of: Newton's first law of motion
Wrong: Acceleration
Wrong: Reaction
Wrong: Momentum`;

export const CARD_INSTRUCTIONS = `From the attached notes or pages, pull out every fact worth memorising for a board exam: constants, unit conversions, formulas, principles (laws, theorems, rules, effects), definitions, units and their symbols, and standard values and ranges. Write them as memory cards in exactly the format below, so I can paste them into my memory bank. Put the whole result in one code block, with no commentary.

Format, one card after another with a blank line between them:

${CARD_SAMPLE}

Rules:
- One fact per card. The Card line is the prompt I see; the Answer line is what I must recall. Keep both short.
- Kind is one of: Constant, Conversion, Formula, Principle, Definition, Unit and symbol, Standard and range.
- When the answer is a number with a unit, or a range such as 30–300 MHz, give it exactly, with its unit, and write no Wrong lines: my app makes those itself.
- For every other answer, write exactly three Wrong lines. Each must be nearly right but wrong: a flipped sign, a swapped variable, a missing or extra factor, an exponent changed, or one key word changed (such as directly ↔ inversely). Never write one that is also correct, and keep them the same length and style as the answer.
- Wrap every formula and expression with variables in dollar signs, like $V = IR$. Write maths the typed way or in LaTeX: x^2, sqrt(x), \\frac{a}{b}, \\times 10^8.
- Deck is one of my categories. Subject names the subject inside that deck: copy one of mine exactly when it fits, or recommend a new one. Leave the Subject line out when no one subject fits.
- When the same fact is needed in another of my subjects too, in this deck or another, add an Also line for each, as Deck › Subject, copying my names exactly. Write the card once; never repeat it for the other subject.
- When one fact is worth asking more than one way (a value in another unit, such as amu and kg; a law by its statement, its name and its formula), write the main card first, then each other way as its own card with a Variant of line that copies the main card's Card line exactly. A variant needs no Kind, Deck, Subject or Also lines: it shares the main card's. It still needs three Wrong lines unless its answer is a number. Do not make variants that only reword the prompt.
- Add a Tags line only when a tag would help me find the card later. Reuse a tag from my list when one fits.
- Leave out worked examples, problems to solve, and anything not worth memorising word for word.`;

/** The instructions, with the decks, subjects and tags already in the bank. */
export function cardInstructions(nodes: TreeNode[], tags: string[]): string {
  const live = nodes.filter((n) => !n.deletedAt);
  const cats = live.filter((n) => n.kind === "category").sort((a, b) => a.order - b.order);
  const lines = cats.map((c) => {
    const subs = live.filter((n) => n.kind === "subject" && categoriesOf(n).includes(c.id)).map((n) => n.name);
    return `- ${c.name}${subs.length ? `: ${subs.join(", ")}` : ""}`;
  });
  let out = CARD_INSTRUCTIONS;
  if (lines.length) out += `\n\nMy decks and their subjects:\n${lines.join("\n")}`;
  if (tags.length) out += `\n\nTags already in my bank: ${tags.join(", ")}`;
  return out;
}

export interface ParsedCard {
  prompt: string;
  answer: string;
  kind: string | null;
  deck: string | null;
  subject: string | null;
  wrong: string[];
  tags: string[];
  /** Other places, as written: "ELEX › Electromagnetics". */
  also: string[];
  /** The prompt of the card this is a variant of, as written. */
  variantOf: string | null;
}

const FIELD =
  /^\s*(Card|Prompt|Q|Answer|A|Kind|Type|Deck|Category|Subject|Wrong|Tags?|Also(?: in)?|Variant(?: of)?)\s*:\s*(.*)$/i;

/** Reads text in the card format. Cards are separated by a new Card line or a blank line. */
export function parseCards(text: string): ParsedCard[] {
  const out: ParsedCard[] = [];
  let cur: ParsedCard | null = null;
  const flush = () => {
    if (cur && (cur.prompt || cur.answer)) out.push(cur);
    cur = null;
  };
  const blank = (): ParsedCard => ({
    prompt: "",
    answer: "",
    kind: null,
    deck: null,
    subject: null,
    wrong: [],
    tags: [],
    also: [],
    variantOf: null,
  });
  let last: "prompt" | "answer" | null = null;

  for (const raw of text.replace(/^```\w*\s*|```\s*$/gm, "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      last = null;
      continue;
    }
    const m = FIELD.exec(line);
    if (!m) {
      // A line with no label continues the prompt or answer above it, such as a long definition.
      if (cur && last) cur[last] = `${cur[last]}\n${line.trim()}`;
      continue;
    }
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "card" || key === "prompt" || key === "q") {
      flush();
      cur = { ...blank(), prompt: value };
      last = "prompt";
      continue;
    }
    cur ??= blank();
    last = null;
    if (key === "answer" || key === "a") {
      cur.answer = value;
      last = "answer";
    } else if (key === "kind" || key === "type") cur.kind = value;
    else if (key === "deck" || key === "category") cur.deck = value;
    else if (key === "subject") cur.subject = value;
    else if (key.startsWith("variant")) cur.variantOf = value || null;
    else if (key === "wrong") {
      if (value) cur.wrong.push(value);
    } else if (key.startsWith("also")) {
      cur.also.push(
        ...value
          .split(";")
          .map((t) => t.trim())
          .filter(Boolean),
      );
    } else
      cur.tags.push(
        ...value
          .split(/[,;]/)
          .map((t) => t.trim())
          .filter(Boolean),
      );
  }
  flush();
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** "Law", "Theorem", "units" and the like, to a card kind. */
export function kindFrom(text: string | null): CardKind | null {
  if (!text) return null;
  const t = norm(text);
  const exact = CARD_KINDS.find((k) => norm(k.label) === t || norm(k.plural) === t || k.id === t);
  if (exact) return exact.id;
  if (/law|theorem|rule|effect|principle|theory/.test(t)) return "principle";
  if (/unit|symbol/.test(t)) return "unit";
  if (/range|standard|band|value/.test(t)) return "standard";
  if (/conver/.test(t)) return "conversion";
  if (/formula|equation/.test(t)) return "formula";
  if (/defin|term/.test(t)) return "definition";
  if (/constant/.test(t)) return "constant";
  return null;
}

/**
 * Matches "ELEX › Electromagnetics" (or ELEX > ..., ELEX / ...) to a deck and subject in the bank. A name alone may
 * be a deck or a subject. Null when nothing matches.
 */
export function matchPlace(text: string, nodes: TreeNode[]): CardPlace | null {
  const live = nodes.filter((n) => !n.deletedAt);
  const cats = live.filter((n) => n.kind === "category");
  const subjects = live.filter((n) => n.kind === "subject");
  const parts = text
    .split(/\s*(?:›|>|\/|»)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    const cat = cats.find((c) => norm(c.name) === norm(parts[0]));
    if (cat) return { categoryId: cat.id };
    const sub = subjects.find((x) => norm(x.name) === norm(parts[0]));
    const deck = sub ? categoriesOf(sub)[0] : undefined;
    return sub && deck ? { categoryId: deck, subjectId: sub.id } : null;
  }
  const cat = cats.find((c) => norm(c.name) === norm(parts[0]));
  if (!cat) return null;
  const sub = subjects.find((x) => norm(x.name) === norm(parts[1]) && categoriesOf(x).includes(cat.id));
  return sub ? { categoryId: cat.id, subjectId: sub.id } : null;
}

/** Turns read cards into drafts, matching deck and subject names to the bank. */
export function toCardDrafts(
  parsed: ParsedCard[],
  nodes: TreeNode[],
  defaults: { categoryId: string | null; subjectId: string | null; tags: string[] },
): CardDraft[] {
  const live = nodes.filter((n) => !n.deletedAt);
  const cats = live.filter((n) => n.kind === "category");
  const subjects = live.filter((n) => n.kind === "subject");
  const t = now();
  return parsed.map((p, i) => {
    const cat = p.deck ? cats.find((c) => norm(c.name) === norm(p.deck!)) : undefined;
    const categoryId = cat?.id ?? defaults.categoryId ?? undefined;
    let subjectId: string | undefined;
    let newSubject: string | undefined;
    if (p.subject && categoryId) {
      const hit = subjects.find((s) => norm(s.name) === norm(p.subject!) && categoriesOf(s).includes(categoryId));
      if (hit) subjectId = hit.id;
      else newSubject = p.subject;
    } else if (!p.subject && defaults.subjectId) {
      const s = subjects.find((x) => x.id === defaults.subjectId);
      if (s && categoryId && categoriesOf(s).includes(categoryId)) subjectId = s.id;
    }
    const also: CardPlace[] = [];
    const alsoMissing: string[] = [];
    for (const text of p.also) {
      const place = matchPlace(text, nodes);
      if (place) also.push(place);
      else alsoMissing.push(text);
    }
    return {
      id: newId(),
      prompt: p.prompt,
      ...(also.length ? { also } : {}),
      ...(alsoMissing.length ? { alsoMissing } : {}),
      ...(p.variantOf ? { variantOf: p.variantOf } : {}),
      answer: p.answer,
      kind: kindFrom(p.kind) ?? (isNumberAnswer(p.answer) ? "constant" : "definition"),
      categoryId,
      subjectId,
      newSubject,
      wrong: isNumberAnswer(p.answer) ? [] : p.wrong.slice(0, WRONG_CHOICES),
      tags: normalizeTags([...defaults.tags, ...p.tags]),
      // Keep the pasted order when listed by time.
      createdAt: t + i,
      updatedAt: t,
    };
  });
}

export type DraftStatus =
  "ready" | "needs-deck" | "needs-wrong" | "duplicate" | "problem" | "waits-main" | "needs-main";

export const DRAFT_STATUS_LABEL: Record<DraftStatus, string> = {
  ready: "Ready",
  "needs-deck": "Needs a deck",
  "needs-wrong": "Needs wrong choices",
  duplicate: "Already in the bank?",
  problem: "Needs a prompt and answer",
  "waits-main": "Waits for its main card",
  "needs-main": "Main card not found",
};

/**
 * Prompts compared for repeats: spaces and capital letters do not count, but every symbol does, so
 * "a < b" and "a = b" are different prompts.
 */
const promptKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.?!:;,]+$/, "");

const asks = (c: MemoryCard, key: string) => cardVariants(c).some((v) => promptKey(v.prompt) === key);

/** The card already in the deck with the same prompt, in any of its variants, if there is one. */
export function findDuplicate(d: CardDraft, existing: MemoryCard[]): MemoryCard | undefined {
  if (!d.prompt.trim()) return undefined;
  const key = promptKey(d.prompt);
  // A variant is checked against the card it joins, wherever that is.
  const main = d.variantOf ? findMain(d, existing) : undefined;
  if (main) return asks(main, key) ? main : undefined;
  if (!d.categoryId) return undefined;
  return existing.find((c) => c.categoryId === d.categoryId && asks(c, key));
}

/** For a variant: the card in the bank it joins, matched by any of that card's prompts, its own deck first. */
export function findMain(d: CardDraft, existing: MemoryCard[]): MemoryCard | undefined {
  if (!d.variantOf?.trim()) return undefined;
  const key = promptKey(d.variantOf);
  const hits = existing.filter((c) => asks(c, key));
  return hits.find((c) => c.categoryId === d.categoryId) ?? hits[0];
}

/**
 * Whether a draft can be added, and if not, why. `existing` is the cards in the bank, `drafts` every draft waiting. A
 * likely repeat is only a warning: it can still be added one by one, but Add all ready leaves it for you to check. A
 * variant waits for its main card when that is still a draft here; Add all ready adds the main card first.
 */
export function draftStatus(d: CardDraft, existing: MemoryCard[], drafts: CardDraft[] = []): DraftStatus {
  if (!d.prompt.trim() || !d.answer.trim()) return "problem";
  if (d.variantOf) {
    if (cardProblem({ ...d, categoryId: "-" })) return "needs-wrong";
    if (!findMain(d, existing)) {
      const key = promptKey(d.variantOf);
      return drafts.some((x) => x.id !== d.id && !x.variantOf && promptKey(x.prompt) === key)
        ? "waits-main"
        : "needs-main";
    }
    return findDuplicate(d, existing) ? "duplicate" : "ready";
  }
  if (!d.categoryId) return "needs-deck";
  if (cardProblem({ ...d, categoryId: d.categoryId })) return "needs-wrong";
  return findDuplicate(d, existing) ? "duplicate" : "ready";
}

// ---------------------------------------------------------------------------------------------
// The drafts, kept on this device
// ---------------------------------------------------------------------------------------------

export function useCardDrafts(): CardDraft[] | undefined {
  return useLiveQuery(() => db.cardDrafts.orderBy("createdAt").toArray(), []);
}

export async function saveCardDrafts(list: CardDraft[]): Promise<void> {
  await db.cardDrafts.bulkPut(list);
}

export async function updateCardDraft(id: string, patch: Partial<CardDraft>): Promise<void> {
  await db.cardDrafts.update(id, { ...patch, updatedAt: now() });
}

export async function discardCardDrafts(ids: string[]): Promise<void> {
  await db.cardDrafts.bulkDelete(ids);
}

/** Creates the subject a draft recommends, in its deck, and files every draft that names it there. */
export async function createDraftSubject(d: CardDraft): Promise<void> {
  if (!d.newSubject || !d.categoryId) return;
  const id = await createNode("subject", d.categoryId, d.newSubject);
  const all = await db.cardDrafts.toArray();
  const same = all.filter(
    (x) => x.categoryId === d.categoryId && x.newSubject && norm(x.newSubject) === norm(d.newSubject!),
  );
  await db.cardDrafts.bulkPut(same.map((x) => ({ ...x, subjectId: id, newSubject: undefined, updatedAt: now() })));
}

/** Adds a draft to the bank as a card, or as a variant of the card it names, and removes the draft. */
export async function acceptCardDraft(d: CardDraft): Promise<void> {
  if (d.variantOf) {
    const main = findMain(d, await db.cards.filter((c) => !c.deletedAt).toArray());
    if (!main) return;
    await addVariant(main.id, { prompt: d.prompt, answer: d.answer, wrong: d.wrong }, d.tags);
    await db.cardDrafts.delete(d.id);
    return;
  }
  if (!d.categoryId) return;
  await saveCard({
    categoryId: d.categoryId,
    subjectId: d.subjectId,
    also: d.also,
    kind: d.kind,
    prompt: d.prompt,
    answer: d.answer,
    wrong: d.wrong,
    tags: d.tags,
  });
  await db.cardDrafts.delete(d.id);
}

// ---------------------------------------------------------------------------------------------
// Changing many drafts at once, from the selection bar. Each change can be undone.
// ---------------------------------------------------------------------------------------------

/** The drafts as they are now, to put back with `restoreCardDrafts`. */
export async function snapshotCardDrafts(ids: string[]): Promise<CardDraft[]> {
  return (await db.cardDrafts.bulkGet(ids)).filter((d): d is CardDraft => !!d);
}

/** Puts drafts back as they were, including ones discarded. */
export async function restoreCardDrafts(before: CardDraft[]): Promise<void> {
  await db.cardDrafts.bulkPut(before);
}

async function patchCardDrafts(ids: string[], fn: (d: CardDraft) => Partial<CardDraft>): Promise<void> {
  const t = now();
  await db.transaction("rw", db.cardDrafts, async () => {
    const list = await snapshotCardDrafts(ids);
    await db.cardDrafts.bulkPut(list.map((d) => ({ ...d, ...fn(d), updatedAt: t })));
  });
}

export function addDraftTags(ids: string[], tags: string[]): Promise<void> {
  return patchCardDrafts(ids, (d) => ({ tags: normalizeTags([...d.tags, ...tags]) }));
}

export function removeDraftTag(ids: string[], tag: string): Promise<void> {
  return patchCardDrafts(ids, (d) => ({ tags: d.tags.filter((t) => norm(t) !== norm(tag)) }));
}

/** Files drafts in a deck and subject. That settles any subject Claude recommended. */
export function moveCardDrafts(ids: string[], place: CardPlace): Promise<void> {
  return patchCardDrafts(ids, () => ({
    categoryId: place.categoryId,
    subjectId: place.subjectId,
    newSubject: undefined,
  }));
}

/** Creates every subject the drafts recommend, once each, and files the drafts in them. */
export async function createAllDraftSubjects(): Promise<number> {
  let made = 0;
  for (;;) {
    const next = (await db.cardDrafts.toArray()).find((d) => d.newSubject && d.categoryId && !d.subjectId);
    if (!next) return made;
    await createDraftSubject(next);
    made++;
  }
}
