"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import QuizPicker from "@/components/quiz/QuizPicker";
import { formatDateTime } from "@/lib/format";
import { useAttempts, useBlueprints, useNodes, useNow, useQuestions } from "@/lib/hooks";
import { abandonAttempt, isComplete } from "@/lib/quiz/quiz";
import { confirmAction } from "@/lib/ui/dialog";
import InfoTip from "@/components/ui/InfoTip";
import PracticeTag from "@/components/ui/PracticeTag";
import { IncognitoNote, IncognitoSwitch, IncognitoTag } from "@/components/ui/Incognito";
import LoadingScreen from "@/components/layout/LoadingScreen";

export default function QuizPage() {
  const nodes = useNodes();
  const questions = useQuestions();
  const attempts = useAttempts();
  const nowMs = useNow();
  const blueprints = useBlueprints();
  // The incognito quiz, if it is still going, is listed with the rest.
  const incognito = useLiveQuery(() => db.incognitoAttempts.toArray(), []);
  const inProgress = [...(attempts ?? []), ...(incognito ?? [])]
    .filter((a) => a.status === "in_progress")
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1">
          <h1 className="text-xl font-semibold">Quiz</h1>
          <InfoTip>
            Choose a topic or a subject to be quizzed on, or run a mock board for a whole category. A quiz needs enough
            questions to award mastery. With fewer, you can still take it for practice.
          </InfoTip>
          <IncognitoSwitch className="ml-auto" />
        </div>
        <IncognitoNote what="both" />
      </div>

      {inProgress.length > 0 && (
        <section aria-label="In progress" className="space-y-2">
          <h2 className="font-medium">In progress</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {inProgress.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {a.scopeName}
                    {a.practice && <PracticeTag />}
                    {a.incognito && <IncognitoTag />}
                  </p>
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
                    const ok = await confirmAction({
                      title: "Discard this quiz?",
                      message: "Your answers so far will not be scored.",
                      confirmLabel: "Discard",
                      danger: true,
                    });
                    if (ok) await abandonAttempt(a.id);
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
          <LoadingScreen />
        )}
      </section>
    </div>
  );
}
