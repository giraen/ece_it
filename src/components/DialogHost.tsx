"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { answerDialog, currentDialog, subscribeDialogs, type Request } from "@/lib/dialog";

const FOCUSABLE =
  "button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled])";

/**
 * Draws the questions the app asks (see lib/dialog.ts) as a window over the page, in place of the browser's own
 * pop-ups. Escape or a click outside cancels. Tab stays inside, and focus returns to where it was.
 */
export default function DialogHost() {
  const request = useSyncExternalStore(subscribeDialogs, currentDialog, () => null);
  return request ? <Window key={request.id} request={request} /> : null;
}

function Window({ request }: { request: Request }) {
  const titleId = useId();
  const textId = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const go = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState(request.kind === "ask" ? (request.options.initial ?? "") : "");
  const { options } = request;
  const danger = request.kind === "confirm" && !!request.options.danger;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    if (request.kind === "ask") {
      input.current?.focus();
      input.current?.select();
    } else if (danger) cancel.current?.focus();
    else go.current?.focus();
    return () => {
      if (before && document.contains(before)) before.focus();
    };
  }, [request, danger]);

  function close(answer: boolean | string | null) {
    answerDialog(request, answer);
  }

  function submit() {
    if (request.kind === "confirm") return close(true);
    close(text.trim() ? text.trim() : null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      // Nothing behind the window should also react to this key.
      e.preventDefault();
      e.stopPropagation();
      close(request.kind === "confirm" ? false : null);
    } else if (e.key === "Tab") {
      const items = Array.from(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  const confirmLabel = options.confirmLabel ?? (request.kind === "ask" ? "OK" : "Yes");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[18vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(request.kind === "confirm" ? false : null);
      }}
    >
      <div
        ref={box}
        role={danger ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.message ? textId : undefined}
        className="w-full max-w-md space-y-4 rounded-md border border-line bg-surface p-5 shadow-lg"
        onKeyDown={onKeyDown}
      >
        <div className="space-y-1.5">
          <h2 id={titleId} className="text-lg font-semibold">
            {options.title}
          </h2>
          {options.message && (
            <p id={textId} className="text-sm text-muted">
              {options.message}
            </p>
          )}
        </div>
        {request.kind === "ask" && (
          <form
            id={`${titleId}-form`}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor={`${titleId}-input`} className="mb-1 block text-sm font-medium">
              {request.options.label}
            </label>
            <input
              id={`${titleId}-input`}
              ref={input}
              className="input w-full"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </form>
        )}
        <div className="flex justify-end gap-2">
          <button
            ref={cancel}
            type="button"
            className="btn"
            onClick={() => close(request.kind === "confirm" ? false : null)}
          >
            Cancel
          </button>
          <button
            ref={go}
            type="button"
            className={danger ? "btn border-danger bg-danger text-paper hover:bg-danger/90" : "btn btn-primary"}
            disabled={request.kind === "ask" && !text.trim()}
            onClick={submit}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}