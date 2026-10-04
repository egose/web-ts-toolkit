/**
 * ATT-02 verification-order tests: spy + handler-counter proofs that signature
 * validity and time checks succeed before replay allocation, handlers run only
 * after successful reservation + final deadline check, and timeout/uncertainty
 * semantics never execute, fall back, or release.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';

import {
  buildMacInputBytes,
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  encodeTransactionId,
} from '../src/index.js';
import type { AttestationKeySnapshot } from '../src/index.js';

const PUBLIC_ORIGIN = 'https://attestation.example.com';
const NAMESPACE = 'att-order-tests';
const KEY_ID = 'order-key-01';
const KEY_BYTES = Uint8Array.from(
  Buffer.from('e5f6a7b8c9d0e1f2a3b4c5d6e7f80910a1b2c3d4e5f60718293a4b5c6d7e8f90', 'hex'), // pragma: allowlist secret
);
const NOW = 1780000000000;

function snapshotFor(now: number): AttestationKeySnapshot {
  return {
    currentKeyId: KEY_ID,
    keys: [{ keyId: KEY_ID, key: KEY_BYTES, acceptFrom: now - 60000, acceptUntil: now + 60000 }],
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
  return encodeTransactionId({ keyId: KEY_ID, timestampMs: input.timestampMs, nonceHex: input.nonceHex, mac });
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

interface OrderHarness {
  baseUrl: string;
  close: () => Promise<void>;
  handlerCalls: () => number;
  reserveSpy: ReturnType<typeof vi.fn>;
}

async function setupOrderHarness(options?: {
  now?: () => number;
  providerDelayMs?: number;
  storeDelayMs?: number;
  storeHang?: boolean;
  providerHang?: boolean;
  operationTimeoutMs?: number;
  maxAgeMs?: number;
  handlerThrows?: boolean;
}): Promise<OrderHarness> {
  const capture = createAttestationBodyCapture();
  const nowValue = NOW;
  const now = options?.now ?? (() => nowValue);
  const providerSnapshot = snapshotFor(NOW);
  const provider = {
    getSnapshot: async () => {
      if (options?.providerHang === true) {
        await new Promise(() => {});
      }
      if (options?.providerDelayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, options.providerDelayMs));
      }
      return providerSnapshot;
    },
  };
  const inner = createMemoryAttestationStore({ now: () => NOW });
  const reserveSpy = vi.fn(async (input: { replayKey: string; retainUntilMs: number }) => {
    if (options?.storeHang === true) {
      await new Promise(() => {});
    }
    if (options?.storeDelayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, options.storeDelayMs));
    }
    return inner.reserve(input);
  });
  const store = { reserve: reserveSpy };
  let handlerCalls = 0;
  const guard = createRequestAttestationMiddleware({
    publicOrigin: PUBLIC_ORIGIN,
    replayNamespace: NAMESPACE,
    keyProvider: provider,
    store: store as never,
    now,
    ...(options?.operationTimeoutMs === undefined ? {} : { operationTimeoutMs: options.operationTimeoutMs }),
    ...(options?.maxAgeMs === undefined ? {} : { maxAgeMs: options.maxAgeMs }),
  });
  const app = express();
  app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
  app.use(capture.errorHandler as never);
  app.use('/api', guard as never);
  app.post('/api/work', (_req, res) => {
    handlerCalls += 1;
    if (options?.handlerThrows === true) {
      throw new Error('handler boom');
    }
    res.json({ ok: true, calls: handlerCalls });
  });
  // Application error boundary (proves post-handler exceptions are app
  // errors, not attestation failures carrying the stale marker).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ code: 'APP_HANDLER_FAILED' });
  });
  const { baseUrl, close } = await startApp(app);
  return { baseUrl, close, handlerCalls: () => handlerCalls, reserveSpy };
}

describe('verify-before-reserve order (spy + handler counter)', () => {
  it('never calls reserve for invalid signatures and never runs the handler', async () => {
    const harness = await setupOrderHarness();
    try {
      const raw = JSON.stringify({ a: 1 });
      const good = signProof({
        timestampMs: NOW - 5000,
        nonceHex: randomBytes(16).toString('hex'),
        method: 'POST',
        requestTarget: '/api/work',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const bad = `${good.slice(0, -1)}${good.slice(-1) === 'A' ? 'B' : 'A'}`;
      const response = await fetch(`${harness.baseUrl}/api/work`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-transaction-id': bad },
        body: raw,
      });
      expect(response.status).toBe(403);
      expect(harness.reserveSpy).not.toHaveBeenCalled();
      expect(harness.handlerCalls()).toBe(0);
    } finally {
      await harness.close();
    }
  });

  it('reserves exactly once for a valid proof then runs the handler once', async () => {
    const harness = await setupOrderHarness();
    try {
      const raw = JSON.stringify({ a: 1 });
      const header = signProof({
        timestampMs: NOW - 5000,
        nonceHex: randomBytes(16).toString('hex'),
        method: 'POST',
        requestTarget: '/api/work',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const response = await fetch(`${harness.baseUrl}/api/work`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-transaction-id': header },
        body: raw,
      });
      expect(response.status).toBe(200);
      expect(harness.reserveSpy).toHaveBeenCalledTimes(1);
      expect(harness.handlerCalls()).toBe(1);
    } finally {
      await harness.close();
    }
  });

  it('admits one winner for concurrent identical proofs', async () => {
    const harness = await setupOrderHarness();
    try {
      const raw = JSON.stringify({ race: true });
      const nonceHex = randomBytes(16).toString('hex');
      const header = signProof({
        timestampMs: NOW - 5000,
        nonceHex,
        method: 'POST',
        requestTarget: '/api/work',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const attempts = await Promise.all(
        Array.from({ length: 8 }, () =>
          fetch(`${harness.baseUrl}/api/work`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-client-transaction-id': header },
            body: raw,
          }),
        ),
      );
      const statuses = attempts.map((response) => response.status);
      expect(statuses.filter((status) => status === 200)).toHaveLength(1);
      expect(statuses.filter((status) => status === 403)).toHaveLength(7);
      for (const response of attempts) {
        if (response.status === 403) {
          expect(((await response.json()) as { code: string }).code).toBe('ATTESTATION_REPLAY');
        } else {
          await response.json();
        }
      }
      expect(harness.handlerCalls()).toBe(1);
    } finally {
      await harness.close();
    }
  });

  it('still replays after a handler exception (reservation is never released)', async () => {
    const harness = await setupOrderHarness({ handlerThrows: true });
    try {
      const raw = JSON.stringify({ a: 1 });
      const header = signProof({
        timestampMs: NOW - 5000,
        nonceHex: randomBytes(16).toString('hex'),
        method: 'POST',
        requestTarget: '/api/work',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const first = await fetch(`${harness.baseUrl}/api/work`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-transaction-id': header },
        body: raw,
      });
      expect(first.status).toBe(500);
      expect(((await first.json()) as { code: string }).code).toBe('APP_HANDLER_FAILED');
      expect(harness.handlerCalls()).toBe(1);
      const second = await fetch(`${harness.baseUrl}/api/work`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-transaction-id': header },
        body: raw,
      });
      expect(second.status).toBe(403);
      expect(((await second.json()) as { code: string }).code).toBe('ATTESTATION_REPLAY');
      expect(second.headers.get('x-attestation-error')).toBeNull();
      expect(harness.handlerCalls()).toBe(1);
    } finally {
      await harness.close();
    }
  });

  it('admits independent fresh proofs when capacity permits', async () => {
    const harness = await setupOrderHarness();
    try {
      for (let index = 0; index < 3; index += 1) {
        const raw = JSON.stringify({ index });
        const header = signProof({
          timestampMs: NOW - 5000,
          nonceHex: randomBytes(16).toString('hex'),
          method: 'POST',
          requestTarget: '/api/work',
          contentType: 'application/json',
          bodyBytes: Buffer.from(raw),
        });
        const response = await fetch(`${harness.baseUrl}/api/work`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-client-transaction-id': header },
          body: raw,
        });
        expect(response.status).toBe(200);
        await response.json();
      }
      expect(harness.handlerCalls()).toBe(3);
    } finally {
      await harness.close();
    }
  });
});

describe('async deadline crossing', () => {
  it('a provider delay crossing the deadline cannot reserve or execute', async () => {
    let mutableNow = NOW;
    const capture = createAttestationBodyCapture();
    const providerSnapshot = snapshotFor(NOW);
    const innerStore = createMemoryAttestationStore({ now: () => NOW });
    const countingReserve = vi.fn((input: { replayKey: string; retainUntilMs: number }) => innerStore.reserve(input));
    const provider = {
      getSnapshot: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        // Time elapses while awaiting the provider: the proof expires.
        mutableNow = NOW + 60000;
        return providerSnapshot;
      },
    };
    let handlerCalls = 0;
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: provider,
      store: { reserve: countingReserve } as never,
      now: () => mutableNow,
    });
    const app = express();
    app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    app.use('/api', guard as never);
    app.post('/api/work', (_req, res) => {
      handlerCalls += 1;
      res.json({ ok: true });
    });
    const { baseUrl, close } = await startApp(app);
    try {
      const raw = JSON.stringify({ a: 1 });
      const header = signProof({
        timestampMs: NOW - 5000,
        nonceHex: randomBytes(16).toString('hex'),
        method: 'POST',
        requestTarget: '/api/work',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const response = await fetch(`${baseUrl}/api/work`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-transaction-id': header },
        body: raw,
      });
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { code: string };
      expect(['ATTESTATION_EXPIRED', 'ATTESTATION_STALE_KEY']).toContain(payload.code);
      expect(countingReserve).not.toHaveBeenCalled();
      expect(handlerCalls).toBe(0);
    } finally {
      await close();
    }
  });

  it('a store delay crossing the deadline cannot execute and never releases', async () => {
    let mutableNow = NOW;
    const capture = createAttestationBodyCapture();
    const innerStore = createMemoryAttestationStore({ now: () => mutableNow });
    let handlerCalls = 0;
    const delayedStore = {
      reserve: async (input: { replayKey: string; retainUntilMs: number }) => {
        const result = await innerStore.reserve(input);
        // Simulate store latency during which the proof deadline passes.
        await new Promise((resolve) => setTimeout(resolve, 30));
        mutableNow = NOW + 60000;
        return result;
      },
    };
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: { getSnapshot: () => snapshotFor(NOW) },
      store: delayedStore as never,
      now: () => mutableNow,
    });
    const app = express();
    app.use(express.json({ limit: 1024 * 1024, verify: capture.verify as never, inflate: false }));
    app.use(capture.errorHandler as never);
    app.use('/api', guard as never);
    app.post('/api/work', (_req, res) => {
      handlerCalls += 1;
      res.json({ ok: true });
    });
    const { baseUrl, close } = await startApp(app);
    try {
      const raw = JSON.stringify({ a: 1 });
      const nonceHex = randomBytes(16).toString('hex');
      const header = signProof({
        timestampMs: NOW - 5000,
        nonceHex,
        method: 'POST',
        requestTarget: '/api/work',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const response = await fetch(`${baseUrl}/api/work`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-transaction-id': header },
        body: raw,
      });
      expect(response.status).toBe(403);
      expect(handlerCalls).toBe(0);
      // The committed reservation is retained: a direct re-reserve with the
      // same key reports duplicate while its retention lives.
      mutableNow = NOW;
      const { deriveAttestationReplayKey } = await import('../src/index.js');
      const replayKey = deriveAttestationReplayKey({
        replayNamespace: NAMESPACE,
        publicOrigin: PUBLIC_ORIGIN,
        nonceHex,
      });
      const direct = await innerStore.reserve({ replayKey, retainUntilMs: NOW + 10000 });
      expect(direct).toBe('duplicate');
    } finally {
      await close();
    }
  });
});

describe('uncertain timeouts', () => {
  it('an uncertain store timeout never calls next, falls back, or releases', async () => {
    const harness = await setupOrderHarness({ storeHang: true, operationTimeoutMs: 30 });
    try {
      const raw = JSON.stringify({ a: 1 });
      const header = signProof({
        timestampMs: NOW - 5000,
        nonceHex: randomBytes(16).toString('hex'),
        method: 'POST',
        requestTarget: '/api/work',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const response = await fetch(`${harness.baseUrl}/api/work`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-transaction-id': header },
        body: raw,
      });
      expect(response.status).toBe(503);
      expect(((await response.json()) as { code: string }).code).toBe('ATTESTATION_REPLAY_UNAVAILABLE');
      expect(harness.handlerCalls()).toBe(0);
      // Late hanging settlement cannot resume: still no handler after waiting
      // past the original hang.
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(harness.handlerCalls()).toBe(0);
    } finally {
      await harness.close();
    }
  });

  it('a late store success after the timeout still never executes the handler', async () => {
    const harness = await setupOrderHarness({ storeDelayMs: 120, operationTimeoutMs: 25 });
    try {
      const raw = JSON.stringify({ a: 1 });
      const header = signProof({
        timestampMs: NOW - 5000,
        nonceHex: randomBytes(16).toString('hex'),
        method: 'POST',
        requestTarget: '/api/work',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const response = await fetch(`${harness.baseUrl}/api/work`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-transaction-id': header },
        body: raw,
      });
      expect(response.status).toBe(503);
      expect(harness.handlerCalls()).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(harness.handlerCalls()).toBe(0);
    } finally {
      await harness.close();
    }
  });

  it('an uncertain provider timeout returns KEYS_UNAVAILABLE without reserving', async () => {
    const harness = await setupOrderHarness({ providerHang: true, operationTimeoutMs: 30 });
    try {
      const raw = JSON.stringify({ a: 1 });
      const header = signProof({
        timestampMs: NOW - 5000,
        nonceHex: randomBytes(16).toString('hex'),
        method: 'POST',
        requestTarget: '/api/work',
        contentType: 'application/json',
        bodyBytes: Buffer.from(raw),
      });
      const response = await fetch(`${harness.baseUrl}/api/work`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-transaction-id': header },
        body: raw,
      });
      expect(response.status).toBe(503);
      expect(((await response.json()) as { code: string }).code).toBe('ATTESTATION_KEYS_UNAVAILABLE');
      expect(harness.reserveSpy).not.toHaveBeenCalled();
      expect(harness.handlerCalls()).toBe(0);
    } finally {
      await harness.close();
    }
  });
});
