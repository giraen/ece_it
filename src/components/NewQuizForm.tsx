"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Question, TreeNode } from "@/lib/db";
import { formatDuration } from "@/lib/format";
import { startAttempt } from "@/lib/quiz";
import {
  MAX_MINUTES,
  coverageFor,
  itemsProblem,
  minLengthForCoverage,
  planFor,
  suggestedMinutes,
} from "@/lib/quizPlan";
import { targetSecPerItem } from "@/lib/scoring";
import { pathOf, subtreeOf } from "@/lib/tree";

interface Props {
  /** A topic or a subject. */
  node: TreeNode;
  nodes: TreeNode[];
  questions: Question[];
}

/** Choose how many questions and how much time, see what that means, and start. */
export default function NewQuizForm({ node, nodes, questions }: Props) {
  const router = useRouter();
  const kind = node.kind === "topic" ? "topic" : "subject";

  const topicIds = new Set(
    subtreeOf(nodes, node.id)
      .filter((n) => n.kind === "topic")
      .map((n) => n.id),
  );
  const inScope = questions.filter((q) => topicIds.has(q.topicId));
  // Computation questions cannot be rolled into real numbers yet, so a quiz leaves them out.
  const pool = inScope.filter((q) => q.type === "standard");
  const leftOut = inScope.length - pool.length;
  const plan = planFor(kind, pool.length);

  const [itemsText, setItemsText] = useState(String(plan.defaultItems));
  const [minutesText, setMinutesText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const items = itemsText.trim() === "" ? NaN : Number(itemsText);
  const itemsError = itemsProblem(plan, items);
  const validItems = itemsError === null;

  // The time follows the suggestion until you type your own. A topic quiz is always one hour.
  const minutesValue =
    plan.fixedMinutes ?? Number(minutesText ?? suggestedMinutes(validItems ? items : plan.defaultItems));
  const minutesError =
    plan.fixedMinutes === null && (!Number.isInteger(minutesValue) || minutesValue < 1 || minutesValue > MAX_MINUTES)
      ? `Enter a whole number of minutes from 1 to ${MAX_MINUTES.toLocaleString()}.`
      : null;
  const perItemSec = validItems && !minutesError ? targetSecPerItem(minutesValue * 60, items) : 0;

  // What this quiz could earn.
  let mastery: { ok: boolean; text: string };
  if (!validItems) {
    mastery = { ok: false, text: "" };
  } else if (items < plan.masteryMin) {
    mastery = {
      ok: false,
      text:
        plan.available < plan.masteryMin
          ? `Practice only. Mastery needs at least ${plan.masteryMin} questions, and there are ${plan.available} here.`
          : `Practice only. Mastery needs at least ${plan.masteryMin} questions in a ${kind} quiz.`,
    };
  } else {
    const { keysOf, groupName } = coverageFor(kind);
    const need = minLengthForCoverage(pool, keysOf, plan.masteryMin);
    mastery =
      items < need
        ? {
            ok: false,
            text: `Practice only. To give every ${groupName} at least 2 questions, ask for at least ${need}.`,
          }
        : { ok: true, text: "This quiz can award mastery if you reach the bar." };
  }

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const id = await startAttempt(node.id, items, minutesValue);
      router.push(`/quiz/play?id=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the quiz.");
      setStarting(false);
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">New quiz</h1>
        <p className="mt-1 font-medium">{pathOf(nodes, node.id)}</p>
        <p className="text-sm text-muted">
          {pool.length} question{pool.length === 1 ? "" : "s"} available
          {leftOut > 0 && `. ${leftOut} computation question${leftOut === 1 ? " is" : "s are"} left out for now.`}
        </p>
      </div>

      {pool.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-5 text-sm text-muted">
          There are no questions to quiz on here yet.
        </p>
      ) : (
        <>
          <div>
            <label htmlFor="items" className="mb-1 block text-sm font-medium">
              Number of questions
            </label>
            <input
              id="items"
              className="input w-32"
              inputMode="numeric"
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
            />
            <p className={`mt-1 text-xs ${itemsError ? "text-danger" : "text-muted"}`}>
              {itemsError ?? `From 1 to ${plan.maxItems}. Mastery needs ${plan.masteryMin} or more.`}
            </p>
          </div>

          <div>
            <label htmlFor="minutes" className="mb-1 block text-sm font-medium">
              Total time
            </label>
            {plan.fixedMinutes !== null ? (
              <p className="text-sm">
                {plan.fixedMinutes === 60 ? "1 hour" : `${plan.fixedMinutes} minutes`}{" "}
                <span className="text-muted">(always the same for a topic quiz)</span>
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <input
                    id="minutes"
                    className="input w-32"
                    inputMode="numeric"
                    value={minutesText ?? String(suggestedMinutes(validItems ? items : plan.defaultItems))}
                    onChange={(e) => setMinutesText(e.target.value)}
                  />
                  <span className="text-sm text-muted">minutes</span>
                </div>
                <p className={`mt-1 text-xs ${minutesError ? "text-danger" : "text-muted"}`}>
                  {minutesError ?? "Suggested from the number of questions. Change it to anything you like."}
                </p>
              </>
            )}
          </div>

          {perItemSec > 0 && (
            <p className="rounded-md border border-line bg-surface p-3 text-sm">
              About <strong>{formatDuration(perItemSec * 1000)}</strong> per question. The time is a target only: the
              timer counts up and never stops the quiz, and it never changes your score. It is shown to you afterward as
              a statistic.
            </p>
          )}

          {mastery.text && (
            <p
              aria-label="Mastery"
              className={`rounded-md border p-3 text-sm ${
                mastery.ok ? "border-good/40 bg-good/5 text-good" : "border-line bg-surface text-muted"
              }`}
            >
              {mastery.text}
            </p>
          )}
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <button
          className="btn btn-primary"
          disabled={starting || pool.length === 0 || !validItems || minutesError !== null}
          onClick={() => void start()}
        >
          {starting ? "Starting…" : "Start quiz"}
        </button>
        <Link href="/quiz" className="btn">
          Back
        </Link>
      </div>
    </div>
  );
}