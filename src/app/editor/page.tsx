"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import QuestionEditor from "@/components/editor/QuestionEditor";
import CardEditor from "@/components/editor/CardEditor";
import { db } from "@/lib/db";
import { useNodes } from "@/lib/hooks";
import LoadingScreen from "@/components/layout/LoadingScreen";

/** Choosing what a new item is: a quiz question or a memory card. Editing an existing one keeps what it is. */
function ModeSwitch({ card, topic, deck }: { card: boolean; topic: string | null; deck: string | null }) {
  const tabs = [
    { on: !card, href: topic ? `/editor?topic=${topic}` : "/editor", label: "Question" },
    { on: card, href: deck ? `/editor?mode=card&deck=${deck}` : "/editor?mode=card", label: "Memory card" },
  ];
  return (
    <nav aria-label="What to add" className="mb-6 inline-flex overflow-hidden rounded-md border border-line">
      {tabs.map((t, i) => (
        <Link
          key={t.label}
          href={t.href}
          replace
          aria-current={t.on ? "page" : undefined}
          className={`px-4 py-1.5 text-sm ${i > 0 ? "border-l border-line" : ""} ${
            t.on ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-paper"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function Missing({ what }: { what: string }) {
  return (
    <p className="text-sm">
      That {what} no longer exists.{" "}
      <Link href="/bank" className="underline">
        Back to the bank
      </Link>
    </p>
  );
}

function EditorLoader() {
  const params = useSearchParams();
  const id = params.get("id");
  const cardId = params.get("card");
  const topic = params.get("topic");
  const deck = params.get("deck");
  const subject = params.get("subject");
  const isCard = !!cardId || params.get("mode") === "card";
  const nodes = useNodes();
  const question = useLiveQuery(async () => (id ? ((await db.questions.get(id)) ?? null) : null), [id]);
  const card = useLiveQuery(async () => (cardId ? ((await db.cards.get(cardId)) ?? null) : null), [cardId]);

  if (!nodes || question === undefined || card === undefined) return <LoadingScreen />;
  if (id && (!question || question.deletedAt)) return <Missing what="question" />;
  if (cardId && (!card || card.deletedAt)) return <Missing what="card" />;

  const editing = !!id || !!cardId;
  return (
    <>
      {!editing && <ModeSwitch card={isCard} topic={topic} deck={deck} />}
      {isCard ? (
        <CardEditor
          key={card?.id ?? "new"}
          initial={card ?? null}
          defaultDeck={deck}
          defaultSubject={subject}
          nodes={nodes}
        />
      ) : (
        <QuestionEditor key={question?.id ?? "new"} initial={question ?? null} defaultTopicId={topic} nodes={nodes} />
      )}
    </>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <EditorLoader />
    </Suspense>
  );
}
