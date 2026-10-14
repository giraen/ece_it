import type { Choice, DraftQuestion, TreeNode } from "./db";
import { newId } from "./ids";
import { childrenOf } from "./tree";

/** Questions read from pasted text are kept as drafts under this concept id, so they use the same review storage. */
export const EXTRACT_CONCEPT = "extract";

/** One question as read from the pasted text, before it becomes a draft. */
export interface Parsed {
  /** The number written in front of the question, if any. */
  number: number | null;
  stem: string;
  /** The text of each choice, in order. Empty when only an answer was given. */
  choices: string[];
  /** Which choice is the answer, when it could be matched. */
  correct: number | null;
  /** The answer as written, when it is not one of the choices (or there are no choices). */
  answerText: string | null;
  reference: string | null;
  /** The topic named on a "Topic:" line, such as "ELEX > Circuits > Basics". */
  topic: string | null;
  /** The tags named on a "Tags:" line, such as "series, formulas". */
  tags: string[];
  /** The text this question was read from, for questions that could not be understood. */
  raw: string;
  notes: string[];
}

const START_Q = /^\s*(?:Q|Question)\s*(\d+)?\s*[:.)]\s*(.*)$/i;
const START_NUM = /^\s*(\d+)[.)](?:\s+(.*))?$/;
const CHOICE = /^\s*(?:\(([A-Ha-h])\)|([A-Ha-h])[.)])\s*(.*)$/;
const ANSWER = /^\s*(?:Answer|Ans|Key|Correct(?:\s+answer)?)\s*[:=]\s*(.*)$/i;
const REF = /^\s*(?:Ref|Reference|Source)\s*:\s*(.*)$/i;
const TOPIC = /^\s*Topic\s*:\s*(.*)$/i;
const TAGS = /^\s*Tags?\s*:\s*(.*)$/i;
const SKIP = /^\s*(?:Solution|Explanation|Rationale|Notes?)\s*:/i;
const KEY_HEAD = /^\s*(?:answer\s*key|answers|key)\s*:?\s*(.*)$/i;
const KEY_PAIR = /(\d+)\s*[.\-:)=]?\s*\(?([A-Ha-h])\)?(?![A-Za-z0-9])/g;
const KEY_START = /^\d+\s*[.\-:)=]?\s*\(?[A-Ha-h]\)?(?![A-Za-z0-9])/;

const letter = (i: number) => String.fromCharCode(65 + i);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** A name or path with case, spacing and punctuation removed, for comparing. */
export const normName = norm;

interface Cur {
  number: number | null;
  stem: string[];
  choices: string[];
  answer: string | null;
  ref: string | null;
  topic: string | null;
  tags: string[];
  raw: string[];
  phase: "stem" | "choices" | "done";
}

const fresh = (number: number | null, first: string): Cur => ({
  number,
  stem: first ? [first] : [],
  choices: [],
  answer: null,
  ref: null,
  topic: null,
  tags: [],
  raw: first ? [first] : [],
  phase: "stem",
});

/** Reads "D", "(D)", "D." or "D. text" as a letter. Anything else, such as "A parabola", is a written answer. */
function letterOf(answer: string): number | null {
  const m = /^\(?([A-Ha-h])\)?(?:[.)]\s*.*)?$/.exec(answer.trim());
  return m ? m[1].toUpperCase().charCodeAt(0) - 65 : null;
}

function resolve(answer: string | null, choices: string[]): Pick<Parsed, "correct" | "answerText" | "notes"> {
  const notes: string[] = [];
  if (!answer || !answer.trim()) return { correct: null, answerText: null, notes };
  const a = answer.trim();
  const idx = letterOf(a);
  if (idx !== null) {
    if (idx < choices.length) return { correct: idx, answerText: null, notes };
    if (choices.length === 0) {
      const rest = a.replace(/^\(?[A-Ha-h]\)?[.)]?\s*/, "");
      notes.push(`The answer is "${letter(idx)}" but there are no choices.`);
      return { correct: null, answerText: rest || null, notes };
    }
    notes.push(`The answer is "${letter(idx)}" but there is no choice ${letter(idx)}.`);
    return { correct: null, answerText: null, notes };
  }
  const hit = choices.findIndex((c) => norm(c) !== "" && norm(c) === norm(a));
  if (hit >= 0) return { correct: hit, answerText: null, notes };
  if (choices.length > 0) notes.push(`The answer "${a}" does not match any choice.`);
  return { correct: null, answerText: a, notes };
}

/** Splits "a, b; c" into tags. */
function splitTags(s: string): string[] {
  return s
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Drops repeats that differ only by capital letters. The first spelling wins. */
function uniqueTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  return out;
}

/** Reads text in the standard Extract format. See EXTRACT_INSTRUCTIONS. */
export function parseExtract(text: string): Parsed[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const done: Cur[] = [];
  const keys = new Map<number, number>();
  let cur: Cur | null = null;
  let inKey = false;
  let skipping = false;
  let blank = false;

  const finish = () => {
    if (cur && (cur.raw.some((l) => l.trim()) || cur.choices.length)) done.push(cur);
    cur = null;
  };
  const addPairs = (s: string) => {
    for (const m of s.matchAll(KEY_PAIR)) keys.set(Number(m[1]), m[2].toUpperCase().charCodeAt(0) - 65);
  };

  for (const line of lines) {
    if (inKey) {
      addPairs(line);
      continue;
    }
    if (!line.trim()) {
      blank = true;
      skipping = false;
      if (cur) cur.raw.push("");
      if (cur?.phase === "stem" && cur.stem.length) cur.stem.push("");
      continue;
    }
    const head = KEY_HEAD.exec(line);
    if (head && (head[1].trim() === "" || KEY_START.test(head[1].trim()))) {
      finish();
      inKey = true;
      addPairs(head[1]);
      continue;
    }
    if (SKIP.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping) continue;

    const q = START_Q.exec(line);
    const n = q ? null : START_NUM.exec(line);
    if (q || n) {
      finish();
      const number = q ? (q[1] ? Number(q[1]) : null) : Number(n![1]);
      cur = fresh(number, ((q ? q[2] : n![2]) ?? "").trim());
      blank = false;
      continue;
    }
    if (!cur) cur = fresh(null, "");
    const c: Cur = cur;
    c.raw.push(line);

    const ans = ANSWER.exec(line);
    if (ans) {
      c.answer = ans[1].trim();
      c.phase = "done";
      blank = false;
      continue;
    }
    const ref = REF.exec(line);
    if (ref) {
      c.ref = ref[1].trim();
      blank = false;
      continue;
    }
    const tp = TOPIC.exec(line);
    if (tp) {
      c.topic = tp[1].trim();
      blank = false;
      continue;
    }
    const tg = TAGS.exec(line);
    if (tg) {
      c.tags.push(...splitTags(tg[1]));
      blank = false;
      continue;
    }
    const ch = CHOICE.exec(line);
    const label = ch ? (ch[1] ?? ch[2]).toUpperCase() : "";
    if (ch && c.phase !== "done" && label === letter(c.choices.length)) {
      c.choices.push(ch[3].trim());
      c.phase = "choices";
      blank = false;
      continue;
    }
    // Plain text. After a finished question, or after a blank line below the choices, it begins a new question.
    if (c.phase === "done" || (c.phase === "choices" && blank)) {
      finish();
      cur = fresh(null, line.trim());
    } else if (c.phase === "choices") {
      c.choices[c.choices.length - 1] = `${c.choices[c.choices.length - 1]} ${line.trim()}`.trim();
    } else {
      c.stem.push(line.trim());
    }
    blank = false;
  }
  finish();

  return done.map((c, i) => {
    const stem = c.stem.join("\n").trim();
    let answer = c.answer;
    if (!answer) {
      const k = keys.get(c.number ?? i + 1);
      if (k !== undefined) answer = letter(k);
    }
    const r = resolve(answer, c.choices);
    return {
      number: c.number,
      stem,
      choices: c.choices,
      correct: r.correct,
      answerText: r.answerText,
      reference: c.ref || null,
      topic: c.topic || null,
      tags: uniqueTags(c.tags),
      raw: c.raw.join("\n").trim(),
      notes: r.notes,
    };
  });
}

/** A reference for one question: the batch's source plus the question's own "Ref:" line, or the batch reference alone. */
export function combineReference(own: string | null, batchReference: string, sourceOnly: string): string {
  const r = own?.trim();
  if (r) return sourceOnly.trim() ? `${sourceOnly.trim()}, ${r}` : r;
  return batchReference.trim();
}

/** Turns what was read into drafts waiting for review. */
export function toDrafts(
  parsed: Parsed[],
  opts: {
    /** Used for questions with no "Topic:" line, or whose topic is not in the tree. Empty means none. */
    defaultTopicId: string;
    /** Finds the topic a "Topic:" line names. */
    findTopic: (text: string) => string | null;
    reference: (own: string | null) => string;
    at: number;
  },
): DraftQuestion[] {
  return parsed.map((p, i) => {
    let choices: Choice[] = p.choices.map((t) => ({ id: newId(), text: t }));
    let correctChoiceId = p.correct !== null ? choices[p.correct].id : "";
    const notes = [...p.notes];
    if (p.answerText !== null && choices.length === 0) {
      choices = [{ id: newId(), text: p.answerText }];
      correctChoiceId = choices[0].id;
    } else if (p.answerText !== null) {
      notes.push("Check the answer: it was not matched to a choice.");
    }
    if (!p.stem) notes.push(`Could not find the question. Original text: ${p.raw.slice(0, 200)}`);
    const named = p.topic ? opts.findTopic(p.topic) : null;
    const reference = opts.reference(p.reference);
    return {
      id: newId(),
      conceptId: EXTRACT_CONCEPT,
      topicId: named ?? opts.defaultTopicId,
      stem: p.stem,
      choices,
      correctChoiceId,
      ...(reference ? { reference } : {}),
      // A recommended topic that is not in the bank yet waits for you to check it.
      ...(p.topic && !named ? { proposedTopic: p.topic } : {}),
      ...(p.tags.length ? { tags: p.tags } : {}),
      provider: "pasted",
      model: "",
      status: "pending" as const,
      ...(notes.length ? { note: notes.join(" ") } : {}),
      // Keeps the order of the pasted text.
      createdAt: opts.at + i,
      updatedAt: opts.at + i,
    };
  });
}

export type ExtractStatus = "ready" | "needs-answer" | "needs-choices" | "needs-topic" | "problem";

export const STATUS_LABEL: Record<ExtractStatus, string> = {
  ready: "Ready",
  "needs-answer": "Needs answer",
  "needs-choices": "Needs choices",
  "needs-topic": "Needs topic",
  problem: "Needs a question",
};

/** What is still missing before a pasted question can join the bank. */
export function extractStatus(
  d: Pick<DraftQuestion, "stem" | "choices" | "correctChoiceId" | "topicId"> & { proposedTopic?: string },
): ExtractStatus {
  if (!d.stem.trim()) return "problem";
  const filled = d.choices.filter((c) => c.text.trim());
  if (filled.length < 2) return "needs-choices";
  if (!filled.some((c) => c.id === d.correctChoiceId)) return "needs-answer";
  if (!d.topicId || d.proposedTopic) return "needs-topic";
  return "ready";
}

/** True when text looks like maths but has no dollar signs, so it would show as plain text. */
export function looksLikeUnmarkedMaths(text: string): boolean {
  if (text.includes("$")) return false;
  const t = text.replace(/https?:\/\/\S+/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  return /[=^]|\bsqrt\(|\b\d+[A-Za-z]\b|\b[A-Za-z]\d\b|\w\s[+*/]\s\w|\w\s-\s\d/.test(t);
}

/** Warnings about a pasted question that do not stop it being added. */
export function extractWarnings(d: Pick<DraftQuestion, "stem" | "choices">): string[] {
  const out: string[] = [];
  if (looksLikeUnmarkedMaths(d.stem) || d.choices.some((c) => looksLikeUnmarkedMaths(c.text)))
    out.push("This looks like maths but is not between $ signs, so it will show as plain text.");
  return out;
}

/** The same question text, so a question that is already in the bank can be spotted. */
export function sameStem(a: string, b: string): boolean {
  const x = norm(a);
  return x.length > 0 && x === norm(b);
}

/** One topic in the tree, with the names of its category, subject, and topic. A shared subject gives one entry per category. */
export interface TopicEntry {
  id: string;
  parts: string[];
}

export function topicEntries(nodes: TreeNode[]): TopicEntry[] {
  const live = nodes.filter((n) => !n.deletedAt);
  const out: TopicEntry[] = [];
  for (const cat of live.filter((n) => n.kind === "category")) {
    for (const sub of childrenOf(live, cat.id)) {
      for (const topic of childrenOf(live, sub.id)) out.push({ id: topic.id, parts: [cat.name, sub.name, topic.name] });
    }
  }
  return out;
}

/**
 * Finds the topic named in text such as "ELEX > Circuits > Basics". The category and subject may be left out when the
 * rest is enough to tell topics apart. Case, spacing and punctuation do not matter.
 */
export function findTopic(entries: TopicEntry[], text: string): string | null {
  const want = text.split(/\s*(?:>|›|»|→)\s*/).map(norm);
  if (want.length === 0 || want.length > 3 || want.some((w) => !w)) return null;
  const hits = new Set<string>();
  for (const e of entries) {
    const tail = e.parts.slice(3 - want.length).map(norm);
    if (tail.every((t, i) => t === want[i])) hits.add(e.id);
  }
  return hits.size === 1 ? [...hits][0] : null;
}

/** Splits "Category > Subject > Topic" into its three names, or returns null if it is not written that way. */
export function parseTopicPath(text: string): string[] | null {
  const parts = text.split(/\s*(?:>|›|»|→)\s*/).map((p) => p.trim());
  return parts.length === 3 && parts.every(Boolean) ? parts : null;
}

/** The instructions, with the categories, topics and tags already in the bank, so Claude can recommend from them. */
export function instructionsWithTopics(nodes: TreeNode[], tags: string[] = []): string {
  const live = nodes.filter((n) => !n.deletedAt);
  const categories = childrenOf(live, null)
    .filter((n) => n.kind === "category")
    .map((n) => n.name);
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const e of topicEntries(live)) {
    const line = e.parts.join(" > ");
    if (!seen.has(line)) {
      seen.add(line);
      lines.push(`- ${line}`);
    }
  }
  let out = EXTRACT_INSTRUCTIONS;
  if (categories.length) out += `\n\nMy categories: ${categories.join(", ")}.`;
  if (lines.length) out += `\n\nTopics already in my question bank:\n${lines.join("\n")}`;
  if (tags.length) out += `\n\nTags already in my question bank: ${tags.join(", ")}`;
  return out;
}

/** What to paste into a chat with Claude, along with the PDF or pictures, to get text this page can read. */
export const EXTRACT_INSTRUCTIONS = `Turn the questions in the attached file into plain text in exactly the format below, so I can paste it into my question bank. Put the whole result in one code block, with no commentary.

Format, one question after another with a blank line between them:

Q: The question text
A. First choice
B. Second choice
C. Third choice
D. Fourth choice
Answer: B
Topic: Category > Subject > Topic
Tags: first tag, second tag

Rules:
- Wrap every equation, formula, and expression with variables in dollar signs, in the question and in the choices, like $3x - 2y + 6 = 0$. Plain numbers and words stay outside the dollar signs.
- Write maths the typed way: x^2 for powers, x_("text") for words in a subscript, sqrt(x), root(3)(x), a/b or \\frac{a}{b} for fractions, int_a^b f(x) dx, (dy)/(dx), pi, theta, 30^@ for degrees. Fix exponents that were flattened, so "4x2" becomes $4x^2$.
- Keep the choices in the order given and keep their letters.
- If the file has an answer key, put "Answer: " and the letter after each question. If it has no key, leave the Answer line out. Do not guess the answers unless I ask you to.
- If a question has no choices, leave the choice lines out, and give "Answer: " followed by the answer itself.
- Do not add a Ref line. I add the source myself.
- Add a Topic line to every question, written as Category > Subject > Topic. Use one of my categories. If a topic from my list fits, copy it exactly. If none fits, recommend a new Subject and Topic yourself. I will check your recommendation and can change it. A file can cover several topics, so choose for each question on its own.
- Add a Tags line to a question only when a tag would help me find it later, such as the kind of problem or the method it needs. Give one to three short tags separated by commas. Reuse a tag from my list when one fits, and leave the line out otherwise.
- If a question depends on a figure or picture, end its text with [figure].
- Skip page headers, footers, and instructions that are not questions.`;