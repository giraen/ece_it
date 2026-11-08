"use client";

import { useSearchParams } from "next/navigation";
import { EVERY_TIER_FROM } from "@/lib/sourceMix";
import AiSettings from "./AiSettings";
import BackupPage from "./BackupPage";
import DangerZone from "./DangerZone";
import InfoTip from "./InfoTip";
import LibraryLinks from "./LibraryLinks";
import PreferencesPanel from "./PreferencesPanel";
import QuizMixPanel from "./QuizMixPanel";
import StorageStatus from "./StorageStatus";

const JUMPS = [
  { id: "preferences", label: "Preferences" },
  { id: "mix", label: "Quiz mix" },
  { id: "library", label: "Sources and tags" },
  { id: "ai", label: "AI helper" },
  { id: "backup", label: "Backup and sharing" },
  { id: "storage", label: "Storage" },
  { id: "danger", label: "Danger zone" },
];

export default function SettingsPage() {
  const scope = useSearchParams().get("scope") ?? "";
  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Jump to:{" "}
          {JUMPS.map((j, i) => (
            <span key={j.id}>
              {i > 0 && " · "}
              <a href={`#${j.id}`} className="underline">
                {j.label}
              </a>
            </span>
          ))}
        </p>
      </div>

      <section id="preferences" aria-labelledby="preferences-title" className="scroll-mt-4 space-y-4">
        <h2 id="preferences-title" className="text-lg font-semibold">
          Preferences
        </h2>
        <PreferencesPanel />
      </section>

      <section id="mix" aria-labelledby="mix-title" className="scroll-mt-4 space-y-4">
        <div className="flex items-center gap-1">
          <h2 id="mix-title" className="text-lg font-semibold">
            Quiz mix
          </h2>
          <InfoTip>
            How much of a quiz comes from each kind of source. Quizzes draw more from the kinds higher up, but every
            kind that has questions still appears. A quiz of {EVERY_TIER_FROM} or more questions always has at least one
            from each. Inside a kind, questions you missed and ones you have not seen yet still come first.
            <br />
            <br />
            Past quizzes: questions from quizzes you took before. Books: questions from a book. Online: websites and
            videos. Others: anything that is not one of these, such as notes or a handout, and questions with no
            source.
          </InfoTip>
        </div>
        <QuizMixPanel />
      </section>

      <section id="library" aria-labelledby="library-title" className="scroll-mt-4 space-y-4">
        <h2 id="library-title" className="text-lg font-semibold">
          Sources and tags
        </h2>
        <LibraryLinks />
      </section>

      <section id="ai" aria-labelledby="ai-title" className="scroll-mt-4 space-y-4">
        <div className="flex items-center gap-1">
          <h2 id="ai-title" className="text-lg font-semibold">
            AI helper
          </h2>
          <InfoTip>
            Optional. An AI model can reword your questions so you cannot pass by recognising a sentence. It never
            changes numbers or answers without a check, and nothing it writes is used until it passes one. Without a
            key, everything works exactly as written.
          </InfoTip>
        </div>
        <AiSettings />
      </section>

      <section id="backup" aria-label="Backup and sharing" className="scroll-mt-4">
        <BackupPage initialScope={scope} embedded />
      </section>

      <div id="storage" className="scroll-mt-4">
        <StorageStatus />
      </div>

      <div id="danger" className="scroll-mt-4">
        <DangerZone />
      </div>
    </div>
  );
}