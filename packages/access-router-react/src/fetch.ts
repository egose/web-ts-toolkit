import { useEffect, useRef, useCallback } from 'react';

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export function useAbortManager(): { replace: (c: AbortController) => void } {
  const ref = useRef<AbortController | null>(null);

  const replace = useCallback((next: AbortController) => {
    ref.current?.abort();
    ref.current = next;
  }, []);

  useEffect(() => {
    return () => {
      ref.current?.abort();
      ref.current = null;
    };
  }, []);

  return { replace };
}

export function stableStringify(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

export function useMountRef(): React.MutableRefObject<boolean> {
  const ref = useRef(true);

  useEffect(() => {
    ref.current = true;
    return () => {
      ref.current = false;
    };
  }, []);

  return ref;
}
