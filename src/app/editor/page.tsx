"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import QuestionEditor from "@/components/QuestionEditor";
import { useNodes } from "@/lib/hooks";

function EditorLoader() {
  const topic = useSearchParams().get("topic");
  const nodes = useNodes();

  if (!nodes) return <p className="text-sm text-muted">Loading…</p>;
  return <QuestionEditor defaultTopicId={topic} nodes={nodes} />;
}

export default function EditorPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <EditorLoader />
    </Suspense>
  );
}