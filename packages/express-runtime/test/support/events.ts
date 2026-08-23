import type { EventEmitter } from 'node:events';
import http from 'node:http';
import { createDeferred } from './deferred';

/**
 * Wait for a single event on an EventEmitter with timeout and cleanup.
 * Rejects on timeout or if an error event occurs (when waiting for non-error events).
 * Removes listeners after settlement.
 */
export function waitForEvent(
  emitter: EventEmitter,
  event: string,
  options: { timeoutMs?: number; errorEvent?: string } = {},
): Promise<unknown[]> {
  const { timeoutMs = 5000, errorEvent = 'error' } = options;
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      emitter.removeListener(event, onEvent);
      if (errorEvent && errorEvent !== event) {
        emitter.removeListener(errorEvent, onError);
      }
    };
    const onEvent = (...args: unknown[]) => {
      cleanup();
      resolve(args);
    };
    const onError = (err: unknown) => {
      cleanup();
      reject(err);
    };
    emitter.once(event, onEvent);
    if (errorEvent && errorEvent !== event) {
      emitter.once(errorEvent, onError);
    }
    if (timeoutMs !== Infinity) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for event '${event}' after ${timeoutMs}ms`));
      }, timeoutMs);
      // Don't keep process alive for this timeout alone
      timer.unref?.();
    }
  });
}

/**
 * Wait for an http.Server to be listening. Handles already-listening case,
 * error event, and timeout. Uses explicit events, not fixed sleeps.
 */
export async function waitForListening(
  server: http.Server,
  options: { timeoutMs?: number } = {},
): Promise<{ port: number; address: ReturnType<http.Server['address']> }> {
  const { timeoutMs = 5000 } = options;
  if (server.listening) {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? (addr as { port: number }).port : 0;
    return { port, address: addr };
  }
  const deferred = createDeferred<{ port: number; address: ReturnType<http.Server['address']> }>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onListening = () => {
    cleanup();
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? (addr as { port: number }).port : 0;
    deferred.resolve({ port, address: addr });
  };
  const onError = (err: unknown) => {
    cleanup();
    deferred.reject(err);
  };
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    server.removeListener('listening', onListening);
    server.removeListener('error', onError);
  };

  server.once('listening', onListening);
  server.once('error', onError);

  if (timeoutMs !== Infinity) {
    timer = setTimeout(() => {
      cleanup();
      deferred.reject(new Error(`Timed out waiting for server listening after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();
  }

  return deferred.promise;
}

/**
 * Wait for server to fully close. Returns when 'close' event fires.
 */
export async function waitForClose(server: http.Server, options: { timeoutMs?: number } = {}): Promise<void> {
  const { timeoutMs = 5000 } = options;
  if (!server.listening) {
    // Server already closed or never started; wait for close if not already closed.
    // If close has already happened, this will timeout; but we treat not-listening as already done
    // after checking that there is no pending close. For deterministic behavior, check if address is null.
    return;
  }
  await waitForEvent(server, 'close', { timeoutMs });
}

/**
 * Wait for server error event.
 */
export function waitForError(server: http.Server, options: { timeoutMs?: number } = {}): Promise<unknown> {
  return waitForEvent(server, 'error', { timeoutMs: options.timeoutMs ?? 5000, errorEvent: '' }).then(
    (args) => args[0],
  );
}

/**
 * Wait for child process exit with timeout.
 */
export function waitForExit(
  child: {
    once: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
  },
  options: { timeoutMs?: number } = {},
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  const { timeoutMs = 5000 } = options;
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      resolve({ code, signal });
    };
    const onError = (err: unknown) => {
      cleanup();
      reject(err);
    };
    child.once('exit', onExit as (...args: unknown[]) => void);
    child.once('error', onError as (...args: unknown[]) => void);
    if (timeoutMs !== Infinity) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for child exit after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
    }
  });
}

/**
 * Create a barrier that resolves when N events have been observed.
 * Useful for counting child exits or request entries.
 */
export function createEventBarrier(expectedCount: number): {
  arrive: () => void;
  wait: () => Promise<void>;
  count: () => number;
} {
  let count = 0;
  const deferred = createDeferred<void>();
  return {
    arrive: () => {
      count += 1;
      if (count >= expectedCount) {
        deferred.resolve();
      }
    },
    wait: () => deferred.promise,
    count: () => count,
  };
}
