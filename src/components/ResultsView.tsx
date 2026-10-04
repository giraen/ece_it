"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CONFIG } from "@/lib/config";
import type { AttemptItem, QuizAttempt } from "@/lib/db";
import { formatDuration, formatPercent, formatRatio } from "@/lib/format";
import { groupKeysFor, startAttempt } from "@/lib/quiz";
import { groupStats, needsWork, SURENESS_LABEL, type GroupStats } from "@/lib/scoring";
import RichText from "./RichText";

const letter = (i: number) => String.fromCharCode(65 + i);

/** Images become a short marker so review rows stay one line. */
function oneLine(stem: string): string {
  return stem.replace(/!\[[^\]]*\]\(img:[^)]*\)/g, "[image]").replace(/\s+/g, " ").trim();
}

function GroupRow({
  g,
  depth = 0,
  toggle,
}: {
  g: GroupStats;
  depth?: number;
  toggle?: { open: boolean; onClick: () => void };
}) {
  const bar = CONFIG.passBar;
  const ok = g.credit + 1e-9 >= bar;
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-3" style={{ paddingLeft: depth * 20 }}>
        {toggle ? (
          <button className="mr-1 w-4 text-xs text-muted" aria-label={toggle.open ? "Collapse" : "Expand"} onClick={toggle.onClick}>
            {toggle.open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="mr-1 inline-block w-4" />
        )}
        {g.label}
      </td>
      <td className={`px-2 text-right tabular-nums ${ok ? "text-good" : "text-danger"}`}>{formatPercent(g.credit)}</td>
      <td className="px-2 text-right tabular-nums">
        {g.correct}/{g.n}
      </td>
      <td className="px-2 text-right tabular-nums">{g.sureness.sure}</td>
      <td className="px-2 text-right tabular-nums">{g.sureness.not_sure}</td>
      <td className="px-2 text-right tabular-nums">{g.sureness.wise_guess}</td>
      <td className="px-2 text-right tabular-nums">{g.sureness.just_guessed}</td>
      <td className="pl-2 text-right tabular-nums">{g.medianRatio ? formatRatio(g.medianRatio) : "–"}</td>
    </tr>
  );
}

function topicGroups(items: AttemptItem[]): GroupStats[] {
  return groupStats(items, (it) => [{ key: it.topicId, label: it.topicName }]);
}

export default function ResultsView({ attempt }: { attempt: QuizAttempt }) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = attempt.items;
  const s = attempt.summary;
  if (!s) return <p className="text-sm">This quiz has no results yet.</p>;

  const groups = groupStats(items, (it) => groupKeysFor(attempt.scopeKind, it));
  const sortedGroups = [...groups].sort((a, b) => a.credit - b.credit);
  const weak = needsWork(groups);
  const weakestTopic = topicGroups(items)
    .filter((g) => g.credit + 1e-9 < CONFIG.passBar)
    .sort((a, b) => a.credit - b.credit)[0];
  const groupLabel =
    attempt.scopeKind === "category" ? "Subject" : attempt.scopeKind === "subject" ? "Topic" : "Tag";

  const maxMs = Math.max(1, ...items.map((i) => Math.max(i.activeMs, i.targetSec * 1000 * 1.2)));

  async function again(scopeId: string, length: number) {
    setBusy(true);
    setError(null);
    try {
      const id = await startAttempt(scopeId, length);
      router.push(`/quiz/play?id=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the quiz.");
      setBusy(false);
    }
  }

  function toggleOpen(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="text-sm text-muted">
          {attempt.mode === "mock" ? "Mock board" : "Quiz"} results
          {attempt.submittedAt ? ` · ${new Date(attempt.submittedAt).toLocaleString()}` : ""}
        </p>
        <h1 className="text-xl font-semibold">{attempt.scopeName}</h1>
      </header>

      <section aria-label="Overall" className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-line bg-surface p-4 sm:col-span-2">
          <p className="text-sm text-muted">Credit score</p>
          <p className={`text-3xl font-semibold tabular-nums ${s.passed ? "text-good" : "text-danger"}`}>
            {formatPercent(s.credit)}
          </p>
          <p className="mt-1 text-sm">
            {s.passed
              ? `Reached the ${formatPercent(s.bar, 0)} mastery bar.`
              : s.credit + 1e-9 >= s.bar && s.failedGroups.length > 0
                ? `Score is above the bar, but ${s.failedGroups.join(", ")} fell below ${formatPercent(CONFIG.childFloor, 0)}.`
                : `Below the ${formatPercent(s.bar, 0)} mastery bar.`}
          </p>
        </div>
        <div className="rounded-md border border-line bg-surface p-4">
          <p className="text-sm text-muted">Correct</p>
          <p className="text-2xl font-semibold tabular-nums">
            {s.correct}/{s.n}
          </p>
          <p className="text-sm text-muted">{formatPercent(s.accuracy, 0)} accuracy</p>
        </div>
        <div className="rounded-md border border-line bg-surface p-4">
          <p className="text-sm text-muted">Time</p>
          <p className="text-2xl font-semibold tabular-nums">{formatDuration(s.totalMs)}</p>
          <p className="text-sm text-muted">{s.answered} of {s.n} answered</p>
        </div>
      </section>
      <p className="-mt-5 text-xs text-muted">
        Credit counts how sure you were and how fast you answered, not just whether you were right. Mastery records and
        retake cooldowns arrive in the next update; this result is saved to your history.
      </p>

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
                <th className="px-2 pb-2 text-right font-medium">{SURENESS_LABEL.sure}</th>
                <th className="px-2 pb-2 text-right font-medium">{SURENESS_LABEL.not_sure}</th>
                <th className="px-2 pb-2 text-right font-medium">{SURENESS_LABEL.wise_guess}</th>
                <th className="px-2 pb-2 text-right font-medium">{SURENESS_LABEL.just_guessed}</th>
                <th className="pb-2 pl-2 text-right font-medium">Pace vs target</th>
              </tr>
            </thead>
            <tbody>
              {sortedGroups.map((g) => (
                <Fragment key={g.key}>
                  <GroupRow
                    g={g}
                    toggle={
                      attempt.scopeKind === "category"
                        ? { open: open.has(g.key), onClick: () => toggleOpen(g.key) }
                        : undefined
                    }
                  />
                  {attempt.scopeKind === "category" &&
                    open.has(g.key) &&
                    topicGroups(items.filter((it) => it.subjectId === g.key))
                      .sort((a, b) => a.credit - b.credit)
                      .map((t) => <GroupRow key={t.key} g={t} depth={1} />)}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted">
          Pace is the median time taken divided by the target time. Under 1.0× is on target.
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
                <div className="relative h-3 flex-1 rounded bg-paper" role="img" aria-label={`Question ${i + 1}: ${formatDuration(it.activeMs)} against a target of ${formatDuration(it.targetSec * 1000)}`}>
                  <div className={`absolute top-0 left-0 h-3 rounded ${color}`} style={{ width: `${width}%` }} />
                  <div className="absolute -top-0.5 h-4 w-0.5 bg-ink" style={{ left: `${target}%` }} title="Target time" />
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

      <section aria-label="Review">
        <h2 className="mb-2 font-medium">Review</h2>
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {items.map((it, i) => {
            const byId = new Map(it.choices.map((c) => [c.id, c]));
            return (
              <li key={it.questionId + i}>
                <details>
                  <summary className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-6 shrink-0 text-right tabular-nums text-muted">{i + 1}</span>
                    <span className={`w-5 shrink-0 font-medium ${!it.answered ? "text-muted" : it.correct ? "text-good" : "text-danger"}`} aria-label={!it.answered ? "Unanswered" : it.correct ? "Correct" : "Wrong"}>
                      {!it.answered ? "–" : it.correct ? "✓" : "✗"}
                    </span>
                    <RichText text={oneLine(it.stem)} className="min-w-0 flex-1 truncate" />
                    <span className="shrink-0 tabular-nums text-muted">{formatDuration(it.activeMs)}</span>
                  </summary>
                  <div className="space-y-3 border-t border-line bg-paper/50 px-4 py-3">
                    <RichText text={it.stem} className="text-[15px]" />
                    <ol className="space-y-1.5">
                      {it.choiceOrder.map((cid, ci) => {
                        const c = byId.get(cid);
                        if (!c) return null;
                        const mine = it.selectedChoiceId === cid;
                        const right = it.correctChoiceId === cid;
                        return (
                          <li
                            key={cid}
                            className={`flex gap-3 rounded-md border px-3 py-2 text-[15px] ${
                              right ? "border-good bg-good/5" : mine ? "border-danger bg-danger/5" : "border-line bg-surface"
                            }`}
                          >
                            <span className="w-5 shrink-0 font-medium text-muted">{letter(ci)}</span>
                            <div className="min-w-0 flex-1">
                              <RichText text={c.text} />
                            </div>
                            <span className="shrink-0 text-xs">
                              {right && <span className="text-good">Correct</span>}
                              {right && mine && " · "}
                              {mine && <span>Your answer</span>}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                    <p className="text-sm text-muted">
                      {it.sureness ? `You rated it: ${SURENESS_LABEL[it.sureness]}.` : "No sureness rating."} Time{" "}
                      {formatDuration(it.activeMs)} against a target of {formatDuration(it.targetSec * 1000)}. Credit{" "}
                      {formatPercent(it.credit)}.
                    </p>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2 pb-8">
        <button className="btn btn-primary" disabled={busy} onClick={() => void again(attempt.scopeNodeId, items.length)}>
          Quiz this again
        </button>
        {weakestTopic && attempt.scopeKind !== "topic" && (
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              const topicId = items.find((it) => it.topicId === weakestTopic.key)?.topicId;
              if (topicId) void again(topicId, CONFIG.defaultLength.topic);
            }}
          >
            Practice weakest topic: {weakestTopic.label}
          </button>
        )}
        <Link href="/quiz" className="btn">
          Back to quizzes
        </Link>
      </div>
    </div>
  );
}
