"use client";

import { useSearchParams } from "next/navigation";
import AiSettings from "./AiSettings";
import BackupPage from "./BackupPage";
import DangerZone from "./DangerZone";
import StorageStatus from "./StorageStatus";
import InfoTip from "./InfoTip";

export default function SettingsPage() {
  const scope = useSearchParams().get("scope") ?? "";
  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Jump to:{" "}
          <a href="#ai" className="underline">
            AI helper
          </a>
          {" · "}
          <a href="#backup" className="underline">
            Backup and sharing
          </a>
          {" · "}
          <a href="#storage" className="underline">
            Storage
          </a>
          {" · "}
          <a href="#danger" className="underline">
            Danger zone
          </a>
        </p>
      </div>

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