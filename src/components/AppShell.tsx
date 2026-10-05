"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ensureCategories } from "@/lib/categories";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import ProfileMenu from "./ProfileMenu";
import ThemeToggle from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/quiz", label: "Quiz" },
];

/** The header and the page frame around every page. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  useEffect(() => {
    // Ask the browser not to delete your saved questions when it runs low on space.
    void navigator.storage?.persist?.();
    // Make sure GEAS, ESAT, ELEX, and MATH exist.
    void ensureCategories();
  }, []);

  return (
    <>
      <div className="bg-accent-soft px-4 py-2 text-center text-sm text-accent lg:hidden">
        This site is best experienced on a laptop.
      </div>
      <header className="border-b border-line bg-surface">
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
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">{children}</main>
    </>
  );
}