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
 *
 * Accessor-free: own enumerable descriptors are inspected before any value
 * is read, so a caller getter on any included property throws
 * {@link RequestKeyError} without executing. The `signal` key is skipped by
 * name before any descriptor/value read, so a `signal` getter never fires.
 * Symbol-keyed enumerable own properties are preserved (not silently
 * dropped) so downstream `requestKeyFor` rejects them deterministically.
 * Reflective reads (`Object.keys`, `getOwnPropertyDescriptor`,
 * `propertyIsEnumerable`) can still trigger proxy traps; arbitrary proxies
 * are not promised safe introspection.
 */
export function requestConfigKeyInput(requestConfig: RequestConfigLike | undefined): RequestConfigLike | undefined {
  if (!requestConfig) {
    return undefined;
  }
  const rest: Record<string | symbol, unknown> = {};
  let hasContent = false;
  for (const k of Object.keys(requestConfig)) {
    if (k === 'signal') {
      continue;
    }
    const desc = Object.getOwnPropertyDescriptor(requestConfig, k);
    if (desc === undefined) {
      throw new RequestKeyError(`requestKeyFor: property ${truncatedKeyLabel(k)} has no descriptor (request key).`);
    }
    if ('get' in desc || 'set' in desc) {
      throw new RequestKeyError(
        `requestKeyFor: accessor property ${truncatedKeyLabel(k)} is not supported in request keys; getters/setters must not run during dep-key construction.`,
      );
    }
    rest[k] = (desc as { value: unknown }).value;
    hasContent = true;
  }
  for (const s of Object.getOwnPropertySymbols(requestConfig)) {
    if (!Object.prototype.propertyIsEnumerable.call(requestConfig, s)) {
      continue;
    }
    const desc = Object.getOwnPropertyDescriptor(requestConfig, s);
    if (desc === undefined) {
      throw new RequestKeyError('requestKeyFor: symbol-keyed property has no descriptor (request key).');
    }
    if ('get' in desc || 'set' in desc) {
      throw new RequestKeyError(
        'requestKeyFor: accessor property (symbol key) is not supported in request keys; getters/setters must not run during dep-key construction.',
      );
    }
    rest[s] = (desc as { value: unknown }).value;
    hasContent = true;
  }
  return hasContent ? (rest as RequestConfigLike) : undefined;
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
 * (ARR-08 req 3 + req 4, ARR-B01).
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
 * `replace` is the primary member: it aborts the previous in-flight
 * controller (if any) and stores the new one. `abort` aborts the current
 * in-flight controller (if any) without installing a new one; it exists
 * so the `!shouldFetch` (disabled / id-removed / context-changed-while-
 * disabled) effect branch can invalidate the current request owner
 * regardless of its entry path (auto effect vs manual `query()` /
 * `refetch()`). The hook's `[]`-dep `useEffect` cleanup aborts the final
 * in-flight controller on unmount and clears the ref so the hook can be
 * re-entered cleanly if React reuses the component instance for a
 * different key (Strict Mode mount/cleanup/remount cycle included).
 * Internal `AbortController` references are never returned to the hook
 * surface — the manager is a stable function-only handle, not a leaked
 * internal object (ARR-08 req 4, ARR-B01 req 1).
 */
export function useAbortManager(): { replace: (c: AbortController) => void; abort: () => void } {
  const ref = useRef<AbortController | null>(null);

  const replace = useCallback((next: AbortController) => {
    ref.current?.abort();
    ref.current = next;
  }, []);

  const abort = useCallback(() => {
    ref.current?.abort();
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
  const managerRef = useRef<{ replace: (c: AbortController) => void; abort: () => void } | null>(null);
  if (managerRef.current === null) {
    managerRef.current = { replace, abort };
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

const REQUEST_KEY_MAX_DEPTH = 64;
const REQUEST_KEY_MAX_NODES = 20_000;
const REQUEST_KEY_MAX_OUTPUT_LENGTH = 200_000;

interface RequestKeyContext {
  // Set of objects currently on the recursion stack, for cycle
  // detection. A `WeakSet` is sufficient because only reference-equal
  // objects can participate in a cycle.
  stack: WeakSet<object>;
  // Per-call reuse of repeated object/array references. This is scoped
  // to one `requestKeyFor(...)` invocation only: it reduces repeated
  // traversal work without retaining caller objects across renders.
  // Each entry stores the serialized key plus the intrinsic subtree
  // height (max nested container depth below the node), so a cache hit
  // at a deeper position can revalidate the effective depth
  // (`depth + height`) instead of reusing a shallow-first serialization
  // past the documented depth limit (ARR-B06).
  cache: WeakMap<object, { key: string; height: number }>;
  nodesVisited: number;
  outputLength: number;
}

// Intrinsic `Date.prototype.getTime` captured once at module load so key
// construction never performs caller-overridable method lookup on the
// instance (`value.getTime()` would invoke an own accessor/override).
// Prototype-chain membership below likewise avoids `instanceof` (which
// reads `Symbol.hasInstance` on the constructor) and `constructor.name`
// (which reads through the instance).
const intrinsicDateGetTime = Date.prototype.getTime as (this: Date) => number;

function prototypeChainIncludes(value: object, target: object): boolean {
  let current: object | null = Object.getPrototypeOf(value);
  while (current !== null) {
    if (current === target) {
      return true;
    }
    current = Object.getPrototypeOf(current);
  }
  return false;
}

function safePrototypeDisplayName(proto: object | null): string {
  if (proto === null) {
    return 'null';
  }
  const desc = Object.getOwnPropertyDescriptor(proto, 'constructor');
  if (
    desc !== undefined &&
    'value' in desc &&
    typeof desc.value === 'function' &&
    typeof (desc.value as { name?: unknown }).name === 'string' &&
    (desc.value as { name: string }).name.length > 0
  ) {
    return (desc.value as { name: string }).name;
  }
  return 'unknown';
}

// Bounded diagnostic label for a property name: short names are
// JSON-encoded in full; huge names report a truncated prefix plus the
// total length so oversized-input errors never allocate an
// input-sized diagnostic string (ARR-B06).
function truncatedKeyLabel(k: string): string {
  if (k.length <= 100) {
    return JSON.stringify(k);
  }
  return `${JSON.stringify(k.slice(0, 50))}... (key length ${k.length})`;
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
 *     an ISO-string filter because of the `d:` prefix. The instant is
 *     read via the intrinsic `Date.prototype.getTime` captured at module
 *     load, never via caller-overridable `value.getTime()` lookup.
 *   - Arrays map to `[<key(e1)>,<key(e2)>,...]` recursively. Element
 *     descriptors (own, then inherited for holes) are inspected before
 *     any read, so own/inherited accessors throw before a getter fires.
 *     True holes with no prototype value serialize as `undefined`,
 *     preserving normal sparse-array behavior; an inherited accessor at
 *     a hole is a deliberate tightening (previously it would execute).
 *     Inherited data values at holes read through by descriptor value.
 *   - Plain objects (no `null` prototype + only enumerable own data
 *     properties) map to `{<key(sorted)!:<key(value)>!...}` recursively.
 *     The key list is sorted, so two structurally equivalent objects
 *     produce the same string regardless of insertion order.
 *   - Traversal is bounded: request keys reject inputs deeper than 64
 *     nested array/object levels, inputs that require more than 20,000
 *     first-visit nodes, or outputs longer than 200,000 characters.
 *     Numeric budgets are unchanged (ARR-B06 retains them).
 *   - Per-call memoization reuses repeated references without retaining
 *     caller objects across calls. Cached subtrees store their intrinsic
 *     height and revalidate `depth + height` on hits (ARR-B06), so a
 *     subtree first seen shallowly cannot be reused deeper past the
 *     depth limit; shared and copied over-depth structures both throw
 *     independent of visitation order.
 *   - Obviously oversized strings/property names are preflighted on raw
 *     length before `JSON.stringify` (escaping only grows the encoded
 *     form), and excessive object/array width is preflighted on counts
 *     (plus a lower-bound output check) before sorting/iteration
 *     (ARR-B06). Oversized diagnostics are truncated by length.
 *
 * Unsupported values — `bigint`, `function`, `symbol`, accessor
 * properties, cycles, and non-plain built-in objects (`RegExp`,
 * `Map`, `Set`, `URL`, etc.) — throw {@link RequestKeyError}.
 *
 * Never invokes a getter: an accessor property detected via
 * `Object.getOwnPropertyDescriptor` is rejected before any access.
 * The same descriptor-first policy covers array indices (including
 * inherited accessors at sparse holes) and top-level request-config
 * properties via `requestConfigKeyInput` (whose `signal` key is skipped
 * by name before any read). Date instants use the captured intrinsic.
 *
 * Proxy boundary: the reflective operations above
 * (`getOwnPropertyDescriptor`, `getPrototypeOf`, `Object.keys`,
 * `getOwnPropertySymbols`) can trigger proxy traps. Safe introspection
 * of arbitrary proxies is not promised; pass plain wire data.
 *
 * Residual limits (ARR-B06, honest bounds): the budgets bound accepted
 * output and first-visit traversal, not all temporary work. Enumerating
 * `Object.keys` / descriptors over a caller object is inherently
 * input-sized, and escaping may expand strings up to ~6x per character
 * before the post-encoding output check fires. No absolute CPU/memory
 * bound for arbitrary caller objects is claimed.
 */
export function requestKeyFor(value: unknown): string {
  return requestKeyForImpl(
    value,
    { stack: new WeakSet(), cache: new WeakMap(), nodesVisited: 0, outputLength: 0 },
    0,
    false,
  );
}

/**
 * Order-preserving request key for `sort` inputs (Task ARR-B02).
 *
 * Same serializer, budgets, and {@link RequestKeyError} contract as
 * {@link requestKeyFor}, except plain-object keys keep their insertion
 * order instead of being sorted. That retains compound-sort wire
 * precedence (`{status: 1, name: 1}` vs `{name: 1, status: 1}` produce
 * different keys) while ordinary dictionary inputs must keep using
 * `requestKeyFor` (which stays insertion-order-insensitive).
 *
 * String and tuple-array sorts delegate to the same traversal, so they
 * behave exactly as before (array order was already significant).
 * Accessor properties are rejected via descriptor inspection before any
 * value read, so no getter executes during normalization.
 *
 * Package-internal: not re-exported from the package index.
 */
export function sortKeyFor(value: unknown): string {
  return requestKeyForImpl(
    value,
    { stack: new WeakSet(), cache: new WeakMap(), nodesVisited: 0, outputLength: 0 },
    0,
    true,
  );
}

function throwRequestKeyDepthError(): never {
  throw new RequestKeyError(
    `requestKeyFor: request input exceeds the maximum depth of ${REQUEST_KEY_MAX_DEPTH} nested arrays/objects; flatten or normalize the structure before passing it to a query hook.`,
  );
}

function throwRequestKeyNodesError(): never {
  throw new RequestKeyError(
    `requestKeyFor: request input exceeds the maximum traversal budget of ${REQUEST_KEY_MAX_NODES} nodes; reduce the filter, params, or requestConfig shape before passing it to a query hook.`,
  );
}

function throwRequestKeyOutputError(): never {
  throw new RequestKeyError(
    `requestKeyFor: request input exceeds the maximum serialized key length of ${REQUEST_KEY_MAX_OUTPUT_LENGTH} characters; reduce repeated or oversized request data before passing it to a query hook.`,
  );
}

function requestKeyForImpl(
  value: unknown,
  ctx: RequestKeyContext,
  depth: number,
  preserveObjectKeyOrder: boolean,
): string {
  return serializeRequestKeyNode(value, ctx, depth, preserveObjectKeyOrder).text;
}

// Inner traversal returning both the canonical text and the intrinsic
// subtree height (max nested array/object depth below this node).
// Height 0 covers primitives/Dates; an empty container also has height
// 0, otherwise height = 1 + max(child heights). Cache entries store
// this height so a hit at `depth` revalidates `depth + height` against
// the depth limit (ARR-B06): a subtree first seen shallowly cannot be
// reused deeper past the documented bound, keeping shared and copied
// structures consistent independent of visitation order.
function serializeRequestKeyNode(
  value: unknown,
  ctx: RequestKeyContext,
  depth: number,
  preserveObjectKeyOrder: boolean,
): { text: string; height: number } {
  if (depth > REQUEST_KEY_MAX_DEPTH) {
    throwRequestKeyDepthError();
  }
  if (value === null) {
    noteRequestKeyNode(ctx);
    return { text: finalizePrimitiveRequestKey(ctx, 'n:'), height: 0 };
  }
  if (value === undefined) {
    noteRequestKeyNode(ctx);
    return { text: finalizePrimitiveRequestKey(ctx, 'u:'), height: 0 };
  }

  if (typeof value === 'object') {
    const cached = ctx.cache.get(value as object);
    if (cached !== undefined) {
      if (depth + cached.height > REQUEST_KEY_MAX_DEPTH) {
        throwRequestKeyDepthError();
      }
      reserveRequestKeyOutput(ctx, cached.key.length);
      return { text: cached.key, height: cached.height };
    }
  }

  noteRequestKeyNode(ctx);

  const t = typeof value;
  switch (t) {
    case 'boolean':
      return { text: finalizePrimitiveRequestKey(ctx, `b:${value}`), height: 0 };
    case 'number': {
      if (Number.isNaN(value)) return { text: finalizePrimitiveRequestKey(ctx, 'n:NaN'), height: 0 };
      if (Object.is(value, -0)) return { text: finalizePrimitiveRequestKey(ctx, 'n:-0'), height: 0 };
      return { text: finalizePrimitiveRequestKey(ctx, `n:${String(value)}`), height: 0 };
    }
    case 'string': {
      // Preflight obviously oversized strings before JSON encoding:
      // the encoded form is at least `s:` + 2 quotes + raw length, and
      // escaping only grows it, so exceeding the budget on raw length
      // alone guarantees the encoded form exceeds too (ARR-B06).
      const rawLength = (value as string).length;
      if (ctx.outputLength + rawLength + 4 > REQUEST_KEY_MAX_OUTPUT_LENGTH) {
        throwRequestKeyOutputError();
      }
      return { text: finalizePrimitiveRequestKey(ctx, `s:${JSON.stringify(value)}`), height: 0 };
    }
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
      // date. The instant comes from the captured intrinsic, never from
      // caller-overridable `value.getTime()` lookup, so own/patched
      // accessors never fire. Membership is checked via the prototype
      // chain (not `instanceof`, which reads `Symbol.hasInstance`).
      if (prototypeChainIncludes(value as object, Date.prototype)) {
        if (typeof intrinsicDateGetTime !== 'function') {
          throw new RequestKeyError(
            'requestKeyFor: Date values are not supported in this environment (Date.prototype.getTime is unavailable); pass an epoch-millis number instead.',
          );
        }
        let instant: number;
        try {
          instant = intrinsicDateGetTime.call(value as Date);
        } catch {
          throw new RequestKeyError(
            'requestKeyFor: invalid Date receiver in request keys; pass an epoch-millis number instead.',
          );
        }
        return { text: finalizePrimitiveRequestKey(ctx, `d:${instant}`), height: 0 };
      }
      // Reject unsupported built-in instances. `RegExp`, `Map`, `Set`,
      // `URL`, `Error`, and class instances are not part of the
      // request-input contract; rejecting keeps the canonical key
      // stable instead of relying on the current (unspecified)
      // `toString()` shape. Membership uses the prototype chain so no
      // instance `constructor` getter fires; messages use static names.
      if (prototypeChainIncludes(value as object, RegExp.prototype)) {
        throw new RequestKeyError(
          'requestKeyFor: instance of RegExp is not supported in request keys; pass its plain-data representation (e.g. a source/flags string) to the query hook instead.',
        );
      }
      if (prototypeChainIncludes(value as object, Map.prototype)) {
        throw new RequestKeyError(
          'requestKeyFor: instance of Map is not supported in request keys; pass its plain-data representation (e.g. a sorted array of entries) to the query hook instead.',
        );
      }
      if (prototypeChainIncludes(value as object, Set.prototype)) {
        throw new RequestKeyError(
          'requestKeyFor: instance of Set is not supported in request keys; pass its plain-data representation (e.g. a sorted array of entries) to the query hook instead.',
        );
      }
      if (typeof URL !== 'undefined' && prototypeChainIncludes(value as object, URL.prototype)) {
        throw new RequestKeyError(
          'requestKeyFor: instance of URL is not supported in request keys; pass its plain-data representation (e.g. a URL string) to the query hook instead.',
        );
      }
      if (prototypeChainIncludes(value as object, Error.prototype)) {
        throw new RequestKeyError(
          'requestKeyFor: instance of Error is not supported in request keys; pass its plain-data representation (e.g. a message string) to the query hook instead.',
        );
      }
      if (Array.isArray(value)) {
        if (ctx.stack.has(value)) {
          throw new RequestKeyError('requestKeyFor: cycle detected in array (request key).');
        }
        ctx.stack.add(value);
        reserveRequestKeyOutput(ctx, 1);
        let out = '[';
        // Descriptor-first element reads (ARR-B05): an own accessor at
        // an index throws before its getter fires. Holes fall through
        // to the prototype chain, which is walked descriptor-first as
        // well: an inherited accessor throws (deliberate tightening —
        // previously it executed), inherited data reads through by
        // descriptor value, and a true hole serializes as `undefined`,
        // preserving documented sparse-array behavior.
        const length = (value as unknown[]).length;
        // Width preflight (ARR-B06): each element costs at least one
        // traversal node, so an array that already exceeds the remaining
        // node budget is rejected before per-element work.
        if (ctx.nodesVisited + length > REQUEST_KEY_MAX_NODES) {
          throwRequestKeyNodesError();
        }
        let maxChildHeight = 0;
        let hasChild = false;
        for (let i = 0; i < length; i++) {
          if (i > 0) {
            reserveRequestKeyOutput(ctx, 1);
            out += ',';
          }
          const indexKey = String(i);
          const ownDesc = Object.getOwnPropertyDescriptor(value, indexKey);
          let element: unknown;
          if (ownDesc !== undefined) {
            if ('get' in ownDesc || 'set' in ownDesc) {
              throw new RequestKeyError(
                `requestKeyFor: accessor array element at index ${i} is not supported in request keys; getters/setters must not run during dep-key construction.`,
              );
            }
            element = (ownDesc as { value: unknown }).value;
          } else {
            let inherited: PropertyDescriptor | undefined;
            let proto: object | null = Object.getPrototypeOf(value);
            while (proto !== null) {
              const candidate = Object.getOwnPropertyDescriptor(proto, indexKey);
              if (candidate !== undefined) {
                inherited = candidate;
                break;
              }
              proto = Object.getPrototypeOf(proto);
            }
            if (inherited !== undefined) {
              if ('get' in inherited || 'set' in inherited) {
                throw new RequestKeyError(
                  `requestKeyFor: inherited accessor array element at index ${i} is not supported in request keys; getters/setters must not run during dep-key construction.`,
                );
              }
              element = (inherited as { value: unknown }).value;
            } else {
              element = undefined;
            }
          }
          const child = serializeRequestKeyNode(element, ctx, depth + 1, preserveObjectKeyOrder);
          hasChild = true;
          if (child.height + 1 > maxChildHeight) {
            maxChildHeight = child.height + 1;
          }
          out += child.text;
        }
        reserveRequestKeyOutput(ctx, 1);
        out += ']';
        ctx.stack.delete(value);
        const height = hasChild ? maxChildHeight : 0;
        ctx.cache.set(value, { key: out, height });
        return { text: out, height };
      }
      // Plain object path. Reject objects whose prototype is not
      // `Object.prototype` or `null`: a `class` instance would silently
      // drop its method surface into the key but key on instance fields,
      // which is brittle and not part of the request-input contract.
      const proto = Object.getPrototypeOf(value);
      if (proto !== null && proto !== Object.prototype) {
        throw new RequestKeyError(
          `requestKeyFor: object with prototype ${safePrototypeDisplayName(proto)} is not a plain object; only object literals and Object.create(null) shapes are supported in request keys.`,
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
      // dep-key construction. The canonical path sorts keys so ordinary
      // dictionaries compare insertion-order-insensitively; the sort
      // path (ARR-B02) preserves insertion order so compound-sort
      // precedence participates in request identity.
      const unsortedKeys = Object.keys(value as object);
      // Width preflight before sorting (ARR-B06): each key's value costs
      // at least one traversal node, so an object that already exceeds
      // the remaining node budget is rejected before the O(n log n)
      // sort. A lower-bound output check (raw key chars + per-entry
      // framing) likewise rejects obviously oversized key sets before
      // sorting. Enumerating `Object.keys` itself is unavoidable
      // input-sized reflective work (see JSDoc residual limits).
      if (ctx.nodesVisited + unsortedKeys.length > REQUEST_KEY_MAX_NODES) {
        throwRequestKeyNodesError();
      }
      let totalKeyChars = 0;
      for (let i = 0; i < unsortedKeys.length; i++) {
        totalKeyChars += unsortedKeys[i].length;
      }
      if (ctx.outputLength + totalKeyChars + 6 * unsortedKeys.length + 2 > REQUEST_KEY_MAX_OUTPUT_LENGTH) {
        throwRequestKeyOutputError();
      }
      const keys = preserveObjectKeyOrder ? unsortedKeys : unsortedKeys.sort();
      reserveRequestKeyOutput(ctx, 1);
      let out = '{';
      let maxChildHeight = 0;
      let hasChild = false;
      for (let i = 0; i < keys.length; i++) {
        if (i > 0) {
          reserveRequestKeyOutput(ctx, 1);
          out += ',';
        }
        const k = keys[i];
        const desc = Object.getOwnPropertyDescriptor(value as object, k);
        if (desc === undefined) {
          // Should not happen for `Object.keys()` results, but still
          // treat as unsupported to surface if it ever did.
          throw new RequestKeyError(`requestKeyFor: property ${truncatedKeyLabel(k)} has no descriptor (request key).`);
        }
        if ('get' in desc || 'set' in desc) {
          throw new RequestKeyError(
            `requestKeyFor: accessor property ${truncatedKeyLabel(k)} is not supported in request keys; getters/setters must not run during dep-key construction.`,
          );
        }
        // Preflight obviously oversized property names before encoding:
        // the encoded name is at least raw length + 2 quotes, plus the
        // `:` separator, and escaping only grows it (ARR-B06).
        if (ctx.outputLength + k.length + 3 > REQUEST_KEY_MAX_OUTPUT_LENGTH) {
          throwRequestKeyOutputError();
        }
        const keyText = JSON.stringify(k);
        reserveRequestKeyOutput(ctx, keyText.length + 1);
        const child = serializeRequestKeyNode(
          (desc as { value: unknown }).value,
          ctx,
          depth + 1,
          preserveObjectKeyOrder,
        );
        hasChild = true;
        if (child.height + 1 > maxChildHeight) {
          maxChildHeight = child.height + 1;
        }
        out += `${keyText}:${child.text}`;
      }
      reserveRequestKeyOutput(ctx, 1);
      out += '}';
      ctx.stack.delete(value as object);
      const height = hasChild ? maxChildHeight : 0;
      ctx.cache.set(value as object, { key: out, height });
      return { text: out, height };
    }
    default:
      throw new RequestKeyError(`requestKeyFor: unsupported value of type ${t}.`);
  }
}

function noteRequestKeyNode(ctx: RequestKeyContext): void {
  ctx.nodesVisited += 1;
  if (ctx.nodesVisited > REQUEST_KEY_MAX_NODES) {
    throwRequestKeyNodesError();
  }
}

function finalizePrimitiveRequestKey(ctx: RequestKeyContext, key: string): string {
  reserveRequestKeyOutput(ctx, key.length);
  return key;
}

function reserveRequestKeyOutput(ctx: RequestKeyContext, length: number): void {
  ctx.outputLength += length;
  if (ctx.outputLength > REQUEST_KEY_MAX_OUTPUT_LENGTH) {
    throwRequestKeyOutputError();
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
