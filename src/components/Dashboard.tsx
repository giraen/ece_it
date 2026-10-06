"use client";

import Link from "next/link";
import { computeDashboard, EXPIRING_DAYS } from "@/lib/dashboard";
import { formatCountdown, formatDate, formatPercent } from "@/lib/format";
import { useAttempts, useNodes, useNow, useQuestions } from "@/lib/hooks";
import { pathOf } from "@/lib/tree";
import BackupStatus from "./BackupStatus";

const DAY = 86_400_000;

function Tile({
  href,
  value,
  label,
  note,
  tone = "plain",
}: {
  href: string;
  value: React.ReactNode;
  label: string;
  note?: string;
  tone?: "plain" | "warn" | "good";
}) {
  const color = tone === "warn" ? "text-danger" : tone === "good" ? "text-good" : "text-ink";
  return (
    <Link href={href} className="block rounded-md border border-line bg-surface p-4 hover:border-accent/60">
      <p className={`text-3xl font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
    </Link>
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
  const nextLocked = d.locked[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Home</h1>
          <p className="text-sm text-muted">A quick look at where things stand.</p>
        </div>
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

          <section aria-label="Overview" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              href="/progress"
              value={d.topicsLeft}
              label="Topics left to master"
              note={`${d.topicsMastered} of ${d.topics} mastered`}
              tone={d.topicsLeft === 0 ? "good" : "plain"}
            />
            <Tile
              href="/progress"
              value={d.expiringSoon.length}
              label="Mastery expiring soon"
              note={`Within ${EXPIRING_DAYS} days`}
              tone={d.expiringSoon.length > 0 ? "warn" : "plain"}
            />
            <Tile
              href="/progress"
              value={d.expired}
              label="Mastery expired"
              note="Needs a retake"
              tone={d.expired > 0 ? "warn" : "plain"}
            />
            <Tile href="/quiz" value={d.neverTaken} label="Topics never quizzed" note="With at least one question" />
            <Tile href="/quiz" value={d.inProgress} label="Quizzes in progress" note="Pick up where you left off" />
            <Tile
              href="/progress"
              value={d.locked.length}
              label="Locked after a fail"
              note={nextLocked ? `Next opens in ${formatCountdown(nextLocked.until - nowMs)}` : "Nothing is locked"}
            />
            <Tile href="/bank" value={d.questions} label="Questions in your bank" />
            <Tile href="/progress?tab=analytics" value={d.quizzesTaken} label="Quizzes taken" note="See analytics" />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-label="Expiring soon">
              <h2 className="mb-2 font-medium">Expiring soon</h2>
              {d.expiringSoon.length === 0 ? (
                <p className="rounded-md border border-line bg-surface p-4 text-sm text-muted">
                  No mastery runs out in the next {EXPIRING_DAYS} days.
                </p>
              ) : (
                <ul className="divide-y divide-line rounded-md border border-line bg-surface">
                  {d.expiringSoon.slice(0, 5).map((x) => {
                    const left = Math.max(1, Math.ceil((x.expiresAt - nowMs) / DAY));
                    return (
                      <li key={x.node.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{pathOf(nodes, x.node.id)}</span>
                        <span className="text-xs text-danger">
                          {left} day{left === 1 ? "" : "s"} · {formatDate(x.expiresAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

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