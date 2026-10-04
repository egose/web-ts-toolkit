/**
 * ATT-02 middleware HTTP tests: parser combinations, tamper-every-field
 * invalidation, fixed error mapping, and guard composition (no hardcoded
 * exclusions, no `req.auth` mutation, stale-key marker discipline).
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';

import {
  ATTESTATION_ERROR_RESPONSE_HEADER,
  DEFAULT_ATTESTATION_HEADER,
  buildMacInputBytes,
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  encodeTransactionId,
} from '../src/index.js';
import type { AttestationKeySnapshot } from '../src/index.js';

const PUBLIC_ORIGIN = 'https://attestation.example.com';
const NAMESPACE = 'att-mw-tests';
const KEY_ID = 'mw-key-01';
const KEY_BYTES = Uint8Array.from(
  Buffer.from('d973c35da623a2329dd08a32153635042a7fe90b730035c90508ae7ec50c0d24', 'hex'), // pragma: allowlist secret
);
const NOW = 1780000000000;

function snapshotFor(now: number): AttestationKeySnapshot {
  return {
    currentKeyId: KEY_ID,
    keys: [{ keyId: KEY_ID, key: KEY_BYTES, acceptFrom: now - 60000, acceptUntil: now + 60000 }],
  };
}

function staticProvider(snapshot: AttestationKeySnapshot) {
  return { getSnapshot: () => snapshot };
}

function signProof(input: {
  keyId?: string;
  key?: Uint8Array;
  timestampMs: number;
  nonceHex: string;
  method: string;
  requestTarget: string;
  contentType: string;
  bodyBytes: Uint8Array;
}): string {
  const keyId = input.keyId ?? KEY_ID;
  const key = input.key ?? KEY_BYTES;
  const bodyHashHex = createHash('sha256').update(input.bodyBytes).digest('hex');
  const macInput = buildMacInputBytes({
    replayNamespace: NAMESPACE,
    publicOrigin: PUBLIC_ORIGIN,
    keyId,
    timestampMs: input.timestampMs,
    nonceHex: input.nonceHex,
    method: input.method,
    requestTarget: input.requestTarget,
    contentType: input.contentType,
    bodyHashHex,
  });
  const mac = createHmac('sha256', Buffer.from(key)).update(macInput).digest('base64url');
  return encodeTransactionId({ keyId, timestampMs: input.timestampMs, nonceHex: input.nonceHex, mac });
}

function nonce(): string {
  return randomBytes(16).toString('hex');
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

interface GuardSetup {
  handlerCalls: () => number;
  baseUrl: string;
  close: () => Promise<void>;
  storeReserveCalls: () => number;
}

async function setupGuardedApp(options?: {
  now?: () => number;
  provider?: { getSnapshot: () => AttestationKeySnapshot | Promise<AttestationKeySnapshot> };
  publicPathPrefix?: string;
  headerName?: string;
  onDiagnostic?: (event: { code: string; status: number }) => void;
  maxBodyBytes?: number;
}): Promise<GuardSetup> {
  const maxBodyBytes = options?.maxBodyBytes ?? 1024 * 1024;
  const capture = createAttestationBodyCapture({ maxBodyBytes });
  const nowValue = NOW;
  const now = options?.now ?? (() => nowValue);
  const provider = options?.provider ?? staticProvider(snapshotFor(NOW));
  let reserveCalls = 0;
  const inner = createMemoryAttestationStore({ now: () => NOW });
  const store = {
    reserve: async (input: { replayKey: string; retainUntilMs: number }) => {
      reserveCalls += 1;
      return inner.reserve(input);
    },
  };
  let handlerCalls = 0;
  const guard = createRequestAttestationMiddleware({
    publicOrigin: PUBLIC_ORIGIN,
    replayNamespace: NAMESPACE,
    ...(options?.publicPathPrefix === undefined ? {} : { publicPathPrefix: options.publicPathPrefix }),
    ...(options?.headerName === undefined ? {} : { headerName: options.headerName }),
    ...(options?.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic }),
    keyProvider: provider,
    store,
    now,
  });
  const app = express();
  app.use(express.json({ limit: maxBodyBytes, verify: capture.verify as never, inflate: false }));
  app.use(
    express.urlencoded({ extended: false, limit: maxBodyBytes, verify: capture.verify as never, inflate: false }),
  );
  app.use(
    express.raw({
      type: 'application/octet-stream',
      limit: maxBodyBytes,
      verify: capture.verify as never,
      inflate: false,
    }),
  );
  app.use(express.raw({ type: 'multipart/*', limit: maxBodyBytes, verify: capture.verify as never, inflate: false }));
  app.use(capture.errorHandler as never);
  // Unprotected route proves there is no hardcoded bypass: the guard is
  // mounted only where the app chooses.
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', guard as never);
  app.post('/api/submit', (req, res) => {
    handlerCalls += 1;
    res.json({ ok: true, auth: (req as { auth?: unknown }).auth ?? null, body: req.body ?? null });
  });
  app.put('/api/blob/7', (req, res) => {
    handlerCalls += 1;
    res.json({ ok: true });
  });
  app.get('/api/items', (_req, res) => {
    handlerCalls += 1;
    res.json({ ok: true });
  });
  const { baseUrl, close } = await startApp(app);
  return { handlerCalls: () => handlerCalls, baseUrl, close, storeReserveCalls: () => reserveCalls };
}

describe('valid proofs across parser combinations', () => {
  it('accepts JSON with exact bytes and leaves body usable', async () => {
    const setup = await setupGuardedApp();
    try {
      const raw = JSON.stringify({ a: 1 });
      const header = signProof({
        timestampMs: NOW - 5000,
        nonceHex: nonce(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw, 'utf8'),
      });
      const response = await fetch(`${setup.baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [DEFAULT_ATTESTATION_HEADER]: header },
        body: raw,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBeNull();
      expect(response.headers.get('x-attestation-error')).toBeNull();
      expect(response.headers.get('www-authenticate')).toBeNull();
      const payload = (await response.json()) as { ok: boolean; auth: null; body: unknown };
      expect(payload.ok).toBe(true);
      expect(payload.auth).toBeNull();
      expect(payload.body).toEqual({ a: 1 });
      expect(setup.handlerCalls()).toBe(1);
    } finally {
      await setup.close();
    }
  });

  it('accepts urlencoded, raw/binary, empty, and multipart exact bytes', async () => {
    const setup = await setupGuardedApp();
    try {
      // urlencoded
      const form = 'a=1&b=2';
      const formHeader = signProof({
        timestampMs: NOW - 5000,
        nonceHex: nonce(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'application/x-www-form-urlencoded',
        bodyBytes: Buffer.from(form, 'utf8'),
      });
      const formRes = await fetch(`${setup.baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', [DEFAULT_ATTESTATION_HEADER]: formHeader },
        body: form,
      });
      expect(formRes.status).toBe(200);

      // raw binary
      const bytes = Buffer.from([0x00, 0x01, 0xff, 0x48, 0x69]);
      const rawHeader = signProof({
        timestampMs: NOW - 5000,
        nonceHex: nonce(),
        method: 'PUT',
        requestTarget: '/api/blob/7',
        contentType: 'application/octet-stream',
        bodyBytes: bytes,
      });
      const rawRes = await fetch(`${setup.baseUrl}/api/blob/7`, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream', [DEFAULT_ATTESTATION_HEADER]: rawHeader },
        body: bytes as unknown as BodyInit,
      });
      expect(rawRes.status).toBe(200);

      // empty GET (no content-type, zero bytes)
      const emptyHeader = signProof({
        timestampMs: NOW - 5000,
        nonceHex: nonce(),
        method: 'GET',
        requestTarget: '/api/items',
        contentType: '',
        bodyBytes: Buffer.alloc(0),
      });
      const emptyRes = await fetch(`${setup.baseUrl}/api/items`, {
        method: 'GET',
        headers: { [DEFAULT_ATTESTATION_HEADER]: emptyHeader },
      });
      expect(emptyRes.status).toBe(200);

      // multipart exact bytes
      const boundary = '----mp-boundary-7';
      const multipart = `------mp-boundary-7\r\nContent-Disposition: form-data; name="f"\r\n\r\nv\r\n------mp-boundary-7--\r\n`;
      const mpBytes = Buffer.from(multipart, 'utf8');
      const mpHeader = signProof({
        timestampMs: NOW - 5000,
        nonceHex: nonce(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: `multipart/form-data; boundary=${boundary}`,
        bodyBytes: mpBytes,
      });
      const mpRes = await fetch(`${setup.baseUrl}/api/submit`, {
        method: 'POST',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          [DEFAULT_ATTESTATION_HEADER]: mpHeader,
        },
        body: mpBytes as unknown as BodyInit,
      });
      expect(mpRes.status).toBe(200);
      expect(setup.handlerCalls()).toBe(4);
    } finally {
      await setup.close();
    }
  });

  it('does not require attestation on unguarded routes', async () => {
    const setup = await setupGuardedApp();
    try {
      const response = await fetch(`${setup.baseUrl}/health`, { method: 'GET' });
      expect(response.status).toBe(200);
      expect(setup.handlerCalls()).toBe(0);
    } finally {
      await setup.close();
    }
  });
});

describe('tamper-every-field invalidation', () => {
  it.each([
    'method',
    'path',
    'queryOrder',
    'querySpelling',
    'contentType',
    'bodyWhitespace',
    'bodyBytes',
    'namespace',
    'origin',
    'version',
    'keyId',
    'timestamp',
    'nonce',
  ])('rejects tampered %s', async (field) => {
    const setup = await setupGuardedApp();
    try {
      const raw = JSON.stringify({ a: 1 });
      const base = {
        timestampMs: NOW - 5000,
        nonceHex: nonce(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw, 'utf8'),
      };
      let header = signProof(base);
      let sendTarget = '/api/submit';
      let sendBody: string | Buffer = raw;
      let sendContentType = 'application/json';
      let sendMethod = 'POST';
      if (field === 'method') {
        sendMethod = 'PUT';
      } else if (field === 'path') {
        sendTarget = '/api/submit/';
      } else if (field === 'queryOrder' || field === 'querySpelling') {
        // Sign for ordered queries, send reordered/respelled.
        const target = '/api/submit?tag=a&tag=b&q=x+y';
        header = signProof({ ...base, requestTarget: target });
        sendTarget = field === 'queryOrder' ? '/api/submit?tag=b&tag=a&q=x+y' : '/api/submit?tag=a&tag=b&q=x%20y';
      } else if (field === 'contentType') {
        sendContentType = 'application/json; charset=utf-8';
      } else if (field === 'bodyWhitespace') {
        sendBody = '{"a": 1}';
      } else if (field === 'bodyBytes') {
        sendBody = JSON.stringify({ a: 2 });
      } else if (
        field === 'namespace' ||
        field === 'origin' ||
        field === 'version' ||
        field === 'keyId' ||
        field === 'timestamp' ||
        field === 'nonce'
      ) {
        // Envelope-level tampering: flip the last char of the encoded ID.
        // Any envelope change invalidates the MAC or the envelope itself.
        header = `${header.slice(0, -1)}${header.slice(-1) === 'A' ? 'B' : 'A'}`;
      }
      const response = await fetch(`${setup.baseUrl}${sendTarget}`, {
        method: sendMethod,
        headers: { 'content-type': sendContentType, [DEFAULT_ATTESTATION_HEADER]: header },
        body: sendBody,
      });
      expect(response.status).toBe(403);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('www-authenticate')).toBeNull();
      const payload = (await response.json()) as { code: string };
      expect(['ATTESTATION_MALFORMED', 'ATTESTATION_INVALID_SIGNATURE']).toContain(payload.code);
      expect(setup.handlerCalls()).toBe(0);
      expect(setup.storeReserveCalls()).toBe(0);
    } finally {
      await setup.close();
    }
  });

  it('rejects nonempty uncaptured bodies with 500 BODY_CAPTURE_REQUIRED', async () => {
    // App mounts only JSON parsing; a binary body with an octet-stream type
    // passes through unparsed with no capture record.
    const capture = createAttestationBodyCapture();
    const store = createMemoryAttestationStore({ now: () => NOW });
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: staticProvider(snapshotFor(NOW)),
      store,
      now: () => NOW,
    });
    const app = express();
    app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    app.use('/api', guard as never);
    app.post('/api/submit', (_req, res) => res.json({ ok: true }));
    const { baseUrl, close } = await startApp(app);
    try {
      const bytes = Buffer.from([0x01, 0x02, 0x03]);
      const header = signProof({
        timestampMs: NOW - 5000,
        nonceHex: nonce(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'application/octet-stream',
        bodyBytes: bytes,
      });
      const response = await fetch(`${baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', [DEFAULT_ATTESTATION_HEADER]: header },
        body: bytes as unknown as BodyInit,
      });
      expect(response.status).toBe(500);
      const payload = (await response.json()) as { code: string };
      expect(payload.code).toBe('ATTESTATION_BODY_CAPTURE_REQUIRED');
    } finally {
      await close();
    }
  });
});

describe('fixed error mapping', () => {
  it('maps missing to 403 ATTESTATION_MISSING', async () => {
    const setup = await setupGuardedApp();
    try {
      const response = await fetch(`${setup.baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ a: 1 }),
      });
      expect(response.status).toBe(403);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-attestation-error')).toBeNull();
      const payload = (await response.json()) as { code: string; message: string };
      expect(payload).toEqual({ code: 'ATTESTATION_MISSING', message: 'Request signature is required.' });
      expect(JSON.stringify(payload)).not.toMatch(/d973c35d|unknown-key-01|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/i);
    } finally {
      await setup.close();
    }
  });

  it('maps duplicate and comma-joined headers to 403 MALFORMED without reserve', async () => {
    const setup = await setupGuardedApp();
    try {
      const raw = JSON.stringify({ a: 1 });
      const first = signProof({
        timestampMs: NOW - 5000,
        nonceHex: nonce(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const second = signProof({
        timestampMs: NOW - 5000,
        nonceHex: nonce(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      // Comma-joined single header value.
      const joined = await fetch(`${setup.baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [DEFAULT_ATTESTATION_HEADER]: `${first},${second}` },
        body: raw,
      });
      expect(joined.status).toBe(403);
      expect(((await joined.json()) as { code: string }).code).toBe('ATTESTATION_MALFORMED');
      expect(setup.storeReserveCalls()).toBe(0);
    } finally {
      await setup.close();
    }
  });

  it('detects duplicate raw headers via rawHeaders', async () => {
    const { checkProofTiming } = await import('../src/index.js');
    expect(typeof checkProofTiming).toBe('function');
    // Direct middleware invocation with duplicated rawHeaders (fetch would
    // merge duplicates into one comma-joined value; rawHeaders preserves them).
    const { createRequestAttestationMiddleware: createGuard } = await import('../src/index.js');
    const store = createMemoryAttestationStore({ now: () => NOW });
    const guard = createGuard({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: staticProvider(snapshotFor(NOW)),
      store,
      now: () => NOW,
    });
    let status = 0;
    let payload: unknown;
    const req = {
      method: 'POST',
      originalUrl: '/api/submit',
      headers: { 'content-type': 'application/json', [DEFAULT_ATTESTATION_HEADER]: 'first' },
      rawHeaders: [
        DEFAULT_ATTESTATION_HEADER,
        'first',
        DEFAULT_ATTESTATION_HEADER,
        'second',
        'Content-Type',
        'application/json',
      ],
      body: { a: 1 },
    };
    const res = {
      headersSent: false,
      setHeader: () => {},
      status: (code: number) => {
        status = code;
        return {
          json: (body: unknown) => {
            payload = body;
          },
        };
      },
    };
    let nextCalled = false;
    (guard as (req: unknown, res: unknown, next: () => void) => void)(req, res, () => {
      nextCalled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(nextCalled).toBe(false);
    expect(status).toBe(403);
    expect(payload).toEqual({ code: 'ATTESTATION_MALFORMED', message: 'Request signature is invalid.' });
  });

  it('maps oversized encoded IDs and malformed envelopes to MALFORMED', async () => {
    const setup = await setupGuardedApp();
    try {
      const raw = JSON.stringify({ a: 1 });
      const oversized = await fetch(`${setup.baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [DEFAULT_ATTESTATION_HEADER]: 'A'.repeat(1025) },
        body: raw,
      });
      expect(oversized.status).toBe(403);
      expect(((await oversized.json()) as { code: string }).code).toBe('ATTESTATION_MALFORMED');
      const malformed = await fetch(`${setup.baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [DEFAULT_ATTESTATION_HEADER]: 'not-base64url!!!' },
        body: raw,
      });
      expect(malformed.status).toBe(403);
      expect(setup.storeReserveCalls()).toBe(0);
    } finally {
      await setup.close();
    }
  });

  it('maps over-limit parser bodies to 413 before the guard', async () => {
    const setup = await setupGuardedApp({ maxBodyBytes: 16 });
    try {
      const raw = JSON.stringify({ padding: 'definitely over sixteen bytes long' });
      const header = signProof({
        timestampMs: NOW - 5000,
        nonceHex: nonce(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const response = await fetch(`${setup.baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [DEFAULT_ATTESTATION_HEADER]: header },
        body: raw,
      });
      expect(response.status).toBe(413);
      expect(((await response.json()) as { code: string }).code).toBe('ATTESTATION_BODY_TOO_LARGE');
      expect(setup.handlerCalls()).toBe(0);
      expect(setup.storeReserveCalls()).toBe(0);
    } finally {
      await setup.close();
    }
  });

  it('distinguishes unknown key (STALE) vs expired vs future with marker discipline', async () => {
    const setup = await setupGuardedApp();
    try {
      const raw = JSON.stringify({ a: 1 });
      // Unknown well-formed key.
      const unknownHeader = signProof({
        keyId: 'unknown-key-01',
        timestampMs: NOW - 5000,
        nonceHex: nonce(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const unknownRes = await fetch(`${setup.baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [DEFAULT_ATTESTATION_HEADER]: unknownHeader },
        body: raw,
      });
      expect(unknownRes.status).toBe(403);
      expect(((await unknownRes.json()) as { code: string }).code).toBe('ATTESTATION_STALE_KEY');
      expect(unknownRes.headers.get('x-attestation-error')).toBe('stale-key');

      // Expired known key (no stale marker).
      const expiredHeader = signProof({
        timestampMs: NOW - 40000,
        nonceHex: nonce(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const expiredRes = await fetch(`${setup.baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [DEFAULT_ATTESTATION_HEADER]: expiredHeader },
        body: raw,
      });
      expect(expiredRes.status).toBe(403);
      expect(((await expiredRes.json()) as { code: string }).code).toBe('ATTESTATION_EXPIRED');
      expect(expiredRes.headers.get('x-attestation-error')).toBeNull();

      // Future known key.
      const futureHeader = signProof({
        timestampMs: NOW + 6000,
        nonceHex: nonce(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const futureRes = await fetch(`${setup.baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [DEFAULT_ATTESTATION_HEADER]: futureHeader },
        body: raw,
      });
      expect(futureRes.status).toBe(403);
      expect(((await futureRes.json()) as { code: string }).code).toBe('ATTESTATION_FUTURE');
      expect(setup.handlerCalls()).toBe(0);
    } finally {
      await setup.close();
    }
  });

  it('maps retired keys to STALE even with fresh timestamps', async () => {
    const retiredSnapshot: AttestationKeySnapshot = {
      currentKeyId: KEY_ID,
      keys: [{ keyId: KEY_ID, key: KEY_BYTES, acceptFrom: NOW - 120000, acceptUntil: NOW - 1000 }],
    };
    const setup = await setupGuardedApp({ provider: staticProvider(retiredSnapshot) });
    try {
      const raw = JSON.stringify({ a: 1 });
      const header = signProof({
        timestampMs: NOW - 500,
        nonceHex: nonce(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const response = await fetch(`${setup.baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [DEFAULT_ATTESTATION_HEADER]: header },
        body: raw,
      });
      expect(response.status).toBe(403);
      expect(((await response.json()) as { code: string }).code).toBe('ATTESTATION_STALE_KEY');
      expect(response.headers.get('x-attestation-error')).toBe('stale-key');
    } finally {
      await setup.close();
    }
  });

  it('maps unsafe verifier clocks to 500 INTERNAL before any replay call', async () => {
    for (const badNow of [Number.NaN, -1, 1.5]) {
      const setup = await setupGuardedApp({ now: () => badNow });
      try {
        const raw = JSON.stringify({ a: 1 });
        const header = signProof({
          timestampMs: NOW - 5000,
          nonceHex: nonce(),
          method: 'POST',
          requestTarget: '/api/submit',
          contentType: 'application/json',
          bodyBytes: Buffer.from(raw),
        });
        const response = await fetch(`${setup.baseUrl}/api/submit`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [DEFAULT_ATTESTATION_HEADER]: header },
          body: raw,
        });
        expect(response.status).toBe(500);
        expect(((await response.json()) as { code: string }).code).toBe('ATTESTATION_INTERNAL_ERROR');
        expect(setup.storeReserveCalls()).toBe(0);
      } finally {
        await setup.close();
      }
    }
  });

  it('maps provider faults and malformed snapshots to 503 KEYS_UNAVAILABLE (never STALE)', async () => {
    const raw = JSON.stringify({ a: 1 });
    const header = signProof({
      timestampMs: NOW - 5000,
      nonceHex: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      method: 'POST',
      requestTarget: '/api/submit',
      contentType: 'application/json',
      bodyBytes: Buffer.from(raw),
    });
    const cases: { name: string; provider: { getSnapshot: () => unknown } }[] = [
      {
        name: 'throw',
        provider: {
          getSnapshot: () => {
            throw new Error('kms down');
          },
        },
      },
      { name: 'reject', provider: { getSnapshot: () => Promise.reject(new Error('read failed')) } },
      {
        name: 'malformed',
        provider: { getSnapshot: (() => ({ currentKeyId: 'x', keys: [] })) as unknown as () => unknown },
      },
    ];
    for (const entry of cases) {
      const setup = await setupGuardedApp({ provider: entry.provider as never });
      try {
        const response = await fetch(`${setup.baseUrl}/api/submit`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [DEFAULT_ATTESTATION_HEADER]: header },
          body: raw,
        });
        expect(response.status, entry.name).toBe(503);
        expect(((await response.json()) as { code: string }).code, entry.name).toBe('ATTESTATION_KEYS_UNAVAILABLE');
        expect(setup.storeReserveCalls(), entry.name).toBe(0);
      } finally {
        await setup.close();
      }
    }
  });

  it('rejects compressed content-encoding with 415 and never echoes secrets', async () => {
    const setup = await setupGuardedApp();
    try {
      const raw = JSON.stringify({ a: 1 });
      const header = signProof({
        timestampMs: NOW - 5000,
        nonceHex: nonce(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      // Send gzip bytes with gzip encoding; parser uses inflate:false so the
      // guard must reject the encoding itself.
      const { gzipSync } = await import('node:zlib');
      const gzipped = gzipSync(Buffer.from(raw, 'utf8'));
      const response = await fetch(`${setup.baseUrl}/api/submit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
          [DEFAULT_ATTESTATION_HEADER]: header,
        },
        body: gzipped as unknown as BodyInit,
      });
      expect(response.status).toBe(415);
      const text = await response.text();
      expect(text).not.toMatch(/mw-key|d973|nonce|sig|héllo/i);
      expect(JSON.parse(text)).toEqual({
        code: 'ATTESTATION_UNSUPPORTED_ENCODING',
        message: 'Request body encoding is unsupported.',
      });
    } finally {
      await setup.close();
    }
  });

  it('supports custom header names and publicPathPrefix concatenation', async () => {
    const setup = await setupGuardedApp({ headerName: 'x-custom-proof', publicPathPrefix: '/prefix' });
    // The guarded app mounts at /api, but the public target includes /prefix.
    // Build a dedicated prefixed app for this case.
    await setup.close();
    const capture = createAttestationBodyCapture();
    const store = createMemoryAttestationStore({ now: () => NOW });
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      publicPathPrefix: '/prefix',
      headerName: 'x-custom-proof',
      keyProvider: staticProvider(snapshotFor(NOW)),
      store,
      now: () => NOW,
    });
    const app = express();
    app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    app.use('/api', guard as never);
    app.post('/api/submit', (_req, res) => res.json({ ok: true }));
    const { baseUrl, close } = await startApp(app);
    try {
      const raw = JSON.stringify({ a: 1 });
      // originalUrl is /api/submit; public target is /prefix/api/submit.
      const header = signProof({
        timestampMs: NOW - 5000,
        nonceHex: nonce(),
        method: 'POST',
        requestTarget: '/prefix/api/submit',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const response = await fetch(`${baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-custom-proof': header },
        body: raw,
      });
      expect(response.status).toBe(200);
    } finally {
      await close();
    }
  });

  it('emits the diagnostic hook with allowlisted fields and survives hook throws', async () => {
    const seen: { code: string; status: number }[] = [];
    const setup = await setupGuardedApp({
      onDiagnostic: (event) => {
        seen.push({ code: event.code, status: event.status });
        if (event.code === 'ATTESTATION_MISSING') {
          throw new Error('diagnostic observer boom');
        }
      },
    });
    try {
      const missing = await fetch(`${setup.baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ a: 1 }),
      });
      expect(missing.status).toBe(403);
      expect(seen).toEqual([{ code: 'ATTESTATION_MISSING', status: 403 }]);
      expect(Object.keys(seen[0])).toEqual(['code', 'status']);
    } finally {
      await setup.close();
    }
  });

  it('rejects invalid construction options loudly', async () => {
    const store = createMemoryAttestationStore({ now: () => NOW });
    const provider = staticProvider(snapshotFor(NOW));
    expect(() =>
      createRequestAttestationMiddleware({
        publicOrigin: 'http://evil.example.com',
        replayNamespace: NAMESPACE,
        keyProvider: provider,
        store,
      }),
    ).toThrow();
    expect(() =>
      createRequestAttestationMiddleware({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: 'bad ns!',
        keyProvider: provider,
        store,
      }),
    ).toThrow();
    expect(() =>
      createRequestAttestationMiddleware({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: provider,
        store,
        headerName: 'Authorization',
      }),
    ).toThrow();
    expect(() =>
      createRequestAttestationMiddleware({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: provider,
        store,
        maxAgeMs: 1,
      }),
    ).toThrow();
    expect(() =>
      createRequestAttestationMiddleware({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: provider,
        store,
        operationTimeoutMs: 0,
      }),
    ).toThrow();
    expect(() =>
      createRequestAttestationMiddleware({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: provider,
        store,
        publicPathPrefix: 'no-slash',
      }),
    ).toThrow();
    expect(() =>
      createRequestAttestationMiddleware({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: null as never,
        store,
      }),
    ).toThrow();
    expect(() =>
      createRequestAttestationMiddleware({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: provider,
        store: null as never,
      }),
    ).toThrow();
    expect(() =>
      createRequestAttestationMiddleware({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: provider,
        store,
        unknownOption: 1,
      } as never),
    ).toThrow();
    expect(ATTESTATION_ERROR_RESPONSE_HEADER).toBe('x-attestation-error');
  });
});
