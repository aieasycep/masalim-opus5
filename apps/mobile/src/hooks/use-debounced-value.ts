import { useEffect, useState } from 'react';

/**
 * Delays a rapidly changing value.
 *
 * Used by search: a request per keystroke would trip the rate limiter on a fast
 * typer and paint results for a prefix they have already moved past.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}
