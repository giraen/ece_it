"use client";

import { createContext, useCallback, useRef, useState, type ReactNode } from "react";
import type { Edit } from "@/lib/mathEdit";
import MathToolbar from "./MathToolbar";

type Action = (text: string, s: number, e: number) => Edit;
type Runner = (action: Action) => void;

interface Group {
  /** Called by a text box when it is clicked into, so the buttons above act on it. */
  setActive: (run: Runner, label: string) => void;
}

export const ToolbarGroupContext = createContext<Group | null>(null);

/**
 * One toolbar shared by several text boxes, such as the choices of a question.
 * It stays at the top, and its buttons act on whichever box was used last.
 * With enabled={false} the boxes keep their own toolbars and nothing is added.
 */
export default function ToolbarGroup({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const active = useRef<Runner | null>(null);
  const [label, setLabel] = useState<string | null>(null);

  const setActive = useCallback((run: Runner, name: string) => {
    active.current = run;
    setLabel(name);
  }, []);

  if (!enabled) return <>{children}</>;

  return (
    <ToolbarGroupContext.Provider value={{ setActive }}>
      <div className="mb-3 rounded-md border border-line bg-surface p-1">
        <MathToolbar run={(action) => active.current?.(action)} />
        <p className="px-1 pt-1 text-xs text-muted" aria-live="polite">
          {label ? `Buttons insert into: ${label}` : "Click a box below, then use the buttons to insert into it."}
        </p>
      </div>
      {children}
    </ToolbarGroupContext.Provider>
  );
}