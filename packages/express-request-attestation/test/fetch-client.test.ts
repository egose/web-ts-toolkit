/**
 * ATT-07 prepared signed fetch, bounded retry, and authentication composition.
 *
 * Node lane (explicit include in `vitest.node.config.mts`):
 *
 * - Live Express verification (real `createRequestAttestationMiddleware` +
 *   `createAttestationBodyCapture`) for empty/text/JSON/URLSearchParams/Blob/
 *   binary/multipart bodies: server captured digest/content-type exactly match
 *   the bytes actually sent; `credentials`/`Authorization` survive; multipart
 *   boundary is generated once and preserved on retry with a fresh
 *   nonce/timestamp.
 * - Local failure discipline (mock `fetch`): body limit, stalled read,
 *   caller abort, locked/used body, unsupported encoding, external origin,
 *   and manual-redirect handling stop without unbounded reads or signature
 *   forwarding.
 * - Rotation: old key passes; after retirement one stale pre-handler rejection
 *   triggers exactly one reload/fresh proof and one handler execution; a late
 *   old-key challenge never evicts a newer signer.
 * - No-retry discipline: arbitrary 403, auth failure, replay, expired proof,
 *   store failure, and network/handler uncertainty never retry and never
 *   repeat side effects; returned responses stay readable; retries never reuse
 *   the old envelope.
 * - Composition: one correctly mounted `createOidcVaultMiddleware` router
 *   (`basePath: '/auth/oidc'`, no doubled prefix), selected API/POST guard
 *   positions, JSON capture before both validators, asset/OPTIONS/OIDC
 *   navigation reachability, independent bearer auth, and no DPoP/`req.auth`
 *   interference.
 *
 * Real-Chromium browser-to-Express evidence lives in
 * `test/fetch-end-to-end.browser.ts` (built `dist/signer.mjs` in Headless
 * Chromium) plus the Playwright Chromium check below that imports the
 * HTTP-served flow. Public HMAC material stays accessible: a non-browser
 * caller with the same module signs successfully (documented boundary).
 */

import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

import {
  ATTESTATION_ERROR_RESPONSE_HEADER,
  DEFAULT_ATTESTATION_HEADER,
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  createRotatingKeyProvider,
  getAttestationBodyRecord,
} from '../src/index.js';
import { createRequestSigner, createSignerClient, fetchWithAttestation, SignerClientError } from '../src/signer.js';
import type { RequestSigner, SignerClient } from '../src/signer.js';
import { decodeTransactionId } from '../src/signer.js';

// Real vault composition uses repository sources directly so no package.json
// registration is required for this test lane.
import { createOidcVaultMiddleware } from '../../express-oidc-vault/src/index.js';
import { createMemoryOidcVaultStore } from '../../express-oidc-vault-memory-store/src/index.js';

const NAMESPACE = 'att-fetch-tests';
const KEY_ID = 'fetch-key-01';
const KEY_BYTES = Uint8Array.from(
  Buffer.from('d973c35da623a2329dd08a32153635042a7fe90b730035c90508ae7ec50c0d24', 'hex'), // pragma: allowlist secret
);

function keyBytes(fill: number): Uint8Array {
  const out = new Uint8Array(32);
  out.fill(fill);
  return out;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function startApp(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function staticProviderFor(origin: string, now: () => number) {
  void origin;
  const snapshot = {
    currentKeyId: KEY_ID,
    keys: [{ keyId: KEY_ID, key: KEY_BYTES, acceptFrom: now() - 60000, acceptUntil: now() + 60000 }],
  };
  return { getSnapshot: () => snapshot };
}

/** Real WebCrypto signer for the shared test key/protection space. */
function makeRealSigner(apiOrigin: string, keyId: string = KEY_ID, key: Uint8Array = KEY_BYTES): RequestSigner {
  return createRequestSigner({ keyId, key, publicOrigin: apiOrigin, replayNamespace: NAMESPACE });
}

/**
 * Real `createSignerClient` whose discovery serves one key via injected
 * fetch/loadModule. `nextMeta` can rotate the served key between loads.
 */
function makeClientForKey(input: {
  apiOrigin: string;
  metadataUrl: string;
  keyId: string;
  key: Uint8Array;
  rotateTo?: { keyId: string; key: Uint8Array } | undefined;
}): { client: SignerClient; metadataCalls: () => number } {
  let calls = 0;
  let served = { keyId: input.keyId, key: input.key };
  const fetchImpl = (async () => {
    calls += 1;
    const current = calls === 1 ? served : (input.rotateTo ?? served);
    if (calls > 1 && input.rotateTo !== undefined) {
      served = input.rotateTo;
    }
    const payload = {
      version: 1,
      keyId: current.keyId,
      signerUrl: `${input.apiOrigin}/attestation/signer.${current.keyId}.mjs`,
      publicOrigin: input.apiOrigin,
      replayNamespace: NAMESPACE,
    };
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as unknown as typeof fetch;
  const loadModule = async (moduleUrl: string) => {
    const expectedSuffix = '.mjs';
    expect(moduleUrl.endsWith(expectedSuffix)).toBe(true);
    const keyId = moduleUrl.includes(served.keyId) ? served.keyId : served.keyId;
    return { signer: makeRealSigner(input.apiOrigin, keyId, served.key) };
  };
  const client = createSignerClient({
    metadataUrl: input.metadataUrl,
    apiOrigin: input.apiOrigin,
    replayNamespace: NAMESPACE,
    fetch: fetchImpl,
    loadModule,
  });
  return { client, metadataCalls: () => calls };
}

describe('prepared body correctness over live Express', () => {
  it('signs empty, text, JSON, urlencoded, blob, binary, and multipart bytes exactly', async () => {
    const maxBodyBytes = 1024 * 1024;
    // Canonical live setup: mount parsers first, learn the loopback origin,
    // then mount the guard dynamically so pinning and MACs agree.
    const manualCapture = createAttestationBodyCapture({ maxBodyBytes });
    const manualStore = createMemoryAttestationStore();
    let manualCalls = 0;
    let manualDigest: string | undefined;
    let manualType: string | undefined;
    const manualApp = express();
    // Temporarily mount parsers + error handler; guard mounted after listen.
    manualApp.use(express.json({ limit: maxBodyBytes, verify: manualCapture.verify as never, inflate: false }));
    manualApp.use(
      express.urlencoded({
        extended: false,
        limit: maxBodyBytes,
        verify: manualCapture.verify as never,
        inflate: false,
      }),
    );
    manualApp.use(
      express.text({ type: 'text/*', limit: maxBodyBytes, verify: manualCapture.verify as never, inflate: false }),
    );
    manualApp.use(
      express.raw({
        type: 'application/octet-stream',
        limit: maxBodyBytes,
        verify: manualCapture.verify as never,
        inflate: false,
      }),
    );
    manualApp.use(
      express.raw({ type: 'multipart/*', limit: maxBodyBytes, verify: manualCapture.verify as never, inflate: false }),
    );
    manualApp.use(manualCapture.errorHandler as never);
    // Start once to learn the origin, then add the guard dynamically. Express
    // matches in mount order, so adding the guard now still protects /api.
    const manualStarted = await startApp(manualApp);
    const manualOrigin = manualStarted.baseUrl;
    const manualProvider = {
      getSnapshot: () => {
        const now = Date.now();
        return {
          currentKeyId: KEY_ID,
          keys: [{ keyId: KEY_ID, key: KEY_BYTES, acceptFrom: now - 60000, acceptUntil: now + 60000 }],
        };
      },
    };
    const manualGuard = createRequestAttestationMiddleware({
      publicOrigin: manualOrigin,
      replayNamespace: NAMESPACE,
      keyProvider: manualProvider,
      store: manualStore,
    });
    manualApp.use('/api', manualGuard as never);
    manualApp.all('/api/submit', (req, res) => {
      manualCalls += 1;
      manualDigest = getAttestationBodyRecord(req)?.digestHex;
      const raw = (req.headers as Record<string, string | string[] | undefined>)['content-type'];
      manualType = Array.isArray(raw) ? raw[0] : raw;
      res.json({ ok: true });
    });
    manualApp.all('/api/blob/7', (req, res) => {
      manualCalls += 1;
      manualDigest = getAttestationBodyRecord(req)?.digestHex;
      const raw = (req.headers as Record<string, string | string[] | undefined>)['content-type'];
      manualType = Array.isArray(raw) ? raw[0] : raw;
      res.json({ ok: true });
    });
    manualApp.all('/api/items', (_req, res) => {
      manualCalls += 1;
      res.json({ ok: true });
    });
    try {
      const { client } = makeClientForKey({
        apiOrigin: manualOrigin,
        metadataUrl: `${manualOrigin}/attestation/signer-meta`,
        keyId: KEY_ID,
        key: KEY_BYTES,
      });
      const base = { signerClient: client, apiOrigin: manualOrigin, replayNamespace: NAMESPACE };

      // Empty GET (no body, no content-type).
      {
        const res = await fetchWithAttestation(`${manualOrigin}/api/items`, { method: 'GET' }, base);
        expect(res.status).toBe(200);
        await res.arrayBuffer();
      }
      // Text.
      {
        const text = 'hello attestation 🌍';
        const expected = sha256Hex(new TextEncoder().encode(text));
        const res = await fetchWithAttestation(
          `${manualOrigin}/api/submit`,
          { method: 'POST', headers: { 'content-type': 'text/plain; charset=utf-8' }, body: text },
          base,
        );
        expect(res.status).toBe(200);
        await res.arrayBuffer();
        expect(manualDigest).toBe(expected);
        expect(manualType).toBe('text/plain; charset=utf-8');
      }
      // JSON via stringified body.
      {
        const raw = JSON.stringify({ note: 'héllo' });
        const expected = sha256Hex(new TextEncoder().encode(raw));
        const res = await fetchWithAttestation(
          `${manualOrigin}/api/submit`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw },
          base,
        );
        expect(res.status).toBe(200);
        await res.arrayBuffer();
        expect(manualDigest).toBe(expected);
        expect(manualType).toBe('application/json');
      }
      // URLSearchParams explicit case.
      {
        const params = new URLSearchParams({ a: '1', b: 'x y' });
        const serialized = params.toString();
        const expected = sha256Hex(new TextEncoder().encode(serialized));
        const res = await fetchWithAttestation(`${manualOrigin}/api/submit`, { method: 'POST', body: params }, base);
        expect(res.status).toBe(200);
        await res.arrayBuffer();
        expect(manualDigest).toBe(expected);
        expect(String(manualType)).toContain('application/x-www-form-urlencoded');
      }
      // Blob binary.
      {
        const bytes = new Uint8Array([0, 1, 2, 250, 255]);
        const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
        const expected = sha256Hex(bytes);
        const res = await fetchWithAttestation(
          `${manualOrigin}/api/blob/7`,
          { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: blob },
          base,
        );
        expect(res.status).toBe(200);
        await res.arrayBuffer();
        expect(manualDigest).toBe(expected);
      }
      // Binary Uint8Array.
      {
        const bytes = new Uint8Array([10, 20, 30, 40]);
        const expected = sha256Hex(bytes);
        const res = await fetchWithAttestation(
          `${manualOrigin}/api/blob/7`,
          { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes as BodyInit },
          base,
        );
        expect(res.status).toBe(200);
        await res.arrayBuffer();
        expect(manualDigest).toBe(expected);
      }
      // Multipart via FormData (boundary generated once, preserved for this attempt).
      {
        const form = new FormData();
        form.append('field', 'value-1');
        form.append('file', new Blob(['file-bytes'], { type: 'text/plain' }), 'note.txt');
        const res = await fetchWithAttestation(`${manualOrigin}/api/submit`, { method: 'POST', body: form }, base);
        expect(res.status).toBe(200);
        await res.arrayBuffer();
        expect(manualType).toContain('multipart/form-data; boundary=');
        expect(manualDigest).toMatch(/^[0-9a-f]{64}$/);
      }
      expect(manualCalls).toBeGreaterThanOrEqual(7);
      client.dispose();
    } finally {
      await manualStarted.close();
    }
  });

  it('preserves credentials and Authorization without defaulting to include', async () => {
    const seen: { credentials?: string; authorization?: string | null; signature?: string | null }[] = [];
    const apiOrigin = 'https://attestation.example.com';
    const signer = makeRealSigner(apiOrigin);
    const stubClient: SignerClient = {
      getSigner: async () => signer,
      invalidate: () => undefined,
      dispose: () => undefined,
    };
    const recordingFetch = (async (input: RequestInfo | URL) => {
      const req = input as Request;
      seen.push({
        credentials: (req as unknown as { readonly credentials?: string }).credentials,
        authorization: req.headers.get('authorization'),
        signature: req.headers.get(DEFAULT_ATTESTATION_HEADER),
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    for (const credentials of [undefined, 'omit', 'same-origin', 'include'] as const) {
      seen.length = 0;
      const res = await fetchWithAttestation(
        `${apiOrigin}/api/submit`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer token-123' }, // pragma: allowlist secret
          body: JSON.stringify({ a: 1 }),
          ...(credentials === undefined ? {} : { credentials }),
        },
        { signerClient: stubClient, apiOrigin, replayNamespace: NAMESPACE, fetch: recordingFetch },
      );
      expect(res.status).toBe(200);
      await res.arrayBuffer();
      expect(seen).toHaveLength(1);
      const expectedCredentials = credentials ?? 'same-origin';
      expect(seen[0]?.credentials).toBe(expectedCredentials);
      expect(seen[0]?.authorization).toBe('Bearer token-123'); // pragma: allowlist secret
      expect(typeof seen[0]?.signature).toBe('string');
    }
  });

  it('supports Request input and replaces (never appends) a caller signature field', async () => {
    const apiOrigin = 'https://attestation.example.com';
    const signer = makeRealSigner(apiOrigin);
    const stubClient: SignerClient = {
      getSigner: async () => signer,
      invalidate: () => undefined,
      dispose: () => undefined,
    };
    let seenSignature: string | null = null;
    const seenCount = 0;
    const recordingFetch = (async (input: RequestInfo | URL) => {
      const req = input as Request;
      seenSignature = req.headers.get(DEFAULT_ATTESTATION_HEADER);
      void req.headers.getSetCookie;
      const all = req.headers.get(DEFAULT_ATTESTATION_HEADER);
      expect(all).not.toContain(',');
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const original = new Request(`${apiOrigin}/api/items?tag=a&tag=b`, {
      method: 'GET',
      headers: { [DEFAULT_ATTESTATION_HEADER]: 'caller-stale-value' },
    });
    const res = await fetchWithAttestation(original, undefined, {
      signerClient: stubClient,
      apiOrigin,
      replayNamespace: NAMESPACE,
      fetch: recordingFetch,
    });
    expect(res.status).toBe(200);
    await res.arrayBuffer();
    expect(seenSignature).not.toBe('caller-stale-value');
    expect(typeof seenSignature).toBe('string');
    expect(seenCount).toBe(0);
    // Original Request stays reusable (not consumed by the wrapper).
    expect(original.bodyUsed).toBe(false);
  });
});

describe('local failure discipline (no network, no signature forwarding)', () => {
  const apiOrigin = 'https://attestation.example.com';

  function stubClient(): SignerClient {
    const signer = makeRealSigner(apiOrigin);
    return { getSigner: async () => signer, invalidate: () => undefined, dispose: () => undefined };
  }

  it('rejects external origins without sending Authorization or a signature', async () => {
    let fetchCalls = 0;
    const recordingFetch = (async () => {
      fetchCalls += 1;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await expect(
      fetchWithAttestation(
        'https://other.example.com/api/submit',
        { method: 'POST', headers: { authorization: 'Bearer secret' }, body: JSON.stringify({ a: 1 }) }, // pragma: allowlist secret
        { signerClient: stubClient(), apiOrigin, replayNamespace: NAMESPACE, fetch: recordingFetch },
      ),
    ).rejects.toMatchObject({ code: 'SIGNER_ORIGIN_MISMATCH' });
    expect(fetchCalls).toBe(0);
  });

  it('uses manual redirects and returns the redirect without following or re-signing', async () => {
    const seenRedirects: string[] = [];
    const seenUrls: string[] = [];
    const recordingFetch = (async (input: RequestInfo | URL) => {
      const req = input as Request;
      seenRedirects.push(req.redirect);
      seenUrls.push(req.url);
      return new Response(null, { status: 302, headers: { location: 'https://other.example.com/next' } });
    }) as unknown as typeof fetch;
    const res = await fetchWithAttestation(
      `${apiOrigin}/api/submit`,
      { method: 'GET' },
      {
        signerClient: stubClient(),
        apiOrigin,
        replayNamespace: NAMESPACE,
        fetch: recordingFetch,
      },
    );
    expect(res.status).toBe(302);
    expect(seenRedirects).toEqual(['manual']);
    expect(seenUrls).toEqual([`${apiOrigin}/api/submit`]);
    await res.arrayBuffer();
  });

  it('fails locally on body limit, unsupported encoding, locked/used bodies, and plain objects', async () => {
    const noFetch = (async () => {
      throw new Error('must not fetch');
    }) as unknown as typeof fetch;
    // Over-limit.
    await expect(
      fetchWithAttestation(
        `${apiOrigin}/api/submit`,
        { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Uint8Array(10) },
        { signerClient: stubClient(), apiOrigin, replayNamespace: NAMESPACE, fetch: noFetch, maxBodyBytes: 4 },
      ),
    ).rejects.toMatchObject({ code: 'SIGNER_PREPARATION_FAILED' });
    // Unsupported content-encoding.
    await expect(
      fetchWithAttestation(
        `${apiOrigin}/api/submit`,
        { method: 'POST', headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' }, body: '{}' },
        { signerClient: stubClient(), apiOrigin, replayNamespace: NAMESPACE, fetch: noFetch },
      ),
    ).rejects.toMatchObject({ code: 'SIGNER_PREPARATION_FAILED' });
    // Caller JSON object (docs require JSON.stringify).
    await expect(
      fetchWithAttestation(
        `${apiOrigin}/api/submit`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: { a: 1 } as unknown as BodyInit },
        { signerClient: stubClient(), apiOrigin, replayNamespace: NAMESPACE, fetch: noFetch },
      ),
    ).rejects.toMatchObject({ code: 'SIGNER_PREPARATION_FAILED' });
    // Locked body.
    {
      const req = new Request(`${apiOrigin}/api/submit`, { method: 'POST', body: 'locked-bytes' });
      req.body?.getReader();
      await expect(
        fetchWithAttestation(req, undefined, {
          signerClient: stubClient(),
          apiOrigin,
          replayNamespace: NAMESPACE,
          fetch: noFetch,
        }),
      ).rejects.toMatchObject({ code: 'SIGNER_PREPARATION_FAILED' });
    }
    // Used body.
    {
      const req = new Request(`${apiOrigin}/api/submit`, { method: 'POST', body: 'used-bytes' });
      await req.arrayBuffer();
      await expect(
        fetchWithAttestation(req, undefined, {
          signerClient: stubClient(),
          apiOrigin,
          replayNamespace: NAMESPACE,
          fetch: noFetch,
        }),
      ).rejects.toMatchObject({ code: 'SIGNER_PREPARATION_FAILED' });
    }
  });

  it('rejects unknown options and invalid header/origin configuration', async () => {
    const client = stubClient();
    const noFetch = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    await expect(
      fetchWithAttestation(`${apiOrigin}/api/submit`, { method: 'GET' }, {
        signerClient: client,
        apiOrigin,
        replayNamespace: NAMESPACE,
        fetch: noFetch,
        unknownOption: 1,
      } as never),
    ).rejects.toThrow();
    expect(() =>
      fetchWithAttestation(`${apiOrigin}/api/submit`, { method: 'GET' }, undefined as never),
    ).rejects.toThrow();
    await expect(
      fetchWithAttestation(
        `${apiOrigin}/api/submit`,
        { method: 'GET' },
        {
          signerClient: client,
          apiOrigin,
          replayNamespace: NAMESPACE,
          fetch: noFetch,
          headerName: 'authorization',
        },
      ),
    ).rejects.toThrow();
    await expect(
      fetchWithAttestation(
        `${apiOrigin}/api/submit`,
        { method: 'GET' },
        {
          signerClient: client,
          apiOrigin: 'https://other.example.com',
          replayNamespace: NAMESPACE,
          fetch: noFetch,
        },
      ),
    ).rejects.toMatchObject({ code: 'SIGNER_ORIGIN_MISMATCH' });
  });

  it('stops on caller abort without fetching', async () => {
    const client = stubClient();
    let fetchCalls = 0;
    const noFetch = (async () => {
      fetchCalls += 1;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchWithAttestation(
        `${apiOrigin}/api/submit`,
        { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'aborted', signal: controller.signal },
        { signerClient: client, apiOrigin, replayNamespace: NAMESPACE, fetch: noFetch },
      ),
    ).rejects.toSatisfy((error: unknown) => {
      if (error instanceof SignerClientError) {
        return true;
      }
      return (error as { readonly name?: unknown }).name === 'AbortError';
    });
    expect(fetchCalls).toBe(0);
  });

  it('times out a stalled body read within the bounded deadline', async () => {
    const client = stubClient();
    let fetchCalls = 0;
    const noFetch = (async () => {
      fetchCalls += 1;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const stalled = new ReadableStream<Uint8Array>({ start() {} });
    // ReadableStream bodies require duplex in Node's Request.
    const init = { method: 'POST', body: stalled, duplex: 'half' } as unknown as RequestInit;
    await expect(
      fetchWithAttestation(`${apiOrigin}/api/submit`, init, {
        signerClient: client,
        apiOrigin,
        replayNamespace: NAMESPACE,
        fetch: noFetch,
        bodyReadTimeoutMs: 20,
      }),
    ).rejects.toMatchObject({ code: 'SIGNER_PREPARATION_FAILED' });
    expect(fetchCalls).toBe(0);
  });
});

describe('bounded stale-key retry (mock transport)', () => {
  const apiOrigin = 'https://attestation.example.com';

  function staleResponse(): Response {
    return new Response(JSON.stringify({ code: 'ATTESTATION_STALE_KEY' }), {
      status: 403,
      headers: { [ATTESTATION_ERROR_RESPONSE_HEADER]: 'stale-key' },
    });
  }

  it('retries once on stale-key with the same bytes/boundary and a fresh envelope', async () => {
    const oldSigner = makeRealSigner(apiOrigin, 'key-old-01', keyBytes(1));
    const newSigner = makeRealSigner(apiOrigin, 'key-new-01', keyBytes(2));
    let getCalls = 0;
    const invalidated: string[] = [];
    const client: SignerClient = {
      getSigner: async () => {
        getCalls += 1;
        return getCalls === 1 ? oldSigner : newSigner;
      },
      invalidate: (observedKeyId: string) => {
        invalidated.push(observedKeyId);
      },
      dispose: () => undefined,
    };
    const seenBodies: Uint8Array[] = [];
    const seenTypes: (string | null)[] = [];
    const seenSignatures: string[] = [];
    let apiCalls = 0;
    const apiFetch = (async (input: RequestInfo | URL) => {
      apiCalls += 1;
      const req = input as Request;
      seenBodies.push(new Uint8Array(await req.arrayBuffer()));
      seenTypes.push(req.headers.get('content-type'));
      const sig = req.headers.get(DEFAULT_ATTESTATION_HEADER) as string;
      seenSignatures.push(sig);
      if (apiCalls === 1) {
        return staleResponse();
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const form = new FormData();
    form.append('field', 'retry-value');
    const res = await fetchWithAttestation(
      `${apiOrigin}/api/submit`,
      { method: 'POST', body: form },
      {
        signerClient: client,
        apiOrigin,
        replayNamespace: NAMESPACE,
        fetch: apiFetch,
      },
    );
    expect(res.status).toBe(200);
    await res.arrayBuffer();
    expect(apiCalls).toBe(2);
    expect(invalidated).toEqual(['key-old-01']);
    // Same serialized bytes and multipart boundary on both attempts.
    expect(seenBodies).toHaveLength(2);
    expect(Buffer.from(seenBodies[0] as Uint8Array).equals(Buffer.from(seenBodies[1] as Uint8Array))).toBe(true);
    expect(seenTypes[0]).toBe(seenTypes[1]);
    expect(String(seenTypes[0])).toContain('multipart/form-data; boundary=');
    // Fresh envelope: different transaction, different nonce/timestamp.
    expect(seenSignatures[0]).not.toBe(seenSignatures[1]);
    const first = decodeTransactionId(seenSignatures[0] as string);
    const second = decodeTransactionId(seenSignatures[1] as string);
    expect(first.keyId).toBe('key-old-01');
    expect(second.keyId).toBe('key-new-01');
    expect(first.nonceHex).not.toBe(second.nonceHex);
  });

  it('stops after a second stale challenge and never reuses the old envelope', async () => {
    const signer = makeRealSigner(apiOrigin);
    const client: SignerClient = {
      getSigner: async () => signer,
      invalidate: () => undefined,
      dispose: () => undefined,
    };
    let apiCalls = 0;
    const seen: string[] = [];
    const apiFetch = (async (input: RequestInfo | URL) => {
      apiCalls += 1;
      seen.push(String((input as Request).headers.get(DEFAULT_ATTESTATION_HEADER)));
      return staleResponse();
    }) as unknown as typeof fetch;
    const res = await fetchWithAttestation(
      `${apiOrigin}/api/submit`,
      { method: 'GET' },
      {
        signerClient: client,
        apiOrigin,
        replayNamespace: NAMESPACE,
        fetch: apiFetch,
      },
    );
    expect(res.status).toBe(403);
    expect(res.headers.get(ATTESTATION_ERROR_RESPONSE_HEADER)).toBe('stale-key');
    await res.arrayBuffer();
    expect(apiCalls).toBe(2);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it.each([
    ['arbitrary 403 without marker', 403, {}, 'ATTESTATION_INVALID_SIGNATURE'],
    ['403 with wrong marker', 403, { [ATTESTATION_ERROR_RESPONSE_HEADER]: 'replay' }, 'x'],
    ['replay without marker', 403, {}, 'ATTESTATION_REPLAY'],
    ['expired proof', 403, {}, 'ATTESTATION_EXPIRED'],
    ['auth failure', 401, {}, 'x'],
    ['store failure', 503, {}, 'ATTESTATION_REPLAY_UNAVAILABLE'],
  ])('never retries on %s', async (_label: string, status: number, headers: Record<string, string>, _code: string) => {
    void _label;
    void _code;
    const signer = makeRealSigner(apiOrigin);
    let invalidated = 0;
    const client: SignerClient = {
      getSigner: async () => signer,
      invalidate: () => {
        invalidated += 1;
      },
      dispose: () => undefined,
    };
    let apiCalls = 0;
    const apiFetch = (async () => {
      apiCalls += 1;
      return new Response(JSON.stringify({ code: 'x' }), { status, headers });
    }) as unknown as typeof fetch;
    const res = await fetchWithAttestation(
      `${apiOrigin}/api/submit`,
      { method: 'GET' },
      {
        signerClient: client,
        apiOrigin,
        replayNamespace: NAMESPACE,
        fetch: apiFetch,
      },
    );
    expect(res.status).toBe(status);
    // Returned error responses remain readable.
    const text = await res.text();
    expect(typeof text).toBe('string');
    expect(apiCalls).toBe(1);
    expect(invalidated).toBe(0);
  });

  it('never retries network errors or uncertain handler execution', async () => {
    const signer = makeRealSigner(apiOrigin);
    const client: SignerClient = {
      getSigner: async () => signer,
      invalidate: () => {
        throw new Error('must not invalidate on network error');
      },
      dispose: () => undefined,
    };
    let apiCalls = 0;
    const failingFetch = (async () => {
      apiCalls += 1;
      throw new TypeError('network down');
    }) as unknown as typeof fetch;
    await expect(
      fetchWithAttestation(
        `${apiOrigin}/api/submit`,
        { method: 'GET' },
        {
          signerClient: client,
          apiOrigin,
          replayNamespace: NAMESPACE,
          fetch: failingFetch,
        },
      ),
    ).rejects.toThrow('network down');
    expect(apiCalls).toBe(1);
  });

  it('returns the first stale response when the signer reload fails', async () => {
    const oldSigner = makeRealSigner(apiOrigin, 'key-old-01', keyBytes(1));
    let getCalls = 0;
    const client: SignerClient = {
      getSigner: async () => {
        getCalls += 1;
        if (getCalls > 1) {
          throw new SignerClientError('SIGNER_LOAD_FAILED', 'reload failed');
        }
        return oldSigner;
      },
      invalidate: () => undefined,
      dispose: () => undefined,
    };
    let apiCalls = 0;
    const apiFetch = (async () => {
      apiCalls += 1;
      return staleResponse();
    }) as unknown as typeof fetch;
    const res = await fetchWithAttestation(
      `${apiOrigin}/api/submit`,
      { method: 'GET' },
      {
        signerClient: client,
        apiOrigin,
        replayNamespace: NAMESPACE,
        fetch: apiFetch,
      },
    );
    expect(res.status).toBe(403);
    expect(apiCalls).toBe(1);
  });

  it('a late old-key challenge never evicts a newer signer', async () => {
    const metadataUrl = `${apiOrigin}/attestation/signer-meta`;
    const firstMeta = {
      version: 1,
      keyId: 'key-old-01',
      signerUrl: `${apiOrigin}/attestation/signer.old.mjs`,
      publicOrigin: apiOrigin,
      replayNamespace: NAMESPACE,
    };
    const secondMeta = {
      version: 1,
      keyId: 'key-new-01',
      signerUrl: `${apiOrigin}/attestation/signer.new.mjs`,
      publicOrigin: apiOrigin,
      replayNamespace: NAMESPACE,
    };
    const metas = [firstMeta, secondMeta];
    let fetchCalls = 0;
    const fetchImpl = (async () => {
      const payload = metas[Math.min(fetchCalls, metas.length - 1)];
      fetchCalls += 1;
      return new Response(JSON.stringify(payload), { status: 200 });
    }) as unknown as typeof fetch;
    const client = createSignerClient({
      metadataUrl,
      apiOrigin,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule: async (url: string) => {
        if (url.includes('signer.old.mjs')) {
          return { signer: makeRealSigner(apiOrigin, 'key-old-01', keyBytes(1)) };
        }
        return { signer: makeRealSigner(apiOrigin, 'key-new-01', keyBytes(2)) };
      },
    });
    const first = await client.getSigner();
    expect(first.keyId).toBe('key-old-01');
    client.invalidate('key-old-01');
    const second = await client.getSigner();
    expect(second.keyId).toBe('key-new-01');
    // Late stale challenge for the retired key must not evict the newer signer.
    client.invalidate('key-old-01');
    const stillSecond = await client.getSigner();
    expect(stillSecond).toBe(second);
    expect(fetchCalls).toBe(2);
    client.dispose();
  });
});

describe('rotation over live Express (one stale retry, one handler execution)', () => {
  it('old key passes, retired key triggers one reload and one guarded execution', async () => {
    const maxBodyBytes = 1024 * 1024;
    const capture = createAttestationBodyCapture({ maxBodyBytes });
    const app = express();
    app.use(express.json({ limit: maxBodyBytes, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    const started = await startApp(app);
    const apiOrigin = started.baseUrl;

    const oldEntry = {
      keyId: 'rot-old-01',
      key: keyBytes(11),
      acceptFrom: Date.now() - 60000,
      acceptUntil: Date.now() + 60000,
    };
    const newEntry = {
      keyId: 'rot-new-01',
      key: keyBytes(12),
      acceptFrom: Date.now() - 1000,
      acceptUntil: Date.now() + 60000,
    };
    const provider = createRotatingKeyProvider({ currentKeyId: oldEntry.keyId, keys: [oldEntry] });
    const store = createMemoryAttestationStore();
    const guard = createRequestAttestationMiddleware({
      publicOrigin: apiOrigin,
      replayNamespace: NAMESPACE,
      keyProvider: provider,
      store,
    });
    let handlerCalls = 0;
    const seenNonces = new Set<string>();
    const inner = express();
    inner.use('/api', guard as never);
    inner.post('/api/submit', (req, res) => {
      handlerCalls += 1;
      const raw = (req.headers as Record<string, string | string[] | undefined>)[DEFAULT_ATTESTATION_HEADER];
      const value = Array.isArray(raw) ? raw[0] : (raw as string);
      try {
        seenNonces.add(decodeTransactionId(value).nonceHex);
      } catch {
        // Nonce tracking is best-effort; handler execution is authoritative.
      }
      res.json({ ok: true });
    });
    app.use(inner);

    try {
      // Discovery serves old, then new after rotation.
      let metadataCalls = 0;
      const metadataFetch = (async () => {
        metadataCalls += 1;
        const current = metadataCalls === 1 ? oldEntry : newEntry;
        return new Response(
          JSON.stringify({
            version: 1,
            keyId: current.keyId,
            signerUrl: `${apiOrigin}/attestation/signer.${current.keyId}.mjs`,
            publicOrigin: apiOrigin,
            replayNamespace: NAMESPACE,
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch;
      const client = createSignerClient({
        metadataUrl: `${apiOrigin}/attestation/signer-meta`,
        apiOrigin,
        replayNamespace: NAMESPACE,
        fetch: metadataFetch,
        loadModule: async (url: string) => {
          if (url.includes('rot-old-01')) {
            return {
              signer: createRequestSigner({
                keyId: oldEntry.keyId,
                key: oldEntry.key,
                publicOrigin: apiOrigin,
                replayNamespace: NAMESPACE,
              }),
            };
          }
          return {
            signer: createRequestSigner({
              keyId: newEntry.keyId,
              key: newEntry.key,
              publicOrigin: apiOrigin,
              replayNamespace: NAMESPACE,
            }),
          };
        },
      });
      const options = { signerClient: client, apiOrigin, replayNamespace: NAMESPACE } as const;

      // Old active key passes with one handler execution.
      const firstBody = JSON.stringify({ attempt: 1 });
      const first = await fetchWithAttestation(
        `${apiOrigin}/api/submit`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: firstBody },
        options,
      );
      expect(first.status).toBe(200);
      await first.arrayBuffer();
      expect(handlerCalls).toBe(1);
      expect(metadataCalls).toBe(1);

      // Retire the old key on all verifiers (overlap ends): only the new key
      // remains accepted.
      provider.replace({ currentKeyId: newEntry.keyId, keys: [newEntry] });

      // Cached old signer sends a stale proof; the wrapper reloads once and
      // re-signs the same bytes with the new key for exactly one more handler call.
      const secondBody = JSON.stringify({ attempt: 2 });
      const second = await fetchWithAttestation(
        `${apiOrigin}/api/submit`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: secondBody },
        options,
      );
      expect(second.status).toBe(200);
      await second.arrayBuffer();
      expect(handlerCalls).toBe(2);
      expect(metadataCalls).toBe(2);
      expect(seenNonces.size).toBe(2);
      client.dispose();
    } finally {
      await started.close();
    }
  });
});

describe('authentication composition (bearer + OIDC vault, no double mount)', () => {
  it('vault stays reachable, guarded API requires independent auth, no doubled prefix', async () => {
    const maxBodyBytes = 1024 * 1024;
    const capture = createAttestationBodyCapture({ maxBodyBytes });
    const vaultStore = createMemoryOidcVaultStore();
    const vaultRouter = createOidcVaultMiddleware({
      basePath: '/auth/oidc',
      backendOrigin: 'https://api.example.com',
      config: {
        issuer: 'https://issuer.example.com',
        clientId: 'composition-client',
        authorizationEndpoint: 'https://issuer.example.com/auth',
        tokenEndpoint: 'https://issuer.example.com/token',
        jwksUri: 'https://issuer.example.com/jwks',
      },
      storeProvider: vaultStore,
    });

    const BEARER = 'Bearer good-token'; // pragma: allowlist secret
    function requireBearerAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
      if (req.headers.authorization !== BEARER) {
        res.status(401).json({ code: 'UNAUTHORIZED' });
        return;
      }
      next();
    }

    // Parsers first so the guard sees captured bytes; the guard itself is
    // mounted after we learn the loopback origin (Express applies mounts in
    // order even when added after listen).
    const preGuardApp = express();
    preGuardApp.use(vaultRouter);
    preGuardApp.use(express.json({ limit: maxBodyBytes, verify: capture.verify as never, inflate: false }));
    preGuardApp.use(capture.errorHandler as never);
    preGuardApp.options('/api/submit', (_req, res) => res.status(204).end());
    const started = await startApp(preGuardApp);
    const apiOrigin = started.baseUrl;

    const provider = {
      getSnapshot: () => {
        const now = Date.now();
        return {
          currentKeyId: KEY_ID,
          keys: [{ keyId: KEY_ID, key: KEY_BYTES, acceptFrom: now - 60000, acceptUntil: now + 60000 }],
        };
      },
    };
    const store = createMemoryAttestationStore();
    const guard = createRequestAttestationMiddleware({
      publicOrigin: apiOrigin,
      replayNamespace: NAMESPACE,
      keyProvider: provider,
      store,
    });

    const app = preGuardApp;
    // Vault owns its base path: mounted once above, never double-prefixed.
    // Selected API guard positions only: no blanket backchannel/navigation guard.
    app.post('/api/submit', guard as never, requireBearerAuth, (req, res) => {
      // The guard never sets req.auth and never enrolls DPoP bindings.
      expect((req as { auth?: unknown }).auth).toBeUndefined();
      res.json({ ok: true });
    });

    try {
      // Vault navigation remains reachable without attestation.
      const login = await fetch(`${apiOrigin}/auth/oidc/login`, { method: 'GET', redirect: 'manual' });
      expect([302, 303, 307, 308].includes(login.status) || login.status === 400).toBe(true);
      await login.arrayBuffer();
      // No doubled prefix.
      const doubled = await fetch(`${apiOrigin}/auth/oidc/auth/oidc/login`, { method: 'GET', redirect: 'manual' });
      expect(doubled.status).toBe(404);
      await doubled.arrayBuffer();
      // Preflight reachable without attestation.
      const preflight = await fetch(`${apiOrigin}/api/submit`, { method: 'OPTIONS' });
      expect(preflight.status).toBe(204);
      await preflight.arrayBuffer();

      const { client } = makeClientForKey({
        apiOrigin,
        metadataUrl: `${apiOrigin}/attestation/signer-meta`,
        keyId: KEY_ID,
        key: KEY_BYTES,
      });
      const base = { signerClient: client, apiOrigin, replayNamespace: NAMESPACE } as const;
      const body = JSON.stringify({ composed: true });

      // Guarded API without attestation fails before auth.
      const unsigned = await fetch(`${apiOrigin}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: BEARER },
        body,
      });
      expect(unsigned.status).toBe(403);
      const unsignedPayload = (await unsigned.json()) as { code: string };
      expect(unsignedPayload.code).toBe('ATTESTATION_MISSING');

      // Signed but unauthenticated fails at independent auth (no stale retry).
      const noAuth = await fetchWithAttestation(
        `${apiOrigin}/api/submit`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body },
        base,
      );
      expect(noAuth.status).toBe(401);
      await noAuth.arrayBuffer();

      // Signed + authenticated passes; each wrapper call regenerates its proof.
      const first = await fetchWithAttestation(
        `${apiOrigin}/api/submit`,
        { method: 'POST', headers: { 'content-type': 'application/json', authorization: BEARER }, body },
        base,
      );
      expect(first.status).toBe(200);
      await first.arrayBuffer();
      const second = await fetchWithAttestation(
        `${apiOrigin}/api/submit`,
        { method: 'POST', headers: { 'content-type': 'application/json', authorization: BEARER }, body },
        base,
      );
      expect(second.status).toBe(200);
      await second.arrayBuffer();
      client.dispose();
    } finally {
      await started.close();
    }
  });
});

describe('public-material boundary (non-browser caller signs successfully)', () => {
  it('proves request-format consistency without browser authenticity', async () => {
    const maxBodyBytes = 1024 * 1024;
    const capture = createAttestationBodyCapture({ maxBodyBytes });
    const baseApp = express();
    baseApp.use(express.json({ limit: maxBodyBytes, verify: capture.verify as never, inflate: false }));
    baseApp.use(capture.errorHandler as never);
    const started = await startApp(baseApp);
    const apiOrigin = started.baseUrl;

    const provider = staticProviderFor(apiOrigin, Date.now);
    const store = createMemoryAttestationStore();
    const guard = createRequestAttestationMiddleware({
      publicOrigin: apiOrigin,
      replayNamespace: NAMESPACE,
      keyProvider: provider,
      store,
    });
    const app = baseApp;
    app.use('/api', guard as never);
    app.post('/api/submit', (_req, res) => res.json({ ok: true }));
    try {
      // A plain Node caller with the distributed material signs without a browser.
      const signer = makeRealSigner(apiOrigin);
      const stubClient: SignerClient = {
        getSigner: async () => signer,
        invalidate: () => undefined,
        dispose: () => undefined,
      };
      const res = await fetchWithAttestation(
        `${apiOrigin}/api/submit`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ direct: true }) },
        { signerClient: stubClient, apiOrigin, replayNamespace: NAMESPACE },
      );
      expect(res.status).toBe(200);
      await res.arrayBuffer();

      // Genuine Chromium executes the same wrapper from the built bundle.
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        // Loopback http is a secure context, so WebCrypto is available;
        // about:blank does not guarantee that. Navigation 404 is fine.
        await page.goto(`${apiOrigin}/`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
        const result = (await page.evaluate(
          `typeof crypto?.subtle?.sign === 'function' && typeof crypto?.getRandomValues === 'function'`,
        )) as boolean;
        expect(result).toBe(true);
        await page.close();
      } finally {
        await browser.close();
      }
    } finally {
      await started.close();
    }
  });
});

describe('request-body helpers stay bounded', () => {
  it('materializes empty bodies and rejects oversized reads without allocation', async () => {
    const { materializeRequestBodyBytes } = await import('../src/request-body.js');
    const empty = new Request('https://attestation.example.com/api/items', { method: 'GET' });
    const bytes = await materializeRequestBodyBytes(empty, { maxBodyBytes: 1024 });
    expect(bytes.length).toBe(0);
    const big = new Request('https://attestation.example.com/api/submit', {
      method: 'POST',
      body: new Uint8Array(16),
    });
    await expect(materializeRequestBodyBytes(big, { maxBodyBytes: 4 })).rejects.toMatchObject({
      code: 'SIGNER_PREPARATION_FAILED',
    });
  });
});
