"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { observations } from "@/lib/analytics";
import { useAttempts } from "@/lib/hooks";
import { useMasteryBar } from "@/lib/preferences";
import Analytics from "./Analytics";
import LoadingScreen from "./LoadingScreen";
import MasteryOverview from "./MasteryOverview";
import StrengthsPanel from "./StrengthsPanel";

const TABS = [
  { id: "mastery", label: "Mastery" },
  { id: "analytics", label: "Analytics" },
  { id: "strengths", label: "Strengths & weak spots" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** The strengths and weak spots lists, on a tab of their own. */
function Strengths() {
  const attempts = useAttempts();
  const bar = useMasteryBar();
  if (!attempts) return <LoadingScreen />;
  const obs = observations(attempts);
  if (obs.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line p-8 text-center text-sm text-muted">
        These lists appear after you finish your first quiz.{" "}
        <Link href="/quiz" className="underline">
          Start one
        </Link>
        .
      </p>
    );
  }
  return <StrengthsPanel obs={obs} bar={bar} />;
}

export default function ProgressPage() {
  const router = useRouter();
  const asked = useSearchParams().get("tab");
  const tab: TabId = TABS.some((t) => t.id === asked) ? (asked as TabId) : "mastery";

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
        {tab === "mastery" ? <MasteryOverview /> : tab === "analytics" ? <Analytics /> : <Strengths />}
      </div>
    </div>
  );
}