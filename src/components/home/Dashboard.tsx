"use client";

import Link from "next/link";
import { computeDashboard, EXPIRING_DAYS } from "@/lib/progress/dashboard";
import { formatDate, formatPercent } from "@/lib/format";
import { useAttempts, useNodes, useNow, useQuestions } from "@/lib/hooks";
import { pathOf } from "@/lib/bank/tree";
import { useLastBackup } from "@/lib/backup/lastBackup";
import type { QuizAttempt } from "@/lib/db";
import CategoryChip, { CATEGORY_STYLE, CATEGORY_TITLE, categoryKey } from "@/components/ui/CategoryChip";
import InfoTip from "@/components/ui/InfoTip";
import PracticeTag from "@/components/ui/PracticeTag";

const DAY = 86_400_000;

const REASON: Record<string, string> = {
  expiring: "Its mastery runs out soon.",
  expired: "Its mastery has run out.",
  never: "You have not quizzed it yet.",
};

/** "Good morning" and so on, by the hour. */
function greeting(ms: number): string {
  const h = new Date(ms).getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** "Today", "Yesterday", or a date. */
function when(ms: number, nowMs: number): string {
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  if (ms >= start.getTime()) return "Today";
  if (ms >= start.getTime() - DAY) return "Yesterday";
  return formatDate(ms);
}

/** The path without its category, which the chip already shows. */
const withoutCategory = (path: string) => path.split("›").slice(1).join("›").trim() || path;

function ResultState({ a }: { a: QuizAttempt }) {
  if (a.practice) return <PracticeTag />;
  if (a.summary?.masteryAwarded) return <span className="text-xs font-semibold text-good">Mastered</span>;
  if (a.summary?.passed) return <span className="text-xs font-semibold text-good">Passed</span>;
  return <span className="text-xs font-semibold text-muted">Not yet</span>;
}

/** A warning strip when the last backup is old, since the bank only lives in this browser. */
function BackupBanner({ nowMs }: { nowMs: number }) {
  const last = useLastBackup();
  const days = last === null ? null : Math.floor((nowMs - last) / DAY);
  if (days !== null && days < 7) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-priority-soft px-4 py-3 text-sm text-priority">
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
        <path
          d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
          strokeLinejoin="round"
        />
      </svg>
      <span className="min-w-0 flex-1">
        {days === null ? "You have never backed up from this browser." : `Last backup was ${days} days ago.`} Your
        questions only live in this browser.
      </span>
      <Link href="/settings#backup" className="font-semibold underline">
        Back up now
      </Link>
    </div>
  );
}

export default function Dashboard() {
  const nodes = useNodes();
  const questions = useQuestions();
  const attempts = useAttempts();
  const nowMs = useNow();

  if (!nodes || !questions || !attempts) return <p className="text-sm text-muted">Loading…</p>;

  const d = computeDashboard({ nodes, questions, attempts, nowMs });
  const empty = questions.length === 0;
  const due = d.expiringSoon.filter((x) => x.node.kind === "topic").length + d.expired;
  const today = new Date(nowMs).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });

  const glance = [
    {
      label: "Topics left to master",
      value: d.topicsLeft,
      tone: "",
      info: `${d.topicsMastered} of ${d.topics} topics mastered.`,
    },
    {
      label: "Expiring soon",
      value: d.expiringSoon.length,
      tone: d.expiringSoon.length > 0 ? "text-danger" : "",
      info: `Mastery that runs out within ${EXPIRING_DAYS} days.`,
    },
    {
      label: "Expired",
      value: d.expired,
      tone: d.expired > 0 ? "text-danger" : "",
      info: "Take the quiz again to renew it.",
    },
    { label: "Questions in bank", value: d.questions.toLocaleString(), tone: "" },
    { label: "Quizzes taken", value: d.quizzesTaken, tone: "" },
  ];

  return (
    <div className="space-y-6">
      <BackupBanner nowMs={nowMs} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="eyebrow font-mono">{today}</p>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
            {greeting(nowMs)}.{" "}
            {empty
              ? "Let's fill your bank."
              : due > 0
                ? `${due} ${due === 1 ? "topic needs" : "topics need"} you today.`
                : "You're all caught up."}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/editor" className="btn max-lg:hidden">
            New question
          </Link>
          <Link href="/quiz" className="btn btn-primary">
            Start a quiz
          </Link>
        </div>
      </div>

      {empty ? (
        <section className="card p-8 text-center">
          <p className="font-semibold">Your bank is empty.</p>
          <p className="mt-1 text-sm text-muted">Add a few questions, and this page will fill in.</p>
          <Link href="/bank" className="btn btn-primary mt-4 max-lg:hidden">
            Open the bank
          </Link>
          {/* A phone starts with an empty bank of its own, so it points to the backup import instead. */}
          <p className="mt-3 text-sm text-muted lg:hidden">
            Your questions are saved in each browser separately. To bring them here, export a backup on your computer
            and import it on this phone.
          </p>
          <Link href="/settings#backup" className="btn btn-primary mt-4 lg:hidden">
            Import a backup
          </Link>
        </section>
      ) : (
        <>
          <section aria-label="Next up" className="card flex flex-wrap items-center gap-4 p-5 lg:gap-5 lg:px-6">
            {d.next ? (
              <>
                <CategoryChip
                  name={pathOf(nodes, d.next.node.id)}
                  className="size-12 rounded-lg text-[13px] max-lg:hidden"
                />
                <div className="min-w-0 flex-1 basis-56 space-y-1">
                  <p className="eyebrow">Next up</p>
                  <p className="text-lg font-semibold">
                    <CategoryChip name={pathOf(nodes, d.next.node.id)} className="mr-2 align-middle lg:hidden" />
                    {withoutCategory(pathOf(nodes, d.next.node.id))}
                  </p>
                  <p className={`text-sm ${d.next.reason === "never" ? "text-muted" : "text-danger"}`}>
                    {REASON[d.next.reason]}
                  </p>
                </div>
                {d.nextLast?.summary && (
                  <div className="text-right">
                    <p className="num text-2xl font-semibold">{formatPercent(d.nextLast.summary.credit, 0)}</p>
                    <p className="text-xs text-muted">last score</p>
                  </div>
                )}
                <Link href={`/quiz/new?node=${d.next.node.id}`} className="btn btn-primary px-5 py-2.5 max-lg:w-full">
                  Quiz it
                </Link>
              </>
            ) : (
              <div className="space-y-1">
                <p className="eyebrow">Next up</p>
                <p className="text-sm">Nothing urgent. Every topic you have quizzed is current.</p>
              </div>
            )}
          </section>

          <section aria-label="Categories" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {d.categories.map((c) => {
              const key = categoryKey(c.node.name);
              const share = c.topics > 0 ? c.mastered / c.topics : 0;
              return (
                <Link
                  key={c.node.id}
                  href="/progress"
                  className="card flex flex-col gap-3 p-4 transition-colors hover:border-muted/40 lg:p-5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <CategoryChip name={c.node.name} />
                    <span className="truncate text-xs text-muted max-lg:hidden">{key ? CATEGORY_TITLE[key] : ""}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="num text-3xl font-semibold tracking-tight">
                      {c.topics > 0 ? formatPercent(share, 0) : "–"}
                    </span>
                    <span className="text-xs text-muted">mastered</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-track" aria-hidden="true">
                    <div
                      className={`h-full rounded-full ${key ? CATEGORY_STYLE[key].bar : "bg-accent"}`}
                      style={{ width: `${share * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted">
                    {c.topics > 0
                      ? `${c.mastered} of ${c.topics} topic${c.topics === 1 ? "" : "s"}`
                      : `${c.questions} question${c.questions === 1 ? "" : "s"}`}
                  </span>
                </Link>
              );
            })}
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section aria-label="At a glance" className="card p-5">
              <h2 className="mb-1 text-sm font-semibold">At a glance</h2>
              <ul>
                {glance.map((g) => (
                  <li
                    key={g.label}
                    className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0"
                  >
                    <span className="flex items-center gap-1 text-sm text-muted">
                      {g.label}
                      {g.info && <InfoTip>{g.info}</InfoTip>}
                    </span>
                    <span className={`num text-base font-semibold ${g.tone}`}>{g.value}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-label="Recent quizzes" className="card p-5 lg:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Recent quizzes</h2>
                <Link href="/progress?tab=analytics" className="text-sm font-medium text-accent hover:underline">
                  See analytics
                </Link>
              </div>
              {d.recent.length === 0 ? (
                <p className="py-3 text-sm text-muted">No quizzes taken yet.</p>
              ) : (
                <ul>
                  {d.recent.map((a) => (
                    <li key={a.id} className="border-b border-line last:border-0">
                      <Link
                        href={`/quiz/results?id=${a.id}`}
                        className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 text-sm hover:bg-paper"
                      >
                        <CategoryChip name={a.scopeName} className="w-12" />
                        <span className="min-w-0 flex-1 truncate">{withoutCategory(a.scopeName)}</span>
                        <span className="text-xs text-muted max-lg:hidden">{when(a.submittedAt ?? 0, nowMs)}</span>
                        <span className="w-16 text-right max-lg:hidden">
                          <ResultState a={a} />
                        </span>
                        <span
                          className={`num w-14 text-right font-semibold ${a.summary?.passed ? "text-good" : "text-ink"}`}
                        >
                          {a.summary ? formatPercent(a.summary.credit, 0) : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
