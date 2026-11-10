"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartIcon, CloseIcon, HomeIcon, MoreIcon, QuizIcon } from "@/components/ui/icons";
import { useReadOnly } from "@/lib/sync/syncState";

const TABS = [
  { href: "/", label: "Home", icon: HomeIcon, match: [] as string[] },
  { href: "/quiz", label: "Quiz", icon: QuizIcon, match: ["/quiz"] },
  { href: "/progress", label: "Progress", icon: ChartIcon, match: ["/progress"] },
];

/** What the More tab opens. The pages for writing questions are listed too, marked as needing a computer. */
const MORE = [
  { href: "/settings", label: "Settings", note: "Backup, preferences, AI" },
  { href: "/help", label: "Help", note: "How everything works" },
  { href: "/bank", label: "Bank", note: "On a computer" },
  { href: "/extract", label: "Extract", note: "On a computer" },
];

const isOn = (path: string, href: string, match: string[]) =>
  href === "/" ? path === "/" : match.some((m) => path.startsWith(m));

/** The tab bar at the bottom of a phone screen, and the sheet that the More tab opens. Hidden on a computer. */
export default function PhoneNav() {
  const path = usePathname();
  // The bank and Extract change the bank, so an on-the-go device leaves them out.
  const more = useReadOnly() ? MORE.filter((m) => m.href !== "/bank" && m.href !== "/extract") : MORE;
  // The page the sheet was opened on. Moving to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (on: boolean) => setOpenOn(on ? path : null);
  const inMore =
    MORE.some((m) => path.startsWith(m.href)) || ["/editor", "/concept", "/blueprint"].some((p) => path.startsWith(p));

  // Escape closes the sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const tab = (on: boolean) =>
    `flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] ${on ? "font-semibold text-accent" : "text-muted"}`;

  return (
    <div className="lg:hidden">
      {open && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="More">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-xl border-t border-line bg-surface p-3 pb-[calc(env(safe-area-inset-bottom)+5rem)] shadow-lg">
            <div className="mb-1 flex items-center justify-between px-2">
              <p className="text-sm font-semibold">More</p>
              <button
                type="button"
                aria-label="Close"
                className="rounded p-1 text-muted"
                onClick={() => setOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>
            <ul>
              {more.map((m) => (
                <li key={m.href}>
                  <Link
                    href={m.href}
                    className={`flex items-baseline justify-between rounded-md px-3 py-3 ${
                      path.startsWith(m.href) ? "bg-accent-soft text-accent" : ""
                    }`}
                  >
                    <span className="font-medium">{m.label}</span>
                    <span className="text-xs text-muted">{m.note}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 flex border-t border-line bg-surface px-2 pb-[env(safe-area-inset-bottom)]"
      >
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const on = !open && isOn(path, href, match);
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined} className={tab(on)}>
              <Icon />
              {label}
            </Link>
          );
        })}
        <button type="button" aria-expanded={open} className={tab(open || inMore)} onClick={() => setOpen(!open)}>
          <MoreIcon />
          More
        </button>
      </nav>
    </div>
  );
}
