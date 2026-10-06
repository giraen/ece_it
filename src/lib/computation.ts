import { create, all } from "mathjs";
import { CONFIG } from "./config";
import { SLOT, slotsIn } from "./slots";
import type { AnswerFormat, Choice, ComputationTemplate, Derived, Given, Question, ValueRule } from "./db";

// ---------------------------------------------------------------------------------------------
// A locked-down formula evaluator
// ---------------------------------------------------------------------------------------------

const math = create(all);
const mathParse = math.parse;
const mathEvaluate = math.evaluate;

const off = (name: string) => () => {
  throw new Error(`The function ${name} is not allowed in formulas.`);
};
// Formulas can come from a shared pack, so the functions that can change the evaluator are switched off.
math.import(
  {
    import: off("import"),
    createUnit: off("createUnit"),
    reviver: off("reviver"),
    evaluate: off("evaluate"),
    parse: off("parse"),
    compile: off("compile"),
    simplify: off("simplify"),
    derivative: off("derivative"),
    resolve: off("resolve"),
  },
  { override: true },
);

const MAX_FORMULA = 400;
const BANNED =
  /\b(import|createUnit|reviver|evaluate|parse|compile|simplify|derivative|resolve|range|zeros|ones|identity|ndarray)\b/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set([
  "pi",
  "PI",
  "tau",
  "phi",
  "Infinity",
  "NaN",
  "true",
  "false",
  "null",
  "undefined",
  "mod",
  "to",
  "in",
  "and",
  "or",
  "not",
  "xor",
]);

function isMathName(name: string): boolean {
  return name in (math as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------------------------
// Numbers with SI suffixes
// ---------------------------------------------------------------------------------------------

const SUFFIX: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  µ: 1e-6,
  μ: 1e-6,
  u: 1e-6,
  m: 1e-3,
  k: 1e3,
  M: 1e6,
  G: 1e9,
};

/** "4.7k" -> 4700, "2.2u" -> 2.2e-6, "10m" -> 0.01, "1e-3" -> 0.001. Returns null if it is not a number. */
export function parseQuantity(text: string): number | null {
  const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([pnµμumkMG]?)$/.exec(text.trim().replace(/\s+/g, ""));
  if (!m) return null;
  const v = Number(m[1]) * (SUFFIX[m[2]] ?? 1);
  return Number.isFinite(v) ? Number(v.toPrecision(12)) : null;
}

const round12 = (v: number) => Number(v.toPrecision(12));

const E_SERIES: Record<"E6" | "E12" | "E24", number[]> = {
  E6: [1.0, 1.5, 2.2, 3.3, 4.7, 6.8],
  E12: [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2],
  E24: [
    1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2,
    9.1,
  ],
};

/** Every standard value of an E-series between `from` and `to`. */
export function eSeriesValues(series: "E6" | "E12" | "E24", from: number, to: number): number[] {
  const out: number[] = [];
  const lo = Math.floor(Math.log10(from)) - 1;
  const hi = Math.ceil(Math.log10(to)) + 1;
  for (let k = lo; k <= hi; k++) {
    for (const m of E_SERIES[series]) {
      const v = round12(m * 10 ** k);
      if (v >= from * (1 - 1e-9) && v <= to * (1 + 1e-9)) out.push(v);
    }
  }
  return out;
}

/** What is wrong with a value rule, as plain sentences. Empty means it is fine. */
export function ruleProblems(rule: ValueRule, label: string): string[] {
  const bad = (msg: string) => [`${label}: ${msg}`];
  switch (rule.kind) {
    case "list": {
      if (rule.values.length === 0) return bad("add at least one value.");
      const wrong = rule.values.filter((v) => parseQuantity(v) === null);
      return wrong.length ? bad(`"${wrong[0]}" is not a number.`) : [];
    }
    case "range": {
      const [a, b, s] = [parseQuantity(rule.from), parseQuantity(rule.to), parseQuantity(rule.step)];
      if (a === null || b === null || s === null) return bad("the start, end, and step must be numbers.");
      if (s <= 0) return bad("the step must be greater than 0.");
      if (a > b) return bad("the start must not be greater than the end.");
      return [];
    }
    case "eseries": {
      const [a, b] = [parseQuantity(rule.from), parseQuantity(rule.to)];
      if (a === null || b === null) return bad("the start and end must be numbers.");
      if (a <= 0 || a > b) return bad("the start must be above 0 and not greater than the end.");
      return eSeriesValues(rule.series, a, b).length ? [] : bad("no standard values fall in that range.");
    }
    case "int": {
      const [a, b] = [parseQuantity(rule.from), parseQuantity(rule.to)];
      if (a === null || b === null || !Number.isInteger(a) || !Number.isInteger(b))
        return bad("the start and end must be whole numbers.");
      return a > b ? bad("the start must not be greater than the end.") : [];
    }
    case "decimal": {
      const [a, b] = [parseQuantity(rule.from), parseQuantity(rule.to)];
      if (a === null || b === null) return bad("the start and end must be numbers.");
      if (a > b) return bad("the start must not be greater than the end.");
      return Number.isInteger(rule.decimals) && rule.decimals >= 0 && rule.decimals <= 8
        ? []
        : bad("decimals must be a whole number from 0 to 8.");
    }
  }
}

/** Draws one value for a rule. Call only after `ruleProblems` is empty. */
export function drawValue(rule: ValueRule, rand: () => number): number {
  switch (rule.kind) {
    case "list": {
      const vs = rule.values.map((v) => parseQuantity(v) as number);
      return vs[Math.floor(rand() * vs.length)];
    }
    case "range": {
      const [a, b, s] = [
        parseQuantity(rule.from) as number,
        parseQuantity(rule.to) as number,
        parseQuantity(rule.step) as number,
      ];
      const n = Math.floor((b - a) / s + 1e-9) + 1;
      return round12(a + Math.floor(rand() * n) * s);
    }
    case "eseries": {
      const vs = eSeriesValues(rule.series, parseQuantity(rule.from) as number, parseQuantity(rule.to) as number);
      return vs[Math.floor(rand() * vs.length)];
    }
    case "int": {
      const [a, b] = [parseQuantity(rule.from) as number, parseQuantity(rule.to) as number];
      return a + Math.floor(rand() * (b - a + 1));
    }
    case "decimal": {
      const [a, b] = [parseQuantity(rule.from) as number, parseQuantity(rule.to) as number];
      const v = Number((a + rand() * (b - a)).toFixed(rule.decimals));
      return Math.min(b, Math.max(a, v));
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Showing numbers: 3180 with unit "Ω" -> $3.18\,\text{k}\Omega$
// ---------------------------------------------------------------------------------------------

const PREFIX_FOR: Record<number, string> = {
  [-12]: "p",
  [-9]: "n",
  [-6]: "µ",
  [-3]: "m",
  0: "",
  3: "k",
  6: "M",
  9: "G",
};

function texPrefix(p: string): string {
  if (p === "µ") return "\\mu";
  return p ? `\\text{${p}}` : "";
}

/** The unit as LaTeX: Ω, µ and ° become symbols, everything else is upright text. */
export function texUnit(unit: string): string {
  let out = "";
  let run = "";
  const flush = () => {
    if (run) out += `\\text{${run.replace(/[\\{}$%&#_^~]/g, "")}}`;
    run = "";
  };
  for (const ch of unit.trim()) {
    if (ch === "Ω") {
      flush();
      out += "\\Omega";
    } else if (ch === "µ" || ch === "μ") {
      flush();
      out += "\\mu";
    } else if (ch === "°") {
      flush();
      out += "^{\\circ}";
    } else run += ch;
  }
  flush();
  return out;
}

const trimNumber = (v: number, sigFigs: number) => String(Number(v.toPrecision(sigFigs)));

/** A number as inline LaTeX with units and significant figures, ready to drop into text. */
export function formatQuantity(
  value: number,
  unit: string,
  sigFigs: number,
  notation: AnswerFormat["notation"],
): string {
  const sf = Math.min(8, Math.max(1, Math.round(sigFigs)));
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(value);
  const u = unit.trim();

  if (v === 0) return `$0${u ? `\\,${texUnit(u)}` : ""}$`;

  if (notation === "engineering" && u) {
    let exp = Math.min(9, Math.max(-12, Math.floor(Math.log10(v) / 3) * 3));
    let mant = v / 10 ** exp;
    // 999.96 rounds up to 1000 at 3 figures, so move to the next prefix.
    if (Number(mant.toPrecision(sf)) >= 1000 && exp < 9) {
      exp += 3;
      mant = v / 10 ** exp;
    }
    return `$${sign}${trimNumber(mant, sf)}\\,${texPrefix(PREFIX_FOR[exp])}${texUnit(u)}$`;
  }

  const unitTex = u ? `\\,${texUnit(u)}` : "";
  if (v >= 1e-3 && v < 1e9) return `$${sign}${trimNumber(v, sf)}${unitTex}$`;
  const e = Math.floor(Math.log10(v));
  return `$${sign}${trimNumber(v / 10 ** e, sf)}\\times10^{${e}}${unitTex}$`;
}

// ---------------------------------------------------------------------------------------------
// Checking a template
// ---------------------------------------------------------------------------------------------

type TemplateLike = Pick<Question, "choices" | "correctChoiceId"> & { template?: ComputationTemplate };

export { slotsIn };

function checkFormula(expr: string, known: Set<string>, label: string): string[] {
  const text = expr.trim();
  if (!text) return [`${label}: write a formula.`];
  if (text.length > MAX_FORMULA) return [`${label}: the formula is too long.`];
  if (BANNED.test(text)) return [`${label}: that function is not allowed in formulas.`];
  try {
    const node = mathParse(text);
    const unknown: string[] = [];
    node.traverse((n) => {
      const sym = n as unknown as { isSymbolNode?: boolean; name?: string };
      if (sym.isSymbolNode && sym.name && !known.has(sym.name) && !isMathName(sym.name)) unknown.push(sym.name);
    });
    if (unknown.length) return [`${label}: "${unknown[0]}" is not a given or derived value.`];
    return [];
  } catch (e) {
    return [`${label}: ${e instanceof Error ? e.message : "the formula cannot be read."}`];
  }
}

/** Everything wrong with a template that can be found without rolling it. Never throws. */
export function validateTemplate(q: TemplateLike): string[] {
  try {
    const t = q.template;
    if (!t) return ["This question has no template."];
    const problems: string[] = [];

    const names = [...t.givens.map((g) => g.name), ...t.derived.map((d) => d.name)];
    if (t.givens.length === 0) problems.push("Add at least one given value.");
    names.forEach((n, i) => {
      if (!NAME.test(n))
        problems.push(`"${n || "(blank)"}" is not a valid name. Use letters, digits, and _, starting with a letter.`);
      else if (
        RESERVED.has(n) ||
        (isMathName(n) && typeof (math as unknown as Record<string, unknown>)[n] === "function")
      )
        problems.push(`"${n}" is a built-in name. Pick another.`);
      else if (names.indexOf(n) !== i) problems.push(`The name "${n}" is used twice.`);
    });
    t.givens.forEach((g) => problems.push(...ruleProblems(g.rule, `Given ${g.name || "(blank)"}`)));

    const known = new Set<string>(t.givens.map((g) => g.name));
    t.derived.forEach((d) => {
      problems.push(...checkFormula(d.formula, known, `Derived ${d.name || "(blank)"}`));
      known.add(d.name);
    });
    t.constraints.forEach((c, i) => problems.push(...checkFormula(c, known, `Constraint ${i + 1}`)));

    if (t.stems.length === 0 || t.stems.some((s) => !s.trim())) problems.push("Write the question wording.");
    t.stems.forEach((s, i) => {
      const unknownSlots = slotsIn(s).filter((n) => !known.has(n));
      if (unknownSlots.length) problems.push(`Wording ${i + 1}: {${unknownSlots[0]}} is not a given or derived value.`);
    });

    if (q.choices.length < 2) problems.push("Add at least two choices.");
    q.choices.forEach((c, i) => problems.push(...checkFormula(c.text, known, `Choice ${String.fromCharCode(65 + i)}`)));
    if (!q.choices.some((c) => c.id === q.correctChoiceId)) problems.push("Mark exactly one choice as correct.");

    if (!Number.isInteger(t.format.sigFigs) || t.format.sigFigs < 1 || t.format.sigFigs > 8)
      problems.push("Significant figures must be a whole number from 1 to 8.");
    return problems;
  } catch {
    return ["This template is damaged."];
  }
}

// ---------------------------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------------------------

export interface Rolled {
  /** Values drawn for the givens, then the derived ones. */
  values: Record<string, number>;
  stem: string;
  stemIndex: number;
  choices: Choice[];
  correctChoiceId: string;
  /** The numeric value of every choice, for the editor's preview. */
  choiceValues: number[];
}

export type RollResult = { ok: true; rolled: Rolled; tries: number } | { ok: false; reason: string; tries: number };

function evalNumber(expr: string, scope: Record<string, number>): number {
  const r = mathEvaluate(expr, { ...scope }) as unknown;
  if (typeof r !== "number" || !Number.isFinite(r)) throw new Error("not a finite number");
  return r;
}

function evalCondition(expr: string, scope: Record<string, number>): boolean {
  const r = mathEvaluate(expr, { ...scope }) as unknown;
  if (typeof r !== "boolean") throw new Error("must be a yes-or-no condition");
  return r;
}

function tooClose(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs(a - b) <= CONFIG.minChoiceSpacing * Math.max(Math.abs(a), Math.abs(b));
}

function fillStem(stem: string, t: ComputationTemplate, values: Record<string, number>): string {
  const units = new Map<string, { unit: string; sig: number; notation: AnswerFormat["notation"] }>();
  t.givens.forEach((g) => units.set(g.name, { unit: g.unit, sig: 4, notation: "engineering" }));
  t.derived.forEach((d) => units.set(d.name, { unit: d.unit, sig: t.format.sigFigs, notation: t.format.notation }));
  return stem.replace(SLOT, (whole, name: string) => {
    const f = units.get(name);
    return f && name in values ? formatQuantity(values[name], f.unit, f.sig, f.notation) : whole;
  });
}

/**
 * Rolls fresh values and builds one concrete question. Re-rolls when a constraint fails, a formula has no
 * finite answer, or two choices land too close together. Gives up after `maxRolls` tries.
 */
export function rollQuestion(
  q: TemplateLike,
  rand: () => number = Math.random,
  maxTries: number = CONFIG.maxRolls,
): RollResult {
  const problems = validateTemplate(q);
  if (problems.length) return { ok: false, reason: problems[0], tries: 0 };
  const t = q.template as ComputationTemplate;
  let reason = "no roll worked";

  for (let tries = 1; tries <= maxTries; tries++) {
    try {
      const scope: Record<string, number> = {};
      for (const g of t.givens) scope[g.name] = drawValue(g.rule, rand);
      for (const d of t.derived) scope[d.name] = evalNumber(d.formula, scope);

      if (!t.constraints.every((c) => evalCondition(c, scope))) {
        reason = "the constraints rejected every roll";
        continue;
      }

      const values = q.choices.map((c) => evalNumber(c.text, scope));
      const texts = values.map((v) => formatQuantity(v, t.format.unit, t.format.sigFigs, t.format.notation));
      let clash = new Set(texts).size !== texts.length;
      for (let i = 0; i < values.length && !clash; i++) {
        for (let j = i + 1; j < values.length; j++) if (tooClose(values[i], values[j])) clash = true;
      }
      if (clash) {
        reason = "two choices were too close together";
        continue;
      }

      const stemIndex = Math.floor(rand() * t.stems.length);
      return {
        ok: true,
        tries,
        rolled: {
          values: scope,
          stem: fillStem(t.stems[stemIndex], t, scope),
          stemIndex,
          choices: q.choices.map((c, i) => ({ id: c.id, text: texts[i] })),
          correctChoiceId: q.correctChoiceId,
          choiceValues: values,
        },
      };
    } catch (e) {
      reason = `a formula failed (${e instanceof Error ? e.message : "error"})`;
    }
  }
  return { ok: false, reason: `After ${maxTries} tries: ${reason}.`, tries: maxTries };
}

/** True when the template is valid and produces a question. */
export function isUsable(q: TemplateLike): boolean {
  return rollQuestion(q).ok;
}

// ---------------------------------------------------------------------------------------------
// Editor drafts
// ---------------------------------------------------------------------------------------------

export interface DraftChoice {
  id: string;
  formula: string;
  mistake: string;
}

export interface CompDraft {
  givens: Given[];
  derived: Derived[];
  constraints: string[];
  stems: string[];
  choices: DraftChoice[];
  format: AnswerFormat;
}

export function draftToQuestion(d: CompDraft, correctChoiceId: string | null): TemplateLike & { stem: string } {
  return {
    stem: d.stems[0] ?? "",
    choices: d.choices.map((c) => ({ id: c.id, text: c.formula })),
    correctChoiceId: correctChoiceId ?? "",
    template: {
      givens: d.givens,
      derived: d.derived,
      constraints: d.constraints,
      stems: d.stems,
      format: d.format,
      mistakes: Object.fromEntries(d.choices.filter((c) => c.mistake.trim()).map((c) => [c.id, c.mistake.trim()])),
    },
  };
}

export function draftFromQuestion(q: Pick<Question, "choices" | "template">): CompDraft | null {
  const t = q.template;
  if (!t) return null;
  return {
    givens: t.givens,
    derived: t.derived,
    constraints: t.constraints,
    stems: t.stems,
    choices: q.choices.map((c) => ({ id: c.id, formula: c.text, mistake: t.mistakes[c.id] ?? "" })),
    format: t.format,
  };
}