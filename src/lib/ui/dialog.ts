/**
 * Questions the app asks in its own window instead of the browser's. A page calls `confirmAction` or `askText` and
 * waits for the answer, and the <DialogHost /> in the page frame draws the window. Several can wait in a line.
 */

export interface ConfirmOptions {
  title: string;
  /** What will happen, in a sentence or two. */
  message?: string;
  /** The text on the button that goes ahead. */
  confirmLabel?: string;
  /** Makes the button red and puts the cursor on Cancel, for things that cannot be taken back. */
  danger?: boolean;
}

export interface AskOptions {
  title: string;
  message?: string;
  /** The name of the box. */
  label: string;
  initial?: string;
  confirmLabel?: string;
}

export type Request =
  | { id: number; kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { id: number; kind: "ask"; options: AskOptions; resolve: (text: string | null) => void };

let queue: Request[] = [];
let next = 1;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function subscribeDialogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The window to show now, or null. The same object is returned until it is answered. */
export function currentDialog(): Request | null {
  return queue[0] ?? null;
}

/** Closes a window with its answer and moves on to the next one waiting. */
export function answerDialog(request: Request, answer: boolean | string | null): void {
  queue = queue.filter((r) => r !== request);
  if (request.kind === "confirm") request.resolve(answer === true);
  else request.resolve(typeof answer === "string" ? answer : null);
  emit();
}

/** Asks yes or no. Resolves true only when the person goes ahead. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  // Without the page frame there is nothing to draw the window, so the browser's own question is the fallback.
  if (listeners.size === 0)
    return Promise.resolve(window.confirm([options.title, options.message].filter(Boolean).join("\n\n")));
  return new Promise((resolve) => {
    queue = [...queue, { id: next++, kind: "confirm", options, resolve }];
    emit();
  });
}

/** Asks for a line of text. Resolves with what was typed, or null when the person cancels or leaves it empty. */
export function askText(options: AskOptions): Promise<string | null> {
  if (listeners.size === 0) {
    const text = window.prompt([options.title, options.message].filter(Boolean).join("\n\n"), options.initial ?? "");
    return Promise.resolve(text && text.trim() ? text : null);
  }
  return new Promise((resolve) => {
    queue = [...queue, { id: next++, kind: "ask", options, resolve }];
    emit();
  });
}