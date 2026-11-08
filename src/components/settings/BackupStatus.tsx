"use client";

import Link from "next/link";
import { useNow } from "@/lib/hooks";
import { useLastBackup } from "@/lib/lastBackup";

const DAY = 86_400_000;

/** "Last backup: 3 days ago", in a warning colour when it has been too long. */
export default function BackupStatus({ link = false }: { link?: boolean }) {
  const last = useLastBackup();
  const nowMs = useNow();
  const days = last === null ? null : Math.max(0, Math.floor((nowMs - last) / DAY));
  const stale = days === null || days >= 7;
  const text =
    days === null
      ? "You have never exported a backup from this browser."
      : days === 0
        ? "Last backup: today."
        : `Last backup: ${days} day${days === 1 ? "" : "s"} ago.`;
  return (
    <p className={`text-sm ${stale ? "text-danger" : "text-muted"}`}>
      {text}
      {link && (
        <>
          {" "}
          <Link href="/settings#backup" className="underline">
            {stale ? "Back up now" : "Backup and sharing"}
          </Link>
        </>
      )}
    </p>
  );
}