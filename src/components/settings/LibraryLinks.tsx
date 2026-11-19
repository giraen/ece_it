"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSources } from "@/lib/bank/sources";
import { tagStats } from "@/lib/bank/tagAdmin";

const card = "block card p-4 hover:bg-paper focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none";

/** Cards that open the Sources, Tags and Possible duplicates pages, so those long lists are not in the middle of Settings. */
export default function LibraryLinks() {
  const sources = useSources();
  const tags = useLiveQuery(async () => {
    const [questions, notes, cards] = await Promise.all([
      db.questions.filter((q) => !q.deletedAt).toArray(),
      db.concepts.filter((c) => !c.deletedAt).toArray(),
      db.cards.filter((c) => !c.deletedAt).toArray(),
    ]);
    return tagStats(questions, notes, cards).length;
  }, []);
  const count = (n: number | undefined, word: string) => (n === undefined ? " " : `${n} ${word}${n === 1 ? "" : "s"}`);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
      <Link href="/settings/duplicates" className={card}>
        <span className="font-medium">Possible duplicates</span>
        <span className="mt-0.5 block text-sm text-muted">Questions or cards added twice</span>
        <span className="mt-2 block text-sm text-accent">Check for duplicates →</span>
      </Link>
    </div>
  );
}
