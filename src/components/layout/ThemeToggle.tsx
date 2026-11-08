"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "./icons";

const KEY = "ece:theme";

// The theme lives on the <html> element (data-theme). This watches it, so the button always matches the page.
function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}

const read = (): "light" | "dark" =>
  document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

/** Switches between the light and dark theme. The choice is remembered on this device. */
export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as const);
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="rounded-md p-2 text-muted hover:bg-paper hover:text-ink"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => {
        const root = document.documentElement;
        // Fade the colours for a moment. This is a colour change, not movement, so it always runs.
        root.classList.add("theme-fade");
        window.setTimeout(() => root.classList.remove("theme-fade"), 650);
        root.setAttribute("data-theme", next);
        try {
          localStorage.setItem(KEY, next);
        } catch {
          // The choice just will not be remembered.
        }
      }}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}