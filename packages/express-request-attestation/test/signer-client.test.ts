/**
 * ATT-06 signer-client Node unit lane.
 *
 * Exercises `fetchSignerBundle` (single bounded discovery + native-loader
 * import, no retirement refetch) and `createSignerClient` (generation-aware
 * single-flight loading, one retirement refetch, timeout/abort discard,
 * invalidate/dispose semantics) with injected fetch/loadModule mocks — never
 * real network, storage, DOM, or global fetch patching.
 *
 * Real Chromium execution against the built `dist/signer.mjs` lives in
 * `test/signer.browser.ts`; this file runs in Node with Node WebCrypto
 * available but uses fixture signer objects (no crypto needed) for the
 * loading contract.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';

import {
  AttestationProtocolError,
  DEFAULT_SIGNER_LOAD_TIMEOUT_MS,
  SIGNER_METADATA_BYTE_CAP,
  SignerClientError,
  createSignerClient,
  fetchSignerBundle,
  isSignerClientError,
} from '../src/signer.js';
import type { RequestSigner } from '../src/signer.js';
import { runDiscoveryResponseTests } from './discovery-response.cases.js';
import { runDiscoveryFetchReceiverTests } from './fetch-receiver.cases.js';

runDiscoveryResponseTests({ SignerClientError, createSignerClient, fetchSignerBundle });
runDiscoveryFetchReceiverTests({ createSignerClient, fetchSignerBundle });

const API_ORIGIN = 'https://attestation.example.com';
const NAMESPACE = 'att-fixture';
const METADATA_URL = 'https://attestation.example.com/attestation/signer-meta';
const KEY_ID = 'fixture-key-01';
const SIGNER_URL = 'https://attestation.example.com/attestation/signer.abc123.mjs';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeSigner(keyId: string = KEY_ID): RequestSigner {
  return {
    version: 1,
    keyId,
    publicOrigin: API_ORIGIN,
    replayNamespace: NAMESPACE,
    sign: async () => 'transaction-id',
  };
}

function makeMetadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    keyId: KEY_ID,
    signerUrl: SIGNER_URL,
    publicOrigin: API_ORIGIN,
    replayNamespace: NAMESPACE,
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, { status });
}

function mockFetch(responses: Response[] | ((url: string, init?: RequestInit) => Promise<Response>)): {
  fetchImpl: typeof fetch;
  calls: { url: string; init?: RequestInit }[];
} {
  const calls: { url: string; init?: RequestInit }[] = [];
  const queue = Array.isArray(responses) ? [...responses] : null;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (queue !== null) {
      const next = queue.shift();
      if (next === undefined) {
        throw new Error('mock fetch queue exhausted');
      }
      return next;
    }
    return (responses as (url: string, init?: RequestInit) => Promise<Response>)(url, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('signer-client constants and error taxonomy', () => {
  it('exposes bounded metadata cap and default load timeout', () => {
    expect(SIGNER_METADATA_BYTE_CAP).toBe(4096);
    expect(DEFAULT_SIGNER_LOAD_TIMEOUT_MS).toBe(5000);
  });

  it('SignerClientError carries typed codes and isSignerClientError guards', () => {
    const error = new SignerClientError('SIGNER_LOAD_TIMEOUT', 'timed out');
    expect(error.name).toBe('SignerClientError');
    expect(error.code).toBe('SIGNER_LOAD_TIMEOUT');
    expect(isSignerClientError(error)).toBe(true);
    expect(isSignerClientError(new Error('nope'))).toBe(false);
    expect(isSignerClientError(new AttestationProtocolError('bad'))).toBe(false);
  });

  it('rejects unknown options without allocating a load', async () => {
    // fetchSignerBundle is async: validation failures reject, not throw sync.
    await expect(
      fetchSignerBundle({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        unknownOption: 1,
      } as never),
    ).rejects.toThrow(AttestationProtocolError);
    expect(() =>
      createSignerClient({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        loadTimeoutMs: 5000,
        unknownOption: 1,
      } as never),
    ).toThrow(AttestationProtocolError);
    await expect(fetchSignerBundle(null as never)).rejects.toThrow(AttestationProtocolError);
    expect(() => createSignerClient([] as never)).toThrow(AttestationProtocolError);
  });

  it('validates origins, namespaces, metadata URLs, loaders, and timeouts', async () => {
    const { fetchImpl } = mockFetch([jsonResponse(makeMetadata())]);
    const loader = async (): Promise<{ signer: RequestSigner }> => ({ signer: makeSigner() });
    // Bad API origin (non-loopback http).
    expect(() =>
      createSignerClient({
        metadataUrl: 'http://evil.example.com/attestation/signer-meta',
        apiOrigin: 'http://evil.example.com',
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule: loader,
      }),
    ).toThrow(AttestationProtocolError);
    // Bad namespace.
    expect(() =>
      createSignerClient({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: 'bad ns!',
        fetch: fetchImpl,
        loadModule: loader,
      }),
    ).toThrow(AttestationProtocolError);
    // Relative metadata URL.
    expect(() =>
      createSignerClient({
        metadataUrl: '/attestation/signer-meta',
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule: loader,
      }),
    ).toThrow(AttestationProtocolError);
    // Metadata origin differs from API origin.
    expect(() =>
      createSignerClient({
        metadataUrl: 'https://other.example.com/attestation/signer-meta',
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule: loader,
      }),
    ).toThrow(SignerClientError);
    // Metadata URL with userinfo.
    expect(() =>
      createSignerClient({
        metadataUrl: 'https://user:pass@attestation.example.com/attestation/signer-meta', // pragma: allowlist secret
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule: loader,
      }),
    ).toThrow(SignerClientError);
    // Bad timeout bounds.
    for (const loadTimeoutMs of [0, -1, 1.5, 60001, Number.NaN, '5000' as never]) {
      expect(() =>
        createSignerClient({
          metadataUrl: METADATA_URL,
          apiOrigin: API_ORIGIN,
          replayNamespace: NAMESPACE,
          fetch: fetchImpl,
          loadModule: loader,
          loadTimeoutMs: loadTimeoutMs as number,
        }),
      ).toThrow(AttestationProtocolError);
    }
    // Non-function fetch/loader/signal.
    expect(() =>
      createSignerClient({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: 'fetch' as never,
        loadModule: loader,
      }),
    ).toThrow(AttestationProtocolError);
    expect(() =>
      createSignerClient({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule: 'loader' as never,
      }),
    ).toThrow(AttestationProtocolError);
    // fetchSignerBundle is async: bad signal rejects.
    await expect(
      fetchSignerBundle({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule: loader,
        signal: 'signal' as never,
      }),
    ).rejects.toThrow(AttestationProtocolError);
  });
});

describe('fetchSignerBundle discovery fetch contract', () => {
  it('sends noncached, credential-omitting, redirect-rejecting discovery defaults', async () => {
    const { fetchImpl, calls } = mockFetch([jsonResponse(makeMetadata())]);
    const seenUrls: string[] = [];
    const bundle = await fetchSignerBundle({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule: async (moduleUrl: string) => {
        seenUrls.push(moduleUrl);
        return { signer: makeSigner() };
      },
    });
    expect(bundle.signer.keyId).toBe(KEY_ID);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(METADATA_URL);
    const init = calls[0]?.init as RequestInit & {
      cache?: string;
      credentials?: string;
      redirect?: string;
    };
    expect(init.cache).toBe('no-store');
    expect(init.credentials).toBe('omit');
    expect(init.redirect).toBe('error');
    expect(seenUrls).toEqual([SIGNER_URL]);
  });

  it('resolves relative signerUrl against the metadata location', async () => {
    const { fetchImpl } = mockFetch([jsonResponse(makeMetadata({ signerUrl: 'signer.deadbeef.mjs' }))]);
    const seen: string[] = [];
    await fetchSignerBundle({
      metadataUrl: 'https://attestation.example.com/attestation/signer-meta',
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule: async (moduleUrl: string) => {
        seen.push(moduleUrl);
        return { signer: makeSigner() };
      },
    });
    expect(seen).toEqual(['https://attestation.example.com/attestation/signer.deadbeef.mjs']);
  });

  it('rejects oversized metadata without importing a module', async () => {
    const big = `{"version":1,"keyId":"${KEY_ID}","padding":"${'a'.repeat(5000)}"}`;
    expect(new TextEncoder().encode(big).length).toBeGreaterThan(SIGNER_METADATA_BYTE_CAP);
    let loaderCalls = 0;
    const { fetchImpl } = mockFetch([textResponse(big)]);
    await expect(
      fetchSignerBundle({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule: async () => {
          loaderCalls += 1;
          return { signer: makeSigner() };
        },
      }),
    ).rejects.toThrow(SignerClientError);
    await expect(
      fetchSignerBundle({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: mockFetch([textResponse(big)]).fetchImpl,
        loadModule: async () => {
          loaderCalls += 1;
          return { signer: makeSigner() };
        },
      }),
    ).rejects.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
    expect(loaderCalls).toBe(0);
  });

  it('rejects non-JSON, non-object, failed, and thrown metadata fetches', async () => {
    const loader = async (): Promise<{ signer: RequestSigner }> => ({ signer: makeSigner() });
    const base = {
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      loadModule: loader,
    } as const;
    await expect(
      fetchSignerBundle({ ...base, fetch: mockFetch([textResponse('not json{')]).fetchImpl }),
    ).rejects.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
    await expect(
      fetchSignerBundle({ ...base, fetch: mockFetch([jsonResponse([1, 2, 3])]).fetchImpl }),
    ).rejects.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
    await expect(
      fetchSignerBundle({ ...base, fetch: mockFetch([jsonResponse(makeMetadata(), 500)]).fetchImpl }),
    ).rejects.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
    await expect(
      fetchSignerBundle({
        ...base,
        fetch: (async () => {
          throw new TypeError('network down');
        }) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
  });

  it('rejects metadata with wrong version, key, origin, or namespace', async () => {
    const loader = async (): Promise<{ signer: RequestSigner }> => ({ signer: makeSigner() });
    const cases: { meta: Record<string, unknown>; code: string }[] = [
      { meta: makeMetadata({ version: 2 }), code: 'SIGNER_MODULE_INVALID' },
      { meta: makeMetadata({ keyId: 'bad id!' }), code: 'SIGNER_MODULE_INVALID' },
      { meta: makeMetadata({ publicOrigin: 'https://other.example.com' }), code: 'SIGNER_ORIGIN_MISMATCH' },
      { meta: makeMetadata({ replayNamespace: 'other-ns' }), code: 'SIGNER_ORIGIN_MISMATCH' },
      { meta: makeMetadata({ signerUrl: '' }), code: 'SIGNER_ORIGIN_MISMATCH' },
    ];
    for (const { meta, code } of cases) {
      await expect(
        fetchSignerBundle({
          metadataUrl: METADATA_URL,
          apiOrigin: API_ORIGIN,
          replayNamespace: NAMESPACE,
          fetch: mockFetch([jsonResponse(meta)]).fetchImpl,
          loadModule: loader,
        }),
      ).rejects.toMatchObject({ code });
    }
  });

  it('rejects unexpected module origins, non-module paths, fragments, and userinfo', async () => {
    const badUrls = [
      'https://other.example.com/attestation/signer.x.mjs',
      'https://attestation.example.com/attestation/signer.js',
      'https://attestation.example.com/attestation/signer.x.mjs#frag',
      'https://user@attestation.example.com/attestation/signer.x.mjs',
      'http://evil.example.com/attestation/signer.x.mjs',
    ];
    for (const signerUrl of badUrls) {
      let loaderCalls = 0;
      await expect(
        fetchSignerBundle({
          metadataUrl: METADATA_URL,
          apiOrigin: API_ORIGIN,
          replayNamespace: NAMESPACE,
          fetch: mockFetch([jsonResponse(makeMetadata({ signerUrl }))]).fetchImpl,
          loadModule: async () => {
            loaderCalls += 1;
            return { signer: makeSigner() };
          },
        }),
      ).rejects.toMatchObject({ code: 'SIGNER_ORIGIN_MISMATCH' });
      expect(loaderCalls).toBe(0);
    }
  });

  it('rejects JS source strings, signSource extras, and malformed signers', async () => {
    const candidates: unknown[] = [
      'export const signer = 1;',
      null,
      {},
      { signSource: 'export const signer = 1;' },
      { signer: null },
      { signer: { ...makeSigner(), version: 2 } },
      { signer: { ...makeSigner(), keyId: 'other-key-01' } },
      { signer: { ...makeSigner(), publicOrigin: 'https://other.example.com' } },
      { signer: { ...makeSigner(), replayNamespace: 'other-ns' } },
      { signer: { ...makeSigner(), sign: 'not-a-function' } },
      { signer: { ...makeSigner(), keyId: 'bad id!' } },
    ];
    for (const candidate of candidates) {
      await expect(
        fetchSignerBundle({
          metadataUrl: METADATA_URL,
          apiOrigin: API_ORIGIN,
          replayNamespace: NAMESPACE,
          fetch: mockFetch([jsonResponse(makeMetadata())]).fetchImpl,
          loadModule: (async () => candidate) as never,
        }),
      ).rejects.toMatchObject({ code: 'SIGNER_MODULE_INVALID' });
    }
  });

  it('does not refetch discovery on module failure (single attempt)', async () => {
    const { fetchImpl, calls } = mockFetch([jsonResponse(makeMetadata())]);
    await expect(
      fetchSignerBundle({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule: async () => {
          throw new Error('import failed');
        },
      }),
    ).rejects.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
    expect(calls).toHaveLength(1);
  });

  it('stops waiting on an aborted signal without importing', async () => {
    const controller = new AbortController();
    controller.abort();
    let loaderCalls = 0;
    const { fetchImpl, calls } = mockFetch([jsonResponse(makeMetadata())]);
    await expect(
      fetchSignerBundle({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule: async () => {
          loaderCalls += 1;
          return { signer: makeSigner() };
        },
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
    expect(calls).toHaveLength(0);
    expect(loaderCalls).toBe(0);
  });

  it('performs no import-time network work', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const fresh = (await import('../src/signer.js')) as Record<string, unknown>;
      expect(typeof fresh['fetchSignerBundle']).toBe('function');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect((globalThis as Record<string, unknown>)['localStorage']).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('incremental metadata stream limits', () => {
  function loadResponse(response: Response, signal?: AbortSignal) {
    const loadModule = vi.fn(async () => ({ signer: makeSigner() }));
    const promise = fetchSignerBundle({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: mockFetch([response]).fetchImpl,
      loadModule,
      ...(signal === undefined ? {} : { signal }),
    });
    let outcome: PromiseSettledResult<unknown> | undefined;
    const settled = promise.then(
      (value) => {
        outcome = { status: 'fulfilled', value };
      },
      (reason: unknown) => {
        outcome = { status: 'rejected', reason };
      },
    );
    return { settled, outcome: () => outcome, loadModule };
  }

  it.each(['settles', 'rejects', 'never settles'] as const)(
    'rejects 4097 bytes before EOF when metadata cancellation %s',
    async (cancellation) => {
      vi.useFakeTimers();
      let sink!: ReadableStreamDefaultController<Uint8Array>;
      let pulls = 0;
      const cancel = vi.fn(() => {
        if (cancellation === 'rejects') return Promise.reject(new Error('metadata cancel rejected'));
        if (cancellation === 'never settles') return new Promise<void>(() => undefined);
      });
      const stream = new ReadableStream<Uint8Array>(
        {
          start(controller) {
            sink = controller;
          },
          pull(controller) {
            if (++pulls === 1) controller.enqueue(new Uint8Array(SIGNER_METADATA_BYTE_CAP));
            else if (pulls === 2) controller.enqueue(new Uint8Array(1));
            // No EOF: a whole-response accumulator cannot reach its cap check.
          },
          cancel,
        },
        { highWaterMark: 0 },
      );
      const result = loadResponse(new Response(stream));
      try {
        await vi.advanceTimersByTimeAsync(0);
        expect(result.outcome()).toMatchObject({
          status: 'rejected',
          reason: {
            name: 'SignerClientError',
            code: 'SIGNER_LOAD_FAILED',
            message: expect.stringContaining('4096-byte cap'),
          },
        });
        expect(pulls).toBe(2);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(stream.locked).toBe(false);
        expect(result.loadModule).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        sink.error(new Error('finite pre-fix test cleanup'));
        await result.settled;
      }
    },
  );

  it('accepts exact-cap UTF-8 split across tiny chunks with interleaved empty chunks', async () => {
    const text = JSON.stringify(makeMetadata({ note: 'café 🌍' }));
    const encoded = new TextEncoder().encode(text);
    const bytes = new TextEncoder().encode(text + ' '.repeat(SIGNER_METADATA_BYTE_CAP - encoded.length));
    let position = 0;
    let empty = true;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (position === bytes.length) controller.close();
          else if (empty) controller.enqueue(new Uint8Array(0));
          else controller.enqueue(bytes.subarray(position, ++position));
          empty = !empty;
        },
      },
      { highWaterMark: 0 },
    );
    const result = loadResponse(new Response(stream));
    await result.settled;
    expect(result.outcome()).toMatchObject({ status: 'fulfilled', value: { signer: { keyId: KEY_ID } } });
    expect(result.loadModule).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it('rejects invalid UTF-8 without importing and releases its reader', async () => {
    const response = new Response(new Uint8Array([0xc3, 0x28]));
    const result = loadResponse(response);
    await result.settled;
    expect(result.outcome()).toMatchObject({
      status: 'rejected',
      reason: { code: 'SIGNER_LOAD_FAILED', message: expect.stringContaining('valid UTF-8') },
    });
    expect(response.body?.locked).toBe(false);
    expect(result.loadModule).not.toHaveBeenCalled();
  });

  it.each(['arrayBuffer', 'text'] as const)(
    'rejects %s-only substitutes without unbounded buffering',
    async (method) => {
      const raw = JSON.stringify(makeMetadata());
      const read = vi.fn(async () => (method === 'text' ? raw : new TextEncoder().encode(raw).buffer));
      const result = loadResponse({ ok: true, [method]: read } as unknown as Response);
      await result.settled;
      expect(result.outcome()).toMatchObject({ status: 'rejected', reason: { code: 'SIGNER_LOAD_FAILED' } });
      expect(read).not.toHaveBeenCalled();
      expect(result.loadModule).not.toHaveBeenCalled();
    },
  );

  it('bounds standalone body consumption at 5000 ms without waiting for cancellation', async () => {
    vi.useFakeTimers();
    let sink!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        sink = controller;
      },
      cancel,
    });
    const result = loadResponse(new Response(stream));
    try {
      await vi.advanceTimersByTimeAsync(4999);
      expect(result.outcome()).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(result.outcome()).toMatchObject({
        status: 'rejected',
        reason: { name: 'SignerClientError', code: 'SIGNER_LOAD_FAILED', message: expect.stringContaining('5000 ms') },
      });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(stream.locked).toBe(false);
      expect(result.loadModule).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      sink.error(new Error('finite pre-fix test cleanup'));
      await result.settled;
    }
  });

  it('propagates mid-body abort to an injected native response and absorbs cancellation rejection', async () => {
    vi.useFakeTimers();
    let sink!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn(() => Promise.reject(new Error('metadata cancel rejected')));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        sink = controller;
      },
      cancel,
    });
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const result = loadResponse(new Response(stream), controller.signal);
    try {
      await vi.advanceTimersByTimeAsync(0);
      controller.abort(new Error('caller stopped discovery'));
      await vi.advanceTimersByTimeAsync(0);
      expect(result.outcome()).toMatchObject({
        status: 'rejected',
        reason: { code: 'SIGNER_LOAD_FAILED', message: expect.stringContaining('discovery was aborted') },
      });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1]);
      expect(stream.locked).toBe(false);
      expect(result.loadModule).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      sink.error(new Error('finite pre-fix test cleanup'));
      await result.settled;
    }
  });

  it('scopes the standalone deadline to body reading, excluding headers and module evaluation', async () => {
    vi.useFakeTimers();
    const headers = deferred<Response>();
    const module = deferred<{ signer: RequestSigner }>();
    const loadModule = vi.fn(() => module.promise);
    const pending = fetchSignerBundle({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: mockFetch(async () => headers.promise).fetchImpl,
      loadModule,
    });
    const result = Promise.allSettled([pending]);
    try {
      await vi.advanceTimersByTimeAsync(6000);
      expect(loadModule).not.toHaveBeenCalled();
      headers.resolve(jsonResponse(makeMetadata()));
      await vi.advanceTimersByTimeAsync(0);
      expect(loadModule).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(6000);
      module.resolve({ signer: makeSigner() });
      expect(await result).toMatchObject([{ status: 'fulfilled' }]);
    } finally {
      headers.resolve(jsonResponse(makeMetadata()));
      module.resolve({ signer: makeSigner() });
      await result;
    }
  });

  it('retains a configured client load bound above 5000 ms without adding a per-body cap', async () => {
    vi.useFakeTimers();
    let sink!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        sink = controller;
      },
    });
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: mockFetch([new Response(stream)]).fetchImpl,
      loadModule: async () => ({ signer: makeSigner() }),
      loadTimeoutMs: 10000,
    });
    const result = Promise.allSettled([client.getSigner()]);
    try {
      await vi.advanceTimersByTimeAsync(6000);
      sink.enqueue(new TextEncoder().encode(JSON.stringify(makeMetadata())));
      sink.close();
      expect(await result).toMatchObject([{ status: 'fulfilled' }]);
      expect(stream.locked).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      client.dispose();
    }
  });

  it('does not let productive empty metadata starve the whole-load deadline', async () => {
    vi.useFakeTimers();
    const empty = new Uint8Array(0);
    let pulls = 0;
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (++pulls > 50000) controller.close();
          else controller.enqueue(empty);
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    const loadModule = vi.fn(async () => ({ signer: makeSigner() }));
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: mockFetch([new Response(stream)]).fetchImpl,
      loadModule,
      loadTimeoutMs: 20,
    });
    const result = Promise.allSettled([client.getSigner()]);
    try {
      await vi.advanceTimersByTimeAsync(20);
      expect(await result).toMatchObject([{ status: 'rejected', reason: { code: 'SIGNER_LOAD_TIMEOUT' } }]);
      expect(pulls).toBeLessThan(50000);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(stream.locked).toBe(false);
      expect(loadModule).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      client.dispose();
    }
  });
});

describe('createSignerClient single-flight, generations, and disposal', () => {
  it('shares one metadata/module load across concurrent getSigner callers', async () => {
    const { fetchImpl, calls } = mockFetch([jsonResponse(makeMetadata())]);
    let loaderCalls = 0;
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule: async (url: string) => {
        loaderCalls += 1;
        expect(url).toBe(SIGNER_URL);
        return { signer: makeSigner() };
      },
    });
    const [first, second, third] = await Promise.all([client.getSigner(), client.getSigner(), client.getSigner()]);
    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(calls).toHaveLength(1);
    expect(loaderCalls).toBe(1);
    // Cached active signer: no second load.
    const fourth = await client.getSigner();
    expect(fourth).toBe(first);
    expect(calls).toHaveLength(1);
    client.dispose();
  });

  it('clears a rejected load so a later explicit call can recover', async () => {
    const failingFetch = mockFetch([jsonResponse(makeMetadata(), 500), jsonResponse(makeMetadata())]);
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: failingFetch.fetchImpl,
      loadModule: async () => ({ signer: makeSigner() }),
    });
    await expect(client.getSigner()).rejects.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
    const signer = await client.getSigner();
    expect(signer.keyId).toBe(KEY_ID);
    expect(failingFetch.calls).toHaveLength(2);
    client.dispose();
  });

  it('invalidate with the active key forces a reload; a late old key never evicts a newer signer', async () => {
    const firstMeta = makeMetadata({ keyId: 'key-old-01', signerUrl: `${API_ORIGIN}/attestation/signer.old.mjs` });
    const secondMeta = makeMetadata({ keyId: 'key-new-01', signerUrl: `${API_ORIGIN}/attestation/signer.new.mjs` });
    const metas = [jsonResponse(firstMeta), jsonResponse(secondMeta)];
    const { fetchImpl, calls } = mockFetch(metas);
    const byUrl: Record<string, RequestSigner> = {};
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule: async (url: string) => {
        if (url.endsWith('signer.old.mjs')) {
          const signer = makeSigner('key-old-01');
          byUrl['old'] = signer;
          return { signer };
        }
        const signer = makeSigner('key-new-01');
        byUrl['new'] = signer;
        return { signer };
      },
    });
    const first = await client.getSigner();
    expect(first.keyId).toBe('key-old-01');
    expect(calls).toHaveLength(1);
    // A late rejection naming a key we never held must not evict the active signer.
    client.invalidate('key-ancient-99');
    const stillFirst = await client.getSigner();
    expect(stillFirst).toBe(first);
    expect(calls).toHaveLength(1);
    // Observing the active key evicts it; the next load picks up the new key.
    client.invalidate('key-old-01');
    const second = await client.getSigner();
    expect(second.keyId).toBe('key-new-01');
    expect(second).not.toBe(first);
    expect(calls).toHaveLength(2);
    // A late stale rejection for the retired key must not evict the newer signer.
    client.invalidate('key-old-01');
    const stillSecond = await client.getSigner();
    expect(stillSecond).toBe(second);
    expect(calls).toHaveLength(2);
    client.dispose();
  });

  it('discards an old in-flight load after invalidate (late result never installs)', async () => {
    // First fetch hangs behind a gate; later fetches serve fresh metadata.
    let fetchCalls = 0;
    const gate = deferred<Response>();
    const fetchImpl = (async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return gate.promise;
      }
      return jsonResponse(makeMetadata({ keyId: 'key-new-01', signerUrl: `${API_ORIGIN}/attestation/signer.new.mjs` }));
    }) as unknown as typeof fetch;
    let loaderCalls = 0;
    const loadedUrls: string[] = [];
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadTimeoutMs: 5000,
      loadModule: async (url: string) => {
        loaderCalls += 1;
        loadedUrls.push(url);
        if (url.includes('signer.old.mjs')) {
          return { signer: makeSigner('key-old-01') };
        }
        return { signer: makeSigner('key-new-01') };
      },
    });
    const pending = client.getSigner();
    const guarded = pending.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    expect(fetchCalls).toBe(1);
    // Invalidate while the metadata fetch is still in flight: bump generation.
    client.invalidate('anything');
    // Let the old fetch settle late with a valid document. The old load still
    // runs its import attempt, but the generation check discards the result.
    gate.resolve(
      jsonResponse(makeMetadata({ keyId: 'key-old-01', signerUrl: `${API_ORIGIN}/attestation/signer.old.mjs` })),
    );
    await expect(guarded).resolves.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
    expect(loaderCalls).toBe(1);
    // The late old-generation result did not install: the next call reloads
    // with fresh metadata and installs the new signer.
    const next = await client.getSigner();
    expect(next.keyId).toBe('key-new-01');
    expect(fetchCalls).toBe(2);
    expect(loaderCalls).toBe(2);
    expect(loadedUrls[1]).toContain('signer.new.mjs');
    client.dispose();
  });

  it.each(['metadata', 'module'] as const)(
    'shares one replacement through repeated stale challenges during %s loading',
    async (phase) => {
      const oldSigner = makeSigner();
      const newSigner = makeSigner('key-new-01');
      const metadataGate = deferred<void>();
      const moduleGate = deferred<{ signer: RequestSigner }>();
      const moduleStarted = deferred<void>();
      let discoveries = 0;
      const { fetchImpl, calls } = mockFetch(async () => {
        if (++discoveries === 1) {
          return jsonResponse(makeMetadata());
        }
        await metadataGate.promise;
        return jsonResponse(makeMetadata({ keyId: newSigner.keyId, signerUrl: 'signer.new.mjs' }));
      });
      const loadModule = vi.fn(async (url: string) => {
        if (url === SIGNER_URL) {
          return { signer: oldSigner };
        }
        moduleStarted.resolve(undefined);
        return moduleGate.promise;
      });
      const client = createSignerClient({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule,
      });
      try {
        expect(await client.getSigner()).toBe(oldSigner);
        client.invalidate(oldSigner.keyId);
        client.invalidate(oldSigner.keyId);
        const replacement = client.getSigner();
        const replacementResult = Promise.allSettled([replacement]);
        if (phase === 'module') {
          metadataGate.resolve(undefined);
          await moduleStarted.promise;
        }
        const peers = Array.from({ length: 8 }, () => {
          client.invalidate(oldSigner.keyId);
          return client.getSigner();
        });
        const peerResults = Promise.allSettled(peers);
        metadataGate.resolve(undefined);
        moduleGate.resolve({ signer: newSigner });
        const results = [...(await replacementResult), ...(await peerResults)];
        expect(results).toEqual(Array.from({ length: 9 }, () => ({ status: 'fulfilled', value: newSigner })));
        expect(peers.every((peer) => peer === replacement)).toBe(true);
        expect(calls).toHaveLength(2);
        expect(loadModule).toHaveBeenCalledTimes(2);
        client.invalidate(oldSigner.keyId);
        expect(await client.getSigner()).toBe(newSigner);
        expect(calls).toHaveLength(2);
      } finally {
        metadataGate.resolve(undefined);
        moduleGate.resolve({ signer: newSigner });
        client.dispose();
      }
    },
  );

  it.each(['metadata', 'module', 'recovery'] as const)(
    'shares the third-generation %s load with a late challenge from the first key',
    async (phase) => {
      const firstSigner = makeSigner('key-first-01');
      const secondSigner = makeSigner('key-second-01');
      const thirdSigner = makeSigner('key-third-01');
      const metadataGate = deferred<void>();
      const moduleGate = deferred<{ signer: RequestSigner }>();
      const moduleStarted = deferred<void>();
      let discoveries = 0;
      const { fetchImpl, calls } = mockFetch(async () => {
        discoveries += 1;
        const signer = discoveries === 1 ? firstSigner : discoveries === 2 ? secondSigner : thirdSigner;
        const metadata = makeMetadata({ keyId: signer.keyId, signerUrl: `signer.${signer.keyId}.mjs` });
        if (discoveries === 3 && phase === 'recovery') {
          return jsonResponse(metadata, 503);
        }
        if (discoveries >= 3) {
          await metadataGate.promise;
        }
        return jsonResponse(metadata);
      });
      const loadModule = vi.fn(async (url: string) => {
        if (url.endsWith(`signer.${firstSigner.keyId}.mjs`)) {
          return { signer: firstSigner };
        }
        if (url.endsWith(`signer.${secondSigner.keyId}.mjs`)) {
          return { signer: secondSigner };
        }
        moduleStarted.resolve(undefined);
        return moduleGate.promise;
      });
      const client = createSignerClient({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule,
      });
      try {
        expect(await client.getSigner()).toBe(firstSigner);
        client.invalidate(firstSigner.keyId);
        expect(await client.getSigner()).toBe(secondSigner);
        client.invalidate(secondSigner.keyId);
        if (phase === 'recovery') {
          await expect(client.getSigner()).rejects.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
        }
        const replacement = client.getSigner();
        const replacementResult = Promise.allSettled([replacement]);
        if (phase !== 'metadata') {
          metadataGate.resolve(undefined);
          await moduleStarted.promise;
        }
        client.invalidate(firstSigner.keyId);
        const peer = client.getSigner();
        const peerResult = Promise.allSettled([peer]);
        metadataGate.resolve(undefined);
        moduleGate.resolve({ signer: thirdSigner });
        const results = [...(await replacementResult), ...(await peerResult)];
        expect.soft(calls).toHaveLength(phase === 'recovery' ? 4 : 3);
        expect.soft(loadModule).toHaveBeenCalledTimes(3);
        expect.soft(results).toEqual([
          { status: 'fulfilled', value: thirdSigner },
          { status: 'fulfilled', value: thirdSigner },
        ]);
        expect(peer).toBe(replacement);
        expect(await client.getSigner()).toBe(thirdSigner);
      } finally {
        metadataGate.resolve(undefined);
        moduleGate.resolve({ signer: thirdSigner });
        client.dispose();
      }
    },
  );

  it('can invalidate an installed same-key signer again after an earlier replacement', async () => {
    // Native import caching may return the same signer object for this URL.
    const signer = makeSigner();
    const { fetchImpl, calls } = mockFetch(async () => jsonResponse(makeMetadata()));
    const loadModule = vi.fn(async () => ({ signer }));
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule,
    });
    try {
      expect(await client.getSigner()).toBe(signer);
      for (let loads = 2; loads <= 3; loads += 1) {
        client.invalidate(signer.keyId);
        expect(await client.getSigner()).toBe(signer);
        expect(calls).toHaveLength(loads);
        expect(loadModule).toHaveBeenCalledTimes(loads);
      }
    } finally {
      client.dispose();
    }
  });

  it('shares a fresh recovery load despite repeated stale challenges after replacement failure', async () => {
    const newSigner = makeSigner('key-new-01');
    const recoveryGate = deferred<void>();
    let discoveries = 0;
    const { fetchImpl, calls } = mockFetch(async () => {
      discoveries += 1;
      if (discoveries <= 2) {
        return jsonResponse(makeMetadata(), discoveries === 1 ? 200 : 503);
      }
      await recoveryGate.promise;
      return jsonResponse(makeMetadata({ keyId: newSigner.keyId, signerUrl: 'signer.new.mjs' }));
    });
    const loadModule = vi.fn(async (url: string) => ({ signer: url === SIGNER_URL ? makeSigner() : newSigner }));
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule,
    });
    try {
      await client.getSigner();
      client.invalidate(KEY_ID);
      const failed = await Promise.allSettled([client.getSigner(), client.getSigner()]);
      expect(failed).toEqual(
        Array.from({ length: 2 }, () => ({
          status: 'rejected',
          reason: expect.objectContaining({ code: 'SIGNER_LOAD_FAILED' }),
        })),
      );
      const recovery = client.getSigner();
      const recoveryResult = Promise.allSettled([recovery]);
      client.invalidate(KEY_ID);
      const peer = client.getSigner();
      const peerResult = Promise.allSettled([peer]);
      recoveryGate.resolve(undefined);
      expect([...(await recoveryResult), ...(await peerResult)]).toEqual([
        { status: 'fulfilled', value: newSigner },
        { status: 'fulfilled', value: newSigner },
      ]);
      expect(peer).toBe(recovery);
      expect(calls).toHaveLength(3);
      expect(loadModule).toHaveBeenCalledTimes(2);
    } finally {
      recoveryGate.resolve(undefined);
      client.dispose();
    }
  });

  it('keeps disposal ownership of current metadata after an obsolete load rejects', async () => {
    const obsoleteMetadata = deferred<Response>();
    const currentMetadata = deferred<Response>();
    let discoveries = 0;
    const { fetchImpl, calls } = mockFetch(async (_url, init) => {
      if (++discoveries === 1) {
        return obsoleteMetadata.promise;
      }
      init?.signal?.addEventListener(
        'abort',
        () => currentMetadata.reject(new DOMException('metadata aborted', 'AbortError')),
        { once: true },
      );
      return currentMetadata.promise;
    });
    const loadModule = vi.fn(async () => ({ signer: makeSigner() }));
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule,
    });
    try {
      const obsoleteResult = Promise.allSettled([client.getSigner()]);
      client.invalidate(KEY_ID);
      const currentResult = Promise.allSettled([client.getSigner()]);
      obsoleteMetadata.reject(new Error('old discovery failed'));
      await expect(obsoleteResult).resolves.toEqual([
        { status: 'rejected', reason: expect.objectContaining({ code: 'SIGNER_LOAD_FAILED' }) },
      ]);
      const currentSignal = calls[1]?.init?.signal;
      expect(currentSignal?.aborted).toBe(false);
      client.dispose();
      const wasAborted = currentSignal?.aborted;
      // Also settle a fetch implementation that ignores abort, so a failed
      // cancellation assertion cannot leave a test waiter or timer behind.
      currentMetadata.resolve(jsonResponse(makeMetadata()));
      await expect(currentResult).resolves.toEqual([
        { status: 'rejected', reason: expect.objectContaining({ code: 'SIGNER_LOAD_FAILED' }) },
      ]);
      expect(wasAborted).toBe(true);
      expect(loadModule).not.toHaveBeenCalled();
      expect(calls).toHaveLength(2);
    } finally {
      obsoleteMetadata.reject(new Error('test cleanup'));
      currentMetadata.resolve(jsonResponse(makeMetadata()));
      client.dispose();
    }
  });

  it.each(['resolve', 'reject'] as const)(
    'keeps a replacement after an obsolete timeout and discards a late native-loader %s',
    async (settlement) => {
      vi.useFakeTimers();
      const obsoleteModule = deferred<{ signer: RequestSigner }>();
      const moduleStarted = deferred<void>();
      const replacementMetadata = deferred<void>();
      const newSigner = makeSigner('key-new-01');
      let discoveries = 0;
      const { fetchImpl, calls } = mockFetch(async () => {
        if (++discoveries === 1) {
          return jsonResponse(makeMetadata());
        }
        await replacementMetadata.promise;
        return jsonResponse(makeMetadata({ keyId: newSigner.keyId, signerUrl: 'signer.new.mjs' }));
      });
      const loadModule = vi.fn(async (url: string) => {
        if (url === SIGNER_URL) {
          moduleStarted.resolve(undefined);
          return obsoleteModule.promise;
        }
        return { signer: newSigner };
      });
      const client = createSignerClient({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule,
        loadTimeoutMs: 50,
      });
      try {
        const obsoleteResult = Promise.allSettled([client.getSigner()]);
        await moduleStarted.promise;
        await vi.advanceTimersByTimeAsync(10);
        client.invalidate(KEY_ID);
        const replacement = client.getSigner();
        const replacementResult = Promise.allSettled([replacement]);
        // The old deadline fires at 50ms; the replacement's is still 10ms away.
        await vi.advanceTimersByTimeAsync(40);
        await expect(obsoleteResult).resolves.toEqual([
          { status: 'rejected', reason: expect.objectContaining({ code: 'SIGNER_LOAD_TIMEOUT' }) },
        ]);
        const peer = client.getSigner();
        const peerResult = Promise.allSettled([peer]);
        if (settlement === 'resolve') {
          obsoleteModule.resolve({ signer: makeSigner() });
        } else {
          obsoleteModule.reject(new Error('late module failure'));
        }
        await vi.advanceTimersByTimeAsync(0);
        replacementMetadata.resolve(undefined);
        expect([...(await replacementResult), ...(await peerResult)]).toEqual([
          { status: 'fulfilled', value: newSigner },
          { status: 'fulfilled', value: newSigner },
        ]);
        expect(peer).toBe(replacement);
        expect(await client.getSigner()).toBe(newSigner);
        expect(calls).toHaveLength(2);
        expect(loadModule).toHaveBeenCalledTimes(2);
        expect(calls[0]?.init?.signal?.aborted).toBe(true);
        expect(calls[1]?.init?.signal?.aborted).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        obsoleteModule.resolve({ signer: makeSigner() });
        replacementMetadata.resolve(undefined);
        client.dispose();
      }
    },
  );

  it('dispose is terminal and discards late settlements', async () => {
    const gate = deferred<Response>();
    const { fetchImpl } = mockFetch(async () => gate.promise);
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule: async () => ({ signer: makeSigner() }),
    });
    const pending = client.getSigner();
    // Attach an early rejection handler so disposal-time discard never leaks
    // as an unhandled rejection under Node's strict mode.
    const guarded = pending.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    client.dispose();
    gate.resolve(jsonResponse(makeMetadata()));
    await expect(guarded).resolves.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
    // After disposal getSigner throws synchronously (terminal client).
    expect(() => client.getSigner()).toThrow(SignerClientError);
    expect(() => client.getSigner()).toThrow(expect.objectContaining({ code: 'SIGNER_LOAD_FAILED' }));
    // invalidate after dispose is a no-op (must not throw).
    expect(() => client.invalidate(KEY_ID)).not.toThrow();
    expect(() => client.dispose()).not.toThrow();
  });

  it('times out a stalled load and lets a later call recover; late results are discarded', async () => {
    const stalled = new Promise<Response>(() => undefined);
    let attempt = 0;
    const fetchImpl = (async () => {
      attempt += 1;
      if (attempt === 1) {
        return stalled;
      }
      return jsonResponse(makeMetadata());
    }) as unknown as typeof fetch;
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule: async () => ({ signer: makeSigner() }),
      loadTimeoutMs: 20,
    });
    await expect(client.getSigner()).rejects.toMatchObject({ code: 'SIGNER_LOAD_TIMEOUT' });
    const signer = await client.getSigner();
    expect(signer.keyId).toBe(KEY_ID);
    expect(attempt).toBe(2);
    client.dispose();
  });

  it('performs the one allowed metadata-to-module retirement refetch', async () => {
    const staleMeta = makeMetadata({ keyId: 'key-stale-01', signerUrl: `${API_ORIGIN}/attestation/signer.stale.mjs` });
    const freshMeta = makeMetadata({ keyId: 'key-fresh-01', signerUrl: `${API_ORIGIN}/attestation/signer.fresh.mjs` });
    const { fetchImpl, calls } = mockFetch([jsonResponse(staleMeta), jsonResponse(freshMeta)]);
    const loads: string[] = [];
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule: async (url: string) => {
        loads.push(url);
        if (url.endsWith('signer.stale.mjs')) {
          throw new Error('stale module gone');
        }
        return { signer: makeSigner('key-fresh-01') };
      },
    });
    const signer = await client.getSigner();
    expect(signer.keyId).toBe('key-fresh-01');
    expect(calls).toHaveLength(2);
    expect(loads).toHaveLength(2);
    client.dispose();
  });

  it.each(['import', 'validation'] as const)(
    'recovers from module %s failure when the refetch changes the URL but keeps the key',
    async (failure) => {
      const signer = makeSigner();
      const { fetchImpl, calls } = mockFetch([
        jsonResponse(makeMetadata()),
        jsonResponse(makeMetadata({ signerUrl: 'signer.new-runtime.mjs' })),
      ]);
      const loadModule = vi.fn(async (url: string) => {
        if (url === SIGNER_URL) {
          if (failure === 'import') {
            throw new Error('old deployment module gone');
          }
          return { signer: makeSigner('wrong-key') };
        }
        return { signer };
      });
      const client = createSignerClient({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule,
      });
      try {
        const results = await Promise.all([client.getSigner(), client.getSigner(), client.getSigner()]);
        expect(results).toEqual([signer, signer, signer]);
        expect(await client.getSigner()).toBe(signer);
        expect(calls).toHaveLength(2);
        expect(loadModule.mock.calls).toEqual([[SIGNER_URL], [`${API_ORIGIN}/attestation/signer.new-runtime.mjs`]]);
      } finally {
        client.dispose();
      }
    },
  );

  it.each([SIGNER_URL, './signer.abc123.mjs'])(
    'stops after one refetch with unchanged validated identity (%s)',
    async (signerUrl) => {
      const { fetchImpl, calls } = mockFetch([jsonResponse(makeMetadata()), jsonResponse(makeMetadata({ signerUrl }))]);
      const originalError = new SignerClientError('SIGNER_LOAD_FAILED', 'module gone');
      const loadModule = vi.fn(async () => {
        throw originalError;
      });
      const client = createSignerClient({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule,
      });
      try {
        await expect(client.getSigner()).rejects.toBe(originalError);
        expect(calls).toHaveLength(2);
        expect(loadModule).toHaveBeenCalledTimes(1);
      } finally {
        client.dispose();
      }
    },
  );

  it.each([KEY_ID, 'key-new-01'])(
    'stops on the second module failure, then permits explicit recovery (refetched key %s)',
    async (keyId) => {
      const freshMetadata = makeMetadata({ keyId, signerUrl: 'signer.new.mjs' });
      const { fetchImpl, calls } = mockFetch([
        jsonResponse(makeMetadata()),
        jsonResponse(freshMetadata),
        jsonResponse(freshMetadata),
      ]);
      const signer = makeSigner(keyId);
      let imports = 0;
      const loadModule = vi.fn(async (url: string) => {
        if (++imports <= 2) {
          throw new Error(`module unavailable: ${url}`);
        }
        return { signer };
      });
      const client = createSignerClient({
        metadataUrl: METADATA_URL,
        apiOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
        loadModule,
      });
      try {
        await expect(client.getSigner()).rejects.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
        expect(calls).toHaveLength(2);
        expect(loadModule.mock.calls).toEqual([[SIGNER_URL], [`${API_ORIGIN}/attestation/signer.new.mjs`]]);
        expect(await client.getSigner()).toBe(signer);
        expect(calls).toHaveLength(3);
        expect(loadModule).toHaveBeenCalledTimes(3);
      } finally {
        client.dispose();
      }
    },
  );

  it('validates the refetched same-key module URL before considering another import', async () => {
    const { fetchImpl, calls } = mockFetch([
      jsonResponse(makeMetadata()),
      jsonResponse(makeMetadata({ signerUrl: 'https://other.example.com/signer.new.mjs' })),
    ]);
    const loadModule = vi.fn(async () => {
      throw new Error('module gone');
    });
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule,
    });
    try {
      await expect(client.getSigner()).rejects.toMatchObject({ code: 'SIGNER_ORIGIN_MISMATCH' });
      expect(calls).toHaveLength(2);
      expect(loadModule).toHaveBeenCalledTimes(1);
    } finally {
      client.dispose();
    }
  });

  it('does not refetch metadata-phase failures', async () => {
    const big = `{"version":1,"padding":"${'b'.repeat(5000)}"}`;
    const { fetchImpl, calls } = mockFetch([textResponse(big)]);
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule: async () => ({ signer: makeSigner() }),
    });
    try {
      await expect(client.getSigner()).rejects.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
      expect(calls).toHaveLength(1);
    } finally {
      client.dispose();
    }
  });

  it('writes no storage, touches no DOM, and patches no global fetch', async () => {
    const globalFetchBefore = globalThis.fetch;
    const { fetchImpl } = mockFetch([jsonResponse(makeMetadata())]);
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule: async () => ({ signer: makeSigner() }),
    });
    const signer = await client.getSigner();
    expect(signer.keyId).toBe(KEY_ID);
    expect(globalThis.fetch).toBe(globalFetchBefore);
    expect((globalThis as Record<string, unknown>)['localStorage']).toBeUndefined();
    expect(typeof (globalThis as Record<string, unknown>)['document']).toBe('undefined');
    client.dispose();
  });
});
