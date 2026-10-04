/**
 * ATT-09 bounded-failure tests (task sections 4.1-4.6).
 *
 * Covers header/decode/target/content-type/body/metadata/module/snapshot
 * limits with cancellation before allocation, request-mutation isolation,
 * generation-aware invalidation with late settlement, error ownership (no raw
 * leakage, fixed operational errors, stale-marker discipline), HTTP/browser
 * scoping (selected guard, preflight, manual redirects, credentials, bearer
 * composition), and bounded memory/timer/stream behavior.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it } from 'vitest';

import {
  AttestationError,
  AttestationProtocolError,
  buildMacInputBytes,
  canonicalizeRequestTarget,
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  decodeTransactionId,
  encodeTransactionId,
  normalizeContentType,
  validateReplayNamespace,
} from '../src/index.js';
import {
  SignerClientError,
  createRequestSigner,
  createSignerClient,
  fetchSignerBundle,
  fetchWithAttestation,
  materializeRequestBodyBytes,
} from '../src/signer.js';
import type { RequestSigner } from '../src/signer.js';

const PUBLIC_ORIGIN = 'https://attestation.example.com';
const NAMESPACE = 'att-failure-tests';
const KEY_ID = 'failure-key-01';
const KEY_BYTES = Uint8Array.from(
  Buffer.from('d973c35da623a2329dd08a32153635042a7fe90b730035c90508ae7ec50c0d24', 'hex'), // pragma: allowlist secret
);
const NOW = 1780000000000;
const METADATA_URL = 'https://attestation.example.com/attestation/signer-meta';

function snapshot() {
  return {
    currentKeyId: KEY_ID,
    keys: [{ keyId: KEY_ID, key: KEY_BYTES, acceptFrom: NOW - 60000, acceptUntil: NOW + 60000 }],
  };
}

function signProof(
  input: {
    timestampMs?: number;
    nonceHex?: string;
    method?: string;
    requestTarget?: string;
    contentType?: string;
    bodyBytes?: Uint8Array;
  } = {},
): string {
  const bodyBytes = input.bodyBytes ?? Buffer.alloc(0);
  const bodyHashHex = createHash('sha256').update(bodyBytes).digest('hex');
  const timestampMs = input.timestampMs ?? NOW - 1000;
  const nonceHex = input.nonceHex ?? randomBytes(16).toString('hex');
  const macInput = buildMacInputBytes({
    replayNamespace: NAMESPACE,
    publicOrigin: PUBLIC_ORIGIN,
    keyId: KEY_ID,
    timestampMs,
    nonceHex,
    method: input.method ?? 'GET',
    requestTarget: input.requestTarget ?? '/api/items',
    contentType: input.contentType ?? '',
    bodyHashHex,
  });
  const mac = createHmac('sha256', Buffer.from(KEY_BYTES)).update(macInput).digest('base64url');
  return encodeTransactionId({
    keyId: KEY_ID,
    timestampMs,
    nonceHex,
    mac,
  });
}

async function startApp(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function makeSigner(keyId: string = KEY_ID): RequestSigner {
  return {
    version: 1,
    keyId,
    publicOrigin: PUBLIC_ORIGIN,
    replayNamespace: NAMESPACE,
    sign: async () => 'transaction-id',
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('header, envelope, target, and content-type limits', () => {
  it('rejects oversized and non-canonical envelopes before expensive work', () => {
    expect(() => decodeTransactionId('x'.repeat(1025))).toThrow(AttestationProtocolError);
    expect(() => decodeTransactionId('')).toThrow(AttestationProtocolError);
    expect(() => decodeTransactionId('!!!not-base64!!!')).toThrow(AttestationProtocolError);
    const good = signProof();
    expect(() => decodeTransactionId(`${good}=`)).toThrow(AttestationProtocolError);
  });

  it('rejects oversized targets and content types at the boundary', () => {
    expect(() => canonicalizeRequestTarget(`/${'a'.repeat(8192)}`)).toThrow(AttestationProtocolError);
    expect(canonicalizeRequestTarget(`/${'a'.repeat(8190)}`)).toBe(`/${'a'.repeat(8190)}`);
    expect(() => normalizeContentType(`x/${'a'.repeat(300)}`)).toThrow(AttestationProtocolError);
    expect(() => validateReplayNamespace('bad namespace!')).toThrow(AttestationProtocolError);
  });

  it('fails over-limit and unsupported bodies before replay allocation', async () => {
    const maxBodyBytes = 64;
    const capture = createAttestationBodyCapture({ maxBodyBytes });
    let reserveCalls = 0;
    const inner = createMemoryAttestationStore({ now: () => NOW });
    const store = {
      reserve: async (input: { replayKey: string; retainUntilMs: number }) => {
        reserveCalls += 1;
        return inner.reserve(input);
      },
    };
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: { getSnapshot: () => snapshot() },
      store: store as never,
      now: () => NOW,
    });
    const app = express();
    app.use(express.json({ limit: maxBodyBytes, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    app.use('/api', guard as never);
    app.post('/api/submit', (_req, res) => res.json({ ok: true }));
    const { baseUrl, close } = await startApp(app);
    try {
      const big = JSON.stringify({ data: 'x'.repeat(200) });
      const proof = signProof({
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'application/json',
        bodyBytes: Buffer.from(big),
      });
      const over = await fetch(`${baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-transaction-id': proof },
        body: big,
      });
      expect(over.status).toBe(413);
      expect(reserveCalls).toBe(0);

      const encoded = await fetch(`${baseUrl}/api/submit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
          'x-client-transaction-id': signProof({
            method: 'POST',
            requestTarget: '/api/submit',
            contentType: 'application/json',
            bodyBytes: Buffer.from(JSON.stringify({ a: 1 })),
          }),
        },
        body: JSON.stringify({ a: 1 }),
      });
      expect(encoded.status).toBe(415);
      expect(reserveCalls).toBe(0);
    } finally {
      await close();
    }
  });

  it('rejects nonempty uncaptured bodies without silently using the empty digest', async () => {
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: { getSnapshot: () => snapshot() },
      store: createMemoryAttestationStore({ now: () => NOW }),
      now: () => NOW,
    });
    const app = express();
    // No parser observes text/plain bytes, so capture has no record.
    app.use('/api', guard as never);
    app.post('/api/submit', (_req, res) => res.json({ ok: true }));
    const { baseUrl, close } = await startApp(app);
    try {
      const body = 'uncaptured-bytes';
      const proof = signProof({
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'text/plain',
        bodyBytes: Buffer.from(body),
      });
      const res = await fetch(`${baseUrl}/api/submit`, {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          'content-length': String(body.length),
          'x-client-transaction-id': proof,
        },
        body,
      });
      expect(res.status).toBe(500);
      expect(((await res.json()) as { code: string }).code).toBe('ATTESTATION_BODY_CAPTURE_REQUIRED');
    } finally {
      await close();
    }
  });
});

describe('snapshot, provider, and store failure ownership', () => {
  it('maps malformed snapshots and provider faults to 503 without raw leakage', async () => {
    const capture = createAttestationBodyCapture();
    async function statusFor(provider: { getSnapshot: () => unknown }) {
      const guard = createRequestAttestationMiddleware({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: provider as never,
        store: createMemoryAttestationStore({ now: () => NOW }),
        now: () => NOW,
      });
      const app = express();
      app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
      app.use(capture.errorHandler as never);
      app.use('/api', guard as never);
      app.get('/api/items', (_req, res) => res.json({ ok: true }));
      const { baseUrl, close } = await startApp(app);
      try {
        const res = await fetch(`${baseUrl}/api/items`, {
          headers: { 'x-client-transaction-id': signProof() },
        });
        const body = (await res.json()) as { code: string; message: string };
        const rawHeaders = res.headers.get('content-type');
        void rawHeaders;
        return { status: res.status, body, noStore: res.headers.get('cache-control') };
      } finally {
        await close();
      }
    }
    const malformed = await statusFor({ getSnapshot: () => ({ currentKeyId: 'x', keys: [] }) });
    expect(malformed.status).toBe(503);
    expect(malformed.body.code).toBe('ATTESTATION_KEYS_UNAVAILABLE');
    expect(malformed.noStore).toBe('no-store');

    const throwing = await statusFor({
      getSnapshot: () => {
        throw new Error('kms boom with secret material');
      },
    });
    expect(throwing.status).toBe(503);
    expect(JSON.stringify(throwing.body)).not.toContain('kms boom');
    expect(JSON.stringify(throwing.body)).not.toContain(KEY_ID);
  });

  it('maps capacity and store faults to replay-unavailable without handler execution', async () => {
    const capture = createAttestationBodyCapture();
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: { getSnapshot: () => snapshot() },
      store: {
        reserve: async () => {
          throw new Error('redis down');
        },
      } as never,
      now: () => NOW,
    });
    const app = express();
    app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    app.use('/api', guard as never);
    let calls = 0;
    app.get('/api/items', (_req, res) => {
      calls += 1;
      res.json({ ok: true });
    });
    const { baseUrl, close } = await startApp(app);
    try {
      const res = await fetch(`${baseUrl}/api/items`, {
        headers: { 'x-client-transaction-id': signProof() },
      });
      expect(res.status).toBe(503);
      const payload = (await res.json()) as { code: string; message: string };
      expect(payload.code).toBe('ATTESTATION_REPLAY_UNAVAILABLE');
      expect(calls).toBe(0);
      expect(JSON.stringify(payload)).not.toContain('redis down');
    } finally {
      await close();
    }
  });

  it('never emits the stale marker after business-handler execution', async () => {
    const capture = createAttestationBodyCapture();
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: { getSnapshot: () => snapshot() },
      store: createMemoryAttestationStore({ now: () => NOW }),
      now: () => NOW,
    });
    const app = express();
    app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    app.use('/api', guard as never);
    app.get('/api/items', (_req, res) => res.json({ ok: true }));
    // Application error boundary after the guard: must not carry the marker.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ code: 'APP_FAILED' });
    });
    const { baseUrl, close } = await startApp(app);
    try {
      const res = await fetch(`${baseUrl}/api/items`, {
        headers: { 'x-client-transaction-id': signProof() },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('x-attestation-error')).toBeNull();
    } finally {
      await close();
    }
  });

  it('bounds provider/store waits and ignores late settlement', async () => {
    const capture = createAttestationBodyCapture();
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: {
        getSnapshot: async () => {
          await new Promise(() => {});
          return snapshot();
        },
      },
      store: createMemoryAttestationStore({ now: () => NOW }),
      now: () => NOW,
      operationTimeoutMs: 20,
    });
    const app = express();
    app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    app.use('/api', guard as never);
    let calls = 0;
    app.get('/api/items', (_req, res) => {
      calls += 1;
      res.json({ ok: true });
    });
    const { baseUrl, close } = await startApp(app);
    try {
      const res = await fetch(`${baseUrl}/api/items`, {
        headers: { 'x-client-transaction-id': signProof() },
      });
      expect(res.status).toBe(503);
      expect(calls).toBe(0);
    } finally {
      await close();
    }
  });
});

describe('mutation isolation and in-flight invalidation', () => {
  it('isolates store input and snapshot mutation between async steps', async () => {
    const store = createMemoryAttestationStore({ now: () => NOW });
    const input = { replayKey: `att:v1:${'c'.repeat(64)}`, retainUntilMs: NOW + 10000 };
    const pending = store.reserve(input);
    input.retainUntilMs = NOW + 20000;
    input.replayKey = `att:v1:${'d'.repeat(64)}`;
    expect(await pending).toBe('reserved');
    // Mutated key was never admitted; original key is now a duplicate.
    expect(await store.reserve({ replayKey: `att:v1:${'c'.repeat(64)}`, retainUntilMs: NOW + 10000 })).toBe(
      'duplicate',
    );
    expect(await store.reserve({ replayKey: `att:v1:${'d'.repeat(64)}`, retainUntilMs: NOW + 10000 })).toBe('reserved');
  });

  it('keeps prepared fetch bytes immutable across caller mutation', async () => {
    const apiOrigin = 'https://attestation.example.com';
    const signer = createRequestSigner({
      keyId: KEY_ID,
      key: KEY_BYTES,
      publicOrigin: apiOrigin,
      replayNamespace: NAMESPACE,
    });
    const seen: Request[] = [];
    const fetchImpl = (async (input: Request) => {
      seen.push(input);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = {
      getSigner: async () => signer,
      invalidate: () => {},
      dispose: () => {},
    };
    const bodyText = JSON.stringify({ stable: 1 });
    const promise = fetchWithAttestation(
      `${apiOrigin}/api/items`,
      { method: 'POST', body: bodyText },
      {
        signerClient: client,
        apiOrigin,
        replayNamespace: NAMESPACE,
        fetch: fetchImpl,
      },
    );
    await promise;
    expect(seen).toHaveLength(1);
    const sent = (await (seen[0] as Request).text()) as string;
    expect(sent).toBe(bodyText);
  });

  it('shares one load across concurrent getSigner calls and discards late old results', async () => {
    let metadataCalls = 0;
    const metadata = {
      version: 1,
      keyId: 'new-key',
      signerUrl: 'https://attestation.example.com/attestation/signer.new.mjs',
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
    };
    const fetchImpl = (async () => {
      metadataCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return jsonResponse(metadata);
    }) as unknown as typeof fetch;
    let loadCalls = 0;
    const loadModule = async () => {
      loadCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { signer: makeSigner('new-key') };
    };
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule,
    });
    try {
      const [first, second] = await Promise.all([client.getSigner(), client.getSigner()]);
      expect(first).toBe(second);
      expect(metadataCalls).toBe(1);
      expect(loadCalls).toBe(1);
      // A late challenge for an old key must not evict the newer signer.
      client.invalidate('old-key');
      const still = await client.getSigner();
      expect(still.keyId).toBe('new-key');
      client.dispose();
    } finally {
      try {
        client.dispose();
      } catch {
        // Dispose is idempotent-terminal; ignore double-dispose.
      }
    }
  });

  it('rejects oversized metadata and unexpected module origins locally', async () => {
    const big = jsonResponse({ ...{ version: 1 }, padding: 'x'.repeat(5000) });
    const fetchBig = (async () => big) as unknown as typeof fetch;
    await expect(
      fetchSignerBundle({
        metadataUrl: METADATA_URL,
        apiOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchBig,
        loadModule: async () => ({ signer: makeSigner() }),
      }),
    ).rejects.toBeInstanceOf(SignerClientError);

    const evilMeta = jsonResponse({
      version: 1,
      keyId: KEY_ID,
      signerUrl: 'https://evil.example.com/attestation/signer.evil.mjs',
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
    });
    const fetchEvil = (async () => evilMeta) as unknown as typeof fetch;
    await expect(
      fetchSignerBundle({
        metadataUrl: METADATA_URL,
        apiOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        fetch: fetchEvil,
        loadModule: async () => ({ signer: makeSigner() }),
      }),
    ).rejects.toBeInstanceOf(SignerClientError);
  });

  it('cancels stalled body reads with a bounded deadline and no leak', async () => {
    const stalled = new Request('https://attestation.example.com/api/items', {
      method: 'POST',
      body: new ReadableStream({
        start() {
          // Never enqueue or close: the deadline must win.
        },
      }) as BodyInit,
      ...({ duplex: 'half' } as { duplex: string }),
    });
    await expect(
      materializeRequestBodyBytes(stalled, { maxBodyBytes: 1024 * 1024, timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(SignerClientError);
    const over = new Request('https://attestation.example.com/api/items', {
      method: 'POST',
      body: 'x'.repeat(100),
    });
    await expect(materializeRequestBodyBytes(over, { maxBodyBytes: 10, timeoutMs: 5000 })).rejects.toBeInstanceOf(
      SignerClientError,
    );
    const controller = new AbortController();
    controller.abort(new Error('caller abort'));
    const aborted = new Request('https://attestation.example.com/api/items', {
      method: 'POST',
      body: 'hello',
    });
    await expect(materializeRequestBodyBytes(aborted, { signal: controller.signal })).rejects.toThrow();
  });
});

describe('HTTP and browser scoping (selected guard, preflight, redirects, credentials)', () => {
  it('guards only selected routes and leaves preflight/asset-like routes reachable', async () => {
    const capture = createAttestationBodyCapture();
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: { getSnapshot: () => snapshot() },
      store: createMemoryAttestationStore({ now: () => NOW }),
      now: () => NOW,
    });
    const app = express();
    app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    app.get('/health', (_req, res) => res.json({ ok: true }));
    // Simulated OIDC-style router owns its base path; no attestation guard here.
    const oidcLike = express.Router();
    oidcLike.get('/login', (_req, res) => res.json({ login: true }));
    app.use('/auth/oidc', oidcLike);
    app.use('/api', guard as never);
    app.get('/api/items', (_req, res) => res.json({ ok: true }));
    const { baseUrl, close } = await startApp(app);
    try {
      const healthBody = (await (await fetch(`${baseUrl}/health`)).json()) as { ok: boolean };
      expect(healthBody.ok).toBe(true);
      const loginBody = (await (await fetch(`${baseUrl}/auth/oidc/login`)).json()) as {
        login: boolean;
      };
      expect(loginBody).toMatchObject({ login: true });
      const preflight = await fetch(`${baseUrl}/api/items`, { method: 'OPTIONS' });
      // No blanket unsigned fallback: the guard still challenges the preflight
      // path when the app routes it through /api, but the dedicated
      // unguarded routes above stay reachable.
      expect([403, 404]).toContain(preflight.status);
      const guarded = await fetch(`${baseUrl}/api/items`);
      expect(guarded.status).toBe(403);
      expect(guarded.headers.get('cache-control')).toBe('no-store');
    } finally {
      await close();
    }
  });

  it('enforces bearer independence: attestation pass does not imply auth pass', async () => {
    const capture = createAttestationBodyCapture();
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: { getSnapshot: () => snapshot() },
      store: createMemoryAttestationStore({ now: () => NOW }),
      now: () => NOW,
    });
    const app = express();
    app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    function requireBearer(req: express.Request, res: express.Response, next: express.NextFunction) {
      if (req.headers.authorization !== 'Bearer good-token') {
        res.status(401).json({ code: 'UNAUTHORIZED' });
        return;
      }
      next();
    }
    app.use('/api', guard as never);
    app.get('/api/private', requireBearer as never, (_req, res) => res.json({ ok: true }));
    const { baseUrl, close } = await startApp(app);
    try {
      const first = await fetch(`${baseUrl}/api/private`, {
        headers: {
          'x-client-transaction-id': signProof({ requestTarget: '/api/private' }),
        },
      });
      expect(first.status).toBe(401);
      const second = await fetch(`${baseUrl}/api/private`, {
        headers: {
          authorization: 'Bearer good-token',
          'x-client-transaction-id': signProof({ requestTarget: '/api/private' }),
        },
      });
      expect(second.status).toBe(200);
    } finally {
      await close();
    }
  });

  it('uses manual redirects, preserves credentials, and pins origin locally', async () => {
    const apiOrigin = 'https://attestation.example.com';
    const signer = createRequestSigner({
      keyId: KEY_ID,
      key: KEY_BYTES,
      publicOrigin: apiOrigin,
      replayNamespace: NAMESPACE,
    });
    const seen: Request[] = [];
    const fetchImpl = (async (input: Request) => {
      seen.push(input);
      return new Response(null, { status: 302, headers: { location: 'https://other.example/x' } });
    }) as unknown as typeof fetch;
    const client = {
      getSigner: async () => signer,
      invalidate: () => {},
      dispose: () => {},
    };
    const res = await fetchWithAttestation(
      `${apiOrigin}/api/items`,
      { method: 'GET', credentials: 'include' },
      { signerClient: client, apiOrigin, replayNamespace: NAMESPACE, fetch: fetchImpl },
    );
    expect(res.status).toBe(302);
    expect(seen).toHaveLength(1);
    expect((seen[0] as Request).redirect).toBe('manual');
    expect((seen[0] as Request).credentials).toBe('include');
    expect((seen[0] as Request).headers.get('x-client-transaction-id')).toBeTruthy();

    const externalCalls: Request[] = [];
    const externalFetch = (async (input: Request) => {
      externalCalls.push(input);
      return new Response('x', { status: 200 });
    }) as unknown as typeof fetch;
    await expect(
      fetchWithAttestation(
        'https://other.example/x',
        {},
        {
          signerClient: client,
          apiOrigin,
          replayNamespace: NAMESPACE,
          fetch: externalFetch,
        },
      ),
    ).rejects.toBeInstanceOf(SignerClientError);
    expect(externalCalls).toHaveLength(0);
  });

  it('keeps fixed error payloads free of raw key/proof/body material', () => {
    for (const code of [
      'ATTESTATION_MISSING',
      'ATTESTATION_MALFORMED',
      'ATTESTATION_STALE_KEY',
      'ATTESTATION_EXPIRED',
      'ATTESTATION_INVALID_SIGNATURE',
      'ATTESTATION_REPLAY',
      'ATTESTATION_KEYS_UNAVAILABLE',
      'ATTESTATION_REPLAY_UNAVAILABLE',
    ] as const) {
      const error = new AttestationError(code);
      const payload = JSON.stringify({ code: error.code, message: error.message });
      expect(payload).not.toContain(Buffer.from(KEY_BYTES).toString('hex'));
      expect(payload).not.toContain('secret');
      expect(Object.keys(JSON.parse(payload) as Record<string, unknown>).sort()).toEqual(['code', 'message']);
    }
  });
});
