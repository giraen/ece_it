"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSources } from "@/lib/sources";
import { tagStats } from "@/lib/tagAdmin";

const card =
  "block rounded-md border border-line bg-surface p-4 hover:bg-paper focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none";

/** Two cards that open the Sources and Tags pages, so those long lists are not in the middle of Settings. */
export default function LibraryLinks() {
  const sources = useSources();
  const tags = useLiveQuery(async () => {
    const [questions, notes] = await Promise.all([
      db.questions.filter((q) => !q.deletedAt).toArray(),
      db.concepts.filter((c) => !c.deletedAt).toArray(),
    ]);
    return tagStats(questions, notes).length;
  }, []);
  const count = (n: number | undefined, word: string) => (n === undefined ? " " : `${n} ${word}${n === 1 ? "" : "s"}`);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Link href="/settings/sources" className={card}>
        <span className="font-medium">Sources</span>
        <span className="mt-0.5 block text-sm text-muted">{count(sources?.length, "source")}</span>
        <span className="mt-2 block text-sm text-accent">Manage sources →</span>
      </Link>
      <Link href="/settings/tags" className={card}>
        <span className="font-medium">Tags</span>
        <span className="mt-0.5 block text-sm text-muted">{count(tags, "tag")}</span>
        <span className="mt-2 block text-sm text-accent">Manage tags →</span>
      </Link>
    </div>
  );
}