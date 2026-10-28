"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ensureCategories } from "@/lib/categories";
import { RECHECK_EVENT, syncRules, type RecheckSummary } from "@/lib/recheck";
import { usePathname } from "next/navigation";
import DialogHost from "./DialogHost";
import Logo from "./Logo";
import ProfileMenu from "./ProfileMenu";
import ThemeToggle from "./ThemeToggle";

const count = (n: number) => `${n} quiz${n === 1 ? "" : "zes"}`;

const NAV = [
  { href: "/", label: "Home" },
  { href: "/quiz", label: "Quiz" },
];

/** The header and the page frame around every page. On a small screen it is replaced by a full-screen notice. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [rechecked, setRechecked] = useState<RecheckSummary | null>(null);

  useEffect(() => {
    // Ask the browser not to delete your saved questions when it runs low on space.
    void navigator.storage?.persist?.();
    // Make sure GEAS, ESAT, ELEX, and MATH exist.
    void ensureCategories();
    // When the mastery bar or the minimums changed since the quizzes were judged, check the recent ones again.
    void syncRules();
    const onRechecked = (e: Event) => setRechecked((e as CustomEvent<RecheckSummary>).detail);
    window.addEventListener(RECHECK_EVENT, onRechecked);
    return () => window.removeEventListener(RECHECK_EVENT, onRechecked);
  }, []);

  return (
    <>
      {/* Small screens only. It covers everything, and the real app below is hidden, so nothing can be tapped. */}
      <section
        aria-label="Screen too small"
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-paper p-8 text-center lg:hidden"
      >
        <Logo />
        <h1 className="text-xl font-semibold">ECE Review is made for a large view</h1>
        <p className="max-w-sm text-muted">
          This screen is too small to use it properly. Please open this site on a laptop or desktop computer.
        </p>
        <p className="max-w-sm text-sm text-muted">On a computer already? Make the browser window wider.</p>
      </section>

      <header className="border-b border-line bg-surface max-lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-6 py-2.5">
          <Link href="/" className="mr-4 flex items-center gap-2 font-semibold" aria-label="ECE Review, home">
            <Logo />
            <span>ECE Review</span>
          </Link>
          <nav aria-label="Main" className="flex gap-1">
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
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </div>
      </header>
      {rechecked && (
        <div role="status" className="border-b border-line bg-accent-soft max-lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-2 text-sm">
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
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 max-lg:hidden">{children}</main>
      <DialogHost />
    </>
  );
}