"use client";

import Link from "next/link";
import { computeDashboard, EXPIRING_DAYS } from "@/lib/dashboard";
import { formatPercent } from "@/lib/format";
import { useAttempts, useNodes, useNow, useQuestions } from "@/lib/hooks";
import { pathOf } from "@/lib/tree";
import BackupStatus from "./BackupStatus";
import InfoTip from "./InfoTip";

function Tile({
  href,
  value,
  label,
  info,
  tone = "plain",
}: {
  href: string;
  value: React.ReactNode;
  label: string;
  info?: React.ReactNode;
  tone?: "plain" | "warn" | "good";
}) {
  const color = tone === "warn" ? "text-danger" : tone === "good" ? "text-good" : "text-ink";
  return (
    <div className="relative rounded-md border border-line bg-surface p-4 hover:border-accent/60">
      <Link href={href} aria-label={`${label}: ${value}`} className="absolute inset-0 rounded-md" />
      <p className={`text-3xl font-semibold tabular-nums ${color}`}>{value}</p>
      <div className="mt-1 flex items-center gap-1">
        <p className="text-sm font-medium">{label}</p>
        {info && (
          <span className="relative z-10">
            <InfoTip>{info}</InfoTip>
          </span>
        )}
      </div>
    </div>
  );
}

const REASON: Record<string, string> = {
  expiring: "Its mastery runs out soon.",
  expired: "Its mastery has run out.",
  never: "You have not quizzed it yet.",
};

export default function Dashboard() {
  const nodes = useNodes();
  const questions = useQuestions();
  const attempts = useAttempts();
  const nowMs = useNow();

  if (!nodes || !questions || !attempts) return <p className="text-sm text-muted">Loading…</p>;

  const d = computeDashboard({ nodes, questions, attempts, nowMs });
  const empty = questions.length === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Home</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/editor" className="btn">
            New question
          </Link>
          <Link href="/quiz" className="btn btn-primary">
            Start a quiz
          </Link>
        </div>
      </div>

      {empty ? (
        <section className="rounded-md border border-dashed border-line p-8 text-center">
          <p className="font-medium">Your bank is empty.</p>
          <p className="mt-1 text-sm text-muted">Add a few questions, and this page will fill in.</p>
          <Link href="/bank" className="btn btn-primary mt-4">
            Open the bank
          </Link>
        </section>
      ) : (
        <>
          <section aria-label="Next up" className="rounded-md border border-line bg-surface p-5">
            <h2 className="text-sm font-medium text-muted">Next up</h2>
            {d.next ? (
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">{pathOf(nodes, d.next.node.id)}</p>
                  <p className="text-sm text-muted">{REASON[d.next.reason]}</p>
                </div>
                <Link href={`/quiz/new?node=${d.next.node.id}`} className="btn btn-primary">
                  Quiz it
                </Link>
              </div>
            ) : (
              <p className="mt-1 text-sm">Nothing urgent. Every topic you have quizzed is current.</p>
            )}
          </section>

          <section aria-label="Overview" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Tile
              href="/progress"
              value={d.topicsLeft}
              label="Topics left to master"
              info={`${d.topicsMastered} of ${d.topics} topics mastered.`}
              tone={d.topicsLeft === 0 ? "good" : "plain"}
            />
            <Tile
              href="/progress"
              value={d.expiringSoon.length}
              label="Mastery expiring soon"
              info={`Mastery that runs out within ${EXPIRING_DAYS} days.`}
              tone={d.expiringSoon.length > 0 ? "warn" : "plain"}
            />
            <Tile
              href="/progress"
              value={d.expired}
              label="Mastery expired"
              info="Mastery has run out. Take the quiz again to renew it."
              tone={d.expired > 0 ? "warn" : "plain"}
            />
            <Tile href="/bank" value={d.questions} label="Questions in your bank" />
            <Tile
              href="/progress?tab=analytics"
              value={d.quizzesTaken}
              label="Quizzes taken"
              info="Open this to see your analytics."
            />
          </section>

          <div>
            <section aria-label="Recent results">
              <h2 className="mb-2 font-medium">Recent results</h2>
              {d.recent.length === 0 ? (
                <p className="rounded-md border border-line bg-surface p-4 text-sm text-muted">No quizzes taken yet.</p>
              ) : (
                <ul className="divide-y divide-line rounded-md border border-line bg-surface">
                  {d.recent.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/quiz/results?id=${a.id}`}
                        className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-paper"
                      >
                        <span className="min-w-0 flex-1 truncate">{a.scopeName}</span>
                        <span className={`font-medium tabular-nums ${a.summary?.passed ? "text-good" : "text-danger"}`}>
                          {a.summary ? formatPercent(a.summary.credit) : ""}
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

      <BackupStatus link />
    </div>
  );
}
