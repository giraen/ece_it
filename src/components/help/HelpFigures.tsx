"use client";

import { useMemo, useState } from "react";
import { CONFIG } from "@/lib/config";
import { rollQuestion } from "@/lib/computation";
import type { ComputationTemplate } from "@/lib/db";
import { formatPercent } from "@/lib/format";
import { SURENESS_LABEL, SURENESS_ORDER } from "@/lib/scoring";
import { RollPreview } from "./ComputationEditor";
import ImageTextarea from "./ImageTextarea";
import PracticeTag from "./PracticeTag";
import Reference from "./Reference";
import RichText from "./RichText";
import Sparkline from "./Sparkline";
import ToolbarGroup from "./ToolbarGroup";

/**
 * Pictures for the Help page. Some are live: the text boxes, the maths, and the rolled question are the real parts of
 * the site, so they look and behave the same here. The others copy the look of a screen and cannot be clicked, so
 * nothing in your bank can change from this page.
 */

export function Figure({
  title,
  live,
  children,
  caption,
}: {
  title: string;
  /** True when the parts inside really work. */
  live?: boolean;
  children: React.ReactNode;
  caption?: React.ReactNode;
}) {
  return (
    <figure className="my-4 overflow-hidden rounded-md border border-line bg-paper">
      <figcaption className="flex items-center justify-between gap-2 border-b border-line bg-surface px-3 py-1.5 text-xs">
        <span className="font-medium">{title}</span>
        <span className={live ? "font-medium text-accent" : "text-muted"}>
          {live ? "Live example. Try it." : "Picture of the screen"}
        </span>
      </figcaption>
      <div className="p-4">{children}</div>
      {caption && <p className="border-t border-line px-3 py-2 text-xs text-muted">{caption}</p>}
    </figure>
  );
}

/** A copy of a screen: it looks the same, but cannot be used. */
function Still({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden="true" inert className="pointer-events-none pl-7 select-none">
      {children}
    </div>
  );
}

/** A callout that points at a part of a picture, written under it. */
export function Mark({ n }: { n: number }) {
  return (
    <span className="mr-1 inline-flex size-5 items-center justify-center rounded-full bg-accent text-xs font-medium text-white">
      {n}
    </span>
  );
}

function Badge({
  n,
  corner,
}: {
  n: number;
  /** Sits on the corner instead of beside the picture, for small things such as buttons. */ corner?: boolean;
}) {
  return (
    <span
      className={`absolute inline-flex size-5 items-center justify-center rounded-full bg-accent text-xs font-medium text-white ${
        corner ? "-top-2 -left-2" : "top-1 -left-7"
      }`}
    >
      {n}
    </span>
  );
}

/* ---------- Writing ---------- */

const PLAYGROUND = [
  "The **voltage** across the resistor is $V = I R$.",
  "",
  "The capacitor charges as $v(t) = V_s(1 - e^(-t/tau))$, where $tau = R C$. After one time constant it is at about 63%.",
  "",
  "- Click this box to see the toolbar float above it.",
  "- Select a word, then press B for bold.",
].join("\n");

export function MathPlayground() {
  const [text, setText] = useState(PLAYGROUND);
  return (
    <Figure
      title="A question box"
      live
      caption="Click into the box. The toolbar appears above it while you type. What you write on the left is exactly what the quiz shows on the right."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-sm font-medium">What you type</p>
          <ImageTextarea label="Practice box" rows={9} value={text} onChange={setText} />
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">What it looks like</p>
          <div className="rounded-md border border-line border-l-4 border-l-accent bg-surface p-4">
            <RichText text={text} className="text-[15px] leading-relaxed" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

const TYPED: { typed: string; note: string }[] = [
  { typed: "$\\frac{a + b}{c}$", note: "fraction" },
  { typed: "$x^2 + y^2$", note: "power" },
  { typed: "$sqrt(x^2 + 1)$", note: "square root" },
  { typed: '$V_("out") = 5$', note: "subscript" },
  { typed: "$(dy)/(dx) = 2x$", note: "derivative" },
  { typed: "$int_0^1 x^2 dx$", note: "definite integral" },
  { typed: "$sum_(n=1)^oo 1/n^2$", note: "sum" },
  { typed: "$lim_(x->0) (sin x)/x$", note: "limit" },
  { typed: "$vec F = m vec a$", note: "vector" },
  { typed: "$root(3)(x)$", note: "higher root" },
  { typed: "$30^@$ and $50%$", note: "degree and percent" },
  { typed: "$100 mu F$ and $4.7 k Omega$", note: "Symbols" },
];

export function TypedTable() {
  return (
    <Figure
      title="Typing maths"
      live
      caption="Put a formula between dollar signs. Letters in a formula are written the quick way. If you already know LaTeX, that works too, and is left exactly as you wrote it."
    >
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th className="py-1 pr-3 font-medium">What it is</th>
            <th className="py-1 pr-3 font-medium">You type</th>
            <th className="py-1 font-medium">You get</th>
          </tr>
        </thead>
        <tbody>
          {TYPED.map((r) => (
            <tr key={r.typed} className="border-b border-line/60 last:border-0">
              <td className="py-1.5 pr-3 text-muted">{r.note}</td>
              <td className="py-1.5 pr-3">
                <code className="rounded bg-surface px-1 py-0.5 text-[13px]">{r.typed}</code>
              </td>
              <td className="py-1.5">
                <RichText text={r.typed} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Figure>
  );
}

export function ChoicesDemo() {
  const [a, setA] = useState("$R_1 + R_2$");
  const [b, setB] = useState("$R_1 R_2$");
  const [c, setC] = useState("$(R_1 R_2)/(R_1 + R_2)$");
  return (
    <Figure
      title="Choices with one toolbar"
      live
      caption="Over the choices there is one toolbar. Click a choice, then press a button, and it goes into that choice."
    >
      <ToolbarGroup>
        <div className="space-y-2">
          {[
            ["A", a, setA],
            ["B", b, setB],
            ["C", c, setC],
          ].map(([letter, value, set]) => (
            <div key={letter as string} className="flex items-start gap-2">
              <span className="mt-2 w-5 text-sm font-medium text-muted">{letter as string}</span>
              <div className="min-w-0 flex-1">
                <ImageTextarea
                  label={`Choice ${letter as string}`}
                  rows={1}
                  value={value as string}
                  onChange={set as (v: string) => void}
                />
              </div>
            </div>
          ))}
        </div>
      </ToolbarGroup>
    </Figure>
  );
}

/* ---------- Computation ---------- */

const DEMO: { template: ComputationTemplate; choices: { id: string; text: string }[]; correctChoiceId: string } = {
  choices: [
    { id: "a", text: "V/R1 + V/R2" },
    { id: "b", text: "V/(R1 + R2)" },
    { id: "c", text: "V * (R1 + R2)" },
    { id: "d", text: "V/R1" },
  ],
  correctChoiceId: "a",
  template: {
    givens: [
      { id: "g1", name: "R1", unit: "Ω", rule: { kind: "list", values: ["100", "220", "470", "1000"] } },
      { id: "g2", name: "R2", unit: "Ω", rule: { kind: "list", values: ["330", "680", "2200"] } },
      { id: "g3", name: "V", unit: "V", rule: { kind: "list", values: ["5", "9", "12"] } },
    ],
    derived: [],
    constraints: [],
    stems: ["A {V} source is connected across {R1} and {R2} in parallel. What is the total current drawn?"],
    format: { unit: "A", sigFigs: 3, notation: "engineering" },
    mistakes: {},
  } as unknown as ComputationTemplate,
};

export function RollDemo() {
  const [n, setN] = useState(0);
  // Rolled again each time the button is pressed. The first roll happens once the page is on screen.
  const result = useMemo(() => {
    void n;
    return rollQuestion(DEMO);
  }, [n]);
  return (
    <Figure
      title="A dynamic question, rolled"
      live
      caption="This is one recipe. Each press makes a new question with new numbers, and the choices follow the numbers."
    >
      <RollPreview result={result} />
      <button className="btn mt-3" onClick={() => setN((x) => x + 1)}>
        Roll again
      </button>
    </Figure>
  );
}

/* ---------- References ---------- */

export function ReferenceStill() {
  return (
    <Figure
      title="Picking a source"
      caption={
        <>
          <Mark n={1} />
          Pick a saved source. <Mark n={2} />
          Type only the page or problem. <Mark n={3} />
          This is the text that is saved on the question.
        </>
      }
    >
      <Still>
        <div className="max-w-xl space-y-2">
          <div className="relative flex gap-2">
            <Badge n={1} />
            <div className="input flex-1">Gonzalez, Electronics Vol. 2, 3rd ed. (2019), Pearson</div>
            <span className="btn">Manage sources</span>
          </div>
          <div className="relative">
            <Badge n={2} />
            <div className="input w-full">p. 143, Problem 5</div>
          </div>
          <div className="relative">
            <Badge n={3} />
            <Reference text="Gonzalez, Electronics Vol. 2, 3rd ed. (2019), Pearson, p. 143, Problem 5" />
          </div>
        </div>
      </Still>
    </Figure>
  );
}

export function ReferenceLive() {
  return (
    <Figure title="How a reference shows" live>
      <div className="space-y-2">
        <Reference text="Gonzalez, Electronics Vol. 2, 3rd ed. (2019), Pearson, p. 143, Problem 5" />
        <Reference text="Lecture notes, week 3, slide 12" />
        <Reference text="Khan Academy, RC circuits, https://www.khanacademy.org/science/electrical-engineering" />
      </div>
    </Figure>
  );
}

/* ---------- The bank ---------- */

function Row({
  depth,
  open,
  name,
  count,
  selected,
  shared,
}: {
  depth: number;
  open?: boolean | null;
  name: string;
  count: number;
  selected?: boolean;
  shared?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1 rounded-md py-1 pr-1 ${selected ? "bg-accent-soft" : ""}`}
      style={{ paddingLeft: depth * 16 + 4 }}
    >
      <span className="w-5 text-xs text-muted">{open === null || open === undefined ? "" : open ? "▾" : "▸"}</span>
      <span className={`min-w-0 flex-1 truncate text-sm ${selected || depth === 0 ? "font-medium" : ""}`}>{name}</span>
      {shared && (
        <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">shared</span>
      )}
      <span className="text-xs text-muted tabular-nums">{count}</span>
    </div>
  );
}

export function TreeStill() {
  return (
    <Figure
      title="The tree in the Bank"
      caption={
        <>
          <Mark n={1} />
          Four categories are always there. <Mark n={2} />
          Under them you add subjects, then topics. <Mark n={3} />
          Questions live in a topic, and the number counts everything under it.
        </>
      }
    >
      <Still>
        <div className="max-w-xs rounded-md border border-line bg-surface p-2">
          <div className="relative">
            <Badge n={1} />
            <Row depth={0} open name="ELEX" count={42} />
          </div>
          <div className="relative">
            <Badge n={2} />
            <Row depth={1} open name="Circuits" count={30} />
          </div>
          <div className="relative">
            <Badge n={3} />
            <Row depth={2} name="DC analysis" count={18} selected />
          </div>
          <Row depth={2} name="Transient analysis" count={12} />
          <Row depth={1} open={false} name="Electronics" count={12} shared />
          <Row depth={0} open={false} name="GEAS" count={0} />
          <Row depth={0} open={false} name="ESAT" count={0} />
          <Row depth={0} open={false} name="MATH" count={0} />
        </div>
      </Still>
    </Figure>
  );
}

/* ---------- Quizzes ---------- */

export function QuizFormStill({ practice }: { practice?: boolean }) {
  const t = CONFIG.quiz.topic;
  return (
    <Figure
      title={practice ? "The two buttons" : "Starting a topic quiz"}
      caption={
        practice ? (
          <>
            <Mark n={1} />
            Start quiz can award mastery. <Mark n={2} />
            Practice never does, and it stays available while the topic is locked or mastered.
          </>
        ) : (
          <>
            <Mark n={1} />
            How many questions. <Mark n={2} />A topic quiz is always {t.totalMinutes} minutes. <Mark n={3} />
            Whether this quiz can award mastery.
          </>
        )
      }
    >
      <Still>
        <div className="max-w-xl space-y-4">
          <div>
            <p className="font-medium">ELEX › Circuits › DC analysis</p>
            <p className="text-sm text-muted">38 questions available</p>
          </div>
          {!practice && (
            <>
              <div className="relative">
                <Badge n={1} />
                <p className="mb-1 text-sm font-medium">Number of questions</p>
                <div className="input w-32">{t.defaultItems}</div>
                <p className="mt-1 text-xs text-muted">
                  From 1 to {t.maxItems}. Mastery needs {t.minItems} or more.
                </p>
              </div>
              <div className="relative">
                <Badge n={2} />
                <p className="mb-1 text-sm font-medium">Total time</p>
                <p className="text-sm">
                  1 hour <span className="text-muted">(always the same for a topic quiz)</span>
                </p>
              </div>
              <div className="relative rounded-md border border-good/40 bg-good/5 p-3 text-sm text-good">
                <Badge n={3} />
                This quiz can award mastery if you reach the bar.
              </div>
            </>
          )}
          {practice && (
            <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
              Locked after a failed quiz. You can retake this topic in 18 h 20 min.
            </div>
          )}
          <div className="flex gap-2">
            <span className="btn btn-primary relative">
              {practice && <Badge n={1} corner />}
              Start quiz
            </span>
            <span className="btn relative">
              {practice && <Badge n={2} corner />}
              Practice
            </span>
            <span className="btn">Back</span>
          </div>
        </div>
      </Still>
    </Figure>
  );
}

export function QuestionStill() {
  return (
    <Figure
      title="A question in a quiz"
      caption={
        <>
          <Mark n={1} />
          Click a choice, or press its letter. <Mark n={2} />
          Say how sure you are, or press S, W, N, or J. <Mark n={3} />
          Confirm, or press Enter. After you confirm you cannot change the answer.
        </>
      }
    >
      <Still>
        <div className="max-w-2xl">
          <div className="mb-3 flex justify-between text-sm text-muted">
            <span>Question 4 of 30</span>
            <span className="tabular-nums">Question time 0:42 · target 2:00</span>
          </div>
          <div className="rounded-md border border-line border-l-4 border-l-accent bg-surface p-5">
            <RichText
              text="Two resistors, $R_1 = 100 Omega$ and $R_2 = 220 Omega$, are in parallel. What is the equivalent resistance?"
              className="text-[17px] leading-relaxed"
            />
          </div>
          <div className="mt-4 space-y-2">
            {[
              ["A", "$320 Omega$", false],
              ["B", "$68.8 Omega$", true],
              ["C", "$120 Omega$", false],
              ["D", "$22 k Omega$", false],
            ].map(([l, t, sel]) => (
              <div
                key={l as string}
                className={`relative flex gap-3 rounded-md border px-4 py-3 ${
                  sel ? "border-accent bg-accent-soft" : "border-line bg-surface"
                }`}
              >
                {l === "B" && <Badge n={1} />}
                <span className="w-5 font-medium text-muted">{l as string}</span>
                <RichText text={t as string} />
              </div>
            ))}
          </div>
          <div className="relative mt-5">
            <Badge n={2} />
            <p className="mb-2 text-sm font-medium">How sure are you?</p>
            <div className="flex flex-wrap gap-2">
              {SURENESS_ORDER.map((s) => (
                <span key={s} className={`btn ${s === "wise_guess" ? "border-accent bg-accent text-white" : ""}`}>
                  {SURENESS_LABEL[s]}
                </span>
              ))}
            </div>
          </div>
          <div className="relative mt-6">
            <Badge n={3} />
            <span className="btn btn-primary">
              Confirm and next <span className="ml-1 text-xs opacity-70">Enter</span>
            </span>
          </div>
        </div>
      </Still>
    </Figure>
  );
}

export function CreditTable() {
  return (
    <div className="my-4 overflow-hidden rounded-md border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-xs text-muted">
          <tr>
            <th className="px-3 py-1.5 font-medium">If you were…</th>
            <th className="px-3 py-1.5 font-medium">and you were right</th>
            <th className="px-3 py-1.5 font-medium">and you were wrong</th>
          </tr>
        </thead>
        <tbody>
          {SURENESS_ORDER.map((s) => (
            <tr key={s} className="border-t border-line">
              <td className="px-3 py-1.5">{SURENESS_LABEL[s]}</td>
              <td className="px-3 py-1.5 tabular-nums">{formatPercent(CONFIG.sureCredit[s], 0)} credit</td>
              <td className="px-3 py-1.5 tabular-nums">0 credit</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultsStill() {
  return (
    <Figure
      title="After a quiz"
      caption={
        <>
          <Mark n={1} />
          Passed or not, against the {formatPercent(CONFIG.passBar, 0)} bar. <Mark n={2} />
          What it did to mastery. <Mark n={3} />
          The totals. Below them is every question, with your answer, the right one, and the source.
        </>
      }
    >
      <Still>
        <div className="max-w-2xl space-y-3">
          <div>
            <p className="text-xl font-semibold">Results</p>
            <p className="font-medium">ELEX › Circuits › DC analysis</p>
          </div>
          <div className="relative rounded-md border border-good/40 bg-good/5 p-4 font-medium text-good">
            <Badge n={1} />
            Passed. You reached the {formatPercent(CONFIG.passBar, 0)} bar.
          </div>
          <div className="relative rounded-md border border-good/40 bg-good/5 p-3 text-sm">
            <Badge n={2} />
            <span className="font-medium text-good">Mastery earned.</span> This topic stays mastered until 27 Oct 2026.
          </div>
          <div className="relative grid grid-cols-3 gap-2">
            <Badge n={3} />
            {[
              ["96.3%", "Average credit"],
              ["28 of 30", "Correct"],
              ["41:12", "Time used"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-md border border-line bg-surface p-3">
                <p className="text-xl font-semibold tabular-nums">{v}</p>
                <p className="text-xs text-muted">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </Still>
    </Figure>
  );
}

export function PracticeResultStill() {
  return (
    <Figure
      title="A practice quiz in your results"
      caption="It is saved with the others and counted in your analytics, with a Practice label so you can tell it apart."
    >
      <Still>
        <div className="max-w-xl space-y-3">
          <p className="font-medium">
            ELEX › Circuits › DC analysis <PracticeTag />
          </p>
          <div className="rounded-md border border-line bg-surface p-3 text-sm">
            <span className="font-medium">Practice quiz.</span> It does not count toward mastery and it never locks
            anything. You can take the real quiz whenever you are ready.
          </div>
        </div>
      </Still>
    </Figure>
  );
}

export function MasteryStill() {
  const d = CONFIG.masteryDays;
  return (
    <Figure
      title="Mastery and the lock"
      caption={`Mastery lasts ${d.topic} days for a topic, ${d.subject} for a subject, and ${d.category} for a category. A failed quiz locks that item for ${CONFIG.cooldownHours} hours.`}
    >
      <Still>
        <div className="grid max-w-2xl gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-good/40 bg-good/5 p-3 text-sm">
            <p className="font-medium text-good">Mastered</p>
            <p className="text-xs text-muted">DC analysis · until 27 Oct</p>
          </div>
          <div className="rounded-md border border-line bg-surface p-3 text-sm">
            <p className="font-medium text-muted">Expired</p>
            <p className="text-xs text-muted">Transient analysis · quiz it again</p>
          </div>
          <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm">
            <p className="font-medium text-danger">Locked</p>
            <p className="text-xs text-muted">Retake in 18 h 20 min</p>
          </div>
        </div>
      </Still>
    </Figure>
  );
}

export function TrendLive() {
  return (
    <Figure
      title="Trend line"
      live
      caption="A small line like this shows how a topic's last quizzes went. It is drawn by the same code as in Analytics."
    >
      <div className="flex items-center gap-3 text-sm">
        <span className="w-40">DC analysis</span>
        <Sparkline values={[0.62, 0.7, 0.68, 0.81, 0.88, 0.93, 0.96]} />
        <span className="font-medium tabular-nums">96.0%</span>
      </div>
    </Figure>
  );
}