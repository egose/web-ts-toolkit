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

const API_ORIGIN = 'https://attestation.example.com';
const NAMESPACE = 'att-fixture';
const METADATA_URL = 'https://attestation.example.com/attestation/signer-meta';
const KEY_ID = 'fixture-key-01';
const SIGNER_URL = 'https://attestation.example.com/attestation/signer.abc123.mjs';

afterEach(() => {
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

  it('stops after one refetch when the key is unchanged or the second load also fails', async () => {
    // Same key on refetch: original import error surfaces, no third fetch.
    const staleMeta = makeMetadata({ keyId: 'key-same-01', signerUrl: `${API_ORIGIN}/attestation/signer.same.mjs` });
    const sameMeta = makeMetadata({ keyId: 'key-same-01', signerUrl: `${API_ORIGIN}/attestation/signer.same.mjs` });
    const first = mockFetch([jsonResponse(staleMeta), jsonResponse(sameMeta)]);
    const clientSame = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: first.fetchImpl,
      loadModule: async () => {
        throw new Error('module gone');
      },
    });
    await expect(clientSame.getSigner()).rejects.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
    expect(first.calls).toHaveLength(2);
    clientSame.dispose();

    // Metadata-phase failure never refetches: oversized discovery fails once.
    const big = `{"version":1,"padding":"${'b'.repeat(5000)}"}`;
    const second = mockFetch([textResponse(big)]);
    const clientMetaFail = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: second.fetchImpl,
      loadModule: async () => ({ signer: makeSigner() }),
    });
    await expect(clientMetaFail.getSigner()).rejects.toMatchObject({ code: 'SIGNER_LOAD_FAILED' });
    expect(second.calls).toHaveLength(1);
    clientMetaFail.dispose();
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
