"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { composeBlueprintQuiz } from "@/lib/blueprint";
import type { Blueprint, Question, QuizAttempt, TreeNode } from "@/lib/db";
import { formatCountdown, formatDate, formatDuration } from "@/lib/format";
import { masteryFor } from "@/lib/mastery";
import { startAttempt } from "@/lib/quiz";
import { MAX_MINUTES, suggestedMinutes } from "@/lib/quizPlan";
import { targetSecPerItem } from "@/lib/scoring";

interface Props {
  /** A category. */
  node: TreeNode;
  nodes: TreeNode[];
  questions: Question[];
  blueprint: Blueprint | null;
  attempts: QuizAttempt[];
  nowMs: number;
}

/** Set up a mock board: see what the blueprint will draw, choose the time, and start. */
export default function NewMockForm({ node, nodes, questions, blueprint, attempts, nowMs }: Props) {
  const router = useRouter();
  const [minutesText, setMinutesText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const info = masteryFor(attempts, node, nowMs);
  const locked = info.lockedUntil !== undefined;

  if (!blueprint) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="text-xl font-semibold">Mock board</h1>
        <p className="font-medium">{node.name}</p>
        <p className="rounded-md border border-dashed border-line p-5 text-sm text-muted">
          A mock board follows a blueprint: how many questions in total, and what share comes from each subject or
          topic. Set one up for {node.name} to start.
        </p>
        <div className="flex gap-2">
          <Link href={`/blueprint?category=${node.id}`} className="btn btn-primary">
            Set up the blueprint
          </Link>
          <Link href="/quiz" className="btn">
            Back
          </Link>
        </div>
      </div>
    );
  }

  // A trial run of the picking shows what the blueprint can fill. The questions themselves are drawn again at the start.
  const trial = composeBlueprintQuiz({ nodes, questions, blueprint });
  const items = trial.picks.length;
  const minutesValue = Number(minutesText ?? suggestedMinutes(items));
  const minutesError =
    !Number.isInteger(minutesValue) || minutesValue < 1 || minutesValue > MAX_MINUTES
      ? `Enter a whole number of minutes from 1 to ${MAX_MINUTES.toLocaleString()}.`
      : null;
  const perItemSec = items > 0 && !minutesError ? targetSecPerItem(minutesValue * 60, items) : 0;

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const id = await startAttempt(node.id, items, minutesValue);
      router.push(`/quiz/play?id=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the mock.");
      setStarting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Mock board</h1>
        <p className="mt-1 font-medium">{node.name}</p>
        <p className="text-sm text-muted">
          Follows the blueprint: {blueprint.totalItems} item{blueprint.totalItems === 1 ? "" : "s"} across{" "}
          {blueprint.entries.length} entr{blueprint.entries.length === 1 ? "y" : "ies"}.{" "}
          <Link href={`/blueprint?category=${node.id}`} className="underline">
            Edit the blueprint
          </Link>
        </p>
      </div>

      {info.lockedUntil !== undefined && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          Locked after a failed mock. You can retake this category in {formatCountdown(info.lockedUntil - nowMs)}.
          Mastery you already hold is not affected.
        </p>
      )}
      {info.status === "mastered" && info.expiresAt !== undefined && (
        <p className="rounded-md border border-good/40 bg-good/5 p-3 text-sm text-good">
          Mastered until {formatDate(info.expiresAt)}. Passing again starts a fresh window.
        </p>
      )}
      {info.status === "expired" && info.expiresAt !== undefined && (
        <p className="rounded-md border border-line bg-surface p-3 text-sm text-muted">
          Mastery expired on {formatDate(info.expiresAt)}.
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-line bg-surface p-3">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="pb-2 text-left font-medium">Entry</th>
              <th className="px-2 pb-2 text-right font-medium">Items</th>
              <th className="pb-2 pl-2 text-right font-medium">In the bank</th>
            </tr>
          </thead>
          <tbody>
            {trial.allocations.map((a) => (
              <tr key={a.entryId} className="border-t border-line">
                <td className="py-1.5">{a.label}</td>
                <td className={`px-2 text-right tabular-nums ${a.picked < a.wanted ? "text-danger" : ""}`}>
                  {a.picked} of {a.wanted}
                </td>
                <td className="pl-2 text-right tabular-nums text-muted">{a.available}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {trial.shortfall && (
        <p className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          The bank has fewer questions than the blueprint asks for, so this mock would have {items} item
          {items === 1 ? "" : "s"} instead of {blueprint.totalItems}. You can start the shorter mock or add more
          questions first.
        </p>
      )}

      <p
        aria-label="Mastery"
        className={`rounded-md border p-3 text-sm ${
          trial.eligible ? "border-good/40 bg-good/5 text-good" : "border-line bg-surface text-muted"
        }`}
      >
        {trial.eligible
          ? "This mock can award mastery if you reach the bar."
          : `Practice only. ${trial.reason ?? "This mock cannot award mastery."}`}
      </p>

      <div>
        <label htmlFor="minutes" className="mb-1 block text-sm font-medium">
          Total time
        </label>
        <div className="flex items-center gap-2">
          <input
            id="minutes"
            className="input w-32"
            inputMode="numeric"
            value={minutesText ?? String(suggestedMinutes(items))}
            onChange={(e) => setMinutesText(e.target.value)}
          />
          <span className="text-sm text-muted">minutes</span>
        </div>
        <p className={`mt-1 text-xs ${minutesError ? "text-danger" : "text-muted"}`}>
          {minutesError ?? "Suggested from the number of items. Change it to anything you like."}
        </p>
      </div>

      {perItemSec > 0 && (
        <p className="text-sm">
          About <strong>{formatDuration(perItemSec * 1000)}</strong> per question. As in every quiz, the time is a
          target and a statistic only.
        </p>
      )}

      <ul className="list-disc space-y-1 rounded-md border border-line bg-surface py-3 pr-4 pl-8 text-sm">
        <li>
          <strong>No pausing and no going back.</strong> Each answer is final once you confirm it.
        </li>
        <li>Every question must be answered to move on, and the mock ends after the last one.</li>
        <li>You can still discard the mock, but then none of it is scored.</li>
      </ul>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <button
          className="btn btn-primary"
          disabled={starting || locked || items === 0 || minutesError !== null}
          onClick={() => void start()}
        >
          {starting ? "Starting…" : "Start mock"}
        </button>
        <Link href="/quiz" className="btn">
          Back
        </Link>
      </div>
    </div>
  );
}