"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Given, ValueRule } from "@/lib/db";
import { slotsIn, type CompDraft, type RollResult } from "@/lib/computation";
import { newId } from "@/lib/ids";
import ImageTextarea from "./ImageTextarea";
import RichText from "./RichText";
import InfoTip from "./InfoTip";

const letter = (i: number) => String.fromCharCode(65 + i);

const RULE_LABEL: Record<ValueRule["kind"], string> = {
  list: "A list of values",
  range: "A range with a step",
  eseries: "Standard E-series values",
  int: "A whole number",
  decimal: "A decimal number",
};

function defaultRule(kind: ValueRule["kind"]): ValueRule {
  switch (kind) {
    case "list":
      return { kind, values: [] };
    case "range":
      return { kind, from: "", to: "", step: "" };
    case "eseries":
      return { kind, series: "E12", from: "", to: "" };
    case "int":
      return { kind, from: "", to: "" };
    case "decimal":
      return { kind, from: "", to: "", decimals: 2 };
  }
}

function RuleFields({ rule, onChange }: { rule: ValueRule; onChange: (r: ValueRule) => void }) {
  const small = "input w-24";
  switch (rule.kind) {
    case "list":
      return (
        <input
          className="input w-72"
          aria-label="Rule values"
          placeholder="10m, 22m, 47m, 100m"
          value={rule.values.join(", ")}
          onChange={(e) =>
            onChange({
              kind: "list",
              values: e.target.value
                .split(",")
                .map((v) => v.trim())
                .filter((v, i, a) => v !== "" || i < a.length - 1),
            })
          }
        />
      );
    case "range":
      return (
        <span className="flex flex-wrap gap-1.5">
          <input
            className={small}
            aria-label="Rule from"
            placeholder="from"
            value={rule.from}
            onChange={(e) => onChange({ ...rule, from: e.target.value })}
          />
          <input
            className={small}
            aria-label="Rule to"
            placeholder="to"
            value={rule.to}
            onChange={(e) => onChange({ ...rule, to: e.target.value })}
          />
          <input
            className={small}
            aria-label="Rule step"
            placeholder="step"
            value={rule.step}
            onChange={(e) => onChange({ ...rule, step: e.target.value })}
          />
        </span>
      );
    case "eseries":
      return (
        <span className="flex flex-wrap gap-1.5">
          <select
            className="input w-24"
            aria-label="Rule series"
            value={rule.series}
            onChange={(e) => onChange({ ...rule, series: e.target.value as "E6" | "E12" | "E24" })}
          >
            <option>E6</option>
            <option>E12</option>
            <option>E24</option>
          </select>
          <input
            className={small}
            aria-label="Rule from"
            placeholder="from"
            value={rule.from}
            onChange={(e) => onChange({ ...rule, from: e.target.value })}
          />
          <input
            className={small}
            aria-label="Rule to"
            placeholder="to"
            value={rule.to}
            onChange={(e) => onChange({ ...rule, to: e.target.value })}
          />
        </span>
      );
    case "int":
      return (
        <span className="flex flex-wrap gap-1.5">
          <input
            className={small}
            aria-label="Rule from"
            placeholder="from"
            value={rule.from}
            onChange={(e) => onChange({ ...rule, from: e.target.value })}
          />
          <input
            className={small}
            aria-label="Rule to"
            placeholder="to"
            value={rule.to}
            onChange={(e) => onChange({ ...rule, to: e.target.value })}
          />
        </span>
      );
    case "decimal":
      return (
        <span className="flex flex-wrap gap-1.5">
          <input
            className={small}
            aria-label="Rule from"
            placeholder="from"
            value={rule.from}
            onChange={(e) => onChange({ ...rule, from: e.target.value })}
          />
          <input
            className={small}
            aria-label="Rule to"
            placeholder="to"
            value={rule.to}
            onChange={(e) => onChange({ ...rule, to: e.target.value })}
          />
          <input
            className="input w-20"
            aria-label="Rule decimals"
            inputMode="numeric"
            placeholder="places"
            value={String(rule.decimals)}
            onChange={(e) => onChange({ ...rule, decimals: Number(e.target.value) || 0 })}
          />
        </span>
      );
  }
}

interface Props {
  draft: CompDraft;
  setDraft: Dispatch<SetStateAction<CompDraft>>;
  correctId: string | null;
  setCorrectId: (id: string | null) => void;
  /** Problems found without rolling. Shown only once the author has asked for a check. */
  problems: string[];
  showProblems: boolean;
  onRoll: () => void;
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-md border border-line bg-surface p-4">
      <div className="flex items-center gap-1">
        <h3 className="text-sm font-medium">{title}</h3>
        {hint && <InfoTip>{hint}</InfoTip>}
      </div>
      {children}
    </section>
  );
}

export function blankDraft(): CompDraft {
  return {
    givens: [{ id: newId(), name: "A", unit: "", rule: { kind: "int", from: "2", to: "9" } }],
    derived: [],
    constraints: [],
    stems: [""],
    choices: Array.from({ length: 4 }, () => ({ id: newId(), formula: "", mistake: "" })),
    format: { unit: "", sigFigs: 3, notation: "engineering" },
  };
}

export default function ComputationEditor({
  draft,
  setDraft,
  correctId,
  setCorrectId,
  problems,
  showProblems,
  onRoll,
}: Props) {
  const patchGiven = (id: string, patch: Partial<Given>) =>
    setDraft((d) => ({ ...d, givens: d.givens.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));

  const names = [...draft.givens.map((g) => g.name), ...draft.derived.map((x) => x.name)].filter(Boolean);
  const found = Array.from(new Set(draft.stems.flatMap(slotsIn)));

  return (
    <div className="space-y-4">
      <Block
        title="Given values"
        hint="Values can use SI suffixes: 4.7k, 2.2u, 10m, 1M. The name is what you use in formulas and as {name} in the wording."
      >
        <div className="space-y-2">
          {draft.givens.map((g) => (
            <div key={g.id} className="flex flex-wrap items-start gap-2">
              <input
                className="input w-20"
                aria-label="Given name"
                placeholder="name"
                value={g.name}
                onChange={(e) => patchGiven(g.id, { name: e.target.value.trim() })}
              />
              <input
                className="input w-20"
                aria-label="Given unit"
                placeholder="unit"
                value={g.unit}
                onChange={(e) => patchGiven(g.id, { unit: e.target.value })}
              />
              <select
                className="input w-52"
                aria-label="Value rule"
                value={g.rule.kind}
                onChange={(e) => patchGiven(g.id, { rule: defaultRule(e.target.value as ValueRule["kind"]) })}
              >
                {(Object.keys(RULE_LABEL) as ValueRule["kind"][]).map((k) => (
                  <option key={k} value={k}>
                    {RULE_LABEL[k]}
                  </option>
                ))}
              </select>
              <RuleFields rule={g.rule} onChange={(rule) => patchGiven(g.id, { rule })} />
              <button
                className="btn"
                aria-label={`Remove given ${g.name}`}
                onClick={() => setDraft((d) => ({ ...d, givens: d.givens.filter((x) => x.id !== g.id) }))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          className="btn"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              givens: [...d.givens, { id: newId(), name: "", unit: "", rule: { kind: "int", from: "", to: "" } }],
            }))
          }
        >
          Add given
        </button>
      </Block>

      <Block
        title="Derived values (optional)"
        hint="Values worked out from the givens, in order. Later ones can use earlier ones. Example: XL = 2*pi*f*L"
      >
        {draft.derived.map((x) => (
          <div key={x.id} className="flex flex-wrap items-start gap-2">
            <input
              className="input w-20"
              aria-label="Derived name"
              placeholder="name"
              value={x.name}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  derived: d.derived.map((y) => (y.id === x.id ? { ...y, name: e.target.value.trim() } : y)),
                }))
              }
            />
            <input
              className="input w-20"
              aria-label="Derived unit"
              placeholder="unit"
              value={x.unit}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  derived: d.derived.map((y) => (y.id === x.id ? { ...y, unit: e.target.value } : y)),
                }))
              }
            />
            <span className="mt-1.5 text-muted">=</span>
            <input
              className="input min-w-64 flex-1 font-mono"
              aria-label="Derived formula"
              placeholder="2*pi*f*L"
              value={x.formula}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  derived: d.derived.map((y) => (y.id === x.id ? { ...y, formula: e.target.value } : y)),
                }))
              }
            />
            <button
              className="btn"
              aria-label={`Remove derived ${x.name}`}
              onClick={() => setDraft((d) => ({ ...d, derived: d.derived.filter((y) => y.id !== x.id) }))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          className="btn"
          onClick={() =>
            setDraft((d) => ({ ...d, derived: [...d.derived, { id: newId(), name: "", unit: "", formula: "" }] }))
          }
        >
          Add derived value
        </button>
      </Block>

      <Block
        title="Constraints (optional)"
        hint="Conditions every roll must meet, such as R1 != R2 or XL > XC. Rolls that fail are thrown away."
      >
        {draft.constraints.map((c, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="input flex-1 font-mono"
              aria-label="Constraint"
              value={c}
              onChange={(e) =>
                setDraft((d) => ({ ...d, constraints: d.constraints.map((x, j) => (j === i ? e.target.value : x)) }))
              }
            />
            <button
              className="btn"
              aria-label={`Remove constraint ${i + 1}`}
              onClick={() => setDraft((d) => ({ ...d, constraints: d.constraints.filter((_, j) => j !== i) }))}
            >
              Remove
            </button>
          </div>
        ))}
        <button className="btn" onClick={() => setDraft((d) => ({ ...d, constraints: [...d.constraints, ""] }))}>
          Add constraint
        </button>
      </Block>

      <Block
        title="Question wording"
        hint="Write {R} where a value should appear, outside $...$ math. A brace right after a letter, _, ^ or } (as in X_{L} or \text{R}) is left alone as LaTeX. Add several wordings and one is picked at random each time."
      >
        {draft.stems.map((s, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1">
              <ImageTextarea
                label={`Wording ${i + 1}`}
                value={s}
                rows={3}
                onChange={(v) => setDraft((d) => ({ ...d, stems: d.stems.map((x, j) => (j === i ? v : x)) }))}
                placeholder="A series RLC circuit has R = {R}, L = {L}. Find the impedance."
              />
            </div>
            {draft.stems.length > 1 && (
              <button
                className="btn"
                aria-label={`Remove wording ${i + 1}`}
                onClick={() => setDraft((d) => ({ ...d, stems: d.stems.filter((_, j) => j !== i) }))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button className="btn" onClick={() => setDraft((d) => ({ ...d, stems: [...d.stems, ""] }))}>
          Add wording
        </button>
        {names.length > 0 && (
          <p className="text-xs text-muted">
            Available: {names.map((n) => `{${n}}`).join(" ")}.{" "}
            {found.length > 0
              ? `Used in the wording: ${found.map((n) => `{${n}}`).join(" ")}.`
              : "No values are used in the wording yet."}
          </p>
        )}
      </Block>

      <Block
        title="Choices"
        hint="Each choice is a formula. Mark the correct one. The other choices should model a specific mistake."
      >
        {draft.choices.map((c, i) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2">
            <input
              type="radio"
              name="comp-correct"
              aria-label={`Choice ${letter(i)} is correct`}
              checked={correctId === c.id}
              onChange={() => setCorrectId(c.id)}
            />
            <span className="w-4 text-sm font-medium text-muted">{letter(i)}</span>
            <input
              className="input min-w-64 flex-1 font-mono"
              aria-label={`Choice ${letter(i)} formula`}
              placeholder="sqrt(R^2 + (XL - XC)^2)"
              value={c.formula}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  choices: d.choices.map((x) => (x.id === c.id ? { ...x, formula: e.target.value } : x)),
                }))
              }
            />
            <button
              className="btn"
              disabled={draft.choices.length <= 2}
              aria-label={`Remove choice ${letter(i)}`}
              onClick={() => {
                setDraft((d) => ({ ...d, choices: d.choices.filter((x) => x.id !== c.id) }));
                if (correctId === c.id) setCorrectId(null);
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          className="btn"
          onClick={() =>
            setDraft((d) => ({ ...d, choices: [...d.choices, { id: newId(), formula: "", mistake: "" }] }))
          }
        >
          Add choice
        </button>
      </Block>

      <Block
        title="How answers are shown"
        hint="Engineering notation picks the SI prefix for you, so 3180 Ω shows as 3.18 kΩ."
      >
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Answer unit</label>
            <input
              className="input w-24"
              aria-label="Answer unit"
              placeholder="Ω"
              value={draft.format.unit}
              onChange={(e) => setDraft((d) => ({ ...d, format: { ...d.format, unit: e.target.value } }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Significant figures</label>
            <input
              className="input w-24"
              aria-label="Significant figures"
              inputMode="numeric"
              value={String(draft.format.sigFigs)}
              onChange={(e) =>
                setDraft((d) => ({ ...d, format: { ...d.format, sigFigs: Number(e.target.value) || 0 } }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Notation</label>
            <select
              className="input w-56"
              aria-label="Notation"
              value={draft.format.notation}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  format: { ...d.format, notation: e.target.value as "engineering" | "plain" },
                }))
              }
            >
              <option value="engineering">Engineering (k, m, µ…)</option>
              <option value="plain">Plain numbers</option>
            </select>
          </div>
        </div>
      </Block>

      {showProblems && problems.length > 0 && (
        <ul className="list-disc rounded-md border border-danger/40 bg-danger/5 py-2 pr-3 pl-7 text-sm text-danger">
          {problems.slice(0, 8).map((p) => (
            <li key={p}>{p}</li>
          ))}
          {problems.length > 8 && <li>…and {problems.length - 8} more.</li>}
        </ul>
      )}

      <button className="btn btn-primary" onClick={onRoll}>
        Roll a preview
      </button>
    </div>
  );
}

/** What the last preview roll produced, for the side panel. */
export function RollPreview({ result }: { result: RollResult | null }) {
  if (!result) {
    return <p className="text-sm text-muted">Choose “Roll a preview” to see a real question made from the recipe.</p>;
  }
  if (!result.ok) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
        <p className="font-medium">This recipe cannot make a question yet.</p>
        <p>{result.reason}</p>
      </div>
    );
  }
  const { rolled } = result;
  return (
    <div className="rounded-md border border-line border-l-4 border-l-accent bg-surface p-5">
      <RichText text={rolled.stem} className="text-[15px] leading-relaxed" />
      <ol className="mt-4 space-y-2">
        {rolled.choices.map((c, i) => {
          const right = c.id === rolled.correctChoiceId;
          return (
            <li key={c.id} className={`rounded-md border px-3 py-2 ${right ? "border-good bg-good/5" : "border-line"}`}>
              <div className="flex gap-3">
                <span className="w-5 shrink-0 font-medium text-muted">{letter(i)}</span>
                <div className="min-w-0 flex-1">
                  <RichText text={c.text} className="text-[15px]" />
                </div>
                {right && <span className="text-xs font-medium text-good">Correct</span>}
              </div>
            </li>
          );
        })}
      </ol>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">
          Values drawn (found in {result.tries} {result.tries === 1 ? "try" : "tries"})
        </summary>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs">
          {Object.entries(rolled.values).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd>{Number(v.toPrecision(8))}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
