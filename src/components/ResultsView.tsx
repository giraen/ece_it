"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AttemptItem } from "@/lib/db";
import { formatDateTime, formatDuration, formatPercent } from "@/lib/format";
import { useAttempt } from "@/lib/hooks";
import { SURENESS_LABEL, overallStats } from "@/lib/scoring";
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
  const overall = overallStats(attempt.items);
  const shown = attempt.items
    .map((item, i) => ({ item, number: i + 1 }))
    .filter(({ item }) => (filter === "wrong" ? !item.correct : filter === "lost" ? item.credit < 1 : true));
  const counts = {
    all: attempt.items.length,
    wrong: attempt.items.filter((i) => !i.correct).length,
    lost: attempt.items.filter((i) => i.credit < 1).length,
  };

  let headline: string;
  if (s.passed && s.masteryAwarded) headline = "Passed. This quiz counts toward mastery.";
  else if (s.passed)
    headline =
      `Passed the ${formatPercent(s.bar, 0)} bar, but this quiz could not award mastery. ${attempt.ineligibleReason ?? ""}`.trim();
  else headline = `Not passed. You needed ${formatPercent(s.bar, 0)} and scored ${formatPercent(s.credit)}.`;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Results</h1>
        <p className="mt-1 font-medium">{attempt.scopeName}</p>
        {attempt.submittedAt && <p className="text-sm text-muted">{formatDateTime(attempt.submittedAt)}</p>}
      </div>

      <p
        role="status"
        className={`rounded-md border p-4 font-medium ${
          s.passed ? "border-good/40 bg-good/5 text-good" : "border-danger/40 bg-danger/5 text-danger"
        }`}
      >
        {headline}
        {s.failedGroups.length > 0 && (
          <span className="mt-1 block text-sm font-normal">
            These areas averaged under 50%: {s.failedGroups.join(", ")}.
          </span>
        )}
      </p>

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

      <div className="flex gap-2">
        <Link href="/quiz" className="btn">
          Back to the quiz page
        </Link>
        <Link href={`/quiz/new?node=${attempt.scopeNodeId}`} className="btn btn-primary">
          Quiz this again
        </Link>
      </div>
    </div>
  );
}