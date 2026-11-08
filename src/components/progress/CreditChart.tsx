"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_KEY, type CategorySeries } from "@/lib/analytics";
import {
  chartPoints,
  fitRange,
  periodsIn,
  periodStart,
  timeDomain,
  type ChartPoint,
  type Measure,
  type TimeAxis,
} from "@/lib/chartTime";
import { CONFIG } from "@/lib/config";
import { formatPercent } from "@/lib/format";

/** One colour per category. They stay apart for people with colour blindness. "All" is drawn in plain ink. */
const SERIES_VAR: Record<string, string> = {
  geas: "var(--s1)",
  esat: "var(--s2)",
  elex: "var(--s3)",
  math: "var(--s4)",
  [ALL_KEY]: "var(--color-ink)",
};
const colorOf = (key: string) => SERIES_VAR[key] ?? "var(--color-accent)";
/** Colours for the subjects or topics you pick, in the order you add them. */
const PICK_VARS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)"];
const MAX_PICKED = PICK_VARS.length;

export type View = "category" | "subject" | "topic";

const VIEWS: { value: View; label: string }[] = [
  { value: "category", label: "Category" },
  { value: "subject", label: "Subject" },
  { value: "topic", label: "Topic" },
];

const AXES: { value: TimeAxis; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

const short = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const monthName = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short" });

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-line">
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1 text-sm ${i > 0 ? "border-l border-line" : ""} ${
              value === o.value ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-paper"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Line {
  s: CategorySeries;
  pts: ChartPoint[];
  color: string;
}

/** The line whose last quiz is the newest, so the chart opens on what you did most recently. */
function latestKey(lines: CategorySeries[]): string | undefined {
  let best: CategorySeries | undefined;
  for (const l of lines) {
    const at = l.points[l.points.length - 1]?.at ?? -Infinity;
    if (!best || at > (best.points[best.points.length - 1]?.at ?? -Infinity)) best = l;
  }
  return best?.key;
}

/** Chips for the picked subjects or topics, each with a ✕, and a dropdown to add another. */
function Picker({
  noun,
  lines,
  picked,
  onChange,
}: {
  noun: string;
  lines: CategorySeries[];
  picked: string[];
  onChange: (keys: string[]) => void;
}) {
  const byKey = new Map(lines.map((l) => [l.key, l]));
  const groups = new Map<string, CategorySeries[]>();
  for (const l of lines) {
    if (picked.includes(l.key)) continue;
    const g = l.group ?? "";
    groups.set(g, [...(groups.get(g) ?? []), l]);
  }
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`${noun}s to show`}>
      {picked.map((key, i) => {
        const l = byKey.get(key);
        if (!l) return null;
        const last = l.points[l.points.length - 1];
        const c = PICK_VARS[i];
        return (
          <span
            key={key}
            title={l.group ? `${l.group} › ${l.name}` : l.name}
            className="inline-flex max-w-[18rem] items-center gap-2 rounded-full border bg-surface py-1 pr-1 pl-2 text-sm"
            style={{ borderColor: c }}
          >
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c }} aria-hidden="true" />
            <span className="truncate">{l.name}</span>
            <span className="text-xs text-muted tabular-nums">{last ? formatPercent(last.avg, 0) : "–"}</span>
            <button
              type="button"
              aria-label={`Hide ${l.name}`}
              className="inline-flex size-5 items-center justify-center rounded-full text-muted hover:bg-paper hover:text-ink"
              onClick={() => onChange(picked.filter((k) => k !== key))}
            >
              ✕
            </button>
          </span>
        );
      })}
      {picked.length < MAX_PICKED && groups.size > 0 && (
        <select
          aria-label={`Add a ${noun} to the chart`}
          className="input w-auto py-1"
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...picked, e.target.value]);
          }}
        >
          <option value="">{picked.length ? `+ Add another ${noun}` : `Pick a ${noun}`}</option>
          {Array.from(groups.entries()).map(([g, ls]) => (
            <optgroup key={g} label={g || "Other"}>
              {ls.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
      {picked.length >= MAX_PICKED && (
        <span className="text-xs text-muted">Up to {MAX_PICKED} at once. Remove one to add another.</span>
      )}
    </div>
  );
}

export default function CreditChart({
  series,
  subjects,
  topics,
  bar,
}: {
  /** One line per category, with "All" last. */
  series: CategorySeries[];
  subjects: CategorySeries[];
  topics: CategorySeries[];
  bar: number;
}) {
  const [axis, setAxis] = useState<TimeAxis>("day");
  const [view, setView] = useState<View>("category");
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(series.map((s) => [s.key, s.key !== ALL_KEY])),
  );
  // The subjects and topics you picked. Until you pick, the one quizzed most recently is shown.
  const [pickedSubjects, setPickedSubjects] = useState<string[] | null>(null);
  const [pickedTopics, setPickedTopics] = useState<string[] | null>(null);
  const subjectKeys = useMemo(
    () => pickedSubjects ?? [latestKey(subjects)].filter((k): k is string => !!k),
    [pickedSubjects, subjects],
  );
  const topicKeys = useMemo(
    () => pickedTopics ?? [latestKey(topics)].filter((k): k is string => !!k),
    [pickedTopics, topics],
  );
  const [active, setActive] = useState<{ key: string; x: number } | null>(null);
  const [width, setWidth] = useState(640);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = width;
  const H = 280;
  const pad = { l: 44, r: 46, t: 14, b: 34 };
  const plotR = W - pad.r;
  const base = H - pad.b;

  // Categories and subjects show their average across their topics. A topic shows each quiz's own score.
  const measure: Measure = view === "topic" ? "result" : "average";

  const { domain, lines, fit } = useMemo(() => {
    let chosen: { s: CategorySeries; color: string }[];
    if (view === "category") {
      chosen = series.filter((s) => on[s.key]).map((s) => ({ s, color: colorOf(s.key) }));
    } else {
      const pool = view === "subject" ? subjects : topics;
      const keys = view === "subject" ? subjectKeys : topicKeys;
      chosen = keys.flatMap((k, i) => {
        const s = pool.find((l) => l.key === k);
        return s ? [{ s, color: PICK_VARS[i] }] : [];
      });
    }
    const domain = timeDomain(chosen.flatMap((c) => c.s.points));
    const lines: Line[] = chosen.map((c) => ({ ...c, pts: chartPoints(c.s.points, axis, measure, domain) }));
    const fit = fitRange(
      lines.flatMap((l) => l.pts.map((p) => p.v)),
      [bar, CONFIG.minimumPass],
    );
    return { domain, lines, fit };
  }, [series, subjects, topics, view, on, subjectKeys, topicKeys, axis, measure, bar]);

  const x = (ms: number) => pad.l + ((ms - domain[0]) / (domain[1] - domain[0])) * (plotR - pad.l);
  const y = (v: number) => pad.t + (1 - (v - fit.lo) / (1 - fit.lo)) * (base - pad.t);

  const shown = lines.filter((l) => l.pts.length > 0);
  const hits = shown.flatMap((l) => l.pts.map((p) => ({ line: l, p, px: x(p.x), py: y(p.v) })));
  const activeHit = active ? hits.find((h) => h.line.s.key === active.key && h.p.x === active.x) : undefined;
  const halo = { paintOrder: "stroke", stroke: "var(--color-surface)", strokeWidth: 3 } as const;

  function nearest(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const k = W / box.width;
    const vx = (e.clientX - box.left) * k;
    const vy = (e.clientY - box.top) * k;
    let best: (typeof hits)[number] | null = null;
    let bd = Infinity;
    for (const h of hits) {
      const d = Math.hypot(h.px - vx, (h.py - vy) * 0.6);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best && bd < 46 ? { key: best.line.s.key, x: best.p.x } : null;
  }

  function onKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    const order = [...hits].sort((a, b) => a.p.x - b.p.x || a.px - b.px);
    if (order.length === 0) return;
    let i = activeHit ? order.indexOf(activeHit) : -1;
    if (e.key === "ArrowRight") i = Math.min(order.length - 1, i + 1);
    else if (e.key === "ArrowLeft") i = i < 0 ? order.length - 1 : Math.max(0, i - 1);
    else if (e.key === "Escape") {
      setActive(null);
      return;
    } else return;
    e.preventDefault();
    setActive({ key: order[i].line.s.key, x: order[i].p.x });
  }

  // grid
  const stepPct = Math.round(fit.step * 100);
  const ticks: number[] = [];
  for (let t = Math.round(fit.lo * 100); t <= 100; t += stepPct) ticks.push(t);

  // end labels, nudged apart so they never sit on top of each other
  // Only categories have short names, so only they are written at the end of their lines.
  const ends = (view === "category" ? shown : [])
    .map((l) => ({ key: l.s.key, name: l.s.key === ALL_KEY ? "ALL" : l.s.name, y: y(l.pts[l.pts.length - 1].v) + 3.5 }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;

  const bands = axis === "day" ? [] : periodsIn(domain, axis);
  const quizDays = axis === "day" ? Array.from(new Set(hits.map((h) => h.p.x))) : [];
  const xLabels = [0.06, 0.28, 0.5, 0.72, 0.94].map((f) => domain[0] + f * (domain[1] - domain[0]));

  // tooltip text
  const tip = activeHit ? describe(activeHit.line, activeHit.p, axis, measure) : null;

  return (
    <div className="credit-chart space-y-3">
      <style>{`.credit-chart{--s1:#2a78d6;--s2:#eda100;--s3:#6250d6;--s4:#e87ba4;--s5:#1a9a8a;--s6:#8a6a3a}:root[data-theme="dark"] .credit-chart{--s1:#3987e5;--s2:#c98500;--s3:#9085e9;--s4:#d55181;--s5:#2bb5a3;--s6:#b8935a}`}</style>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Segmented
          label="Time axis"
          value={axis}
          options={AXES}
          onChange={(v) => {
            setAxis(v);
            setActive(null);
          }}
        />
        <Segmented
          label="View by"
          value={view}
          options={VIEWS}
          onChange={(v) => {
            setView(v);
            setActive(null);
          }}
        />
      </div>

      {view === "subject" && (
        <Picker noun="subject" lines={subjects} picked={subjectKeys} onChange={setPickedSubjects} />
      )}
      {view === "topic" && <Picker noun="topic" lines={topics} picked={topicKeys} onChange={setPickedTopics} />}
      {view === "category" && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Categories to show">
          {series.map((s) => {
            const last = s.points[s.points.length - 1];
            const isOn = !!on[s.key];
            const c = colorOf(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={isOn}
                title={`${s.name}. Click to show or hide. Double-click to show only this one.`}
                onClick={() => setOn((o) => ({ ...o, [s.key]: !o[s.key] }))}
                onDoubleClick={() => setOn(Object.fromEntries(series.map((o) => [o.key, o.key === s.key])))}
                className={`inline-flex items-center gap-2 rounded-full border bg-surface py-1 pl-2 pr-3 text-sm ${
                  s.key === ALL_KEY ? "ml-2" : ""
                } ${isOn ? "" : "text-muted"}`}
                style={{ borderColor: isOn ? c : "var(--color-line)" }}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full border-2"
                  style={{ borderColor: c, background: isOn ? c : "transparent" }}
                  aria-hidden="true"
                />
                {s.key === ALL_KEY ? "All" : s.name}
                <span className="text-xs tabular-nums text-muted">{last ? formatPercent(last.avg, 0) : "–"}</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted">{noteFor(axis, view)}</p>

      <div ref={stage} className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full select-none"
          role="img"
          aria-label={`Credit score over time, one line per ${view}. Use the left and right arrow keys to step through the points.`}
          tabIndex={0}
          onPointerMove={(e) => setActive(nearest(e))}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          {bands.map((b, i) =>
            i % 2 === 0 ? (
              <rect
                key={b.start}
                x={x(b.start)}
                y={pad.t}
                width={x(b.end) - x(b.start)}
                height={base - pad.t}
                fill="var(--color-paper)"
              />
            ) : null,
          )}
          {bands.map((b) => {
            if (x(b.end) - x(b.start) <= 38) return null;
            return (
              <text
                key={`l${b.start}`}
                x={(x(b.start) + x(b.end)) / 2}
                y={H - 12}
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-muted)"
              >
                {axis === "week" ? short(periodStart(b.start, "week")) : monthName(b.start)}
              </text>
            );
          })}

          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.l}
                x2={plotR}
                y1={y(t / 100)}
                y2={y(t / 100)}
                stroke="var(--color-line)"
                strokeWidth="1"
                opacity={t % 50 === 0 ? 1 : 0.55}
              />
              <text x={pad.l - 7} y={y(t / 100) + 3.5} textAnchor="end" fontSize="10" fill="var(--color-muted)">
                {t}%
              </text>
            </g>
          ))}
          <line x1={pad.l} x2={plotR} y1={base} y2={base} stroke="var(--color-line)" strokeWidth="1" />

          {axis === "day" &&
            xLabels.map((ms) => (
              <text key={ms} x={x(ms)} y={H - 12} textAnchor="middle" fontSize="10" fill="var(--color-muted)">
                {short(ms)}
              </text>
            ))}
          {quizDays.map((ms) => (
            <line key={ms} x1={x(ms)} x2={x(ms)} y1={base} y2={base + 4} stroke="var(--color-muted)" strokeWidth="1" />
          ))}

          <line
            x1={pad.l}
            x2={plotR}
            y1={y(bar)}
            y2={y(bar)}
            stroke="var(--color-good)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
          <text x={plotR - 2} y={y(bar) - 5} textAnchor="end" fontSize="10" fill="var(--color-good)" {...halo}>
            goal {Math.round(bar * 100)}%
          </text>
          <line
            x1={pad.l}
            x2={plotR}
            y1={y(CONFIG.minimumPass)}
            y2={y(CONFIG.minimumPass)}
            stroke="var(--color-danger)"
            strokeWidth="1.5"
          />
          <text
            x={plotR - 2}
            y={y(CONFIG.minimumPass) + 13}
            textAnchor="end"
            fontSize="10"
            fill="var(--color-danger)"
            {...halo}
          >
            minimum {Math.round(CONFIG.minimumPass * 100)}%
          </text>

          {shown.map((l) => {
            const c = l.color;
            const dim = active !== null && active.key !== l.s.key;
            // The dots pop in one after another, left to right. Then the line draws through them.
            const n = l.pts.length;
            const gap = n > 1 ? Math.min(0.12, 0.9 / (n - 1)) : 0;
            const lineAt = 0.3 + gap * (n - 1);
            // A new key replays the drawing when the axis, the view, or the line itself changes.
            const play = `${view}-${l.s.key}-${axis}`;
            return (
              <g key={play} opacity={dim ? 0.4 : 1}>
                {l.pts.length > 1 && (
                  <polyline
                    className="chart-line"
                    style={{ animationDelay: `${lineAt}s` }}
                    pathLength={1}
                    points={l.pts.map((p) => `${x(p.x)},${y(p.v)}`).join(" ")}
                    fill="none"
                    stroke={c}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                {l.pts.map((p, i) => {
                  const isActive = activeHit?.line === l && activeHit.p === p;
                  return (
                    <circle
                      key={p.x}
                      className="chart-dot"
                      style={{ animationDelay: `${i * gap}s` }}
                      cx={x(p.x)}
                      cy={y(p.v)}
                      r={isActive ? 6 : axis === "day" ? 3.5 : 4.5}
                      fill={c}
                      stroke={isActive ? "var(--color-surface)" : "none"}
                      strokeWidth="2"
                    />
                  );
                })}
              </g>
            );
          })}

          {shown.length === 0 && (
            <text
              x={(pad.l + plotR) / 2}
              y={pad.t + (base - pad.t) * 0.72}
              textAnchor="middle"
              fontSize="12"
              fill="var(--color-muted)"
              {...halo}
            >
              {view === "category"
                ? "Pick a category above to show its line."
                : `Pick a ${view} above to show its line.`}
            </text>
          )}
          {ends.map((e) => (
            <text key={e.key} x={plotR + 5} y={e.y} fontSize="10" fontWeight="600" fill="var(--color-ink)">
              {e.name}
            </text>
          ))}
          {activeHit && (
            <line
              x1={activeHit.px}
              x2={activeHit.px}
              y1={pad.t}
              y2={base}
              stroke="var(--color-muted)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.6"
            />
          )}
        </svg>

        {tip && activeHit && (
          <div
            className="pointer-events-none absolute z-10 w-max max-w-[17rem] rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg"
            style={{
              left: `${(activeHit.px / W) * 100}%`,
              top: `${Math.min(62, Math.max(32, (activeHit.py / H) * 100))}%`,
              transform: `translate(${activeHit.px > W * 0.55 ? "calc(-100% - 14px)" : "14px"}, -50%)`,
            }}
          >
            <TipBody tip={tip} color={activeHit.line.color} />
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {tip
          ? `${tip.name}${tip.value ? `: ${tip.value}` : ""}. ${tip.when}. ${tip.items.map((q) => `${q.when} ${q.label} ${q.credit}`).join(". ")}. ${tip.parts.map((q) => `${q.label} ${q.credit}`).join(". ")}`
          : ""}
      </p>
    </div>
  );
}

function noteFor(axis: TimeAxis, view: View): string {
  if (view === "topic") {
    return `Each dot is the average of a ${axis}'s quizzes on that topic.`;
  }
  const below = view === "category" ? "subject" : "topic";
  const when = `at the end of each ${axis}`;
  return `Each dot is the ${view}'s average ${when}: the latest score of every topic in it, averaged. Point at a dot to see that ${axis}'s quizzes and each ${below}'s score.`;
}

interface Tip {
  name: string;
  /** The dot's value. Left out when it is just the one quiz listed below. */
  value: string;
  /** What the value is, such as "Average". */
  valueLabel: string;
  /** "Thursday, Oct 29", "Week of Sep 7", "September 2026". */
  when: string;
  itemsTitle: string;
  items: { when: string; label: string; credit: string }[];
  more: number;
  /** What the average is made of at that point, such as each subject's score inside a category. */
  partsTitle: string;
  parts: { label: string; credit: string; n: number }[];
  more2: number;
}

const MAX_LISTED = 6;
const MAX_PARTS = 8;

function describe(line: Line, p: ChartPoint, axis: TimeAxis, measure: Measure): Tip {
  const when =
    axis === "week"
      ? `Week of ${short(p.start)}`
      : axis === "month"
        ? new Date(p.start).toLocaleDateString(undefined, { month: "long", year: "numeric" })
        : new Date(p.start).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  // On the daily axis the date is already in the heading, so each quiz shows its time instead.
  const at = (ms: number) =>
    axis === "day" ? new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : short(ms);
  const averaged = measure === "average";
  const lastQuiz = p.items[p.items.length - 1];
  const parts = averaged ? lastQuiz.parts : [];
  const by = lastQuiz.partsBy ?? "topic";
  return {
    name: line.s.name,
    value: averaged || p.items.length > 1 ? formatPercent(p.v) : "",
    valueLabel: averaged ? "Average" : "Average of these quizzes",
    when,
    itemsTitle: averaged ? (p.items.length === 1 ? "Quiz" : "Quizzes") : "",
    items: p.items
      .slice(0, MAX_LISTED)
      .map((q) => ({ when: at(q.at), label: q.label, credit: formatPercent(q.credit, 0) })),
    more: Math.max(0, p.items.length - MAX_LISTED),
    partsTitle: `Latest score by ${by}`,
    parts: parts.slice(0, MAX_PARTS).map((q) => ({
      label: q.label,
      credit: formatPercent(q.credit, 0),
      n: by === "topic" ? 0 : q.n,
    })),
    more2: Math.max(0, parts.length - MAX_PARTS),
  };
}

function TipBody({ tip, color }: { tip: Tip; color: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 font-semibold">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
        {tip.name}
      </p>
      {tip.value && (
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-lg font-semibold tabular-nums">{tip.value}</span>
          <span className="text-xs text-muted">{tip.valueLabel}</span>
        </p>
      )}
      {tip.when && <p className="mt-0.5 text-xs text-muted">{tip.when}</p>}
      {tip.itemsTitle && (
        <p className="mt-1.5 border-t border-line pt-1.5 text-[11px] tracking-wide text-muted uppercase">
          {tip.itemsTitle}
        </p>
      )}
      <ul className={`space-y-0.5 text-xs ${tip.itemsTitle ? "mt-0.5" : "mt-1.5 border-t border-line pt-1.5"}`}>
        {tip.items.map((q, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="min-w-0 text-muted">
              {q.when} · {q.label}
            </span>
            <span className="tabular-nums">{q.credit}</span>
          </li>
        ))}
        {tip.more > 0 && <li className="text-muted">+{tip.more} more</li>}
      </ul>
      {tip.parts.length > 0 && (
        <>
          <p className="mt-1.5 border-t border-line pt-1.5 text-[11px] tracking-wide text-muted uppercase">
            {tip.partsTitle}
          </p>
          <ul className="mt-0.5 space-y-0.5 text-xs">
            {tip.parts.map((q, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {q.label}
                  {q.n > 0 && (
                    <span className="text-muted">
                      {" "}
                      ({q.n} topic{q.n === 1 ? "" : "s"})
                    </span>
                  )}
                </span>
                <span className="tabular-nums">{q.credit}</span>
              </li>
            ))}
            {tip.more2 > 0 && <li className="text-muted">+{tip.more2} more</li>}
          </ul>
        </>
      )}
    </div>
  );
}