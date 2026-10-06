"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Analytics from "./Analytics";
import MasteryOverview from "./MasteryOverview";

const TABS = [
  { id: "mastery", label: "Mastery" },
  { id: "analytics", label: "Analytics" },
] as const;

export default function ProgressPage() {
  const router = useRouter();
  const tab = useSearchParams().get("tab") === "analytics" ? "analytics" : "mastery";

  return (
    <div className="max-w-4xl space-y-5">
      <h1 className="text-xl font-semibold">Mastery & analytics</h1>
      <div role="tablist" aria-label="Sections" className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => router.replace(t.id === "mastery" ? "/progress" : `/progress?tab=${t.id}`)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              tab === t.id ? "border-accent font-medium text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "mastery" ? <MasteryOverview /> : <Analytics />}
      </div>
    </div>
  );
}