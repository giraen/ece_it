"use client";

import { useSearchParams } from "next/navigation";
import BackupPage from "./BackupPage";
import StorageStatus from "./StorageStatus";

export default function SettingsPage() {
  const scope = useSearchParams().get("scope") ?? "";
  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Jump to:{" "}
          <a href="#backup" className="underline">
            Backup and sharing
          </a>
          {" · "}
          <a href="#storage" className="underline">
            Storage
          </a>
        </p>
      </div>

      <section id="backup" aria-label="Backup and sharing" className="scroll-mt-4">
        <BackupPage initialScope={scope} embedded />
      </section>

      <div id="storage" className="scroll-mt-4">
        <StorageStatus />
      </div>
    </div>
  );
}