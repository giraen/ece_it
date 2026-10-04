"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CONFIG } from "@/lib/config";
import type { TreeNode } from "@/lib/db";
import { startAttempt } from "@/lib/quiz";
import { KIND_LABEL, pathOf } from "@/lib/tree";

interface Props {
  node: TreeNode;
  nodes: TreeNode[];
  available: number;
}

const SPREAD: Record<TreeNode["kind"], string> = {
  topic: "Questions are spread across the topic's tags.",
  subject: "Questions are spread across the subject's topics.",
  category: "Questions are spread evenly across the category's subjects. A custom blueprint arrives in the next update.",
};

export default function NewQuizForm({ node, nodes, available }: Props) {
  const router = useRouter();
  const [length, setLength] = useState(String(Math.min(CONFIG.defaultLength[node.kind], Math.max(available, 1))));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = Number(length);
  const valid = Number.isInteger(parsed) && parsed >= 1;
  const effective = valid ? Math.min(parsed, available) : 0;
  const mock = node.kind === "category";

  async function start() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const id = await startAttempt(node.id, parsed);
      router.push(`/quiz/play?id=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the quiz.");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <p className="text-sm text-muted">{KIND_LABEL[node.kind]} quiz</p>
        <h1 className="text-xl font-semibold">{pathOf(nodes, node.id)}</h1>
      </div>

      <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
        <li>{mock ? "Mock board: no pause and no going back. Questions are interleaved." : "Standard quiz: you can pause and go back to earlier questions."}</li>
        <li>{SPREAD[node.kind]}</li>
        <li>A count-up timer runs while a question is on screen. Credit depends on how sure you were and how fast you answered.</li>
        <li>You pass at {Math.round(CONFIG.passBar * 100)}% credit.</li>
      </ul>

      <div>
        <label htmlFor="len" className="mb-1 block text-sm font-medium">
          Number of questions
        </label>
        <input
          id="len"
          className="input w-32"
          inputMode="numeric"
          value={length}
          onChange={(e) => setLength(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted">
          {available} available.{" "}
          {valid && parsed > available && available > 0 && `The quiz will have ${available}.`}
          {valid && effective > 0 && parsed <= available && `The quiz will have ${effective}.`}
        </p>
      </div>

      {available === 0 && <p className="text-sm text-danger">There are no questions here yet.</p>}
      {!valid && <p className="text-sm text-danger">Enter a whole number of 1 or more.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy || !valid || available === 0} onClick={() => void start()}>
          Start quiz
        </button>
        <Link href="/quiz" className="btn">
          Cancel
        </Link>
      </div>
    </div>
  );
}
