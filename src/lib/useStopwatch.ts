import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Counts up while `running` is true. `elapsed` updates a few times a second for display.
 * `getElapsed()` gives the exact current value and must only be called from event handlers or effects.
 */
export function useStopwatch(running: boolean, initialMs: number, onTick?: (ms: number) => void) {
  const [elapsed, setElapsed] = useState(initialMs);
  const baseRef = useRef(initialMs);
  const startRef = useRef<number | null>(null);
  const tickRef = useRef(onTick);

  useEffect(() => {
    tickRef.current = onTick;
  });

  useEffect(() => {
    if (!running) return;
    startRef.current = performance.now();
    const id = window.setInterval(() => {
      const start = startRef.current;
      if (start === null) return;
      const ms = baseRef.current + (performance.now() - start);
      setElapsed(ms);
      tickRef.current?.(ms);
    }, 250);
    return () => {
      window.clearInterval(id);
      if (startRef.current !== null) {
        baseRef.current += performance.now() - startRef.current;
        startRef.current = null;
      }
    };
  }, [running]);

  const getElapsed = useCallback(
    () => baseRef.current + (startRef.current !== null ? performance.now() - startRef.current : 0),
    [],
  );

  return { elapsed, getElapsed };
}