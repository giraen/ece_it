"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TreeNode } from "@/lib/db";
import { formatDate, formatPercent } from "@/lib/format";
import { startAttempt } from "@/lib/quiz/quiz";
import { suggestedMinutes } from "@/lib/quiz/quizPlan";
import { MISS_LABEL, weakCount, type MissReason, type RetakeReview } from "@/lib/quiz/retake";
import { useIncognito } from "@/lib/incognito";
import RichText from "@/components/ui/RichText";
import { LISTS, figures } from "@/components/progress/StrengthsPanel";
import { SURENESS_LABEL } from "@/lib/quiz/scoring";

const REASON_STYLE: Record<Exclude<MissReason, null>, string> = {
  misconception: "bg-danger/10 text-danger",
  unprepared: "bg-priority-soft text-priority",
  careless: "border border-line bg-paper text-muted",
  skipped: "border border-line text-muted",
};

/** How many missed questions show before "Show more". */
const FIRST = 5;

const chip = (on: boolean) =>
  `rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`;

/** The id the phone's "Review first" strip jumps to. */
export const RETAKE_ID = "review-before-retake";

/** A strip near the top on a phone, pointing down to the review below the setup form. */
export function RetakeStrip({ review }: { review: RetakeReview }) {
  const weak = weakCount(review);
  return (
    <a
      href={`#${RETAKE_ID}`}
      className="flex items-center gap-3 rounded-md border border-priority/40 bg-priority-soft p-3 text-sm text-priority lg:hidden"
    >
      <span className="min-w-0 flex-1">
        <b>Review first:</b> {review.missed.length} missed
        {weak > 0 ? ` and ${weak} weak spot${weak === 1 ? "" : "s"}` : ""} from your last try.
      </span>
      <span aria-hidden className="text-lg leading-none">
        ↓
      </span>
    </a>
  );
}

/**
 * Review before you retake: what you missed in the quiz that failed, and the weak spots of this place from every
 * quiz, with a practice quiz of them all.
 */
export default function RetakePanel({ review, node, bar }: { review: RetakeReview; node: TreeNode; bar: number }) {
  const router = useRouter();
  const incognito = useIncognito();
  const [tab, setTab] = useState<"missed" | "weak">("missed");
  const [all, setAll] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { attempt, missed, weak, practiceIds } = review;
  const weakN = weakCount(review);
  const shown = all ? missed : missed.slice(0, FIRST);
  const score = attempt.summary!;

  async function practise() {
    setError(null);
    setStarting(true);
    try {
      const n = practiceIds.length;
      const id = await startAttempt(node.id, n, suggestedMinutes(n), true, incognito, practiceIds);
      router.push(`/quiz/play?id=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the practice.");
      setStarting(false);
    }
  }

  return (
    <section id={RETAKE_ID} aria-labelledby="retake-title" className="card scroll-mt-4 p-4 lg:p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="retake-title" className="text-lg font-semibold">
          Review before you retake
        </h2>
        <p className="text-sm text-muted">
          {formatDate(attempt.submittedAt!)} ·{" "}
          <span className="num font-semibold text-danger">{formatPercent(score.credit, 0)}</span> of{" "}
          {formatPercent(score.bar, 0)} needed ·{" "}
          <Link href={`/quiz/results?id=${attempt.id}`} className="underline">
            results
          </Link>
        </p>
      </div>

      <div className="mt-3 flex gap-1.5" role="group" aria-label="Show">
        <button
          type="button"
          aria-pressed={tab === "missed"}
          className={chip(tab === "missed")}
          onClick={() => setTab("missed")}
        >
          Missed last time {missed.length}
        </button>
        <button
          type="button"
          aria-pressed={tab === "weak"}
          className={chip(tab === "weak")}
          onClick={() => setTab("weak")}
        >
          Weak spots {weakN}
        </button>
      </div>

      <div className="mt-2">
        {tab === "missed" ? (
          missed.length === 0 ? (
            <p className="py-3 text-sm text-muted">
              Nothing was missed: every question was right, just not enough credit.
            </p>
          ) : (
            <ul>
              {shown.map(({ item, reason, before }, i) => {
                const picked = item.choices.find((c) => c.id === item.selectedChoiceId)?.text;
                const answer = item.choices.find((c) => c.id === item.correctChoiceId)?.text ?? "";
                return (
                  <li key={item.questionId} className="flex gap-3 border-t border-line py-2.5 first:border-t-0">
                    <span className="num w-5 shrink-0 pt-0.5 text-right text-xs text-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <RichText text={item.stem} className="text-sm leading-snug" />
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        {picked !== undefined ? (
                          <span className="flex items-baseline gap-1 text-danger">
                            <span aria-label="You picked">✕</span>
                            <RichText text={picked} className="inline-block" />
                            {item.sureness && (
                              <span className="text-xs text-muted">· {SURENESS_LABEL[item.sureness]}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">Not answered</span>
                        )}
                        <span className="flex items-baseline gap-1 text-good">
                          <span aria-label="Answer">✓</span>
                          <RichText text={answer} className="inline-block" />
                        </span>
                        {before && <span className="text-xs text-muted">· missed before too</span>}
                      </div>
                    </div>
                    {reason && (
                      <span
                        className={`h-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${REASON_STYLE[reason]}`}
                      >
                        {MISS_LABEL[reason]}
                      </span>
                    )}
                  </li>
                );
              })}
              {missed.length > FIRST && (
                <li className="border-t border-line pt-2.5">
                  <button type="button" className="text-sm text-accent hover:underline" onClick={() => setAll(!all)}>
                    {all ? "Show fewer" : `Show ${missed.length - FIRST} more`}
                  </button>
                </li>
              )}
            </ul>
          )
        ) : weakN === 0 ? (
          <p className="py-3 text-sm text-muted">
            No weak spots yet. A question is listed after it has been answered at least 3 times.
          </p>
        ) : (
          <div className="grid gap-x-8 gap-y-4 pt-1 md:grid-cols-2">
            {weak
              .filter((w) => w.rows.length > 0)
              .map((w) => (
                <div key={w.ranking} className="min-w-0">
                  <p className="text-sm font-semibold">
                    {LISTS[w.ranking].title}{" "}
                    <span className="font-normal text-muted">· {LISTS[w.ranking].means.toLowerCase()}</span>
                  </p>
                  <ul className="mt-1">
                    {w.rows.map((row) => {
                      const f = figures(row, w.ranking, bar);
                      return (
                        <li key={row.key} className="flex items-start gap-3 border-t border-line py-2 first:border-t-0">
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm">{row.label}</p>
                            <p className="text-xs text-muted">{f.sub}</p>
                          </div>
                          <span className={`num shrink-0 text-sm font-semibold ${f.tone}`}>{f.value}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </div>

      {practiceIds.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
          <button className="btn btn-primary" disabled={starting} onClick={() => void practise()}>
            {starting ? "Starting…" : `Practise these ${practiceIds.length}`}
          </button>
          <p className="min-w-0 flex-1 text-xs text-muted">
            The {missed.length} missed{weakN > 0 ? " and the weak spots" : ""}, once each. Practice never counts toward
            mastery or locks.
          </p>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
