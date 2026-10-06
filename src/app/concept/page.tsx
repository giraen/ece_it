"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import ConceptEditor from "@/components/ConceptEditor";
import { db } from "@/lib/db";
import { useNodes } from "@/lib/hooks";

function Loader() {
  const params = useSearchParams();
  const id = params.get("id");
  const topic = params.get("topic");
  const nodes = useNodes();
  const concept = useLiveQuery(async () => (id ? ((await db.concepts.get(id)) ?? null) : null), [id]);

  if (!nodes || concept === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (id && (!concept || concept.deletedAt)) {
    return (
      <p className="text-sm">
        That concept no longer exists.{" "}
        <Link href="/bank?tab=concepts" className="underline">
          Back to the bank
        </Link>
      </p>
    );
  }
  return <ConceptEditor key={concept?.id ?? "new"} initial={concept ?? null} defaultTopicId={topic} nodes={nodes} />;
}

export default function ConceptPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Loader />
    </Suspense>
  );
}