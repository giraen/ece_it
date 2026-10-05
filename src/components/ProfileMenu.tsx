"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserIcon } from "./icons";

// `match` lists the pages that belong to each item, so the profile button lights up while you are inside any of them.
const ITEMS = [
  { href: "/progress", label: "Analytics", match: ["/progress", "/blueprint"] },
  { href: "/bank", label: "Bank", match: ["/bank", "/editor", "/concept"] },
  { href: "/settings", label: "Settings", match: ["/settings"] },
];

/** The profile button and the floating menu that opens under it. */
export default function ProfileMenu() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const inMenu = ITEMS.some((i) => i.match.some((m) => path.startsWith(m)));

  useEffect(() => {
    if (!open) return;
    // Move the keyboard focus into the menu, and close it on an outside click or Escape.
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Arrow keys, Home, and End move between the items.
  function onMenuKey(e: React.KeyboardEvent) {
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  }

  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title="Account menu"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-full border p-1.5 ${
          inMenu || open ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:bg-paper hover:text-ink"
        }`}
      >
        <UserIcon />
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKey}
          className="absolute right-0 z-40 mt-2 w-48 rounded-md border border-line bg-surface p-1 shadow-lg"
        >
          {ITEMS.map((it) => {
            const active = it.match.some((m) => path.startsWith(m));
            return (
              <Link
                key={it.href}
                href={it.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`block rounded px-3 py-2 text-sm hover:bg-paper focus:bg-paper focus:outline-none ${
                  active ? "bg-accent-soft font-medium text-accent" : ""
                }`}
              >
                {it.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}