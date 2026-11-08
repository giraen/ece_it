"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/format";
import type { AttemptItem } from "@/lib/db";
import { useAttempt } from "@/lib/hooks";
import { abandonAttempt, isComplete, saveTime, setCurrentIndex, submitAttempt } from "@/lib/quiz/quiz";
import { confirmAction } from "@/lib/ui/dialog";
import QuestionPane from "./QuestionPane";
import PracticeTag from "@/components/ui/PracticeTag";
import { CloseIcon, GridIcon } from "@/components/ui/icons";

function Redirect({ to, text }: { to: string; text: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <p className="text-sm text-muted">{text}</p>;
}

/** The numbered buttons, one per question. It scrolls by itself, and keeps the current question in view. */
function QuestionNav({
  items,
  index,
  onPick,
  big = false,
}: {
  items: AttemptItem[];
  index: number;
  onPick: (i: number) => void;
  /** Bigger buttons, six to a row, for a finger on a phone. */
  big?: boolean;
}) {
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest" });
  }, [index]);
  return (
    <nav
      aria-label="Questions"
      className={`scroll-thin -mx-1 grid min-h-0 gap-1 overflow-y-auto py-1 pr-2.5 pl-1 ${big ? "grid-cols-6" : "grid-cols-5"}`}
    >
      {items.map((it, i) => {
        const done = isComplete(it);
        const partial = !done && Boolean(it.selectedChoiceId);
        return (
          <button
            key={`${i}-${it.questionId}`}
            ref={i === index ? current : undefined}
            aria-label={`Question ${i + 1}${done ? ", answered" : partial ? ", needs a sureness rating" : ""}`}
            aria-current={i === index ? "step" : undefined}
            onClick={() => onPick(i)}
            className={`${big ? "h-10" : "h-8"} rounded border text-sm tabular-nums ${
              i === index
                ? "border-accent bg-accent text-white"
                : done
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : partial
                    ? "border-line bg-surface text-ink underline decoration-dotted"
                    : "border-line bg-surface text-muted"
            }`}
          >
            {i + 1}
          </button>
        );
      })}
    </nav>
  );
}

export default function QuizRunner({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const attempt = useAttempt(attemptId);
  const [paused, setPaused] = useState(false);
  const [live, setLive] = useState<{ index: number; ms: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // On a phone the question numbers and the quiz buttons sit in a sheet that slides up.
  const [sheet, setSheet] = useState(false);

  if (attempt === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (attempt === null) return <p className="text-sm">That quiz no longer exists.</p>;
  if (attempt.status === "submitted")
    return <Redirect to={`/quiz/results?id=${attemptId}`} text="Opening the results…" />;
  if (attempt.status === "abandoned") return <Redirect to="/quiz" text="That quiz was discarded." />;

  const items = attempt.items;
  const total = items.length;
  const index = Math.max(0, Math.min(attempt.currentIndex, total - 1));
  const item = items[index];
  const mock = attempt.mode === "mock";
  const isLast = index === total - 1;
  const answered = items.filter(isComplete).length;
  // Time spent, counting the live clock on the question being shown. The target is the sum of every item's target.
  const totalMs = items.reduce(
    (sum, it, i) => sum + (live && live.index === i && live.ms > it.activeMs ? live.ms : it.activeMs),
    0,
  );
  const targetMs = items.reduce((sum, it) => sum + it.targetSec * 1000, 0);

  async function finish() {
    if (submitting) return;
    const unanswered = items.length - items.filter(isComplete).length;
    if (unanswered > 0) {
      const ok = await confirmAction({
        title: "Submit with unanswered questions?",
        message: `${unanswered} question${unanswered === 1 ? " is" : "s are"} not fully answered and will score 0.`,
        confirmLabel: "Submit anyway",
      });
      if (!ok) return;
    }
    setSubmitting(true);
    if (live) await saveTime(attemptId, live.index, live.ms);
    await submitAttempt(attemptId);
    router.push(`/quiz/results?id=${attemptId}`);
  }

  async function discard() {
    const ok = await confirmAction({
      title: "Discard this quiz?",
      message: "Your answers so far will not be scored.",
      confirmLabel: "Discard",
      danger: true,
    });
    if (!ok) return;
    await abandonAttempt(attemptId);
    router.push("/quiz");
  }

  function advance() {
    if (isLast) void finish();
    else void setCurrentIndex(attemptId, index + 1);
  }

  const title = (
    <p className="text-sm font-medium">
      {attempt.scopeName}
      {attempt.practice && <PracticeTag />}
    </p>
  );
  const status = (
    <p className="text-xs text-muted">
      {mock ? "Mock board: no pause, no going back · " : ""}
      {answered} of {total} answered
    </p>
  );
  const progress = (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-paper" aria-hidden>
      <div className="h-full bg-accent" style={{ width: `${(answered / total) * 100}%` }} />
    </div>
  );
  const actions = (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      {!mock && (
        <div className="grid grid-cols-2 gap-2">
          <button
            className="btn"
            onClick={() => {
              setPaused((p) => !p);
              setSheet(false);
            }}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button className="btn" onClick={() => void finish()} disabled={submitting}>
            Submit quiz
          </button>
        </div>
      )}
      <button className="btn btn-danger" onClick={() => void discard()}>
        Discard
      </button>
    </div>
  );

  return (
    <div className="mx-auto grid max-w-6xl items-start grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-y-6">
      {/* Phone: a slim bar at the top with the quiz time, and a button for the numbers and the quiz buttons. */}
      <div className="sticky top-0 z-30 -mx-4 border-b border-line bg-surface px-4 pt-2 pb-2.5 lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate">{title}</div>
            <p className="text-xs text-muted tabular-nums">
              {answered}/{total} answered · {formatDuration(totalMs)} of {formatDuration(targetMs)}
            </p>
          </div>
          <button
            type="button"
            className="btn shrink-0 py-2"
            aria-expanded={sheet}
            aria-label={mock ? "Quiz options" : "Questions and quiz options"}
            onClick={() => setSheet(true)}
          >
            <GridIcon />
            {mock ? "Options" : "Questions"}
          </button>
        </div>
        {progress}
      </div>

      {sheet && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Quiz">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => setSheet(false)}
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[80vh] flex-col gap-3 rounded-t-xl border-t border-line bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-lg">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {title}
                {status}
              </div>
              <button
                type="button"
                aria-label="Close"
                className="rounded p-1 text-muted"
                onClick={() => setSheet(false)}
              >
                <CloseIcon />
              </button>
            </div>
            {!mock && (
              <QuestionNav
                big
                items={items}
                index={index}
                onPick={(i) => {
                  void setCurrentIndex(attemptId, i);
                  setSheet(false);
                }}
              />
            )}
            {actions}
          </div>
        </div>
      )}

      <div className="min-w-0">
        <QuestionPane
          key={`${attemptId}-${index}`}
          attemptId={attemptId}
          index={index}
          total={total}
          item={item}
          paused={paused}
          isLast={isLast}
          onTick={(i, ms) => setLive({ index: i, ms })}
          onAdvance={advance}
          onPrev={!mock && index > 0 ? () => void setCurrentIndex(attemptId, index - 1) : undefined}
        />
      </div>

      {/* Everything about the quiz as a whole sits on the right and stays in view, however many questions there are. */}
      <aside
        aria-label="Quiz"
        className="sticky top-4 flex max-h-[calc(100vh-7rem)] flex-col gap-3 rounded-md border border-line bg-surface p-3 max-lg:hidden"
      >
        <div>
          {title}
          {status}
        </div>

        <div>
          <p className="text-xs text-muted">Quiz time · target {formatDuration(targetMs)}</p>
          <p className="text-lg font-semibold tabular-nums">{formatDuration(totalMs)}</p>
          {progress}
        </div>

        {!mock && <QuestionNav items={items} index={index} onPick={(i) => void setCurrentIndex(attemptId, i)} />}

        {actions}
      </aside>
    </div>
  );
}
