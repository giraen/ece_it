import { slotsIn } from "./slots";

/** Anything the model must not touch: a formula or a figure. It is swapped for a token and swapped back afterwards. */
export interface Token {
  token: string;
  original: string;
  kind: "math" | "image";
}

const SPAN = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|!\[[^\]]*\]\(img:[0-9a-f]+\))/g;
const TOKEN = /\[\[(?:M|IMG)\d+\]\]/g;

/** Replaces every formula and image with a token such as [[M1]] or [[IMG1]]. The same original always gets the same token. */
export function protectTexts(texts: string[]): { texts: string[]; tokens: Token[] } {
  const tokens: Token[] = [];
  const seen = new Map<string, string>();
  let m = 0;
  let i = 0;
  const out = texts.map((t) =>
    t.replace(SPAN, (original) => {
      let token = seen.get(original);
      if (!token) {
        const image = original.startsWith("![");
        token = image ? `[[IMG${++i}]]` : `[[M${++m}]]`;
        seen.set(original, token);
        tokens.push({ token, original, kind: image ? "image" : "math" });
      }
      return token;
    }),
  );
  return { texts: out, tokens };
}

export function restoreText(text: string, tokens: Token[]): string {
  let out = text;
  for (const t of tokens) out = out.split(t.token).join(t.original);
  return out;
}

export const tokensIn = (text: string): string[] => text.match(TOKEN) ?? [];

/** Tells the model what the tokens stand for, so it understands the question without being able to alter it. */
export function legendFor(tokens: Token[]): string {
  if (tokens.length === 0) return "";
  const lines = tokens.map((t) =>
    t.kind === "image"
      ? `${t.token} is a figure (an image you cannot see)`
      : `${t.token} stands for the formula ${t.original}`,
  );
  return `\nPlaceholders:\n${lines.join("\n")}\n`;
}

/** Returns a reason the model's text is unusable, or null if it is fine. */
export function checkProtected(texts: string[], tokens: Token[], requiredInStem: string[]): string | null {
  const joined = texts.join("\n");
  if (/\$/.test(joined) || /!\[/.test(joined))
    return "it wrote its own formula or image instead of using the placeholders";
  const known = new Set(tokens.map((t) => t.token));
  if (tokensIn(joined).some((t) => !known.has(t))) return "it invented a placeholder";
  const stem = texts[0] ?? "";
  if (requiredInStem.some((t) => !stem.includes(t))) return "it dropped a figure from the question";
  return null;
}

export const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Pulls a JSON object out of a model reply, even if it is wrapped in code fences or chatter. */
export function extractJson(content: string): unknown {
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  const direct = tryParse(content.trim());
  if (direct !== undefined) return direct;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  if (fenced) {
    const v = tryParse(fenced[1].trim());
    if (v !== undefined) return v;
  }
  const a = content.indexOf("{");
  const b = content.lastIndexOf("}");
  return a >= 0 && b > a ? tryParse(content.slice(a, b + 1)) : undefined;
}

// ---------------------------------------------------------------------------------------------
// Concept questions
// ---------------------------------------------------------------------------------------------

export interface ConceptCandidate {
  stem: string;
  choices: string[];
  correctIndex: number;
}

const LETTERS = "ABCDEFGH";

export function conceptMessages(
  stem: string,
  choices: string[],
  correctIndex: number,
  tokens: Token[],
  count: number,
): { role: "system" | "user"; content: string }[] {
  const lettered = choices.map((c, i) => `${LETTERS[i]}. ${c}`).join("\n");
  return [
    {
      role: "system",
      content:
        "You rewrite multiple-choice questions for an electronics engineering board exam review. " +
        "You change the wording and the scenario only. The concept being tested and the meaning of the correct answer must stay the same. " +
        "Never change any numbers or calculations. " +
        "Placeholders like [[M1]] or [[IMG1]] stand for formulas or figures: copy them exactly as written. " +
        "Never write LaTeX, dollar signs, or markdown images yourself. Reply with JSON only.",
    },
    {
      role: "user",
      content:
        `Question:\n${stem}\n\nChoices:\n${lettered}\n\nCorrect answer: ${LETTERS[correctIndex]}\n${legendFor(tokens)}\n` +
        `Write ${count} different versions of this question. Vary the scenario or context, the sentence structure, and the order of the choices. ` +
        `For some versions, ask which statement is NOT true instead; then the correct answer is the false statement. ` +
        `Keep exactly ${choices.length} choices, with exactly one correct answer. ` +
        `Reply as: {"variants":[{"stem":"...","choices":["...","..."],"correctIndex":0}]} where correctIndex counts from 0.`,
    },
  ];
}

export function parseConcept(
  content: string,
  nChoices: number,
  key: "variants" | "questions" = "variants",
): ConceptCandidate[] {
  const json = extractJson(content) as Record<string, unknown> | undefined;
  const list = json && Array.isArray(json[key]) ? (json[key] as unknown[]) : [];
  const out: ConceptCandidate[] = [];
  for (const v of list as Record<string, unknown>[]) {
    if (!v || typeof v.stem !== "string" || !v.stem.trim()) continue;
    if (!Array.isArray(v.choices) || v.choices.length !== nChoices) continue;
    if (!v.choices.every((c) => typeof c === "string" && c.trim())) continue;
    const ci = v.correctIndex;
    if (typeof ci !== "number" || !Number.isInteger(ci) || ci < 0 || ci >= nChoices) continue;
    const choices = (v.choices as string[]).map((c) => c.trim());
    if (new Set(choices.map(normalize)).size !== choices.length) continue;
    out.push({ stem: v.stem.trim(), choices, correctIndex: ci });
  }
  return out;
}

/** Asks for new multiple-choice questions based on a study note. `title` and `body` must already be protected. */
export function draftMessages(
  title: string,
  body: string,
  tokens: Token[],
  count: number,
): { role: "system" | "user"; content: string }[] {
  return [
    {
      role: "system",
      content:
        "You write multiple-choice questions for an electronics engineering board exam review, based on a study note. " +
        "Each question must test the idea in the note, have exactly four choices and exactly one correct answer, and be correct by standard electronics engineering knowledge. " +
        "Mix kinds of questions: concept, fundamentals, a short calculation setup, and application. Do not invent facts that are not in the note or in standard knowledge. " +
        "Placeholders like [[M1]] or [[IMG1]] stand for formulas or figures from the note: copy them exactly if you use them. " +
        "Never write LaTeX, dollar signs, or markdown images yourself. Reply with JSON only.",
    },
    {
      role: "user",
      content:
        `Study note: ${title}\n\n${body}\n${legendFor(tokens)}\n` +
        `Write ${count} different questions based on this note. ` +
        `Reply as: {"questions":[{"stem":"...","choices":["...","...","...","..."],"correctIndex":0}]} where correctIndex counts from 0.`,
    },
  ];
}

export function solveMessages(
  stem: string,
  choices: string[],
  tokens: Token[],
): { role: "system" | "user"; content: string }[] {
  return [
    {
      role: "system",
      content:
        "You are answering a multiple-choice question from an electronics engineering board exam. " +
        "Placeholders like [[M1]] stand for formulas, explained below the question. Think it through, then reply with JSON only.",
    },
    {
      role: "user",
      content: `Question:\n${stem}\n\nChoices:\n${choices.map((c, i) => `${LETTERS[i]}. ${c}`).join("\n")}\n${legendFor(tokens)}\nReply as: {"answer":"B"}`,
    },
  ];
}

/** The index of the letter the model answered, or null if it did not give a clear one. */
export function parseAnswer(content: string, nChoices: number): number | null {
  const json = extractJson(content) as { answer?: unknown } | undefined;
  const raw = json && typeof json.answer === "string" ? json.answer : content;
  const m = /\b([A-H])\b/.exec(raw.trim().toUpperCase());
  if (!m) return null;
  const i = LETTERS.indexOf(m[1]);
  return i >= 0 && i < nChoices ? i : null;
}

// ---------------------------------------------------------------------------------------------
// Computation wordings
// ---------------------------------------------------------------------------------------------

export function framesMessages(
  wording: string,
  slots: { name: string; unit: string }[],
  tokens: Token[],
  count: number,
): { role: "system" | "user"; content: string }[] {
  const slotList = slots.map((s) => `{${s.name}}${s.unit ? ` (in ${s.unit})` : ""}`).join(", ");
  return [
    {
      role: "system",
      content:
        "You rewrite the wording of a calculation question for an electronics engineering board exam review. " +
        "The values are filled in later by a program, so the wording contains slots like {R}. " +
        "Copy every slot exactly as written, including the braces. Use every slot the original uses and never add other slots. " +
        "Never write any numbers or digits. Keep asking for exactly the same quantity. " +
        "Placeholders like [[M1]] stand for formulas: copy them exactly. Never write LaTeX or dollar signs yourself. Reply with JSON only.",
    },
    {
      role: "user",
      content:
        `Original wording:\n${wording}\n\nSlots: ${slotList}\n${legendFor(tokens)}\n` +
        `Write ${count} different wordings: change the scenario, the sentence structure, and the order in which the values are introduced. ` +
        `Reply as: {"wordings":["...","..."]}`,
    },
  ];
}

export function parseFrames(content: string): string[] {
  const json = extractJson(content) as { wordings?: unknown } | undefined;
  const list = json && Array.isArray(json.wordings) ? json.wordings : [];
  return list.filter((w): w is string => typeof w === "string" && w.trim().length > 0).map((w) => w.trim());
}

const DIGITS = /\d+/g;

/** Why a reworded wording is not acceptable, or null if it is. `original` is the protected original wording. */
export function frameProblem(frame: string, original: string, tokens: Token[]): string | null {
  const requiredSlots = new Set(slotsIn(original));
  const got = new Set(slotsIn(frame));
  for (const s of requiredSlots) if (!got.has(s)) return `it left out the slot {${s}}`;
  for (const s of got) if (!requiredSlots.has(s)) return `it added a slot {${s}}`;
  const originalDigits = new Set(original.match(DIGITS) ?? []);
  // Digits inside placeholders such as [[M1]] are not the model's own numbers.
  const frameDigits = (frame.replace(TOKEN, "").match(DIGITS) ?? []).filter((d) => !originalDigits.has(d));
  if (frameDigits.length) return "it wrote a number of its own";
  if (frame.length < 8 || frame.length > 600) return "its length is off";
  return checkProtected(
    [frame],
    tokens,
    tokensIn(original).filter((t) => t.startsWith("[[IMG")),
  );
}