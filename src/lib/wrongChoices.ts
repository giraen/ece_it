import { extractJson, normalize } from "./aiText";
import { recipeProblem, screenFormulas } from "./computation";
import type { ComputationTemplate, ProviderConfig } from "./db";
import { NoProviderError, type LlmRequest } from "./providers";
import { slotsIn } from "./slots";

/** Sends a request to the best available AI provider. Throws NoProviderError when none can answer. */
export type Ask = (req: LlmRequest) => Promise<{ content: string; provider: ProviderConfig }>;

type Message = { role: "system" | "user"; content: string };

const IMAGE = /!\[[^\]]*\]\(img:[0-9a-f]+\)/g;
const TOKEN = /\[\[IMG\d+\]\]/g;

/** Swaps each picture for a token such as [[IMG1]], which the model can see but not change. */
function hideImages(texts: string[]): { texts: string[]; tokens: { token: string; original: string }[] } {
  const tokens: { token: string; original: string }[] = [];
  const out = texts.map((t) =>
    t.replace(IMAGE, (original) => {
      let found = tokens.find((x) => x.original === original);
      if (!found) {
        found = { token: `[[IMG${tokens.length + 1}]]`, original };
        tokens.push(found);
      }
      return found.token;
    }),
  );
  return { texts: out, tokens };
}

function showImages(text: string, tokens: { token: string; original: string }[]): string {
  let out = text;
  for (const t of tokens) out = out.split(t.token).join(t.original);
  return out;
}

/** The list of strings under `key` in a model reply. Anything that is not a short, non-empty string is dropped. */
export function parseList(content: string, key: string): string[] {
  const json = extractJson(content) as Record<string, unknown> | undefined;
  const list = json && Array.isArray(json[key]) ? (json[key] as unknown[]) : [];
  return list
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && x.length <= 400);
}

const FORMAT_NOTE =
  "Write each choice in the same style as the correct answer, with similar length and wording. " +
  'If the correct answer has maths between dollar signs, write maths the same way, for example $5.1 k Omega$ or $V_("out")/V_("in")$. ' +
  "Placeholders like [[IMG1]] stand for pictures: copy them exactly or leave them out. Reply with JSON only.";

export function textMessages(args: {
  stem: string;
  correct: string;
  others: string[];
  count: number;
  slots?: { name: string; unit: string }[];
}): Message[] {
  const { stem, correct, others, count, slots } = args;
  const sentence = slots !== undefined;
  const slotList = (slots ?? []).map((s) => `{${s.name}}${s.unit ? ` (in ${s.unit})` : ""}`).join(", ");
  return [
    {
      role: "system",
      content:
        "You write wrong answer choices for a multiple-choice question in an electronics engineering board exam review. " +
        "A good wrong choice is plausible: it looks like the right answer to a student who has a common misconception, " +
        "mixes up two ideas, makes a typical mistake, or remembers a rule only partly. " +
        "It must still be clearly wrong to an expert. Never write a choice that is also correct, and never write one that is silly. " +
        (sentence
          ? "The choices are statements. A statement may use slots like {R} for a value filled in later: copy a slot exactly, including the braces, and never invent a slot or write a number in its place. " +
            "Every wrong statement must be false for every possible set of values. "
          : "") +
        FORMAT_NOTE,
    },
    {
      role: "user",
      content:
        `Question:\n${stem}\n\nCorrect answer: ${correct}\n` +
        (others.length
          ? `Wrong choices that already exist (do not repeat them):\n${others.map((o) => `- ${o}`).join("\n")}\n`
          : "") +
        (sentence && slotList ? `Slots you may use: ${slotList}\n` : "") +
        `\nWrite ${count} different wrong choices. Make them differ from each other in the mistake they model. ` +
        `Reply as: {"choices":["...","..."]}`,
    },
  ];
}

export function formulaMessages(args: {
  template: Pick<ComputationTemplate, "givens" | "derived" | "stems" | "format">;
  correct: string;
  others: string[];
  count: number;
}): Message[] {
  const { template: t, correct, others, count } = args;
  const names = [
    ...t.givens.map((g) => `${g.name}${g.unit ? ` (${g.unit})` : ""}`),
    ...t.derived.map((d) => `${d.name} = ${d.formula}${d.unit ? ` (${d.unit})` : ""}`),
  ];
  return [
    {
      role: "system",
      content:
        "You write wrong answer choices for a calculation question in an electronics engineering board exam review. " +
        "Each choice is a formula that a program works out to a number. " +
        "A good wrong formula is what a student would get after one realistic mistake in the method: " +
        "forgetting a factor such as 2 or pi, using the wrong formula, inverting a ratio, using the wrong sign, mixing up two quantities, " +
        "or a scaling slip such as a factor of 1000 or 2*pi. " +
        "Use only the names given, and write each formula in this form: * for multiply, / for divide, ^ for power, sqrt(x), pi, parentheses, and plain numbers. " +
        "No units, no words, no equals sign. " +
        "Each formula must be different from the correct one and from each other, and must give a clearly different number. Reply with JSON only.",
    },
    {
      role: "user",
      content:
        `Question wording (values in braces are filled in by the program):\n${t.stems[0] ?? ""}\n\n` +
        `Names you can use:\n${names.map((n) => `- ${n}`).join("\n")}\n\n` +
        `Answer unit: ${t.format.unit || "(none)"}\nCorrect formula: ${correct}\n` +
        (others.length
          ? `Wrong formulas that already exist (do not repeat them):\n${others.map((o) => `- ${o}`).join("\n")}\n`
          : "") +
        `\nWrite ${Math.min(10, count * 2 + 1)} different wrong formulas. ` +
        `Reply as: {"formulas":["...","..."]}`,
    },
  ];
}

function whyStopped(e: unknown): string {
  if (e instanceof NoProviderError) return e.message + (e.reasons.length ? ` (${e.reasons.join("; ")})` : "");
  return e instanceof Error ? e.message : "The request failed.";
}

async function askFor(ask: Ask, messages: Message[]): Promise<string> {
  try {
    // "concept" keeps the small in-browser model out of this: it writes weak wrong choices.
    return (await ask({ purpose: "concept", messages, temperature: 0.8, maxTokens: 3000 })).content;
  } catch (e) {
    throw new Error(whyStopped(e));
  }
}

/**
 * Wrong choices written as text: for a standard question, or for a computation question whose choices are sentences.
 * Returns at most `count` choices, never a copy of the correct answer or of an existing choice. With `slots`, a choice
 * may only use those {names}.
 */
export async function suggestWrongText(args: {
  ask: Ask;
  stem: string;
  correct: string;
  others: string[];
  count: number;
  slots?: { name: string; unit: string }[];
}): Promise<string[]> {
  const hidden = hideImages([args.stem, args.correct, ...args.others]);
  const [stem, correct, ...others] = hidden.texts;
  const content = await askFor(
    args.ask,
    textMessages({ stem, correct, others, count: Math.min(8, args.count + 1), slots: args.slots }),
  );
  const allowed = new Set((args.slots ?? []).map((s) => s.name));
  const known = new Set(hidden.tokens.map((t) => t.token));
  const avoid = new Set([correct, ...others].map(normalize));
  const out: string[] = [];
  for (const raw of parseList(content, "choices")) {
    if ((raw.match(TOKEN) ?? []).some((t) => !known.has(t))) continue;
    if (args.slots !== undefined && slotsIn(raw).some((n) => !allowed.has(n))) continue;
    const key = normalize(raw);
    if (avoid.has(key)) continue;
    avoid.add(key);
    out.push(showImages(raw, hidden.tokens));
    if (out.length >= args.count) break;
  }
  if (out.length === 0) throw new Error("The AI did not give any usable wrong choices. Try again.");
  return out;
}

/** Wrong formulas for a computation question. Each one is checked against the recipe before it is offered. */
export async function suggestWrongFormulas(args: {
  ask: Ask;
  template: Pick<ComputationTemplate, "givens" | "derived" | "constraints" | "stems" | "format">;
  correct: string;
  others: string[];
  count: number;
  rand?: () => number;
}): Promise<string[]> {
  const problem = recipeProblem(args.template);
  if (problem) throw new Error(`Fix this first: ${problem}`);
  const content = await askFor(
    args.ask,
    formulaMessages({ template: args.template, correct: args.correct, others: args.others, count: args.count }),
  );
  const seen = new Set<string>();
  const candidates = parseList(content, "formulas").filter((f) => {
    const key = f.replace(/\s+/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const { kept } = screenFormulas(args.template, args.correct, args.others, candidates, args.rand);
  if (kept.length === 0) {
    throw new Error(
      "None of the AI's formulas worked as a wrong choice, for example they matched the correct answer. Try again.",
    );
  }
  return kept.slice(0, args.count);
}