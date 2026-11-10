"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ensureCategories } from "@/lib/bank/categories";
import { RECHECK_EVENT, syncRules, type RecheckSummary } from "@/lib/progress/recheck";
import { usePathname } from "next/navigation";
import DialogHost from "./DialogHost";
import Logo from "./Logo";
import PhoneNav from "./PhoneNav";
import ProfileMenu from "./ProfileMenu";
import SyncIndicator from "./SyncIndicator";
import ThemeToggle from "./ThemeToggle";
import { startAutoSync } from "@/lib/sync/autoSync";
import { useReadOnly } from "@/lib/sync/syncState";

const count = (n: number) => `${n} quiz${n === 1 ? "" : "zes"}`;

const NAV = [
  { href: "/", label: "Home" },
  { href: "/quiz", label: "Quiz" },
];

/** Pages for writing and organising questions. They need a big screen, so a phone shows a note instead. */
const COMPUTER_ONLY = ["/bank", "/editor", "/extract", "/blueprint", "/concept", "/settings/sources", "/settings/tags"];

/** A quiz in progress fills the phone screen, with its own buttons at the bottom, so the tab bar is hidden. */
const FULL_SCREEN = ["/quiz/play"];

function ComputerOnly() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center">
      <Logo />
      <h1 className="text-lg font-semibold">This page is for a computer</h1>
      <p className="text-sm text-muted">
        Writing and organising questions needs a bigger screen. Open this page on a laptop or desktop computer.
      </p>
      <Link href="/" className="btn">
        Back to home
      </Link>
    </div>
  );
}

/** On an on-the-go device the bank is read-only, so the pages that change it show this instead, on any screen. */
function OnTheGo() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center">
      <Logo />
      <h1 className="text-lg font-semibold">The bank is read-only on this device</h1>
      <p className="text-sm text-muted">
        This is an on-the-go device: it is for quizzes and games. Questions are written and organised on your main
        device, and arrive here when it syncs.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn">
          Back to home
        </Link>
        <Link href="/settings#sync" className="btn">
          Sync settings
        </Link>
      </div>
    </div>
  );
}

/**
 * The header and the page frame around every page. On a computer the pages sit under a top bar. On a phone the top bar
 * is slim and the main pages are in a tab bar at the bottom.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [rechecked, setRechecked] = useState<RecheckSummary | null>(null);
  const computerOnly = COMPUTER_ONLY.some((p) => path.startsWith(p));
  const readOnly = useReadOnly();
  const fullScreen = FULL_SCREEN.some((p) => path.startsWith(p));

  useEffect(() => {
    // Ask the browser not to delete your saved questions when it runs low on space.
    void navigator.storage?.persist?.();
    // Make sure GEAS, ESAT, ELEX, and MATH exist.
    void ensureCategories();
    // When the mastery bar or the minimums changed since the quizzes were judged, check the recent ones again.
    void syncRules();
    // Keep this device in step with the others, when sync is on.
    startAutoSync();
    const onRechecked = (e: Event) => setRechecked((e as CustomEvent<RecheckSummary>).detail);
    window.addEventListener(RECHECK_EVENT, onRechecked);
    return () => window.removeEventListener(RECHECK_EVENT, onRechecked);
  }, []);

  return (
    <>
      <header className={`border-b border-line bg-surface ${fullScreen ? "max-lg:hidden" : ""}`}>
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 lg:px-6">
          <Link href="/" className="mr-4 flex items-center gap-2 font-semibold" aria-label="ECE Review, home">
            <Logo />
            <span>ECE Review</span>
          </Link>
          <nav aria-label="Main" className="flex gap-1 max-lg:hidden">
            {NAV.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-paper hover:text-ink"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SyncIndicator />
            <ThemeToggle />
            <div className="max-lg:hidden">
              <ProfileMenu />
            </div>
          </div>
        </div>
      </header>
      {rechecked && (
        <div role="status" className="border-b border-line bg-accent-soft">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-sm lg:px-6">
            <span>
              The mastery rules changed, so {count(rechecked.checked)} from the recent past{" "}
              {rechecked.checked === 1 ? "was" : "were"} rechecked. {count(rechecked.gained)} gained mastery and{" "}
              {count(rechecked.lost)} lost it.
            </span>
            <button className="ml-auto rounded px-2 py-0.5 font-medium underline" onClick={() => setRechecked(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      <main
        className={`mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 lg:px-6 lg:py-6 ${
          fullScreen ? "max-lg:py-0" : "py-4 max-lg:pb-24"
        }`}
      >
        {computerOnly && readOnly ? (
          <OnTheGo />
        ) : computerOnly ? (
          <>
            <div className="max-lg:hidden">{children}</div>
            <div className="lg:hidden">
              <ComputerOnly />
            </div>
          </>
        ) : (
          children
        )}
      </main>
      {!fullScreen && <PhoneNav />}
      <DialogHost />
    </>
  );
}
