import { useSyncExternalStore } from "react";

const KEY = "ece:motion";
const EVENT = "ece:motion-change";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "full";
  } catch {
    return false;
  }
}

/** True when the person turned animation on here even though their computer asks for less motion. */
export function fullMotion(): boolean {
  return read();
}

/** Turns animation on or off for this app. It is kept in this browser and applied at once. */
export function setFullMotion(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "full");
    else localStorage.removeItem(KEY);
  } catch {
    // Without storage the choice only lasts until the page is closed.
  }
  if (on) document.documentElement.setAttribute("data-motion", "full");
  else document.documentElement.removeAttribute("data-motion");
  window.dispatchEvent(new Event(EVENT));
}

/** Whether animations should be skipped: the computer asks for less motion and it was not turned back on here. */
export function motionReduced(): boolean {
  return !read() && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useFullMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      return () => window.removeEventListener(EVENT, cb);
    },
    read,
    () => false,
  );
}