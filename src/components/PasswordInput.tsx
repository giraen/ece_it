"use client";

import { useState } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Tailwind classes for the width of the whole box. */
  className?: string;
  autoComplete?: string;
  label?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

/** A password box with an eye button that shows or hides what was typed. */
export default function PasswordInput({
  value,
  onChange,
  className = "w-56",
  autoComplete = "new-password",
  label,
  onKeyDown,
}: Props) {
  const [shown, setShown] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <input
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        aria-label={label}
        className="input w-full pr-10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-ink"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        title={shown ? "Hide password" : "Show password"}
        onClick={() => setShown((s) => !s)}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  );
}