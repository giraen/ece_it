"use client";

import Link from "next/link";
import { byTag, byTopic, calibration, creditOverTime, observations, questionStats, summarize } from "@/lib/analytics";
import { CONFIG } from "@/lib/config";
import { formatDate, formatDuration, formatPercent, formatRatio } from "@/lib/format";
import { useAttempts } from "@/lib/hooks";
import { SURENESS_LABEL } from "@/lib/scoring";
import Sparkline from "./Sparkline";

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

function CreditChart({ points }: { points: { at: number; credit: number; scopeName: string }[] }) {
  const W = 640;
  const H = 150;
  const pad = { l: 36, r: 12, t: 10, b: 22 };
  const x = (i: number) =>
    pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - Math.min(1, Math.max(0, v))) * (H - pad.t - pad.b);
  const bar = y(CONFIG.passBar);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Credit score of each quiz over time">
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth="1" />
          <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--color-muted)">
            {Math.round(v * 100)}%
          </text>
        </g>
      ))}
      <line
        x1={pad.l}
        x2={W - pad.r}
        y1={bar}
        y2={bar}
        stroke="var(--color-good)"
        strokeWidth="1.5"
        strokeDasharray="5 4"
      />
      <text x={W - pad.r} y={bar - 4} textAnchor="end" fontSize="10" fill="var(--color-good)">
        mastery bar {Math.round(CONFIG.passBar * 100)}%
      </text>
      {points.length > 1 && (
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.credit)}`).join(" ")}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(p.credit)}
          r="3.5"
          fill={p.credit + 1e-9 >= CONFIG.passBar ? "var(--color-good)" : "var(--color-accent)"}
        >
          <title>{`${p.scopeName}: ${formatPercent(p.credit)} on ${formatDate(p.at)}`}</title>
        </circle>
      ))}
      <text x={pad.l} y={H - 6} fontSize="10" fill="var(--color-muted)">
        {formatDate(points[0].at)}
      </text>
      <text x={W - pad.r} y={H - 6} textAnchor="end" fontSize="10" fill="var(--color-muted)">
        {formatDate(points[points.length - 1].at)}
      </text>
    </svg>
  );
}

export default function Analytics() {
  const attempts = useAttempts();
  if (!attempts) return <p className="text-sm text-muted">Loading…</p>;

  const obs = observations(attempts);
  if (obs.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line p-8 text-center text-sm text-muted">
        Analytics appear after you finish your first quiz.{" "}
        <Link href="/quiz" className="underline">
          Start one
        </Link>
        .
      </p>
    );
  }

  const sum = summarize(attempts);
  const points = creditOverTime(attempts);
  const topics = byTopic(obs).sort((a, b) => a.credit - b.credit);
  const tags = byTag(obs)
    .filter((g) => g.n >= 3)
    .sort((a, b) => a.credit - b.credit)
    .slice(0, 8);
  const cal = calibration(obs);
  const flagged = questionStats(obs).filter((q) => q.flag);
  const sure = cal[0];

  return (
    <div className="space-y-8">
      <section aria-label="Totals" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile value={String(sum.quizzes)} label="Quizzes taken" />
        <Tile value={String(sum.questions)} label="Questions answered" />
        <Tile value={formatPercent(sum.accuracy, 0)} label="Accuracy" />
        <Tile value={formatPercent(sum.credit)} label="Average credit" />
        <Tile value={formatDuration(sum.totalMs)} label="Time spent" />
      </section>

      <section aria-label="Credit over time">
        <h3 className="mb-2 font-medium">Credit over time</h3>
        <div className="rounded-md border border-line bg-surface p-3">
          <CreditChart points={points} />
        </div>
        <p className="mt-1 text-xs text-muted">Each dot is one quiz. Green dots reached the mastery bar.</p>
      </section>

      <section aria-label="By topic">
        <h3 className="mb-2 font-medium">By topic, weakest first</h3>
        <div className="overflow-x-auto rounded-md border border-line bg-surface p-3">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="pb-2 text-left font-medium">Topic</th>
                <th className="px-2 pb-2 text-right font-medium">Answered</th>
                <th className="px-2 pb-2 text-right font-medium">Accuracy</th>
                <th className="px-2 pb-2 text-right font-medium">Credit</th>
                <th className="px-2 pb-2 text-right font-medium">Pace</th>
                <th className="px-2 pb-2 text-right font-medium">Sure but wrong</th>
                <th className="pb-2 pl-2 text-right font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((g) => (
                <tr key={g.key} className="border-t border-line">
                  <td className="py-2">{g.label}</td>
                  <td className="px-2 text-right tabular-nums">{g.n}</td>
                  <td className="px-2 text-right tabular-nums">{formatPercent(g.accuracy, 0)}</td>
                  <td
                    className={`px-2 text-right tabular-nums ${g.credit + 1e-9 >= CONFIG.passBar ? "text-good" : "text-danger"}`}
                  >
                    {formatPercent(g.credit)}
                  </td>
                  <td className="px-2 text-right tabular-nums">{g.medianRatio ? formatRatio(g.medianRatio) : "–"}</td>
                  <td className="px-2 text-right tabular-nums">{g.confidentErrors}</td>
                  <td className="pl-2 text-right">
                    <span className="inline-block align-middle">
                      <Sparkline values={g.trend} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted">
          Pace is the median time taken divided by the target. Under 1.0× is on target.
        </p>
      </section>

      {tags.length > 0 && (
        <section aria-label="Weakest tags">
          <h3 className="mb-2 font-medium">Weakest tags</h3>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {tags.map((g) => (
              <li key={g.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{g.label}</span>
                <span className="text-xs text-muted">{g.n} answered</span>
                <span
                  className={`w-16 text-right tabular-nums ${g.credit + 1e-9 >= CONFIG.passBar ? "text-good" : "text-danger"}`}
                >
                  {formatPercent(g.credit)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Calibration">
        <h3 className="mb-2 font-medium">How well you know what you know</h3>
        <div className="space-y-2 rounded-md border border-line bg-surface p-4">
          {cal.map((r) => (
            <div key={r.level} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0">{SURENESS_LABEL[r.level]}</span>
              <div
                className="h-3 flex-1 overflow-hidden rounded bg-paper"
                role="img"
                aria-label={`${SURENESS_LABEL[r.level]}: right ${Math.round(r.rate * 100)}% of the time`}
              >
                <div className="h-3 rounded bg-accent" style={{ width: `${r.rate * 100}%` }} />
              </div>
              <span className="w-44 shrink-0 text-right tabular-nums text-muted">
                {r.answered ? `${formatPercent(r.rate, 0)} right (${r.correct} of ${r.answered})` : "no answers yet"}
              </span>
            </div>
          ))}
        </div>
        {sure.answered >= 5 && (
          <p className="mt-1 text-sm text-muted">
            {sure.rate >= 0.9
              ? `When you say Sure you are right ${formatPercent(sure.rate, 0)} of the time, so your confidence can be trusted.`
              : `When you say Sure you are right only ${formatPercent(sure.rate, 0)} of the time. Slow down on the ones that feel obvious.`}
          </p>
        )}
      </section>

      <section aria-label="Questions to look at">
        <h3 className="mb-2 font-medium">Questions to look at</h3>
        {flagged.length === 0 ? (
          <p className="rounded-md border border-line bg-surface p-4 text-sm text-muted">
            Nothing stands out. A question shows up here after it has been asked several times.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {flagged.map((q) => (
              <li key={q.questionId} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{q.stem.replace(/!\[[^\]]*\]\([^)]*\)/g, "[image]")}</p>
                  <p className="text-xs text-muted">
                    {q.topicName} · seen {q.seen} times · {q.correct} right ·{" "}
                    {q.flag === "suspect"
                      ? `wrong while sure ${q.confidentWrong} times: check the answer key`
                      : "always right and quick: it may be too easy"}
                  </p>
                </div>
                <Link href={`/editor?id=${q.questionId}`} className="btn py-1">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}