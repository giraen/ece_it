"use client";

import { useState } from "react";

/**
 * Where the bank's tree sits. On a computer it stays in view beside the list while the list scrolls. On a phone it
 * folds into one line above the list, naming the place picked, and opens to pick another.
 */
export default function TreeBox({
  narrow,
  current,
  children,
}: {
  narrow: boolean;
  /** The place picked, for the folded line. */
  current: string;
  /** The tree. It gets `close` to fold the box once a place is picked. */
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!narrow)
    return (
      <div className="scroll-thin sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">{children(() => {})}</div>
    );
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="card flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm"
      >
        <span className="text-muted">Browse</span>
        <span className="min-w-0 flex-1 truncate font-medium">{current}</span>
        <span aria-hidden className="text-muted">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && <div className="mt-2">{children(() => setOpen(false))}</div>}
    </div>
  );
}
