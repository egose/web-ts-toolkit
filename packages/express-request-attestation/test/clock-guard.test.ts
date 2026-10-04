/**
 * ATT-09 lifetime alignment tests (task section 4.4).
 *
 * Proves one deadline formula everywhere: first admission, future-skew
 * proofs, exact expiry, key-retirement deadlines, slow async key/store
 * operations, and replay near the last accepted instant. Reservations
 * outlive every allowed admission window without sliding or clamping, and
 * async deadline crossings never execute a handler. Redis server-time parity
 * is owned by ATT-04 live lanes; here the shared policy plus memory behavior
 * demonstrate the same invariants without Docker.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';

import {
  buildMacInputBytes,
  checkRetentionAdmissible,
  createAttestationBodyCapture,
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  encodeTransactionId,
  evaluateProofTiming,
  maxStoreAdmissionMs,
  maxVerifierRemainingMs,
  resolveTimePolicy,
} from '../src/index.js';

const PUBLIC_ORIGIN = 'https://attestation.example.com';
const NAMESPACE = 'att-clock-tests';
const KEY_ID = 'clock-key-01';
const KEY_BYTES = Uint8Array.from(
  Buffer.from('e5f6a7b8c9d0e1f2a3b4c5d6e7f80910a1b2c3d4e5f60718293a4b5c6d7e8f90', 'hex'), // pragma: allowlist secret
);
const NOW = 1780000000000;

function snapshotFor(now: number, acceptUntil: number = now + 60000) {
  return {
    currentKeyId: KEY_ID,
    keys: [{ keyId: KEY_ID, key: KEY_BYTES, acceptFrom: now - 60000, acceptUntil }],
  };
}

function signProof(input: {
  timestampMs: number;
  nonceHex: string;
  method?: string;
  requestTarget?: string;
  contentType?: string;
  bodyBytes?: Uint8Array;
}): string {
  const bodyBytes = input.bodyBytes ?? Buffer.alloc(0);
  const bodyHashHex = createHash('sha256').update(bodyBytes).digest('hex');
  const macInput = buildMacInputBytes({
    replayNamespace: NAMESPACE,
    publicOrigin: PUBLIC_ORIGIN,
    keyId: KEY_ID,
    timestampMs: input.timestampMs,
    nonceHex: input.nonceHex,
    method: input.method ?? 'GET',
    requestTarget: input.requestTarget ?? '/api/items',
    contentType: input.contentType ?? '',
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

async function startApp(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

describe('single time formula (policy resolution and deadline arithmetic)', () => {
  it('resolves defaults and rejects unknown/widening options', () => {
    const policy = resolveTimePolicy();
    expect(policy).toEqual({ maxAgeMs: 30000, clockSkewMs: 5000, clusterClockGuardMs: 5000 });
    expect(() => resolveTimePolicy({ maxAgeMs: 999 } as never)).toThrow();
    expect(() => resolveTimePolicy({ unknown: 1 } as never)).toThrow();
  });

  it('computes proofDeadline as min(timeDeadline, acceptUntil) with guard retention', () => {
    const policy = resolveTimePolicy();
    const timestampMs = NOW - 10000;
    const timing = evaluateProofTiming({
      timestampMs,
      nowMs: NOW,
      acceptFrom: NOW - 60000,
      acceptUntil: NOW + 60000,
      policy,
    });
    expect(timing.decision).toBe('valid');
    expect(timing.timeDeadlineMs).toBe(timestampMs + 30000 + 5000);
    expect(timing.proofDeadlineMs).toBe(timestampMs + 30000 + 5000);
    expect(timing.retainUntilMs).toBe((timing.proofDeadlineMs as number) + 5000);
  });

  it('caps proofDeadline at key retirement even with a fresh timestamp', () => {
    const policy = resolveTimePolicy();
    const acceptUntil = NOW + 2000;
    const timing = evaluateProofTiming({
      timestampMs: NOW - 1000,
      nowMs: NOW,
      acceptFrom: NOW - 60000,
      acceptUntil,
      policy,
    });
    expect(timing.decision).toBe('valid');
    expect(timing.proofDeadlineMs).toBe(acceptUntil);
    expect(timing.retainUntilMs).toBe(acceptUntil + 5000);
  });

  it('enforces future-skew and exact-expiry boundaries', () => {
    const policy = resolveTimePolicy();
    const atSkew = evaluateProofTiming({
      timestampMs: NOW + 5000,
      nowMs: NOW,
      acceptFrom: NOW - 60000,
      acceptUntil: NOW + 60000,
      policy,
    });
    expect(atSkew.decision).toBe('valid');
    const pastSkew = evaluateProofTiming({
      timestampMs: NOW + 5001,
      nowMs: NOW,
      acceptFrom: NOW - 60000,
      acceptUntil: NOW + 60000,
      policy,
    });
    expect(pastSkew.decision).toBe('future');
    const timestampMs = NOW - 35000;
    const atExpiry = evaluateProofTiming({
      timestampMs,
      nowMs: timestampMs + 35000,
      acceptFrom: NOW - 60000,
      acceptUntil: NOW + 60000,
      policy,
    });
    expect(atExpiry.decision).toBe('expired');
    const beforeExpiry = evaluateProofTiming({
      timestampMs,
      nowMs: timestampMs + 35000 - 1,
      acceptFrom: NOW - 60000,
      acceptUntil: NOW + 60000,
      policy,
    });
    expect(beforeExpiry.decision).toBe('valid');
  });

  it('reports maximum remaining retention bounds (45000 verifier / 50000 store by default)', () => {
    const policy = resolveTimePolicy();
    expect(maxVerifierRemainingMs(policy)).toBe(45000);
    expect(maxStoreAdmissionMs(policy)).toBe(50000);
    expect(checkRetentionAdmissible({ retainUntilMs: NOW + 50000, nowMs: NOW, policy })).toBe('admissible');
    expect(checkRetentionAdmissible({ retainUntilMs: NOW + 50001, nowMs: NOW, policy })).toBe('overlong');
    expect(checkRetentionAdmissible({ retainUntilMs: NOW, nowMs: NOW, policy })).toBe('expired');
  });
});

describe('lifetime alignment across verifiers sharing one store', () => {
  it('admits once and rejects replays through the full retention window', async () => {
    let nowMs = NOW;
    const store = createMemoryAttestationStore({ now: () => nowMs });
    const capture = createAttestationBodyCapture();
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: { getSnapshot: () => snapshotFor(NOW) },
      store,
      now: () => nowMs,
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
      const nonceHex = randomBytes(16).toString('hex');
      const proof = signProof({ timestampMs: NOW, nonceHex });
      const first = await fetch(`${baseUrl}/api/items`, {
        headers: { 'x-client-transaction-id': proof },
      });
      expect(first.status).toBe(200);
      expect(calls).toBe(1);
      // Replay near the end of validity (still within retention) stays rejected.
      nowMs = NOW + 20000;
      const replay = await fetch(`${baseUrl}/api/items`, {
        headers: { 'x-client-transaction-id': proof },
      });
      expect(replay.status).toBe(403);
      expect(((await replay.json()) as { code: string }).code).toBe('ATTESTATION_REPLAY');
      expect(calls).toBe(1);
      // After retention elapses the store reports expired, but the old proof
      // still fails verifier age rules (never silently accepted).
      nowMs = NOW + 45000;
      const late = await fetch(`${baseUrl}/api/items`, {
        headers: { 'x-client-transaction-id': proof },
      });
      expect(late.status).toBe(403);
      expect(calls).toBe(1);
    } finally {
      await close();
    }
  });

  it('keeps two verifiers at opposite guard edges from dropping live state early', async () => {
    const policy = resolveTimePolicy();
    const timestampMs = NOW;
    const acceptFrom = NOW - 60000;
    const acceptUntil = NOW + 60000;
    const early = evaluateProofTiming({
      timestampMs,
      nowMs: NOW,
      acceptFrom,
      acceptUntil,
      policy,
    });
    const late = evaluateProofTiming({
      timestampMs,
      nowMs: NOW + 5000,
      acceptFrom,
      acceptUntil,
      policy,
    });
    // Both guard-edge clocks still accept; retention covers the later deadline.
    expect(early.decision).toBe('valid');
    expect(late.decision).toBe('valid');
    expect(early.retainUntilMs).toBe(late.retainUntilMs);
    // Store admission at the later clock remains within the shared bound.
    expect(
      checkRetentionAdmissible({
        retainUntilMs: early.retainUntilMs as number,
        nowMs: NOW + 5000,
        policy,
      }),
    ).toBe('admissible');
  });

  it('rejects slow async provider crossings before reservation without handler execution', async () => {
    let nowMs = NOW;
    const now = () => nowMs;
    const inner = createMemoryAttestationStore({ now: () => NOW });
    const reserveSpy = vi.fn(async (input: { replayKey: string; retainUntilMs: number }) => inner.reserve(input));
    const provider = {
      getSnapshot: async () => {
        // Simulate a slow KMS read that crosses the 30s+5s deadline.
        nowMs = NOW + 40000;
        return snapshotFor(NOW);
      },
    };
    const capture = createAttestationBodyCapture();
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: provider,
      store: { reserve: reserveSpy } as never,
      now,
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
      const proof = signProof({ timestampMs: NOW, nonceHex: randomBytes(16).toString('hex') });
      const res = await fetch(`${baseUrl}/api/items`, {
        headers: { 'x-client-transaction-id': proof },
      });
      expect(res.status).toBe(403);
      expect(calls).toBe(0);
      expect(reserveSpy).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it('never executes a handler when the store settles after proof expiry', async () => {
    let nowMs = NOW;
    const inner = createMemoryAttestationStore({ now: () => NOW });
    const store = {
      reserve: async (input: { replayKey: string; retainUntilMs: number }) => {
        // Store delay pushes the verifier past the proof deadline.
        nowMs = (input.retainUntilMs as number) + 1000;
        return inner.reserve(input);
      },
    };
    const capture = createAttestationBodyCapture();
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: { getSnapshot: () => snapshotFor(NOW) },
      store: store as never,
      now: () => nowMs,
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
      const proof = signProof({
        timestampMs: NOW - 34000,
        nonceHex: randomBytes(16).toString('hex'),
      });
      const res = await fetch(`${baseUrl}/api/items`, {
        headers: { 'x-client-transaction-id': proof },
      });
      expect(res.status).toBe(403);
      expect(calls).toBe(0);
    } finally {
      await close();
    }
  });

  it('does not slide expiry on duplicate and never clamps overlong retention', async () => {
    let nowMs = NOW;
    const store = createMemoryAttestationStore({ now: () => nowMs });
    const firstKey = 'att:v1:' + 'a'.repeat(64);
    const firstRetain = NOW + 10000;
    expect(await store.reserve({ replayKey: firstKey, retainUntilMs: firstRetain })).toBe('reserved');
    // Duplicate with a later deadline does not extend state.
    expect(await store.reserve({ replayKey: firstKey, retainUntilMs: NOW + 20000 })).toBe('duplicate');
    nowMs = NOW + 10001;
    // After the original deadline the key is reservable again for a fresh proof.
    expect(await store.reserve({ replayKey: firstKey, retainUntilMs: nowMs + 10000 })).toBe('reserved');
    // Overlong retention is rejected, not truncated.
    await expect(
      store.reserve({ replayKey: `att:v1:${'b'.repeat(64)}`, retainUntilMs: nowMs + 240001 }),
    ).rejects.toThrow();
  });
});
