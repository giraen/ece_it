"use client";

import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { parseCode } from "@/lib/sync/crypto";
import { joinSync, turnOffSync, turnOnSync } from "@/lib/sync/autoSync";
import { syncNow } from "@/lib/sync/engine";
import { loadConfig, useSyncStatus } from "@/lib/sync/syncState";
import { confirmAction } from "@/lib/ui/dialog";
import { useNow } from "@/lib/hooks";
import InfoTip from "@/components/ui/InfoTip";

/** "just now", "3 minutes ago", "2 hours ago", or a date. */
export function ago(ms: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A QR code as plain SVG squares, so it needs no image and no script from elsewhere. */
function Qr({ text }: { text: string }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const dark: string[] = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) dark.push(`M${c} ${r}h1v1h-1z`);
    return { n, d: dark.join("") };
  }, [text]);
  return (
    <svg
      viewBox={`-2 -2 ${cells.n + 4} ${cells.n + 4}`}
      className="size-44 rounded-md bg-white p-1"
      role="img"
      aria-label="QR code that opens this site on another device and fills in the sync code"
      shapeRendering="crispEdges"
    >
      <path d={cells.d} fill="#000" />
    </svg>
  );
}

/** The code from a link such as /settings#join=XXXX-…, which the QR code opens. */
function codeFromLink(): string | null {
  if (typeof window === "undefined") return null;
  const m = window.location.hash.match(/join=([0-9A-Za-z-]+)/);
  return m ? parseCode(m[1]) : null;
}

export default function SyncPanel() {
  const status = useSyncStatus();
  const nowMs = useNow();
  const [mode, setMode] = useState<"start" | "join">("start");
  const [typed, setTyped] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);

  // Opened from another device's QR code: fill in the code and point at the Join button.
  useEffect(() => {
    const fromLink = codeFromLink();
    if (!fromLink) return;
    // Take the code out of the address bar, so it is not left in the history.
    history.replaceState(null, "", window.location.pathname + window.location.search + "#sync");
    // Not cleared on unmount: in development React runs this twice, and the second run no longer sees the code.
    window.setTimeout(() => {
      setLinkCode(fromLink);
      document.getElementById("sync")?.scrollIntoView();
    }, 0);
  }, []);

  const code = status.on ? loadConfig()?.code : undefined;
  const joinLink = code && typeof window !== "undefined" ? `${window.location.origin}/settings#join=${code}` : "";

  async function start() {
    setProblem(null);
    await turnOnSync();
    setShowCode(true);
  }

  async function join(text: string) {
    const parsed = parseCode(text);
    if (!parsed) {
      setProblem("That is not a whole sync code. It has 32 letters and digits, in 8 groups of 4.");
      return;
    }
    setProblem(null);
    setLinkCode(null);
    await joinSync(parsed);
  }

  async function stop() {
    if (
      await confirmAction({
        title: "Turn off sync on this device?",
        message:
          "This device stops sending and receiving changes. Nothing is deleted, here or on your other devices. You can join again later with the same code.",
        confirmLabel: "Turn off sync",
      })
    ) {
      turnOffSync();
      setShowCode(false);
    }
  }

  if (!status.on) {
    return (
      <div className="card space-y-4 p-5">
        <p className="text-sm">
          Keep your laptop and phone the same: the bank, your quizzes and results, and your settings. Changes are sent
          by themselves a few seconds after you make them. Everything is encrypted on your device before it leaves, with
          a code only your devices know.
        </p>

        {linkCode ? (
          <div className="space-y-3 rounded-lg bg-accent-soft p-4">
            <p className="text-sm font-medium">Join the devices that showed you this code?</p>
            <p className="font-mono text-sm break-all">{linkCode}</p>
            <p className="text-sm text-muted">
              What is on this device and what is on the others are combined. Nothing is deleted.
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => void join(linkCode)}>
                Join and sync
              </button>
              <button className="btn" onClick={() => setLinkCode(null)}>
                Not now
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="How to start"
              className="inline-flex overflow-hidden rounded-md border border-line"
            >
              {(
                [
                  ["start", "This is my first device"],
                  ["join", "I have a code"],
                ] as const
              ).map(([m, label], i) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  className={`px-3 py-1.5 text-sm ${i > 0 ? "border-l border-line" : ""} ${
                    mode === m ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-paper"
                  }`}
                  onClick={() => setMode(m)}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "start" ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">
                  Makes a new sync code and sends everything on this device. Then add your other devices with it.
                </p>
                <button className="btn btn-primary" disabled={status.running} onClick={() => void start()}>
                  Turn on sync
                </button>
              </div>
            ) : (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void join(typed);
                }}
              >
                <label htmlFor="sync-code" className="block text-sm font-medium">
                  Sync code from your other device
                </label>
                <input
                  id="sync-code"
                  className="input font-mono"
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                />
                <p className="text-sm text-muted">
                  Or scan the QR code it shows with this device&apos;s camera. What is here and what is there are
                  combined; nothing is deleted.
                </p>
                <button className="btn btn-primary" disabled={status.running || !typed.trim()}>
                  Join and sync
                </button>
              </form>
            )}
          </>
        )}
        {problem && <p className="text-sm text-danger">{problem}</p>}
      </div>
    );
  }

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className={`size-2.5 rounded-full ${status.error ? "bg-priority-solid" : status.running ? "bg-accent motion-safe:animate-pulse" : "bg-good"}`}
        />
        <p className="min-w-0 flex-1 text-sm" role="status" aria-live="polite">
          {status.running
            ? (status.step ?? "Syncing…")
            : status.lastSyncAt
              ? `Synced ${ago(status.lastSyncAt, nowMs)}.`
              : "Not synced yet."}
        </p>
        <button className="btn" disabled={status.running} onClick={() => void syncNow()}>
          Sync now
        </button>
      </div>
      {status.error && !status.running && <p className="text-sm text-priority">{status.error}</p>}

      <div className="space-y-3 border-t border-line pt-4">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-medium">Add another device</h3>
          <InfoTip>
            Anyone with this code can read and change your synced data, so only show it to your own devices. On the new
            device, scan the QR code with its camera, or open Settings › Sync, choose I have a code, and type it.
          </InfoTip>
        </div>
        {showCode && code ? (
          <div className="flex flex-wrap items-center gap-5">
            <Qr text={joinLink} />
            <div className="min-w-0 space-y-2">
              <p className="text-sm text-muted">Scan this with the other device&apos;s camera, or type the code:</p>
              <p className="font-mono text-sm font-semibold break-all">{code}</p>
              <button className="btn" onClick={() => setShowCode(false)}>
                Hide the code
              </button>
            </div>
          </div>
        ) : (
          <button className="btn" onClick={() => setShowCode(true)}>
            Show the code and QR
          </button>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <button className="btn btn-danger" onClick={() => void stop()}>
          Turn off sync on this device
        </button>
      </div>
    </div>
  );
}
