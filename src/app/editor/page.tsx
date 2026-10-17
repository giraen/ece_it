"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import QuestionEditor from "@/components/QuestionEditor";
import { db } from "@/lib/db";
import { useNodes } from "@/lib/hooks";
import LoadingScreen from "@/components/LoadingScreen";

function EditorLoader() {
  const params = useSearchParams();
  const id = params.get("id");
  const topic = params.get("topic");
  const nodes = useNodes();
  const question = useLiveQuery(async () => (id ? ((await db.questions.get(id)) ?? null) : null), [id]);

  if (!nodes || question === undefined) return <LoadingScreen />;

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

  return <QuestionEditor key={question?.id ?? "new"} initial={question ?? null} defaultTopicId={topic} nodes={nodes} />;
}

export default function EditorPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <EditorLoader />
    </Suspense>
  );
}