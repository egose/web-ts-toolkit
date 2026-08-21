import { useEffect, useRef, useCallback } from 'react';

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

type RequestConfigLike = { signal?: AbortSignal; [key: string]: unknown };

/**
 * Compose the hook-owned controller signal with any caller-provided query
 * signals so aborting ANY source aborts the resulting signal (Task ARR-H01).
 *
 * - If a source is already aborted, return the first aborted source in
 *   argument order so the request observes its aborted state synchronously.
 * - If only one unique, non-aborted source exists, reuse it directly.
 * - Otherwise allocate a fresh `AbortController`, listen to every unique
 *   source signal, abort the composed controller with the reason of the
 *   first source that aborts, and release all listeners immediately.
 *
 * The returned object owns a single composition controller for the lifetime
 * of one request invocation. Callers MUST invoke `release()` once after
 * the request settles to detach listeners from any long-lived source signal
 * — even when neither source aborted. The `release` is idempotent and
 * safe to call multiple times; a focused resource-cleanup test guards
 * that repeated requests do not accumulate `addEventListener` listeners
 * on long-lived source signals (ARR-H01 acceptance criterion).
 *
 * The returned `AbortSignal` is what the hook forwards to the underlying
 * `ModelService` request and what the hook uses as the authoritative
 * cancellation source after resolve/reject.
 */
export function composeAbortSignals(
  internalSignal: AbortSignal,
  ...otherSignals: (AbortSignal | undefined)[]
): { signal: AbortSignal; release: () => void } {
  const uniqueSignals: AbortSignal[] = [];

  for (const signal of [internalSignal, ...otherSignals]) {
    if (!signal || uniqueSignals.includes(signal)) {
      continue;
    }
    if (signal.aborted) {
      return { signal, release: () => {} };
    }
    uniqueSignals.push(signal);
  }

  if (uniqueSignals.length === 1) {
    return { signal: uniqueSignals[0], release: () => {} };
  }

  const composed = new AbortController();
  let released = false;
  const listeners = new Map<AbortSignal, () => void>();

  const release = () => {
    if (released) {
      return;
    }
    released = true;
    for (const [signal, onAbort] of listeners) {
      signal.removeEventListener('abort', onAbort);
    }
    listeners.clear();
  };

  const settle = (source: AbortSignal) => {
    if (!composed.signal.aborted) {
      composed.abort(source.reason);
    }
    release();
  };

  for (const signal of uniqueSignals) {
    const onAbort = () => settle(signal);
    listeners.set(signal, onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
  }

  return {
    signal: composed.signal,
    release,
  };
}

/**
 * `requestConfig.signal` controls request lifetime but is not part of the
 * structural request identity. Excluding it from the request key avoids an
 * automatic refetch when only the signal instance changes.
 */
export function requestConfigKeyInput(requestConfig: RequestConfigLike | undefined): RequestConfigLike | undefined {
  if (!requestConfig) {
    return undefined;
  }
  const { signal: _signal, ...rest } = requestConfig;
  return Object.keys(rest).length === 0 ? undefined : rest;
}

/**
 * Build the request config forwarded to the underlying `ModelService` call
 * (Task ARR-05). The hook must NOT mutate the caller's `requestConfig`
 * object: callers may share a single config across hook instances and
 * renders, so mutating it (or even mutating `requestConfig.signal`) would
 * leak the hook's internal controller into caller-owned state. The caller's
 * headers and other fields retain both their content and their identity in
 * the forwarded config — only the `signal` field is the union of the
 * caller-supplied signal and the hook-owned signal.
 *
 * The returned object is a fresh shallow copy of `requestConfig` with
 * `signal` set last, so previously-spread `signal` fields on the caller
 * config are overwritten by the composed signal intentionally.
 */
export function mergeRequestConfig(
  requestConfig: RequestConfigLike | undefined,
  signal: AbortSignal | undefined,
): RequestConfigLike {
  // Only overwrite the caller-supplied `signal` field when a composed
  // signal is actually present (Task ARR-05). When `signal === undefined`
  // the caller did not provide one AND the hook could not build one (a
  // path no production query takes, but one a manual `query()` could
  // hypothetically reach if the composition helper were bypassed); leave
  // any pre-existing `requestConfig.signal` intact rather than erasing
  // it. The hook-owned controller is still created by `useAutoQuery`
  // for every invocation, so the production path always supplies a
  // defined signal here.
  if (signal === undefined) {
    return { ...(requestConfig ?? {}) };
  }
  return { ...(requestConfig ?? {}), signal };
}

/**
 * Stable handle to the in-flight `AbortController` for a query hook
 * (ARR-08 req 3 + req 4).
 *
 * Returns a single object whose identity never changes across renders as
 * long as the hook is mounted, so `useAutoQuery`'s `query`/`refetch`
 * callbacks — which list `manager` in their `useCallback` dep arrays —
 * keep a stable identity across unrelated rerenders even though their
 * effective inputs have not changed. Pre-ARR-08 this hook returned a
 * fresh `{ replace }` object literal on every render, churning the
 * identity of every caller-supplied imperative function anchored to the
 * manager even when `replace` itself was stable.
 *
 * `replace` is the only exposed member: it aborts the previous in-flight
 * controller (if any) and stores the new one. The hook's `[]`-dep
 * `useEffect` cleanup aborts the final in-flight controller on unmount
 * and clears the ref so the hook can be re-entered cleanly if React
 * reuses the component instance for a different key (Strict Mode mount/
 * cleanup/remount cycle included). Internal `AbortController` references
 * are never returned to the hook surface — the manager is a stable
 * function-only handle, not a leaked internal object (ARR-08 req 4).
 */
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

  // The manager object identity is stable for the lifetime of the hook.
  // `useMemo` with an empty deps array is NOT sufficient: React may
  // discard the memoized value under memory pressure in concurrent
  // features; a ref-backed `useMemo` would re-allocate on such discard
  // and re-churn `query`/`refetch` identities. A `useRef` value lives
  // for the lifetime of the hook and survives all rerenders.
  const managerRef = useRef<{ replace: (c: AbortController) => void } | null>(null);
  if (managerRef.current === null) {
    managerRef.current = { replace };
  }
  // Lazy-init ref read pattern (https://react.dev/reference/react/useRef):
  // allocate the stable manager exactly once and return the same identity
  // on every subsequent render. The `react-hooks/refs` rule flags this
  // render-path read even though React's own docs sanction it for stable
  // value initialization without re-render churn.
  // eslint-disable-next-line react-hooks/refs
  return managerRef.current;
}

export function stableStringify(value: unknown): string {
  // Preserved for backwards-compatibility only. New request-key
  // construction must go through {@link requestKeyFor} (Task ARR-06):
  // `stableStringify` collides Dates with ISO strings, throws on
  // BigInt/cycles, and silently merges functions/symbols into `null`,
  // so any effect-deps array that depends on structural identity for a
  // request-affecting input should be migrated to `requestKeyFor`.
  return requestKeyFor(value);
}

/**
 * Error thrown by {@link requestKeyFor} when it encounters a value it
 * cannot represent deterministically in a React effect-deps key
 * (Task ARR-06).
 *
 * The categories are:
 *
 *   - **`bigint`**: `JSON.stringify` throws "Do not know how to serialize
 *     a BigInt", and silently converting to a number would silently lose
 *     precision; a filter built around BigInt is not a supported request
 *     input.
 *   - **`function`**: callback identity changes every render, and a
 *     function key is never structural. If a constructor or plugin
 *     needs to influence a request, it must do so via a primitive or
 *     plain object key.
 *   - **`symbol`**: symbols are silently dropped by `JSON.stringify` and
 *     would collide across distinct symbols; an explicit error keeps the
 *     request key sound.
 *   - **Cycles**: an object/array that references itself (directly or
 *     indirectly) would recurse infinitely without an explicit guard;
 *     this is treated as a programming error for key construction.
 *   - **Accessor properties**: a getter on an enumerable own property
 *     would be invoked accidentally when computing the key (a side
 *     effect in the dependency-array path) and silently collide with a
 *     plain-data property of the same name. Accessors are rejected
 *     before any getter fires.
 *   - **Unsupported built-in instances** (`RegExp`, `Map`, `Set`,
 *     `URL`, etc.): not part of the request-input contract; reject so
 *     a future consumer cannot quietly rely on the current
 *     (unspecified) `toString()` shape.
 *
 * The thrown error is a recoverable programming error: query hooks catch
 * `RequestKeyError` while building their structural dependency key,
 * rethrow a plain `Error` with the original `RequestKeyError` in
 * `cause`, and interrupt render before any auto-fetch effect runs. The
 * throw is the documented contract; testing covers each category
 * directly.
 */
export class RequestKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestKeyError';
  }
}

interface RequestKeyContext {
  // Set of objects currently on the recursion stack, for cycle
  // detection. A `WeakSet` is sufficient because only reference-equal
  // objects can participate in a cycle.
  stack: WeakSet<object>;
}

/**
 * Construct the canonical React effect-dep key for a request-affecting
 * input (Task ARR-06).
 *
 * The result is deterministic for any structurally comparable plain-data
 * value and follows these rules (see {@link RequestKeyError} for the
 * rejected categories):
 *
 *   - `null`/`undefined` map to `n:` and `u:` sentinels (distinct).
 *   - Booleans map to `b:true` / `b:false`.
 *   - Numbers map to `n:<number>` using `String()`; `+0` and `-0` map
 *     to `n:0` and `n:-0` respectively (kept distinct because
 *     `Object.is(0, -0)` is false and a filter where a sign matters
 *     must round-trip), and `NaN` maps to `n:NaN`.
 *   - Strings map to `s:<JSON.stringify(value)>` so embedded colons,
 *     quotes, and other characters cannot collide with the prefix
 *     sentinels.
 *   - `Date` maps to `d:<getTime()>` — two dates compare equal iff
 *     they represent the same instant, and a Date never collides with
 *     an ISO-string filter because of the `d:` prefix.
 *   - Arrays map to `[<key(e1)>,<key(e2)>,...]` recursively.
 *   - Plain objects (no `null` prototype + only enumerable own data
 *     properties) map to `{<key(sorted)!:<key(value)>!...}` recursively.
 *     The key list is sorted, so two structurally equivalent objects
 *     produce the same string regardless of insertion order.
 *
 * Unsupported values — `bigint`, `function`, `symbol`, accessor
 * properties, cycles, and non-plain built-in objects (`RegExp`,
 * `Map`, `Set`, `URL`, etc.) — throw {@link RequestKeyError}.
 *
 * Never invokes a getter: an accessor property detected via
 * `Object.getOwnPropertyDescriptor` is rejected before any access.
 */
export function requestKeyFor(value: unknown): string {
  return requestKeyForImpl(value, { stack: new WeakSet() });
}

function requestKeyForImpl(value: unknown, ctx: RequestKeyContext): string {
  if (value === null) return 'n:';
  if (value === undefined) return 'u:';
  const t = typeof value;
  switch (t) {
    case 'boolean':
      return `b:${value}`;
    case 'number': {
      if (Number.isNaN(value)) return 'n:NaN';
      if (Object.is(value, -0)) return 'n:-0';
      return `n:${String(value)}`;
    }
    case 'string':
      return `s:${JSON.stringify(value)}`;
    case 'bigint':
      throw new RequestKeyError(
        'requestKeyFor: bigint is not supported in request keys; convert to a number or string before passing to a query hook.',
      );
    case 'function':
      throw new RequestKeyError(
        'requestKeyFor: function values are not supported in request keys; the request contract requires structural data, not callback identity.',
      );
    case 'symbol':
      throw new RequestKeyError(
        'requestKeyFor: symbol values are not supported in request keys; symbol-keyed properties cannot participate in structural comparison.',
      );
    case 'object': {
      // `Date` is allowed: compare by instant. The `d:` prefix keeps it
      // distinct from any ISO-string filter that happens to look like a
      // date.
      if (value instanceof Date) {
        return `d:${value.getTime()}`;
      }
      // Reject unsupported built-in instances. `RegExp`, `Map`, `Set`,
      // `URL`, `Error`, and class instances are not part of the
      // request-input contract; rejecting keeps the canonical key
      // stable instead of relying on the current (unspecified)
      // `toString()` shape.
      if (
        value instanceof RegExp ||
        value instanceof Map ||
        value instanceof Set ||
        (typeof URL !== 'undefined' && value instanceof URL) ||
        value instanceof Error
      ) {
        throw new RequestKeyError(
          `requestKeyFor: instance of ${value.constructor?.name ?? 'unknown'} is not supported in request keys; pass its plain-data representation (e.g. a URL string, a sorted array of entries) to the query hook instead.`,
        );
      }
      if (Array.isArray(value)) {
        if (ctx.stack.has(value)) {
          throw new RequestKeyError('requestKeyFor: cycle detected in array (request key).');
        }
        ctx.stack.add(value);
        let out = '[';
        for (let i = 0; i < value.length; i++) {
          if (i > 0) out += ',';
          out += requestKeyForImpl(value[i], ctx);
        }
        out += ']';
        ctx.stack.delete(value);
        return out;
      }
      // Plain object path. Reject objects whose prototype is not
      // `Object.prototype` or `null`: a `class` instance would silently
      // drop its method surface into the key but key on instance fields,
      // which is brittle and not part of the request-input contract.
      const proto = Object.getPrototypeOf(value);
      if (proto !== null && proto !== Object.prototype) {
        throw new RequestKeyError(
          `requestKeyFor: object with prototype ${proto.constructor?.name ?? 'unknown'} is not a plain object; only object literals and Object.create(null) shapes are supported in request keys.`,
        );
      }
      if (ctx.stack.has(value as object)) {
        throw new RequestKeyError('requestKeyFor: cycle detected in object (request key).');
      }
      ctx.stack.add(value as object);
      // Reject symbol-keyed own properties. `Object.keys` excludes
      // symbols so a symbol-keyed property would silently drop from
      // the key (an unsound collision with an object that has no such
      // symbol). Detect via `getOwnPropertySymbols` and throw before
      // any further work.
      const symKeys = Object.getOwnPropertySymbols(value as object);
      if (symKeys.length > 0) {
        throw new RequestKeyError(
          `requestKeyFor: symbol-keyed properties are not supported in request keys; remove symbol keys from the request input before passing it to a query hook.`,
        );
      }
      // Iterate enumerable own keys; reject accessor properties before
      // reading them so a getter is never accidentally invoked during
      // dep-key construction.
      const keys = Object.keys(value as object).sort();
      let out = '{';
      for (let i = 0; i < keys.length; i++) {
        if (i > 0) out += ',';
        const k = keys[i];
        const desc = Object.getOwnPropertyDescriptor(value as object, k);
        if (desc === undefined) {
          // Should not happen for `Object.keys()` results, but still
          // treat as unsupported to surface if it ever did.
          throw new RequestKeyError(`requestKeyFor: property ${JSON.stringify(k)} has no descriptor (request key).`);
        }
        if ('get' in desc || 'set' in desc) {
          throw new RequestKeyError(
            `requestKeyFor: accessor property ${JSON.stringify(k)} is not supported in request keys; getters/setters must not run during dep-key construction.`,
          );
        }
        out += `${JSON.stringify(k)}:${requestKeyForImpl((desc as { value: unknown }).value, ctx)}`;
      }
      out += '}';
      ctx.stack.delete(value as object);
      return out;
    }
    default:
      throw new RequestKeyError(`requestKeyFor: unsupported value of type ${t}.`);
  }
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
