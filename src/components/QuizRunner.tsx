"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/format";
import { useAttempt } from "@/lib/hooks";
import { abandonAttempt, isComplete, saveTime, setCurrentIndex, submitAttempt } from "@/lib/quiz";
import QuestionPane from "./QuestionPane";

function Redirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return <p className="text-sm text-muted">Opening the results…</p>;
}

export default function QuizRunner({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const attempt = useAttempt(attemptId);
  const [paused, setPaused] = useState(false);
  const [live, setLive] = useState<{ index: number; ms: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (attempt === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (attempt === null) {
    return <p className="text-sm">That quiz no longer exists.</p>;
  }
  if (attempt.status === "submitted") return <Redirect to={`/quiz/results?id=${attemptId}`} />;
  if (attempt.status === "abandoned") return <Redirect to="/quiz" />;

  const items = attempt.items;
  const total = items.length;
  const index = Math.max(0, Math.min(attempt.currentIndex, total - 1));
  const item = items[index];
  const mock = attempt.mode === "mock";
  const isLast = index === total - 1;
  const answered = items.filter(isComplete).length;
  const totalMs = items.reduce(
    (sum, it, i) => sum + (live && live.index === i && live.ms > it.activeMs ? live.ms : it.activeMs),
    0,
  );

  async function finish() {
    if (submitting) return;
    const unanswered = items.length - items.filter(isComplete).length;
    if (unanswered > 0) {
      const ok = window.confirm(
        `${unanswered} question${unanswered === 1 ? " is" : "s are"} not fully answered and will score 0. Submit anyway?`,
      );
      if (!ok) return;
    }
    setSubmitting(true);
    if (live) await saveTime(attemptId, live.index, live.ms);
    await submitAttempt(attemptId);
    router.push(`/quiz/results?id=${attemptId}`);
  }

  async function discard() {
    if (!window.confirm("Discard this quiz? Your answers so far will not be scored.")) return;
    await abandonAttempt(attemptId);
    router.push("/quiz");
  }

  function advance() {
    if (isLast) void finish();
    else void setCurrentIndex(attemptId, index + 1);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 rounded-md border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{attempt.scopeName}</p>
            <p className="text-xs text-muted">
              {mock ? "Mock board: no pause, no going back" : "Standard quiz"} · {answered} of {total} answered
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Quiz time</p>
            <p className="text-lg font-semibold tabular-nums">{formatDuration(totalMs)}</p>
          </div>
          {!mock && (
            <button className="btn" onClick={() => setPaused((p) => !p)}>
              {paused ? "Resume" : "Pause"}
            </button>
          )}
          {!mock && (
            <button className="btn" onClick={() => void finish()} disabled={submitting}>
              Submit quiz
            </button>
          )}
          <button className="btn btn-danger" onClick={() => void discard()}>
            Discard
          </button>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded bg-paper" aria-hidden>
          <div className="h-full bg-accent" style={{ width: `${(answered / total) * 100}%` }} />
        </div>

        {!mock && (
          <nav aria-label="Questions" className="mt-3 flex flex-wrap gap-1">
            {items.map((it, i) => {
              const done = isComplete(it);
              const partial = !done && Boolean(it.selectedChoiceId);
              return (
                <button
                  key={it.questionId + i}
                  aria-label={`Question ${i + 1}${done ? ", answered" : partial ? ", needs a sureness rating" : ""}`}
                  aria-current={i === index ? "step" : undefined}
                  onClick={() => void setCurrentIndex(attemptId, i)}
                  className={`h-8 min-w-8 rounded border px-2 text-sm tabular-nums ${
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
        )}
      </div>

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
  );
}
