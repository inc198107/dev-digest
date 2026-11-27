"use client";

import React from "react";

/**
 * A value that follows `value` only after it stopped changing for `delayMs`, so a search does not
 * run on every keystroke.
 * @param value The live value.
 * @param delayMs The quiet period (ms).
 * @returns The settled value.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
