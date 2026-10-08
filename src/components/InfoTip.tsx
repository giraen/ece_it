"use client";

import { useEffect, useId, useRef, useState } from "react";

const WIDTH = 320;

interface Props {
  children: React.ReactNode;
  /** The name a screen reader announces for the icon. */
  label?: string;
}

/**
 * A small "i" icon that floats an explanation when you hover it, tab to it, or click it.
 * Clicking keeps it open until you click elsewhere or press Escape.
 */
export default function InfoTip({ children, label = "More information" }: Props) {
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const open = hover || focus || pinned;

  // Near the right edge of the window, open the bubble to the left so it stays on screen.
  function measure() {
    if (!root.current) return;
    setAlignRight(root.current.getBoundingClientRect().left + WIDTH > window.innerWidth - 16);
  }

  useEffect(() => {
    if (!pinned) return;
    const away = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [pinned]);

  return (
    <span
      ref={root}
      className="relative inline-flex align-middle"
      onMouseEnter={() => {
        measure();
        setHover(true);
      }}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        onFocus={() => {
          measure();
          setFocus(true);
        }}
        onBlur={() => setFocus(false)}
        onClick={() => {
          measure();
          setPinned((p) => !p);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setPinned(false);
            setHover(false);
            e.currentTarget.blur();
          }
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {open && (
        <span role="tooltip" id={id} className={`absolute top-full z-30 pt-2 ${alignRight ? "right-0" : "left-0"}`}>
          <span
            className="block rounded-md border border-line bg-surface p-3 text-left text-sm leading-relaxed font-normal text-ink shadow-lg"
            style={{ width: `min(${WIDTH}px, calc(100vw - 2rem))` }}
          >
            {children}
          </span>
        </span>
      )}
    </span>
  );
}