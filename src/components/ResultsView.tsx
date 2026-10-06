"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CONFIG } from "@/lib/config";
import type { AttemptItem } from "@/lib/db";
import { formatCountdown, formatDate, formatDateTime, formatDuration, formatPercent, formatRatio } from "@/lib/format";
import { useAttempt, useAttempts, useNow } from "@/lib/hooks";
import { expiryFor, masteryFor } from "@/lib/mastery";
import { groupKeysFor } from "@/lib/quizPlan";
import { SURENESS_LABEL, SURENESS_ORDER, groupStats, needsWork, overallStats, type GroupStats } from "@/lib/scoring";
import RichText from "./RichText";

const LETTERS = "ABCDEFGH";

type Filter = "all" | "wrong" | "lost";

function Redirect({ to, text }: { to: string; text: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <p className="text-sm text-muted">{text}</p>;
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-md border border-line bg-surface p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm text-muted">{label}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

function GroupRow({ g }: { g: GroupStats }) {
  const low = g.credit + 1e-9 < CONFIG.passBar;
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-2">{g.label}</td>
      <td className={`px-2 text-right tabular-nums ${low ? "font-medium text-danger" : "text-good"}`}>
        {Math.round(g.credit * 100)}%
      </td>
      <td className="px-2 text-right tabular-nums">
        {g.correct}/{g.n}
      </td>
      {SURENESS_ORDER.map((s) => (
        <td key={s} className="px-2 text-right tabular-nums text-muted">
          {g.sureness[s]}
        </td>
      ))}
      <td className="pl-2 text-right tabular-nums text-muted">
        {g.medianRatio > 0 ? formatRatio(g.medianRatio) : "–"}
      </td>
    </tr>
  );
}

/** One question as answered: what you picked, what was right, how sure you were, and the time. */
function ReviewItem({ item, number }: { item: AttemptItem; number: number }) {
  const choiceById = new Map(item.choices.map((c) => [c.id, c]));
  const tone = item.correct ? "text-good" : "text-danger";

  return (
    <li className="space-y-3 rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium">Question {number}</span>
        <span className={`font-medium ${tone}`}>
          {item.answered ? (item.correct ? "Correct" : "Wrong") : "Not answered"}
        </span>
        <span className="text-muted">Credit {item.credit.toFixed(1)}</span>
        {item.sureness && <span className="text-muted">{SURENESS_LABEL[item.sureness]}</span>}
        <span className="text-muted tabular-nums">
          Time {formatDuration(item.activeMs)} of {formatDuration(item.targetSec * 1000)}
        </span>
      </div>
      <RichText text={item.stem} className="text-[15px] leading-relaxed" />
      <ol className="space-y-1.5">
        {item.choiceOrder.map((cid, i) => {
          const c = choiceById.get(cid);
          if (!c) return null;
          const picked = item.selectedChoiceId === cid;
          const right = item.correctChoiceId === cid;
          return (
            <li
              key={cid}
              className={`flex gap-3 rounded-md border px-3 py-2 text-sm ${
                right ? "border-good bg-good/5" : picked ? "border-danger/60 bg-danger/5" : "border-line"
              }`}
            >
              <span className="w-5 shrink-0 font-medium text-muted">{LETTERS[i]}</span>
              <div className="min-w-0 flex-1">
                <RichText text={c.text} />
              </div>
              <span className="shrink-0 text-xs">
                {picked && <span className={right ? "text-good" : "text-danger"}>Your answer</span>}
                {picked && right ? " · " : ""}
                {right && <span className="text-good">Correct answer</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </li>
  );
}

export default function ResultsView({ attemptId }: { attemptId: string }) {
  const attempt = useAttempt(attemptId);
  const allAttempts = useAttempts();
  const nowMs = useNow();
  const [filter, setFilter] = useState<Filter>("all");

  if (attempt === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (attempt === null) return <p className="text-sm">That quiz no longer exists.</p>;
  if (attempt.status === "in_progress") return <Redirect to={`/quiz/play?id=${attemptId}`} text="Opening the quiz…" />;
  if (attempt.status === "abandoned" || !attempt.summary) {
    return (
      <p className="text-sm">
        That quiz was discarded, so it has no results.{" "}
        <Link href="/quiz" className="underline">
          Back to the quiz page
        </Link>
      </p>
    );
  }

  const s = attempt.summary;
  const items = attempt.items;
  const overall = overallStats(items);
  const submittedAt = attempt.submittedAt ?? 0;
  const kind = attempt.scopeKind;

  const groups = groupStats(items, (it) => groupKeysFor(kind, it));
  const sortedGroups = [...groups].sort((a, b) => a.credit - b.credit);
  const weak = needsWork(groups);
  const groupLabel = kind === "subject" ? "Topic" : "Tag";
  // In a subject quiz the groups are topics, so the weakest one can be practised on its own.
  const weakestTopic = kind === "subject" ? weak[0] : undefined;

  const scopeInfo = allAttempts ? masteryFor(allAttempts, { id: attempt.scopeNodeId, kind }, nowMs) : undefined;
  const locked = scopeInfo?.lockedUntil !== undefined;
  const maxMs = Math.max(1, ...items.map((i) => Math.max(i.activeMs, i.targetSec * 1000 * 1.2)));

  const shown = items
    .map((item, i) => ({ item, number: i + 1 }))
    .filter(({ item }) => (filter === "wrong" ? !item.correct : filter === "lost" ? item.credit < 1 : true));
  const counts = {
    all: items.length,
    wrong: items.filter((i) => !i.correct).length,
    lost: items.filter((i) => i.credit < 1).length,
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Results</h1>
        <p className="mt-1 font-medium">{attempt.scopeName}</p>
        {attempt.submittedAt && <p className="text-sm text-muted">{formatDateTime(attempt.submittedAt)}</p>}
      </div>

      <div className="space-y-3">
        <p
          role="status"
          className={`rounded-md border p-4 font-medium ${
            s.passed ? "border-good/40 bg-good/5 text-good" : "border-danger/40 bg-danger/5 text-danger"
          }`}
        >
          {s.passed
            ? `Passed. You reached the ${formatPercent(s.bar, 0)} bar.`
            : `Not passed. You needed ${formatPercent(s.bar, 0)} and scored ${formatPercent(s.credit)}.`}
          {s.failedGroups.length > 0 && (
            <span className="mt-1 block text-sm font-normal">
              These areas averaged under {formatPercent(CONFIG.childFloor, 0)}: {s.failedGroups.join(", ")}.
            </span>
          )}
        </p>

        {s.masteryAwarded ? (
          <p aria-label="Mastery" className="rounded-md border border-good/40 bg-good/5 p-3 text-sm">
            <span className="font-medium text-good">Mastery earned.</span> This {kind} stays mastered until{" "}
            {formatDate(expiryFor(kind, submittedAt))}.
          </p>
        ) : s.passed ? (
          <p aria-label="Mastery" className="rounded-md border border-line bg-surface p-3 text-sm">
            This quiz could not award mastery{attempt.ineligibleReason ? `: ${attempt.ineligibleReason}` : "."}
          </p>
        ) : attempt.eligible !== false ? (
          <p aria-label="Mastery" className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm">
            <span className="font-medium text-danger">Locked for {CONFIG.cooldownHours} hours.</span> This {kind}{" "}
            unlocks after {formatDateTime(submittedAt + CONFIG.cooldownHours * 3_600_000)}. Mastery you already hold is
            not affected.
          </p>
        ) : (
          <p aria-label="Mastery" className="rounded-md border border-line bg-surface p-3 text-sm">
            This was a practice quiz, so nothing is locked
            {attempt.ineligibleReason ? `. ${attempt.ineligibleReason}` : "."} You can retake it any time.
          </p>
        )}
      </div>

      <section aria-label="Totals" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Average credit" value={formatPercent(s.credit)} note={`The bar is ${formatPercent(s.bar, 0)}`} />
        <Tile label="Correct" value={`${s.correct} of ${s.n}`} note={`${s.n - s.answered} not answered`} />
        <Tile
          label="Time used"
          value={formatDuration(overall.totalMs)}
          note={`Target ${formatDuration(overall.targetMs)}. Time never changes the score.`}
        />
        <Tile label="Accuracy" value={formatPercent(s.accuracy, 0)} />
      </section>

      <section aria-label="Needs work">
        <h2 className="mb-2 font-medium">Needs work</h2>
        {weak.length === 0 ? (
          <p className="rounded-md border border-good/40 bg-good/5 p-4 text-sm">
            No weak spots. Every {groupLabel.toLowerCase()} reached the bar.
          </p>
        ) : (
          <ul className="space-y-2">
            {weak.map((w) => (
              <li key={w.key} className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm">
                <span className="font-medium">{w.label}</span> ({formatPercent(w.credit)}): {w.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Breakdown">
        <h2 className="mb-2 font-medium">Breakdown by {groupLabel.toLowerCase()}</h2>
        <div className="overflow-x-auto rounded-md border border-line bg-surface p-3">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="pb-2 text-left font-medium">{groupLabel}</th>
                <th className="px-2 pb-2 text-right font-medium">Credit</th>
                <th className="px-2 pb-2 text-right font-medium">Correct</th>
                {SURENESS_ORDER.map((id) => (
                  <th key={id} className="px-2 pb-2 text-right font-medium">
                    {SURENESS_LABEL[id]}
                  </th>
                ))}
                <th className="pb-2 pl-2 text-right font-medium">Pace vs target</th>
              </tr>
            </thead>
            <tbody>
              {sortedGroups.map((g) => (
                <GroupRow key={g.key} g={g} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted">
          The sureness columns count how many answers you gave at each level. Pace is the median time taken divided by
          the target. Under 1.0× is on target. Pace is a statistic and never changes credit.
        </p>
      </section>

      <section aria-label="Time per question">
        <h2 className="mb-2 font-medium">Time per question</h2>
        <div className="space-y-1.5 rounded-md border border-line bg-surface p-3">
          {items.map((it, i) => {
            const width = (it.activeMs / maxMs) * 100;
            const target = ((it.targetSec * 1000) / maxMs) * 100;
            const color = !it.answered ? "bg-line" : it.correct ? "bg-good" : "bg-danger";
            return (
              <div key={it.questionId + i} className="flex items-center gap-3 text-sm">
                <span className="w-7 shrink-0 text-right tabular-nums text-muted">{i + 1}</span>
                <div
                  className="relative h-3 flex-1 rounded bg-paper"
                  role="img"
                  aria-label={`Question ${i + 1}: ${formatDuration(it.activeMs)} against a target of ${formatDuration(it.targetSec * 1000)}`}
                >
                  <div className={`absolute top-0 left-0 h-3 rounded ${color}`} style={{ width: `${width}%` }} />
                  <div
                    className="absolute -top-0.5 h-4 w-0.5 bg-ink"
                    style={{ left: `${target}%` }}
                    title="Target time"
                  />
                </div>
                <span className="w-24 shrink-0 text-right tabular-nums text-muted">
                  {formatDuration(it.activeMs)} / {formatDuration(it.targetSec * 1000)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-muted">
          The dark tick marks each question&apos;s target. Green is correct, red is wrong, grey is unanswered.
        </p>
      </section>

      <section aria-label="Review" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-medium">Every question</h2>
          {(
            [
              ["all", "All"],
              ["wrong", "Wrong or skipped"],
              ["lost", "Lost any credit"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`rounded px-2.5 py-1 text-sm ${
                filter === id ? "bg-accent text-white" : "bg-accent-soft text-accent hover:bg-accent/15"
              }`}
            >
              {label} <span className="opacity-70">{counts[id]}</span>
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="rounded-md border border-dashed border-line p-6 text-sm text-muted">Nothing to show here.</p>
        ) : (
          <ul className="space-y-3">
            {shown.map(({ item, number }) => (
              <ReviewItem key={item.questionId + number} item={item} number={number} />
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2 pb-8">
        {locked && scopeInfo?.lockedUntil !== undefined ? (
          <span className="btn cursor-not-allowed opacity-60" aria-disabled="true">
            Retake in {formatCountdown(scopeInfo.lockedUntil - nowMs)}
          </span>
        ) : (
          <Link href={`/quiz/new?node=${attempt.scopeNodeId}`} className="btn btn-primary">
            Quiz this again
          </Link>
        )}
        {weakestTopic && (
          <Link href={`/quiz/new?node=${weakestTopic.key}`} className="btn">
            Practice weakest topic: {weakestTopic.label}
          </Link>
        )}
        <Link href="/quiz" className="btn">
          Back to the quiz page
        </Link>
      </div>
    </div>
  );
}