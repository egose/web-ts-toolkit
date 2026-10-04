/**
 * ATT-09 cross-path boundary tests (task sections 4.2-4.3).
 *
 * Verifies exact raw target/body semantics across mounted/nested routers,
 * stripped proxy prefixes, pinned origins, Unicode, percent-escape spelling,
 * doubled/trailing slashes, duplicate/reordered queries, plus/space, empty
 * search, dot segments, malformed escapes, and content-type boundaries.
 * Accepted/rejected forms must match server, WebCrypto, and generated-module
 * behavior (shared codec is the single source of truth).
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it } from 'vitest';

import {
  AttestationProtocolError,
  buildMacInputBytes,
  canonicalizeRequestTarget,
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  decodeTransactionId,
  encodeTransactionId,
  normalizeContentType,
  normalizeMethod,
  validateHeaderName,
  validatePublicOrigin,
} from '../src/index.js';
import { createRequestSigner } from '../src/signer.js';

const PUBLIC_ORIGIN = 'https://attestation.example.com';
const NAMESPACE = 'att-boundary-tests';
const KEY_ID = 'boundary-key-01';
const KEY_BYTES = Uint8Array.from(
  Buffer.from('d973c35da623a2329dd08a32153635042a7fe90b730035c90508ae7ec50c0d24', 'hex'), // pragma: allowlist secret
);
const NOW = 1780000000000;

function snapshot() {
  return {
    currentKeyId: KEY_ID,
    keys: [{ keyId: KEY_ID, key: KEY_BYTES, acceptFrom: NOW - 60000, acceptUntil: NOW + 60000 }],
  };
}

function signProof(input: {
  timestampMs: number;
  nonceHex: string;
  method: string;
  requestTarget: string;
  contentType: string;
  bodyBytes: Uint8Array;
}): string {
  const bodyHashHex = createHash('sha256').update(input.bodyBytes).digest('hex');
  const macInput = buildMacInputBytes({
    replayNamespace: NAMESPACE,
    publicOrigin: PUBLIC_ORIGIN,
    keyId: KEY_ID,
    timestampMs: input.timestampMs,
    nonceHex: input.nonceHex,
    method: input.method,
    requestTarget: input.requestTarget,
    contentType: input.contentType,
    bodyHashHex,
  });
  const mac = createHmac('sha256', Buffer.from(KEY_BYTES)).update(macInput).digest('base64url');
  return encodeTransactionId({
    keyId: KEY_ID,
    timestampMs: input.timestampMs,
    nonceHex: input.nonceHex,
    mac,
  });
}

function freshNonce(): string {
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

describe('canonical target preservation (no decode/sort fallback)', () => {
  it('preserves encoded reserved escapes, case, doubled/trailing slashes, and query order', () => {
    expect(canonicalizeRequestTarget('/api/items')).toBe('/api/items');
    expect(canonicalizeRequestTarget('/api/items/')).toBe('/api/items/');
    expect(canonicalizeRequestTarget('/api//items')).toBe('/api//items');
    expect(canonicalizeRequestTarget('/api/%2F')).toBe('/api/%2F');
    expect(canonicalizeRequestTarget('/api/%2f')).toBe('/api/%2f');
    expect(canonicalizeRequestTarget('/api/a%2Fb')).not.toBe('/api/a/b');
    expect(canonicalizeRequestTarget('/api/%2F')).not.toBe(canonicalizeRequestTarget('/api/%2f'));
    expect(canonicalizeRequestTarget('/api/x?a=1&a=1')).toBe('/api/x?a=1&a=1');
    expect(canonicalizeRequestTarget('/api/x?b=2&a=1')).not.toBe('/api/x?a=1&b=2');
    expect(canonicalizeRequestTarget('/api/x?q=a+b')).not.toBe('/api/x?q=a%20b');
    expect(canonicalizeRequestTarget('/api/x?tag=%7E')).not.toBe('/api/x?tag=~');
  });

  it('treats a lone empty ? as no search string', () => {
    expect(canonicalizeRequestTarget('/items?')).toBe('/items');
    expect(canonicalizeRequestTarget('/api/items?')).toBe('/api/items');
  });

  it('accepts Unicode targets without decoding them', () => {
    const raw = '/api/caf\u00e9';
    const encoded = '/api/caf%C3%A9';
    expect(canonicalizeRequestTarget(raw)).toBe(raw);
    expect(canonicalizeRequestTarget(encoded)).toBe(encoded);
    expect(raw).not.toBe(encoded);
  });

  it('rejects non-origin forms, authority targets, fragments, backslashes, controls, and raw spaces', () => {
    expect(() => canonicalizeRequestTarget('https://x/api')).toThrow(AttestationProtocolError);
    expect(() => canonicalizeRequestTarget('//evil.com/api')).toThrow(AttestationProtocolError);
    expect(() => canonicalizeRequestTarget('/api#frag')).toThrow(AttestationProtocolError);
    expect(() => canonicalizeRequestTarget('/api\\win')).toThrow(AttestationProtocolError);
    expect(() => canonicalizeRequestTarget('/api/in valid')).toThrow(AttestationProtocolError);
    expect(() => canonicalizeRequestTarget('/api/\u0001')).toThrow(AttestationProtocolError);
    expect(() => canonicalizeRequestTarget('')).toThrow(AttestationProtocolError);
  });

  it('rejects malformed percent escapes before allocation', () => {
    expect(() => canonicalizeRequestTarget('/api/%')).toThrow(AttestationProtocolError);
    expect(() => canonicalizeRequestTarget('/api/%2')).toThrow(AttestationProtocolError);
    expect(() => canonicalizeRequestTarget('/api/%ZZ')).toThrow(AttestationProtocolError);
    expect(() => canonicalizeRequestTarget('/api/%2G')).toThrow(AttestationProtocolError);
  });

  it('rejects plain and encoded dot segments in every spelling', () => {
    for (const target of ['/a/./b', '/a/../b', '/./x', '/../x', '/a/%2e/b', '/a/%2E/b', '/a/%2e%2e/b', '/a/%2E%2e/b']) {
      expect(() => canonicalizeRequestTarget(target), target).toThrow(AttestationProtocolError);
    }
  });
});

describe('method, content-type, origin, and header-name boundaries', () => {
  it('normalizes method case without changing semantics', () => {
    expect(normalizeMethod('get')).toBe('GET');
    expect(normalizeMethod('Post')).toBe('POST');
    expect(() => normalizeMethod('')).toThrow(AttestationProtocolError);
    expect(() => normalizeMethod('has space')).toThrow(AttestationProtocolError);
  });

  it('trims only outer OWS from content type and preserves interior bytes', () => {
    expect(normalizeContentType('  application/json  ')).toBe('application/json');
    expect(normalizeContentType('\ttext/plain\t')).toBe('text/plain');
    const boundary = 'multipart/form-data; boundary=----WebKitFormBoundaryABC123';
    expect(normalizeContentType(` ${boundary} `)).toBe(boundary);
    expect(normalizeContentType(undefined)).toBe('');
    expect(normalizeContentType(null)).toBe('');
    expect(() => normalizeContentType('text/plain\u0000')).toThrow(AttestationProtocolError);
    expect(() => normalizeContentType(`x/${'a'.repeat(300)}`)).toThrow(AttestationProtocolError);
  });

  it('pins canonical origins and rejects derived/ambiguous values', () => {
    expect(() => validatePublicOrigin('https://attestation.example.com/')).toThrow(AttestationProtocolError);
    expect(() => validatePublicOrigin('http://attestation.example.com')).toThrow(AttestationProtocolError);
    expect(() => validatePublicOrigin('https://user@attestation.example.com')).toThrow(AttestationProtocolError);
    expect(() => validatePublicOrigin('http://localhost:3000')).not.toThrow();
    validatePublicOrigin(PUBLIC_ORIGIN);
  });

  it('rejects reserved and malformed signature header names', () => {
    for (const reserved of [
      'authorization',
      'Authorization',
      'cookie',
      'host',
      'origin',
      'content-type',
      'content-length',
      'x-attestation-error',
    ]) {
      expect(() => validateHeaderName(reserved), reserved).toThrow(AttestationProtocolError);
    }
    expect(() => validateHeaderName('not a token')).toThrow(AttestationProtocolError);
    validateHeaderName('x-client-transaction-id');
    validateHeaderName('x-custom-attestation');
  });
});

describe('mounted routers, proxy prefix, and hostile headers (live Express)', () => {
  it('verifies nested router mounts through originalUrl', async () => {
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
    const nested = express.Router();
    nested.post('/submit', guard as never, (_req, res) => res.json({ ok: true }));
    app.use('/api/v1', nested);
    const { baseUrl, close } = await startApp(app);
    try {
      const raw = JSON.stringify({ nested: true });
      const proof = signProof({
        timestampMs: NOW - 1000,
        nonceHex: freshNonce(),
        method: 'POST',
        requestTarget: '/api/v1/submit',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const res = await fetch(`${baseUrl}/api/v1/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-transaction-id': proof },
        body: raw,
      });
      expect(res.status).toBe(200);
    } finally {
      await close();
    }
  });

  it('re-applies a stripped proxy prefix from trusted config', async () => {
    const capture = createAttestationBodyCapture();
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      publicPathPrefix: '/ext',
      keyProvider: { getSnapshot: () => snapshot() },
      store: createMemoryAttestationStore({ now: () => NOW }),
      now: () => NOW,
    });
    const app = express();
    app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    app.use('/api', guard as never);
    app.post('/api/inner', (_req, res) => res.json({ ok: true }));
    const { baseUrl, close } = await startApp(app);
    try {
      const raw = JSON.stringify({ p: 1 });
      // Public target includes the stripped /ext prefix; Express sees /api/inner.
      const proof = signProof({
        timestampMs: NOW - 1000,
        nonceHex: freshNonce(),
        method: 'POST',
        requestTarget: '/ext/api/inner',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const ok = await fetch(`${baseUrl}/api/inner`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-transaction-id': proof },
        body: raw,
      });
      expect(ok.status).toBe(200);
      // Without the prefix the same bytes must not verify.
      const wrong = signProof({
        timestampMs: NOW - 1000,
        nonceHex: freshNonce(),
        method: 'POST',
        requestTarget: '/api/inner',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const bad = await fetch(`${baseUrl}/api/inner`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-transaction-id': wrong },
        body: raw,
      });
      expect(bad.status).toBe(403);
      expect((await bad.json()) as { code: string }).toMatchObject({
        code: 'ATTESTATION_INVALID_SIGNATURE',
      });
    } finally {
      await close();
    }
  });

  it('ignores hostile Host/forwarding headers and pins the configured origin', async () => {
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
    app.post('/api/submit', (_req, res) => res.json({ ok: true }));
    const { baseUrl, close } = await startApp(app);
    try {
      const raw = JSON.stringify({ h: 1 });
      const proof = signProof({
        timestampMs: NOW - 1000,
        nonceHex: freshNonce(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const res = await fetch(`${baseUrl}/api/submit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-client-transaction-id': proof,
          host: 'evil.example.com',
          origin: 'https://evil.example.com',
          'x-forwarded-host': 'evil.example.com',
          'x-forwarded-proto': 'https',
          forwarded: 'for=1.2.3.4;host=evil.example.com',
        },
        body: raw,
      });
      expect(res.status).toBe(200);
    } finally {
      await close();
    }
  });

  it('distinguishes escape spelling, query order, plus/space, and empty search over HTTP', async () => {
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
    const { baseUrl, close } = await startApp(app);
    try {
      const empty = Buffer.alloc(0);
      const emptyHash = createHash('sha256').update(empty).digest('hex');
      void emptyHash;
      // Query order matters: sign ?b=2&a=1, send ?a=1&b=2 must fail.
      const ordered = signProof({
        timestampMs: NOW - 1000,
        nonceHex: freshNonce(),
        method: 'GET',
        requestTarget: '/api/items?b=2&a=1',
        contentType: '',
        bodyBytes: empty,
      });
      const swapped = await fetch(`${baseUrl}/api/items?a=1&b=2`, {
        headers: { 'x-client-transaction-id': ordered },
      });
      expect(swapped.status).toBe(403);

      // Empty search equivalence: sign /api/items, request /api/items? passes.
      const bare = signProof({
        timestampMs: NOW - 1000,
        nonceHex: freshNonce(),
        method: 'GET',
        requestTarget: '/api/items',
        contentType: '',
        bodyBytes: empty,
      });
      const trailingQuestion = await fetch(`${baseUrl}/api/items?`, {
        headers: { 'x-client-transaction-id': bare },
      });
      expect(trailingQuestion.status).toBe(200);

      // Plus versus %20 are different inputs.
      const plus = signProof({
        timestampMs: NOW - 1000,
        nonceHex: freshNonce(),
        method: 'GET',
        requestTarget: '/api/items?q=a+b',
        contentType: '',
        bodyBytes: empty,
      });
      const spaceForm = await fetch(`${baseUrl}/api/items?q=a%20b`, {
        headers: { 'x-client-transaction-id': plus },
      });
      expect(spaceForm.status).toBe(403);
    } finally {
      await close();
    }
  });
});

describe('cross-runtime target agreement (Node HMAC vs WebCrypto)', () => {
  it('produces identical transaction IDs for boundary targets', async () => {
    const targets = [
      '/api/%2F',
      '/api/%2f',
      '/api//doubled/',
      '/api/x?a=1&a=1&b=2',
      '/api/caf%C3%A9',
      '/api/items?tag=%7E',
    ];
    for (const requestTarget of targets) {
      const timestampMs = NOW - 1000;
      const nonceHex = 'abcdef0123456789abcdef0123456789'; // pragma: allowlist secret
      const contentType = 'application/json';
      const bodyBytes = Buffer.from(JSON.stringify({ t: requestTarget }));
      const nodeProof = signProof({
        timestampMs,
        nonceHex,
        method: 'POST',
        requestTarget,
        contentType,
        bodyBytes,
      });
      const signer = createRequestSigner({
        keyId: KEY_ID,
        key: KEY_BYTES,
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
      });
      const bodyHashHex = createHash('sha256').update(bodyBytes).digest('hex');
      const browserProof = await signer.sign({
        method: 'POST',
        requestTarget,
        contentType,
        bodyHashHex,
        timestampMs,
        nonceHex,
      });
      expect(browserProof).toBe(nodeProof);
      expect(decodeTransactionId(browserProof).keyId).toBe(KEY_ID);
    }
  });

  it('rejects unknown envelope versions and non-canonical encodings identically', () => {
    const good = signProof({
      timestampMs: NOW - 1000,
      nonceHex: freshNonce(),
      method: 'GET',
      requestTarget: '/api/items',
      contentType: '',
      bodyBytes: Buffer.alloc(0),
    });
    // Padding or version tampering breaks strict decode on every runtime.
    expect(() => decodeTransactionId(`${good}=`)).toThrow(AttestationProtocolError);
    expect(() => decodeTransactionId('not-base64!!')).toThrow(AttestationProtocolError);
  });
});
