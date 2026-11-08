"use client";

import { useState } from "react";
import { recheckMastery } from "@/lib/recheck";

/** Judges a quiz again under the rules as they are now. It can give mastery, and it can take it away. */
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
        Recheck
      </button>
      {result && (
        <p role="status" className={result.ok ? "text-good" : "text-muted"}>
          {result.text}
        </p>
      )}
    </div>
  );
}