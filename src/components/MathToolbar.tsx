"use client";

import { useEffect, useRef, useState } from "react";
import {
  cycleHeading,
  insertLink,
  insertMath,
  insertTable,
  prefixLines,
  wrapSelection,
  type Edit,
} from "@/lib/mathEdit";

type Action = (text: string, s: number, e: number) => Edit;

interface Item {
  label: string;
  title: string;
  run: Action;
  /** Shown in the button in a serif face, for maths symbols. */
  math?: boolean;
}

const maths = (label: string, title: string, template: string, group = false): Item => ({
  label,
  title,
  math: true,
  run: (t, s, e) => insertMath(t, s, e, template, group),
});

const FORMAT: Item[] = [
  { label: "B", title: "Bold (Ctrl+B)", run: (t, s, e) => wrapSelection(t, s, e, "**", "**", "bold") },
  { label: "I", title: "Italic (Ctrl+I)", run: (t, s, e) => wrapSelection(t, s, e, "*", "*", "italic") },
  { label: "H", title: "Heading: press again for a smaller one", run: cycleHeading },
  { label: "• List", title: "Bulleted list", run: (t, s, e) => prefixLines(t, s, e, "bullet") },
  { label: "1. List", title: "Numbered list", run: (t, s, e) => prefixLines(t, s, e, "number") },
  { label: "☑", title: "Checklist", run: (t, s, e) => prefixLines(t, s, e, "check") },
  { label: "❝", title: "Quote", run: (t, s, e) => prefixLines(t, s, e, "quote") },
  { label: "</>", title: "Code", run: (t, s, e) => wrapSelection(t, s, e, "`", "`", "code") },
  { label: "Table", title: "Table", run: insertTable },
  { label: "Link", title: "Link", run: insertLink },
];

const MAIN: Item[] = [
  maths("a⁄b", "Fraction", "‹a›/‹b›", true),
  maths("xⁿ", "Power", "‹x›^‹2›", true),
  maths("xₙ", 'Subscript (words go in quotes, like V_("out"))', '‹V›_("‹out›")', true),
  maths("√", "Square root", "sqrt(‹x›)"),
  maths("∫ₐᵇ", "Integral with limits", "int_‹a›^‹b› ‹f(x)› dx"),
  maths("lim", "Limit", "lim_(‹x->0›) ‹f(x)›"),
  maths("d/dx", "Derivative", "(d‹y›)/(d‹x›)"),
  maths("∂/∂x", "Partial derivative", "(del ‹f›)/(del ‹x›)"),
  maths("Σ", "Sum", "sum_(‹n=1›)^‹oo› ‹a_n›"),
];

const DEL: Item[] = [
  maths("∇f", "Gradient", "grad ‹f›"),
  maths("∇·F", "Divergence", "grad * ‹F›"),
  maths("∇×F", "Curl", "grad xx ‹F›"),
  maths("∇²f", "Laplacian", "grad^2 ‹f›"),
];

const MORE: Item[] = [
  maths("∫", "Integral, no limits", "int ‹f(x)› dx"),
  maths("∮", "Closed-loop integral", "oint ‹F› * dl"),
  maths("∬", "Double integral", "\\iint_‹D› ‹f›\\,dA"),
  maths("d²y/dx²", "Second derivative", "(d^2 ‹y›)/(d‹x›^2)"),
  maths("∂²f/∂x²", "Second partial derivative", "(del^2 ‹f›)/(del ‹x›^2)"),
  maths("lim x→∞", "Limit at infinity", "lim_(‹x->oo›) ‹f(x)›"),
  maths("∏", "Product", "prod_(‹i=1›)^‹n› ‹x_i›"),
  maths("ⁿ√", "Nth root", "root(‹3›)(‹x›)"),
  maths("|x|", "Absolute value", "abs(‹x›)"),
  maths("x⃗", "Vector", "vec ‹F›"),
  maths("x̂", "Unit vector", "hat ‹x›"),
  maths("x̄", "Bar", "bar ‹x›"),
  maths("ẋ", "Time derivative", "dot ‹x›"),
  maths("[ ]", "Matrix", "[[‹a›,‹b›],[‹c›,‹d›]]"),
];

const word = (label: string, w: string): Item => ({
  label,
  title: w,
  math: true,
  run: (t, s, e) => insertMath(t, s, e, `‹${w}›`),
});

const GREEK: Item[] = [
  ["α", "alpha"],
  ["β", "beta"],
  ["γ", "gamma"],
  ["δ", "delta"],
  ["ε", "epsilon"],
  ["θ", "theta"],
  ["λ", "lambda"],
  ["μ", "mu"],
  ["π", "pi"],
  ["ρ", "rho"],
  ["σ", "sigma"],
  ["τ", "tau"],
  ["φ", "phi"],
  ["ω", "omega"],
  ["Δ", "Delta"],
  ["Φ", "Phi"],
  ["Σ", "Sigma"],
  ["Ω", "Omega"],
].map(([l, w]) => word(l, w));

const SYMBOLS: Item[] = [
  ["≤", "<="],
  ["≥", ">="],
  ["≠", "!="],
  ["≈", "~~"],
  ["±", "+-"],
  ["×", "xx"],
  ["·", "*"],
  ["∞", "oo"],
  ["→", "->"],
  ["⇒", "=>"],
  ["°", "^@"],
  ["∝", "prop"],
  ["∠", "/_"],
  ["∥", "||"],
].map(([l, w]) => word(l, w));

/** A button that opens a small panel of choices. */
function Palette({ label, items, run }: { label: string; items: Item[]; run: (a: Action) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={box} className="relative">
      <button
        type="button"
        className="btn px-2 py-0.5 text-xs"
        aria-haspopup="true"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        {label} ▾
      </button>
      {open && (
        <span className="absolute left-0 z-30 mt-1 flex w-60 flex-wrap gap-1 rounded-md border border-line bg-surface p-2 shadow-lg">
          {items.map((it) => (
            <button
              key={it.title + it.label}
              type="button"
              title={it.title}
              aria-label={it.title}
              className={`btn px-2 py-0.5 text-sm ${it.math ? "font-serif" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                run(it.run);
                setOpen(false);
              }}
            >
              {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * Buttons above a text box that insert formatting and maths at the cursor. Clicking never takes the focus away
 * from the box, so the selection stays where it was.
 */
export default function MathToolbar({ run, className = "" }: { run: (a: Action) => void; className?: string }) {
  const button = (it: Item) => (
    <button
      key={it.title}
      type="button"
      title={it.title}
      aria-label={it.title}
      className={`btn px-2 py-0.5 text-xs ${it.math ? "font-serif text-sm" : ""} ${it.label === "B" ? "font-bold" : ""} ${it.label === "I" ? "italic" : ""}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => run(it.run)}
    >
      {it.label}
    </button>
  );

  return (
    <div role="toolbar" aria-label="Formatting and maths" className={`flex flex-wrap items-center gap-1 ${className}`}>
      {FORMAT.map(button)}
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      {MAIN.map(button)}
      <Palette label="∇" items={DEL} run={run} />
      <Palette label="α β" items={GREEK} run={run} />
      <Palette label="≤ ±" items={SYMBOLS} run={run} />
      <Palette label="More" items={MORE} run={run} />
    </div>
  );
}