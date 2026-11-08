"use client";

import { syncNow } from "@/lib/sync/engine";
import { useSyncStatus } from "@/lib/sync/syncState";
import { CloudIcon } from "@/components/ui/icons";

/**
 * A cloud in the header while sync is on. A dot on it shows the state: green when synced, pulsing while syncing,
 * amber when something went wrong. Clicking it syncs now.
 */
export default function SyncIndicator() {
  const s = useSyncStatus();
  if (!s.on) return null;
  const label = s.running
    ? (s.step ?? "Syncing…")
    : s.error
      ? `Sync problem: ${s.error} Click to try again.`
      : "Synced. Click to sync now.";
  return (
    <button
      type="button"
      className="relative rounded-md p-2 text-muted hover:bg-paper hover:text-ink"
      aria-label={label}
      title={label}
      onClick={() => void syncNow()}
    >
      <CloudIcon />
      <span
        aria-hidden="true"
        className={`absolute right-1.5 bottom-1.5 size-2 rounded-full ring-2 ring-surface ${
          s.error && !s.running ? "bg-priority-solid" : s.running ? "bg-accent motion-safe:animate-pulse" : "bg-good"
        }`}
      />
    </button>
  );
}
