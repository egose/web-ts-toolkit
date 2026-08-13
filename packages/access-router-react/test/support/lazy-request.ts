/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Contract-accurate lazy/deferred request helpers for the access-router-react
// test harness (ARR-01).
//
// The real `@web-ts-toolkit/access-router-client` `LazyRequest<T>` is a
// thenable that exposes `.exec()` (`packages/access-router-client/src/lazy-promise.ts`).
// `.then()` / `.catch()` / `.finally()` all funnel through `exec()`, which
// caches the underlying promise so repeated chaining attaches to the same
// execution rather than re-invoking the executor.
//
// The helpers below mirror that shape so the React hooks under test observe
// the same promise semantics the client ships to installed consumers:
//
// - a request can remain pending
// - a request can observe an abort (via `AbortSignal`)
// - a request can settle in a chosen order (out-of-order completion testing)
// - a request can resolve to the client's normal `{ success: false, data: null }`
//   failure response without violating the client `Response` type
// - a request can reject (e.g. when `throwOnError` is enabled or the transport
//   fails before reaching the client boundary)
//
// These helpers intentionally do NOT use `vi.fn()` directly on the lazy
// request object: the public hook surface awaits the request, so the request
// must satisfy `Promise<T>` plus `LazyRequest<T>` exactly. The `.exec()`
// spy is exposed separately for argument-and-call assertions.

import type { LazyRequest } from '@web-ts-toolkit/access-router-client';
import { vi } from 'vitest';

/**
 * A controllable deferred settlement for a lazy request. The returned
 * controller lets a test release a pending request in any of three modes
 * (success, resolved-failure, rejection) and inspect the `AbortSignal` that
 * the hook forwarded to the service call.
 */
export interface DeferredController<T> {
  /** Sets the value used when `resolve()` is called with no argument. */
  resetValue(value: T): void;
  /** Resolve the promise as a success. Optional `value` overrides the configured success result. */
  resolve(value?: T): void;
  /** Resolve the promise with the configured `FailureResult` payload. */
  resolveFailure(failure?: T): void;
  /** Reject the promise with the supplied error (preserves transport-error semantics). */
  reject(error: unknown): void;
  /** Resolve on the next microtask with the configured success result. */
  settle(): void;
  /** The `AbortSignal` forwarded by the hook for the underlying call. */
  signal: AbortSignal | undefined;
  /** True once the lazy request's `.then()`/`.exec()` has been invoked. */
  started: boolean;
}

export interface LazyRequestOptions<T> {
  /** The result the request will resolve with when `resolve()` or `settle()` is invoked. */
  value: T;
  /** When true, defers settlement until `resolve()`/`reject()` is called. Defaults to true. */
  deferred?: boolean;
  /**
   * Settles immediately as a rejected promise carrying `error`. Useful for
   * representing the `throwOnError` / pre-boundary transport failure path,
   * which resolves to a `ServiceError` rejection at the React boundary.
   */
  reject?: unknown;
}

export interface ControlledLazyRequest<T> {
  /** The lazy request object satisfying `LazyRequest<T>` (and the shared `Promise<T>`). */
  request: LazyRequest<T>;
  /** Controller for releasing a deferred request. */
  controller: DeferredController<T>;
  /** Vitest spy recording `exec()` callers and arguments. */
  execSpy: ReturnType<typeof vi.fn>;
}

/**
 * Build a controlled lazy request that mirrors the client's
 * `wrapLazyPromise` shape. The request stays pending until either:
 *   - `options.deferred === false` (resolve/settle on the next microtask), or
 *   - the test invokes `controller.resolve()`, `.resolveFailure()`, or `.reject()`.
 *
 * The captured `AbortSignal` is the one the hook forwarded to the service
 * call (the hook always calls `service.<op>(...args, { ...requestConfig, signal })`).
 * The harness records it so cancellation and signal-forwarding tests can
 * assert on it without racing on microtask timing.
 *
 * `ModelPromiseMeta` is intentionally omitted from the constructed object.
 * The hook surface never introspects lazy-request metadata; it only `await`s
 * or `.exec()`s the returned request. Keeping meta off the mock prevents
 * the test harness from coupling to private adapter-internal symbols while
 * still satisfying the public `LazyRequest<T>` contract.
 */
export function createLazyRequest<T>(options: LazyRequestOptions<T>): ControlledLazyRequest<T> {
  const { value: initialValue, deferred = true, reject: initialReject } = options;

  let resolveFns: ((value: T) => void)[] = [];
  let rejectFns: ((error: unknown) => void)[] = [];
  let settled = false;
  let currentValue: T = initialValue;
  // The signal forwarded by the hook for this request; recorded by the
  // service-call wrapper before the lazy request's executor runs.
  let forwardedSignal: AbortSignal | undefined;

  const settleResolved = (value: T) => {
    if (settled) return;
    settled = true;
    // Capture the current subscribers before clearing so a late `.then()`
    // attached after settlement still sees a settled promise (Promise
    // semantics guarantee that). The captured `resolveFns` array is what
    // the cached promise's resolver points to.
    const pendingResolvers = resolveFns;
    resolveFns = [];
    rejectFns = [];
    for (const resolve of pendingResolvers) resolve(value);
  };

  const settleRejected = (error: unknown) => {
    if (settled) return;
    settled = true;
    const pendingRejecters = rejectFns;
    resolveFns = [];
    rejectFns = [];
    for (const reject of pendingRejecters) reject(error);
  };

  // The shared underlying promise. `Promise.resolve().then(execute)` mirrors
  // `wrapLazyPromise`: synchronous executor failures are converted to
  // rejections and reach `.then`/`.catch`/`await` consumers.
  let cachedPromise: Promise<T> | undefined;

  const ensureDeferredForced = () => {
    if (initialReject !== undefined && !settled) {
      // Pre-seed a rejection so awaiting without explicit `controller.reject()`
      // mirrors the throwOnError transport-failure path the client exposes.
      settleRejected(initialReject);
    }
  };

  const buildPromise = (): Promise<T> => {
    if (cachedPromise) return cachedPromise;
    cachedPromise = new Promise<T>((resolve, reject) => {
      resolveFns.push(resolve);
      rejectFns.push(reject);
      ensureDeferredForced();
      if (!deferred && initialReject === undefined) {
        // Schedule a microtask settlement so synchronous assertions can run
        // against the pending state before the request resolves.
        queueMicrotask(() => settleResolved(currentValue));
      }
    });
    return cachedPromise;
  };

  const execSpy = vi.fn((): Promise<T> => buildPromise());

  // `wrapLazyPromise` exposes `.then/.catch/.finally` that each call
  // `exec()` and chain to the shared underlying promise. The hook surface
  // uses `await` (which triggers `then`), but `.exec()` is called on the
  // hook-imperative path (manual `query()`/`mutate()`), so the spy needs to
  // record both entry paths.
  const request = {
    exec: execSpy,
    then<TResult1 = T, TResult2 = never>(
      onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return buildPromise().then(onFulfilled as any, onRejected as any);
    },
    catch<TResult = never>(
      onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
    ): Promise<T | TResult> {
      return buildPromise().catch(onRejected as any);
    },
    finally(onFinally?: (() => void) | null): Promise<T> {
      return buildPromise().finally(onFinally as any);
    },
    [Symbol.toStringTag]: 'Promise',
  } as unknown as LazyRequest<T>;

  // Expose the forwarded signal as a non-enumerable configurable getter so
  // cancellation tests can assert on it without it leaking into iteration
  // snapshots or breaking `LazyRequest<T>` structural equality. The getter
  // reads the closed-over variable that the mock-service factory records
  // before the lazy request's `.exec()`/`.then()` runs.
  Object.defineProperty(request, 'signal', {
    get: () => forwardedSignal,
    enumerable: false,
    configurable: true,
  });

  const controller: DeferredController<T> = {
    resetValue(value: T) {
      currentValue = value;
    },
    resolve(value?: T) {
      settleResolved(value ?? currentValue);
    },
    resolveFailure(failure?: T) {
      settleResolved(failure ?? currentValue);
    },
    reject(error: unknown) {
      settleRejected(error);
    },
    settle() {
      queueMicrotask(() => settleResolved(currentValue));
    },
    get signal(): AbortSignal | undefined {
      return forwardedSignal;
    },
    get started(): boolean {
      return cachedPromise !== undefined;
    },
  };

  return {
    request,
    controller,
    execSpy,
    // Internal hook: the mock-service factory records the supplied abort
    // signal here before invoking the lazy request's `.exec()`/`.then()`.
    // Exposed via a dedicated function rather than the public controller
    // surface to keep the mock-service the single source of truth for what
    // the hook forwarded.
    __recordSignal: (signal: AbortSignal | undefined) => {
      forwardedSignal = signal;
    },
  } as ControlledLazyRequest<T> & { __recordSignal: (signal: AbortSignal | undefined) => void };
}

export type LazyRequestRecorder<T> = ControlledLazyRequest<T> & {
  __recordSignal: (signal: AbortSignal | undefined) => void;
};

/**
 * Convenience constructor for a lazy request that resolves immediately
 * on the next microtask (the historical behavior of the 60 existing tests).
 * Use `createLazyRequest({ ..., deferred: true })` instead when a test
 * needs to observe pending state or release settlement explicitly.
 */
export function createImmediateLazyRequest<T>(value: T): ControlledLazyRequest<T> {
  return createLazyRequest({ value, deferred: false });
}

/**
 * Convenience constructor for a lazy request that rejects immediately
 * on the next microtask (mirrors the rejected-side behavior of the
 * historical `createRejectingLazyMock` helper).
 */
export function createImmediateRejectedLazyRequest<T>(value: T, error: unknown): ControlledLazyRequest<T> {
  return createLazyRequest({ value, deferred: false, reject: error });
}
