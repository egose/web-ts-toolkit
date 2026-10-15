import { OidcVaultDpopClientError } from './errors';

export interface SessionAuthority {
  /** Local invalidation only; consumers own cleanup of their in-flight work. */
  readonly signal: AbortSignal;
  isCurrent(): boolean;
  assertCurrent(): void;
}

const superseded = (): OidcVaultDpopClientError =>
  new OidcVaultDpopClientError('DPOP_OPERATION_SUPERSEDED', 'This browser auth operation was superseded.');
const closed = (): OidcVaultDpopClientError =>
  new OidcVaultDpopClientError('DPOP_SESSION_DISPOSED', 'This browser auth context is closed.');

/** Entry-time authority and a failure-tolerant FIFO, independent of cookie Web Locks. */
export const createSessionLifecycle = () => {
  let disposed = false;
  let controller = new AbortController();
  let tail: Promise<void> = Promise.resolve();

  const assertLive = (): void => {
    if (disposed) throw closed();
  };
  const capture = (current: () => boolean = () => true): SessionAuthority => {
    assertLive();
    const { signal } = controller;
    return {
      signal,
      isCurrent: () => !disposed && !signal.aborted && current(),
      assertCurrent() {
        assertLive();
        if (signal.aborted || !current()) throw superseded();
      },
    };
  };

  return {
    capture,
    isLive: () => !disposed,
    invalidate(): SessionAuthority {
      assertLive();
      const previous = controller;
      controller = new AbortController();
      previous.abort(superseded());
      return capture();
    },
    enqueue<T>(authority: SessionAuthority, run: () => Promise<T>): Promise<T> {
      const pending = tail.then(() => {
        // Never recapture authority after waiting for earlier operations.
        authority.assertCurrent();
        return run();
      });
      tail = pending.then(
        () => {},
        () => {},
      );
      return pending;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort(closed());
    },
  };
};
