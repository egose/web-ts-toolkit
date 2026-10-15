import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestVaultJson } from '../src/vault-http';

const encode = (text: string) => new TextEncoder().encode(text);
const drain = () => new Promise<void>((resolve) => setImmediate(resolve));
const controllers: AbortController[] = [];
const releases: Array<() => void> = [];
const outcomes: Promise<unknown>[] = [];
const deferred = <T>(fallback: T) => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  releases.push(() => resolve(fallback));
  return { promise, resolve, reject };
};
const observe = <T>(promise: Promise<T>) => {
  const state: { result?: { value: T } | { error: unknown } } = {};
  outcomes.push(
    promise.then(
      (value) => {
        state.result = { value };
      },
      (error: unknown) => {
        state.result = { error };
      },
    ),
  );
  return state;
};
const fixture = (response: Response | Promise<Response>, maxResponseBytes = 1024) => {
  const controller = new AbortController();
  controllers.push(controller);
  const request = vi.fn<typeof fetch>(async () => response);
  const run = () =>
    requestVaultJson(
      request,
      'https://vault.example.com/refresh',
      { method: 'POST' },
      {
        signal: controller.signal,
        requestTimeoutMs: 100,
        maxResponseBytes,
      },
    );
  return { controller, request, run };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});
afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.abort();
  for (const release of releases.splice(0)) release();
  await vi.runAllTimersAsync();
  await Promise.all(outcomes.splice(0));
  await drain(); // Vitest reports any unhandled late fetch/read/cancel rejection.
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('DPH-03 vault HTTP deadlines', () => {
  it('settles a fetch that never resolves, aborts its signal and removes the timer/listener', async () => {
    const f = fixture(new Promise<Response>(() => {}));
    const added = vi.spyOn(f.controller.signal, 'addEventListener');
    const removed = vi.spyOn(f.controller.signal, 'removeEventListener');
    const running = observe(f.run());
    await vi.advanceTimersByTimeAsync(99);
    expect(running.result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(running.result).toMatchObject({
      error: {
        code: 'DPOP_REQUEST_TIMEOUT',
        message: 'The vault request timed out.',
        requiresLogin: false,
      },
    });
    expect(f.request).toHaveBeenCalledOnce();
    expect(f.request.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(removed).toHaveBeenCalledWith('abort', added.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps one deadline across delayed headers and a stalled body', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }));
    const headers = deferred(response);
    const f = fixture(headers.promise);
    const running = observe(f.run());
    await vi.advanceTimersByTimeAsync(80);
    headers.resolve(response);
    await drain();
    await vi.advanceTimersByTimeAsync(19);
    expect(running.result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(running.result).toMatchObject({ error: { code: 'DPOP_REQUEST_TIMEOUT' } });
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not reset the deadline when a response trickles bytes', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          stream = controller;
        },
        cancel,
      }),
    );
    const f = fixture(response);
    const running = observe(f.run());
    for (let chunk = 0; chunk < 4; chunk++) {
      await vi.advanceTimersByTimeAsync(24);
      stream.enqueue(encode(' '));
    }
    await vi.advanceTimersByTimeAsync(3);
    expect(running.result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(running.result).toMatchObject({ error: { code: 'DPOP_REQUEST_TIMEOUT' } });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(['valid', 'malformed'] as const)(
    'includes synchronous %s JSON parsing even before the timer can dispatch',
    async (kind) => {
      const text = kind === 'valid' ? '{"parsed":"vault"}' : '{"parsed":';
      const f = fixture(new Response(text));
      let elapsed = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
      const parse = JSON.parse;
      vi.spyOn(JSON, 'parse').mockImplementation((input: string) => {
        if (input === text) elapsed = 101; // Models CPU time without yielding to timers.
        return parse(input) as unknown;
      });
      await expect(f.run()).rejects.toMatchObject({ code: 'DPOP_REQUEST_TIMEOUT', requiresLogin: false });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('observes a late fetch rejection after its deadline', async () => {
    const headers = deferred(new Response('{}'));
    const f = fixture(headers.promise);
    const running = observe(f.run());
    await vi.advanceTimersByTimeAsync(100);
    expect(running.result).toMatchObject({ error: { code: 'DPOP_REQUEST_TIMEOUT' } });
    headers.reject(new Error('late transport rejection'));
    await drain();
    expect(running.result).toMatchObject({ error: { code: 'DPOP_REQUEST_TIMEOUT' } });
  });

  it('honors an already-invalid authority before fetch or timers', async () => {
    const f = fixture(new Response('{}'));
    f.controller.abort(new Error('superseded'));
    await expect(f.run()).rejects.toBe(f.controller.signal.reason);
    expect(f.request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('DPH-03 actual streamed byte limits', () => {
  it.each([undefined, '0', '1', '8', '9999999', 'invalid'])(
    'accepts exactly the byte budget with Content-Length %s',
    async (length) => {
      const bytes = encode('"é🙂"'); // Eight bytes; five JavaScript UTF-16 code units.
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
            controller.close();
          },
        }),
        { headers: length === undefined ? {} : { 'Content-Length': length } },
      );
      const f = fixture(response, 8);
      const json = vi.spyOn(response, 'json');
      await expect(f.run()).resolves.toEqual({ status: 200, nonce: null, value: 'é🙂' });
      expect(json).not.toHaveBeenCalled();
      expect(response.body?.locked).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([undefined, '0', '1', '8', '9999999', 'invalid'])(
    'rejects actual overflow with Content-Length %s',
    async (length) => {
      const cancel = vi.fn();
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encode('"é'));
            controller.enqueue(encode('🙂"'));
            // Leave it open: the client must stop at the bound, not wait for EOF.
          },
          cancel,
        }),
        { headers: length === undefined ? {} : { 'Content-Length': length } },
      );
      const f = fixture(response, 7);
      await expect(f.run()).rejects.toMatchObject({
        code: 'DPOP_RESPONSE_TOO_LARGE',
        message: 'The vault response exceeded the size limit.',
        requiresLogin: false,
      });
      expect(cancel).toHaveBeenCalledOnce();
      expect(f.request.mock.calls[0][1]?.signal?.aborted).toBe(true);
      expect(response.body?.locked).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('stops on one oversized chunk without waiting for rejecting cleanup or leaking its payload', async () => {
    const cancel = vi.fn(async () => {
      throw new Error('private cleanup information');
    });
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encode('{"private":"credential","padding":"xxxxxxxx"}'));
        },
        cancel,
      }),
    );
    const f = fixture(response, 4);
    await expect(f.run()).rejects.toMatchObject({
      code: 'DPOP_RESPONSE_TOO_LARGE',
      message: 'The vault response exceeded the size limit.',
      requiresLogin: false,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe('DPH-03 body and cleanup outcomes', () => {
  it.each(['malformed', 'empty', 'read-error'] as const)(
    'preserves the undefined-value contract for %s bodies',
    async (kind) => {
      const response =
        kind === 'read-error'
          ? new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.error(new Error('private read error'));
                },
              }),
              { status: 400 },
            )
          : new Response(kind === 'empty' ? null : '{"private":', { status: 400 });
      const f = fixture(response);
      await expect(f.run()).resolves.toEqual({ status: 400, nonce: null, value: undefined });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('treats non-byte injected chunks as an unreadable body and cleans up without exposing their contents', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue('private non-byte chunk');
        },
        cancel,
      }),
    );
    const f = fixture(response);
    await expect(f.run()).resolves.toEqual({ status: 200, nonce: null, value: undefined });
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['throws', 'rejects', 'stalls'] as const)(
    'bounds a custom read ignoring abort when cancel %s and releaseLock throws',
    async (behavior) => {
      const response = new Response('{}');
      const pending = deferred<ReadableStreamReadResult<Uint8Array>>({ done: true, value: undefined });
      const cancellation = deferred<void>(undefined);
      const read = vi.fn(() => pending.promise);
      const cancel = vi.fn(() => {
        if (behavior === 'throws') throw new Error('cancel threw');
        if (behavior === 'rejects') return Promise.reject(new Error('cancel rejected'));
        return cancellation.promise;
      });
      const releaseLock = vi.fn(() => {
        throw new Error('release threw');
      });
      vi.spyOn(response.body!, 'getReader').mockReturnValue({
        read,
        cancel,
        releaseLock,
      } as unknown as ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>);
      const f = fixture(response);
      const running = observe(f.run());
      await drain();
      expect(read).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(100);
      expect(running.result).toMatchObject({ error: { code: 'DPOP_REQUEST_TIMEOUT' } });
      expect(cancel).toHaveBeenCalledOnce();
      expect(releaseLock).toHaveBeenCalledOnce();
      pending.reject(new Error('late read rejection'));
      if (behavior === 'stalls') cancellation.reject(new Error('late cancellation rejection'));
      await drain();
      expect(read).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not let releaseLock failure replace successfully parsed JSON; detaches the authority listener', async () => {
    const response = new Response('{}');
    const reader = response.body!.getReader();
    vi.spyOn(response.body!, 'getReader').mockReturnValue(reader);
    const releaseLock = reader.releaseLock.bind(reader);
    vi.spyOn(reader, 'releaseLock').mockImplementation(() => {
      releaseLock();
      throw new Error('custom release failed');
    });
    const f = fixture(response);
    await expect(f.run()).resolves.toEqual({ status: 200, nonce: null, value: {} });
    f.controller.abort();
    expect(f.request.mock.calls[0][1]?.signal?.aborted).toBe(false);
    expect(response.body?.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
