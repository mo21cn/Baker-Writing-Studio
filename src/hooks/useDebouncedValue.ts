import { useEffect, useState } from "react";

/**
 * Delay a rapidly changing value.
 *
 * Typing updates the store on every keystroke; parsing the whole
 * document (and running MathJax over every formula) at that rate is
 * what made long documents feel heavy. The editor stays instant, the
 * preview catches up 200-300 ms later.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
