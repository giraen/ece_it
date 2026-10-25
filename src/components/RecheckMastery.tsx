"use client";

import { useState } from "react";
import { recheckMastery } from "@/lib/recheck";

/** Lets a quiz that was ruled out for leaving a tag or topic out be checked again against the current rule. */
export default function RecheckMastery({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    try {
      setResult(await recheckMastery(id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" className="btn" disabled={busy} onClick={() => void run()}>
        Check this quiz again
      </button>
      {result && (
        <p role="status" className={result.ok ? "text-good" : "text-danger"}>
          {result.text}
        </p>
      )}
    </div>
  );
}