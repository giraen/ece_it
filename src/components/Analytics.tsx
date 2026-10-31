"use client";

import Link from "next/link";
import LoadingScreen from "./LoadingScreen";
import { byTopic, calibration, categorySeries, observations, summarize } from "@/lib/analytics";
import { FIXED_CATEGORIES } from "@/lib/categories";
import { CONFIG } from "@/lib/config";
import { formatPercent, formatRatio, formatSpent } from "@/lib/format";
import { useAttempts } from "@/lib/hooks";
import { useMasteryBar } from "@/lib/preferences";
import { SURENESS_LABEL } from "@/lib/scoring";
import CreditChart from "./CreditChart";
import Sparkline from "./Sparkline";
import InfoTip from "./InfoTip";
import StrengthsPanel from "./StrengthsPanel";

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export default function Analytics() {
  const attempts = useAttempts();
  const bar = useMasteryBar();
  if (!attempts) return <LoadingScreen />;

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
  const series = categorySeries(attempts, FIXED_CATEGORIES);
  const topics = byTopic(obs).sort((a, b) => a.credit - b.credit);
  const cal = calibration(obs);
  const sure = cal[0];

  return (
    <div className="space-y-8">
      <section aria-label="Totals" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile value={String(sum.quizzes)} label="Quizzes taken" />
        <Tile value={String(sum.questions)} label="Questions answered" />
        <Tile value={formatPercent(sum.accuracy, 0)} label="Accuracy" />
        <Tile value={formatPercent(sum.credit)} label="Average credit" />
        <Tile value={formatSpent(sum.totalMs)} label="Time spent" />
      </section>

      <section aria-label="Credit over time">
        <div className="mb-2 flex items-center gap-1">
          <h3 className="font-medium">Credit over time</h3>
          <InfoTip>
            One line per category, and All for every category together. Click a category to show or hide it. Switch the
            time axis to see each quiz, or a weekly or monthly average. The dashed green line is the goal you set in
            Settings. The red line is the fixed {Math.round(CONFIG.minimumPass * 100)}% minimum to pass.
          </InfoTip>
        </div>
        <div className="rounded-md border border-line bg-surface p-3">
          <CreditChart series={series} bar={bar} />
        </div>
      </section>

      <section aria-label="By topic">
        <div className="mb-2 flex items-center gap-1">
          <h3 className="font-medium">By topic, weakest first</h3>
          <InfoTip>Pace is the median time taken divided by the target. Under 1.0× is on target.</InfoTip>
        </div>
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
                    className={`px-2 text-right tabular-nums ${g.credit + 1e-9 >= bar ? "text-good" : "text-danger"}`}
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
      </section>

      <StrengthsPanel obs={obs} bar={bar} />

      <section aria-label="Calibration">
        <div className="mb-2 flex items-center gap-1">
          <h3 className="font-medium">How well you know what you know</h3>
          {sure.answered >= 5 && (
            <InfoTip>
              {sure.rate >= 0.9
                ? `When you say Sure you are right ${formatPercent(sure.rate, 0)} of the time, so your confidence can be trusted.`
                : `When you say Sure you are right only ${formatPercent(sure.rate, 0)} of the time. Slow down on the ones that feel obvious.`}
            </InfoTip>
          )}
        </div>
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
      </section>
    </div>
  );
}