"use client";

import Link from "next/link";
import QuizPicker from "@/components/QuizPicker";
import { formatDateTime } from "@/lib/format";
import { useAttempts, useBlueprints, useNodes, useNow, useQuestions } from "@/lib/hooks";
import { abandonAttempt, isComplete } from "@/lib/quiz";

export default function QuizPage() {
  const nodes = useNodes();
  const questions = useQuestions();
  const attempts = useAttempts();
  const nowMs = useNow();
  const blueprints = useBlueprints();
  const inProgress = (attempts ?? [])
    .filter((a) => a.status === "in_progress")
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Quiz</h1>
        <p className="mt-1 text-sm text-muted">
          Choose a topic or a subject to be quizzed on, or run a mock board for a whole category. A quiz needs enough
          questions to award mastery. With fewer, you can still take it for practice.
        </p>
      </div>

      {inProgress.length > 0 && (
        <section aria-label="In progress" className="space-y-2">
          <h2 className="font-medium">In progress</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {inProgress.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.scopeName}</p>
                  <p className="text-xs text-muted">
                    {a.items.filter(isComplete).length} of {a.items.length} answered · started{" "}
                    {formatDateTime(a.startedAt)}
                  </p>
                </div>
                <Link href={`/quiz/play?id=${a.id}`} className="btn btn-primary">
                  Resume
                </Link>
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    if (window.confirm("Discard this quiz? Your answers so far will not be scored."))
                      await abandonAttempt(a.id);
                  }}
                >
                  Discard
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Start a quiz" className="space-y-2">
        <h2 className="font-medium">Start a quiz</h2>
        {nodes && questions && attempts && blueprints ? (
          <QuizPicker nodes={nodes} questions={questions} attempts={attempts} blueprints={blueprints} nowMs={nowMs} />
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </section>
    </div>
  );
}