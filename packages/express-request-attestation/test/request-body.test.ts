/** Native-stream regressions for byte storage, cooperative work, and cleanup. */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SignerClientError, materializeRequestBodyBytes } from '../src/signer.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function streamRequest(stream: ReadableStream<Uint8Array>): Request {
  return new Request('https://attestation.example.com/api/items', {
    method: 'POST',
    body: stream,
    ...({ duplex: 'half' } as { duplex: string }),
  });
}

function observe<T>(promise: Promise<T>) {
  let outcome: PromiseSettledResult<T> | undefined;
  const settled = promise.then(
    (value) => {
      outcome = { status: 'fulfilled', value };
    },
    (reason: unknown) => {
      outcome = { status: 'rejected', reason };
    },
  );
  return { settled, outcome: () => outcome };
}

describe('bounded request-body stream ownership', () => {
  it('preserves exact bytes at cap equality, including reused offset views and empty chunks', async () => {
    const expected = new TextEncoder().encode('offset bytes: \u0000\ufeff🌍 café');
    const reusable = new Uint8Array(5);
    const view = reusable.subarray(2, 3);
    const empty = new Uint8Array(0);
    let pulls = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          const index = Math.floor(pulls++ / 2);
          if (index === expected.length) {
            controller.close();
          } else if (pulls % 2 === 1) {
            controller.enqueue(empty);
          } else {
            view[0] = expected[index];
            controller.enqueue(view);
          }
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    const signal = new AbortController().signal;
    const add = vi.spyOn(signal, 'addEventListener');
    const remove = vi.spyOn(signal, 'removeEventListener');
    vi.useFakeTimers();
    const result = await materializeRequestBodyBytes(streamRequest(stream), {
      maxBodyBytes: expected.length,
      signal,
    });
    expect(result).toEqual(expected);
    reusable.fill(255);
    expect(result).toEqual(expected);
    expect(result.buffer.byteLength).toBe(expected.length);
    expect(stream.locked).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['limit', 'non-byte chunk'] as const)(
    'reports %s immediately even when cancellation never settles',
    async (failure) => {
      vi.useFakeTimers();
      const cancel = vi.fn(() => new Promise<void>(() => undefined));
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            controller.enqueue(failure === 'limit' ? new Uint8Array(5) : ('not bytes' as never));
          },
          cancel,
        },
        { highWaterMark: 0 },
      );
      const result = observe(materializeRequestBodyBytes(streamRequest(stream), { maxBodyBytes: 4, timeoutMs: 40 }));
      try {
        await vi.advanceTimersByTimeAsync(0);
        const outcome = result.outcome();
        expect(outcome?.status).toBe('rejected');
        if (outcome?.status !== 'rejected') return;
        expect(outcome.reason).toBeInstanceOf(SignerClientError);
        expect(outcome.reason).toMatchObject({ code: 'SIGNER_PREPARATION_FAILED' });
        expect((outcome.reason as Error).message).toContain(
          failure === 'limit' ? '4-byte limit' : 'chunk is not bytes',
        );
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(stream.locked).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        // Bounds the old implementation too: its incorrect await only ends at
        // the body timeout. Never leave a pre-fix reproduction hanging.
        await vi.advanceTimersByTimeAsync(40);
        await result.settled;
      }
    },
  );

  it.each(['rejects', 'never settles', 'throws'] as const)(
    'releases a stalled reader and deadline when cancellation %s',
    async (cancellation) => {
      vi.useFakeTimers();
      const cancel = vi.fn(() => {
        if (cancellation === 'throws') throw new Error('cancel threw');
        if (cancellation === 'rejects') return Promise.reject(new Error('cancel rejected'));
        return new Promise<void>(() => undefined);
      });
      const stream = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
      const signal = new AbortController().signal;
      const add = vi.spyOn(signal, 'addEventListener');
      const remove = vi.spyOn(signal, 'removeEventListener');
      const result = observe(materializeRequestBodyBytes(streamRequest(stream), { timeoutMs: 20, signal }));
      await vi.advanceTimersByTimeAsync(20);
      await result.settled;
      expect(result.outcome()).toMatchObject({
        status: 'rejected',
        reason: {
          name: 'SignerClientError',
          code: 'SIGNER_PREPARATION_FAILED',
          message: expect.stringContaining('20 ms'),
        },
      });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(stream.locked).toBe(false);
      expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1]);
      expect(vi.getTimerCount()).toBe(0);
      // Flush rejection reporting: Vitest must see no unhandled cancel promise.
      await vi.advanceTimersByTimeAsync(0);
    },
  );

  it.each(['rejects', 'never settles'] as const)(
    'preserves the exact mid-read abort reason when cancellation %s',
    async (cancellation) => {
      vi.useFakeTimers();
      const cancel = vi.fn(() =>
        cancellation === 'rejects' ? Promise.reject(new Error('cancel rejected')) : new Promise<void>(() => undefined),
      );
      const stream = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
      const controller = new AbortController();
      const reason = new Error('caller stopped reading');
      const add = vi.spyOn(controller.signal, 'addEventListener');
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const result = observe(materializeRequestBodyBytes(streamRequest(stream), { signal: controller.signal }));
      await vi.advanceTimersByTimeAsync(0);
      controller.abort(reason);
      await result.settled;
      expect(result.outcome()).toEqual({ status: 'rejected', reason });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(stream.locked).toBe(false);
      expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1]);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(0);
    },
  );

  it.each([new Error('private stream fault'), new SignerClientError('SIGNER_PREPARATION_FAILED', 'typed fault')])(
    'preserves the public error contract after a read rejection (%s)',
    async (cause) => {
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(cause);
        },
      });
      const result = await Promise.allSettled([materializeRequestBodyBytes(streamRequest(stream))]);
      expect(result[0]).toMatchObject({ status: 'rejected', reason: { code: 'SIGNER_PREPARATION_FAILED' } });
      if (result[0]?.status === 'rejected') {
        expect(result[0].reason).toBeInstanceOf(SignerClientError);
        if (cause instanceof SignerClientError) expect(result[0].reason).toBe(cause);
        else expect((result[0].reason as Error).message).not.toContain('private stream fault');
      }
      expect(stream.locked).toBe(false);
    },
  );

  it.each([0, 1])('lets a timer-driven caller abort interrupt productive %i-byte chunks', async (chunkBytes) => {
    const controller = new AbortController();
    const reason = new Error('timer-driven abort');
    const chunk = new Uint8Array(chunkBytes);
    let pulls = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(sink) {
          // Finite fuse makes the pre-fix microtask starvation safe to reproduce.
          if (++pulls > 10000) sink.close();
          else sink.enqueue(chunk);
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    const timer = setTimeout(() => controller.abort(reason), 0);
    try {
      const result = await Promise.allSettled([
        materializeRequestBodyBytes(streamRequest(stream), {
          maxBodyBytes: 10000,
          timeoutMs: 5000,
          signal: controller.signal,
        }),
      ]);
      expect(result[0]).toMatchObject({ status: 'rejected', reason });
      if (result[0]?.status === 'rejected') expect(result[0].reason).toBe(reason);
      expect(pulls).toBeLessThan(10000);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(stream.locked).toBe(false);
    } finally {
      clearTimeout(timer);
    }
  });

  it.each([0, 1])('checks elapsed time between productive %i-byte reads before EOF', async (chunkBytes) => {
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const chunk = new Uint8Array(chunkBytes);
    let pulls = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          elapsed += 1;
          if (++pulls > 100) controller.close();
          else controller.enqueue(chunk);
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    const result = await Promise.allSettled([
      materializeRequestBodyBytes(streamRequest(stream), {
        maxBodyBytes: 1024,
        timeoutMs: 20,
      }),
    ]);
    expect(result[0]).toMatchObject({
      status: 'rejected',
      reason: { code: 'SIGNER_PREPARATION_FAILED', message: expect.stringContaining('20 ms') },
    });
    expect(pulls).toBe(20);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });
});

describe('bounded-resource experiment', () => {
  it('coalesces 32768 one-byte chunks interleaved with 32768 empty chunks', async () => {
    const inputBytes = 32768;
    const one = new Uint8Array(1);
    const empty = new Uint8Array(0);
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (pulls === inputBytes * 2) {
            controller.close();
            return;
          }
          const index = pulls++;
          one[0] = Math.floor(index / 2) % 251;
          controller.enqueue(index % 2 === 0 ? empty : one);
        },
      },
      { highWaterMark: 0 },
    );
    const request = streamRequest(stream);
    const NativeBytes = Uint8Array;
    const nativeSlice = NativeBytes.prototype.slice;
    let allocations = 0;
    let allocatedBytes = 0;
    let largestAllocation = 0;
    function record<T extends Uint8Array>(value: T): T {
      allocations += 1;
      allocatedBytes += value.byteLength;
      largestAllocation = Math.max(largestAllocation, value.byteLength);
      return value;
    }
    const constructorSpy = new Proxy(NativeBytes, {
      construct(target, args) {
        return record(Reflect.construct(target, args) as Uint8Array);
      },
    });
    // Count constructor and intrinsic slice allocations without retaining the
    // arrays under observation. The source reuses two preallocated views.
    const sliceSpy = vi.spyOn(NativeBytes.prototype, 'slice').mockImplementation(function (
      this: Uint8Array,
      start,
      end,
    ) {
      return record(nativeSlice.call(this, start, end));
    });
    globalThis.Uint8Array = constructorSpy;
    let bytes: Uint8Array;
    try {
      bytes = await materializeRequestBodyBytes(request, { maxBodyBytes: inputBytes, timeoutMs: 5000 });
    } finally {
      globalThis.Uint8Array = NativeBytes;
      sliceSpy.mockRestore();
    }
    console.info('bounded-resource finite', {
      inputBytes,
      emptyChunks: inputBytes,
      pulls,
      allocations,
      allocatedBytes,
      largestAllocation,
    });
    expect(bytes.length).toBe(inputBytes);
    expect(bytes.every((value, index) => value === index % 251)).toBe(true);
    expect(pulls).toBe(inputBytes * 2);
    expect(allocations).toBeLessThanOrEqual(16);
    expect(largestAllocation).toBeLessThanOrEqual(inputBytes);
    expect(allocatedBytes).toBeLessThanOrEqual(inputBytes * 3);
    expect(stream.locked).toBe(false);
  });

  it('stops a productive empty stream on a real 20 ms deadline', async () => {
    const empty = new Uint8Array(0);
    let pulls = 0;
    let cancelled = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          // A bounded 100000-chunk fuse also makes this safe on the old reader.
          if (++pulls > 100000) controller.close();
          else controller.enqueue(empty);
        },
        cancel() {
          cancelled += 1;
        },
      },
      { highWaterMark: 0 },
    );
    const request = streamRequest(stream);
    const started = performance.now();
    const result = await Promise.allSettled([
      materializeRequestBodyBytes(request, { maxBodyBytes: 1024, timeoutMs: 20 }),
    ]);
    const elapsedMs = performance.now() - started;
    console.info('bounded-resource deadline', {
      chunkBytes: 0,
      byteCap: 1024,
      timeoutMs: 20,
      pulls,
      elapsedMs,
      cancelled,
      outcome: result[0]?.status,
    });
    expect(result[0]).toMatchObject({
      status: 'rejected',
      reason: { code: 'SIGNER_PREPARATION_FAILED', message: expect.stringContaining('20 ms') },
    });
    expect(pulls).toBeLessThan(100000);
    expect(cancelled).toBe(1);
    expect(stream.locked).toBe(false);
  });
});
