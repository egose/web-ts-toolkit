/** Internal browser-safe stream ownership shared by body and discovery reads. */

type ReadFailure = 'locked' | 'read' | 'chunk' | 'limit' | 'timeout' | 'abort';

interface BoundedByteStreamOptions {
  /** Already validated by the caller. */
  readonly maxBytes: number;
  /** Omit only when `signal` is owned by an already bounded whole operation. */
  readonly timeoutMs: number | undefined;
  readonly signal: AbortSignal | null | undefined;
  /** Keeps each public caller's error class, code, and abort-reason contract. */
  readonly error: (failure: ReadFailure, cause?: unknown) => unknown;
}

const INITIAL_CAPACITY = 1024;
const READS_PER_TURN = 128;

function now(): number {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}

/**
 * One reader, one stop race (not one reaction per chunk), and one growable byte
 * buffer. Empty chunks allocate no storage; tiny chunks are coalesced. Capacity
 * never exceeds maxBytes; growth/final trimming temporarily holds at most two
 * such buffers. Producer-owned chunks/queues are outside that storage bound.
 *
 * Check a supplied read deadline around every read and yield a task every 128
 * chunks, including empty ones, so productive streams cannot monopolize
 * microtasks and starve external abort/deadline timers. Cancellation is signaled
 * once on failure, observed for rejection, and never awaited. All owned handles
 * are released.
 */
export async function readBoundedByteStream(
  stream: ReadableStream<Uint8Array>,
  options: BoundedByteStreamOptions,
): Promise<Uint8Array> {
  const { maxBytes, timeoutMs, signal, error: readError } = options;
  const started = timeoutMs === undefined ? 0 : now();
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = stream.getReader();
  } catch (cause) {
    throw readError('locked', cause);
  }

  let storage: Uint8Array | undefined;
  let total = 0;
  let stopped = false;
  let stopReason: unknown;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let yieldTimer: ReturnType<typeof setTimeout> | undefined;
  let finishYield: (() => void) | undefined;
  let rejectStop!: (reason: unknown) => void;
  const stop = new Promise<never>((_resolve, reject) => {
    rejectStop = reject;
  });

  function stopWith(reason: unknown): void {
    if (stopped) return;
    stopped = true;
    stopReason = reason;
    rejectStop(reason);
  }

  function onAbort(): void {
    stopWith(readError('abort'));
  }

  function checkBounds(): void {
    if (stopped) throw stopReason;
    if (signal?.aborted) throw readError('abort');
    if (timeoutMs !== undefined && now() - started >= timeoutMs) throw readError('timeout');
  }

  async function readLoop(): Promise<Uint8Array> {
    let readsThisTurn = 0;
    for (;;) {
      checkBounds();
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (cause) {
        checkBounds();
        throw readError('read', cause);
      }
      checkBounds();
      if (chunk.done) {
        const result =
          storage === undefined ? new Uint8Array(0) : storage.length === total ? storage : storage.slice(0, total);
        checkBounds();
        return result;
      }
      const value = chunk.value;
      if (!(value instanceof Uint8Array)) throw readError('chunk');
      // Reject the overflowing chunk before allocating/copying it or reading EOF.
      if (value.byteLength > maxBytes - total) throw readError('limit');
      if (value.byteLength > 0) {
        const required = total + value.byteLength;
        if (storage === undefined || required > storage.length) {
          const capacity = Math.min(
            maxBytes,
            Math.max(required, storage === undefined ? INITIAL_CAPACITY : storage.length * 2),
          );
          const grown = new Uint8Array(capacity);
          if (storage !== undefined) grown.set(storage);
          storage = grown;
        }
        storage.set(value, total);
        total = required;
      }
      if (++readsThisTurn === READS_PER_TURN) {
        readsThisTurn = 0;
        await new Promise<void>((resolve) => {
          finishYield = resolve;
          yieldTimer = setTimeout(() => {
            yieldTimer = undefined;
            finishYield = undefined;
            resolve();
          }, 0);
        });
      }
    }
  }

  try {
    if (signal !== null && signal !== undefined) {
      try {
        signal.addEventListener('abort', onAbort, { once: true });
      } catch {
        // The per-read signal check still applies to incomplete signal shims.
      }
    }
    if (timeoutMs !== undefined) {
      deadlineTimer = setTimeout(() => stopWith(readError('timeout')), timeoutMs);
      const handle = deadlineTimer as unknown as { unref?: () => void };
      handle.unref?.();
    }
    return await Promise.race([readLoop(), stop]);
  } catch (reason) {
    stopped = true;
    stopReason = reason;
    try {
      void reader.cancel(reason).catch(() => undefined);
    } catch {
      // A synchronous cancellation fault must not replace the read failure.
    }
    throw reason;
  } finally {
    stopped = true;
    storage = undefined;
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    if (yieldTimer !== undefined) clearTimeout(yieldTimer);
    // Wake a paused loop after clearing its timer so it can discard its result.
    finishYield?.();
    if (signal !== null && signal !== undefined) {
      try {
        signal.removeEventListener('abort', onAbort);
      } catch {
        // Best-effort cleanup for incomplete signal shims.
      }
    }
    try {
      reader.releaseLock();
    } catch {
      // Native readers release even with a pending read/cancel; tolerate shims.
    }
  }
}
