"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import QuestionEditor from "@/components/QuestionEditor";
import { db } from "@/lib/db";
import { useNodes } from "@/lib/hooks";

function EditorLoader() {
  const params = useSearchParams();
  const id = params.get("id");
  const topic = params.get("topic");
  const nodes = useNodes();
  const question = useLiveQuery(async () => (id ? ((await db.questions.get(id)) ?? null) : null), [id]);

  if (!nodes || question === undefined) return <p className="text-sm text-muted">Loading…</p>;

  if (id && (!question || question.deletedAt)) {
    return (
      <p className="text-sm">
        That question no longer exists.{" "}
        <Link href="/bank" className="underline">
          Back to the bank
        </Link>
      </p>
    );
  }

  // Computation questions have their own editor, coming in a later step. Opening one here could lose its formulas.
  if (question && question.type === "computation") {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-xl font-semibold">Edit question</h1>
        <p className="rounded-md border border-line bg-surface p-4 text-sm">
          This is a computation question, which is edited in a later step. It is left untouched for now so nothing is lost.
        </p>
        <Link href="/bank" className="btn">
          Back to the bank
        </Link>
      </div>
    );
  }

  return <QuestionEditor key={question?.id ?? "new"} initial={question ?? null} defaultTopicId={topic} nodes={nodes} />;
}

export default function EditorPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <EditorLoader />
    </Suspense>
  );
}