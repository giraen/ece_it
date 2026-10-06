"use client";

import QuizPicker from "@/components/QuizPicker";
import { useNodes, useQuestions } from "@/lib/hooks";

export default function QuizPage() {
  const nodes = useNodes();
  const questions = useQuestions();

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Quiz</h1>
        <p className="mt-1 text-sm text-muted">
          Choose a topic or a subject to be quizzed on. A quiz needs enough questions to award mastery. With fewer, you
          can still take it for practice.
        </p>
      </div>
      {nodes && questions ? (
        <QuizPicker nodes={nodes} questions={questions} />
      ) : (
        <p className="text-sm text-muted">Loading…</p>
      )}
    </div>
  );
}