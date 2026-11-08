"use client";

import { useEffect, useState } from "react";

const PHRASES = [
  "Calculating the limits…",
  "Implementing stability…",
  "Applying Kirchhoff's laws…",
  "Closing the feedback loop…",
  "Matching the impedance…",
  "Charging the capacitor…",
  "Biasing the transistor…",
  "Filtering out the noise…",
  "Sampling at the Nyquist rate…",
  "Taking the Laplace transform…",
  "Rectifying the signal…",
  "Tuning the resonant circuit…",
  "Modulating the carrier wave…",
  "Simplifying the Boolean algebra…",
  "Clocking the flip-flops…",
  "Grounding the reference node…",
  "Calibrating the oscillator…",
  "Amplifying the signal…",
  "Solving for the Thevenin equivalent…",
  "Differentiating the transfer function…",
  "Sweeping the Smith chart…",
  "Tuning the quarter-wave stub…",
  "Minimizing VSWR…",
  "Synthesizing the netlist…",
  "Flashing the microcontroller EEPROM…",
  "Setting the quiescent Q-point…",
  "Minimizing total harmonic distortion…",
  "Slewing the opamp…",
  "Calculating phase and gain margins…",
  "Accounting for Early voltage effects…",
  "Computing the FFT…",
  "Plotting the root locus…",
  "Multiplexing the channels…",
];

/** A sine wave built from smooth curves, wide enough to scroll one period (40 units) without a gap. */
const WAVE = (() => {
  let d = `M0 20 C 6 -2 14 -2 20 20`;
  for (let k = 2; k <= 8; k++) d += ` S ${20 * k - 6} ${k % 2 ? -2 : 42} ${20 * k} 20`;
  return d;
})();

type Phase = "next" | "typing" | "deleting";

/** Types a phrase, holds it, deletes it, then moves to a different one. */
function useTypewriter() {
  const [phase, setPhase] = useState<Phase>("next");
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const full = PHRASES[index];

  useEffect(() => {
    let delay = 0;
    let step: () => void;
    if (phase === "typing") {
      if (text.length < full.length) {
        delay = 45;
        step = () => setText(full.slice(0, text.length + 1));
      } else {
        delay = 1200;
        step = () => setPhase("deleting");
      }
    } else if (phase === "deleting") {
      if (text.length > 0) {
        delay = 22;
        step = () => setText((t) => t.slice(0, -1));
      } else {
        delay = 180;
        step = () => setPhase("next");
      }
    } else {
      // The first phrase and every later one are picked at random, never the same one twice in a row.
      step = () => {
        setIndex((prev) => {
          let n = Math.floor(Math.random() * PHRASES.length);
          if (n === prev) n = (n + 1) % PHRASES.length;
          return n;
        });
        setPhase("typing");
      };
    }
    const t = window.setTimeout(step, delay);
    return () => window.clearTimeout(t);
  }, [phase, text, full]);

  return text;
}

/** A centred loading screen: a moving sine wave with an ECE phrase being typed and deleted below it. */
export default function LoadingScreen({
  fullscreen = false,
  compact = false,
  progress,
  note,
}: {
  fullscreen?: boolean;
  /** A shorter block, for loading one part of a page. */
  compact?: boolean;
  /** How far along it is, from 0 to 1. Shows a thin bar. */
  progress?: number;
  /** A line under the phrase, such as "36 of 120". */
  note?: string;
}) {
  const text = useTypewriter();
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-5 text-center ${
        fullscreen ? "fixed inset-0 z-50 bg-paper" : compact ? "min-h-[30vh]" : "min-h-[55vh]"
      }`}
    >
      <span className="sr-only">Loading</span>
      <svg width="120" height="40" viewBox="0 0 120 40" aria-hidden="true" className="overflow-hidden">
        <line x1="0" x2="120" y1="20" y2="20" stroke="var(--color-line)" strokeWidth="1" />
        <g className="loading-wave">
          <path
            d={WAVE}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
      <p aria-hidden="true" className="h-6 text-[15px] text-muted">
        {text}
        <span className="loading-caret" />
      </p>
      {progress !== undefined && (
        <div className="w-56 space-y-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-150"
              style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
            />
          </div>
          {note && <p className="text-xs text-muted tabular-nums">{note}</p>}
        </div>
      )}
    </div>
  );
}