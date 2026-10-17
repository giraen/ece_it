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

const AXES: { value: TimeAxis; label: string }[] = [
  { value: "quiz", label: "Each quiz" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];
const MEASURES: { value: Measure; label: string }[] = [
  { value: "result", label: "Quiz result" },
  { value: "average", label: "Category average" },
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
}

export default function CreditChart({ series, bar }: { series: CategorySeries[]; bar: number }) {
  const [axis, setAxis] = useState<TimeAxis>("quiz");
  const [measure, setMeasure] = useState<Measure>("result");
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(series.map((s) => [s.key, s.key !== ALL_KEY])),
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

  const { domain, lines, fit } = useMemo(() => {
    const domain = timeDomain(series.flatMap((s) => s.points));
    const lines: Line[] = series.map((s) => ({ s, pts: chartPoints(s.points, axis, measure, domain) }));
    const fit = fitRange(
      lines.flatMap((l) => l.pts.map((p) => p.v)),
      [bar, CONFIG.minimumPass],
    );
    return { domain, lines, fit };
  }, [series, axis, measure, bar]);

  const x = (ms: number) => pad.l + ((ms - domain[0]) / (domain[1] - domain[0])) * (plotR - pad.l);
  const y = (v: number) => pad.t + (1 - (v - fit.lo) / (1 - fit.lo)) * (base - pad.t);

  const shown = lines.filter((l) => on[l.s.key] && l.pts.length > 0);
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
  const ends = shown
    .map((l) => ({ key: l.s.key, name: l.s.key === ALL_KEY ? "ALL" : l.s.name, y: y(l.pts[l.pts.length - 1].v) + 3.5 }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;

  const bands = axis === "quiz" ? [] : periodsIn(domain, axis);
  const quizDays = axis === "quiz" ? Array.from(new Set(hits.map((h) => h.p.x))) : [];
  const xLabels = [0.06, 0.28, 0.5, 0.72, 0.94].map((f) => domain[0] + f * (domain[1] - domain[0]));

  // tooltip text
  const tip = activeHit ? describe(activeHit.line, activeHit.p, axis, measure) : null;

  return (
    <div className="credit-chart space-y-3">
      <style>{`.credit-chart{--s1:#2a78d6;--s2:#eda100;--s3:#6250d6;--s4:#e87ba4}:root[data-theme="dark"] .credit-chart{--s1:#3987e5;--s2:#c98500;--s3:#9085e9;--s4:#d55181}`}</style>

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
          label="Line shows"
          value={measure}
          options={MEASURES}
          onChange={(v) => {
            setMeasure(v);
            setActive(null);
          }}
        />
      </div>

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
              <span className="text-xs tabular-nums text-muted">
                {last ? formatPercent(measureValue(last, measure), 0) : "–"}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted">{noteFor(axis, measure)}</p>

      <div ref={stage} className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full select-none"
          role="img"
          aria-label="Credit score over time, one line per category. Use the left and right arrow keys to step through the points."
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

          {axis === "quiz" &&
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
            const c = colorOf(l.s.key);
            const dim = active !== null && active.key !== l.s.key;
            // How far along the line each dot is, so each one appears just as the line reaches it.
            const px = l.pts.map((p) => [x(p.x), y(p.v)]);
            const cum = [0];
            for (let i = 1; i < px.length; i++) {
              cum.push(cum[i - 1] + Math.hypot(px[i][0] - px[i - 1][0], px[i][1] - px[i - 1][1]));
            }
            const total = cum[cum.length - 1] || 1;
            // A new key replays the drawing when the axis, the measure, or the line itself changes.
            const play = `${l.s.key}-${axis}-${measure}`;
            return (
              <g key={play} opacity={dim ? 0.4 : 1}>
                {axis !== "quiz" &&
                  l.s.points.map((p) => (
                    <circle key={p.at} cx={x(p.at)} cy={y(measureValue(p, measure))} r="2.5" fill={c} opacity="0.35" />
                  ))}
                {l.pts.length > 1 && (
                  <polyline
                    className="chart-line"
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
                      style={{ animationDelay: `${(cum[i] / total) * 1.1}s` }}
                      cx={x(p.x)}
                      cy={y(p.v)}
                      r={isActive ? 6 : axis === "quiz" ? 3.5 : 4.5}
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
              Pick a category above to show its line.
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
            <TipBody tip={tip} color={colorOf(activeHit.line.s.key)} />
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {tip
          ? `${tip.name}${tip.value ? `: ${tip.value}` : ""}. ${tip.when}. ${tip.items.map((q) => `${q.when} ${q.label} ${q.credit}`).join(". ")}`
          : ""}
      </p>
    </div>
  );
}

const measureValue = (p: { credit: number; avg: number }, m: Measure) => (m === "result" ? p.credit : p.avg);

function noteFor(axis: TimeAxis, measure: Measure): string {
  const unit = axis === "quiz" ? "quiz" : axis === "week" ? "week" : "month";
  if (axis === "quiz")
    return measure === "result" ? "Each dot is one quiz." : "Each dot is the category average after one quiz.";
  return measure === "result"
    ? `Each dot is the average of a ${unit}'s quizzes.`
    : `Each dot is the category average at the end of a ${unit}.`;
}

interface Tip {
  name: string;
  /** The dot's value. Left out when it is just the one quiz listed below. */
  value: string;
  /** "Week of Sep 7", "September 2026". Empty on the per-quiz axis. */
  when: string;
  items: { when: string; label: string; credit: string }[];
  more: number;
}

const MAX_LISTED = 6;

function describe(line: Line, p: ChartPoint, axis: TimeAxis, measure: Measure): Tip {
  const when =
    axis === "week"
      ? `Week of ${short(p.start)}`
      : axis === "month"
        ? new Date(p.start).toLocaleDateString(undefined, { month: "long", year: "numeric" })
        : "";
  return {
    name: line.s.name,
    value: p.items.length === 1 && measure === "result" ? "" : formatPercent(p.v),
    when,
    items: p.items
      .slice(0, MAX_LISTED)
      .map((q) => ({ when: short(q.at), label: q.label, credit: formatPercent(q.credit, 0) })),
    more: Math.max(0, p.items.length - MAX_LISTED),
  };
}

function TipBody({ tip, color }: { tip: Tip; color: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 font-semibold">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
        {tip.name}
      </p>
      {tip.value && <p className="mt-0.5 text-lg font-semibold tabular-nums">{tip.value}</p>}
      {tip.when && <p className="mt-0.5 text-xs text-muted">{tip.when}</p>}
      <ul className="mt-1.5 space-y-0.5 border-t border-line pt-1.5 text-xs">
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
    </div>
  );
}