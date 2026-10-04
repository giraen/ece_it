"use client";

import Link from "next/link";
import { useNodes, useQuestions } from "@/lib/hooks";

export default function Home() {
  const nodes = useNodes();
  const questions = useQuestions();

  const count = (kind: string) => nodes?.filter((n) => n.kind === kind).length ?? 0;
  const label = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">ECE board review</h1>
        <p className="mt-2 text-muted">
          {nodes && questions
            ? `Your bank has ${label(count("category"), "category", "categories")}, ${label(count("subject"), "subject", "subjects")}, ${label(count("topic"), "topic", "topics")}, and ${label(questions.length, "question", "questions")}.`
            : "Loading your bank…"}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/bank" className="btn btn-primary">
          Open the question bank
        </Link>
        <Link href="/editor" className="btn">
          Write a new question
        </Link>
      </div>

      <section>
        <h2 className="mb-2 font-medium">Not built yet</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Quizzes with sureness ratings and a timer</li>
          <li>Mastery tracking for topics, subjects, and categories</li>
          <li>Backup and restore</li>
          <li>Computation questions and AI-reworded variants</li>
          <li>Analytics</li>
        </ul>
      </section>
    </div>
  );
}
