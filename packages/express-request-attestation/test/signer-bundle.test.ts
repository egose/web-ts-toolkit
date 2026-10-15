/**
 * ATT-05 signer-bundle router tests (task sections 4.1/4.6).
 *
 * Covers immutable content-addressed assets, metadata for the current active
 * key with old-module overlap, retired/unknown 404/410 without redirects or
 * unbounded caches, malformed payloads, header/cap discipline, trusted URL
 * construction, and signatures from HTTP-served modules accepted by ATT-02
 * (Node import for the public-material boundary plus real Chromium via
 * Playwright for genuine browser module execution).
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { chromium } from 'playwright';
import { describe, expect, it, vi } from 'vitest';

import {
  AttestationError,
  buildMacInputBytes,
  createMemoryAttestationStore,
  createRequestAttestationMiddleware,
  createRotatingKeyProvider,
  createSignerBundleRouter,
  createStaticKeyProvider,
  encodeTransactionId,
} from '../src/index.js';
import type { AttestationKeySnapshot } from '../src/index.js';
import {
  SIGNER_KEY_MODULE_BYTE_CAP,
  SIGNER_RUNTIME_BYTE_CAP,
  buildSignerKeyModuleSource,
  getSignerKeyModuleAsset,
  getSignerRuntimeAsset,
} from '../src/signer-assets.js';

const PUBLIC_ORIGIN = 'https://attestation.example.com';
const NAMESPACE = 'att-bundle-tests';
const NOW = 1780000000000;
const KEYS_UNAVAILABLE_PAYLOAD = {
  code: 'ATTESTATION_KEYS_UNAVAILABLE',
  message: 'Request signing keys are unavailable.',
};
const INTERNAL_ERROR_PAYLOAD = {
  code: 'ATTESTATION_INTERNAL_ERROR',
  message: 'Request signature verification failed.',
};

function keyBytes(fill: number): Uint8Array {
  const out = new Uint8Array(32);
  out.fill(fill);
  return out;
}

function nonceHex(): string {
  return randomBytes(16).toString('hex');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function expectOperationalFailure(
  response: Response,
  status: number,
  payload: { code: string; message: string },
): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-attestation-error')).toBeNull();
  expect(response.headers.get('location')).toBeNull();
  expect(await response.json()).toEqual(payload);
}

function signWithNode(input: {
  keyId: string;
  key: Uint8Array;
  timestampMs: number;
  nonce: string;
  method: string;
  requestTarget: string;
  contentType: string;
  bodyHashHex: string;
}): string {
  const macInput = buildMacInputBytes({
    replayNamespace: NAMESPACE,
    publicOrigin: PUBLIC_ORIGIN,
    keyId: input.keyId,
    timestampMs: input.timestampMs,
    nonceHex: input.nonce,
    method: input.method,
    requestTarget: input.requestTarget,
    contentType: input.contentType,
    bodyHashHex: input.bodyHashHex,
  });
  const mac = createHmac('sha256', Buffer.from(input.key)).update(macInput).digest('base64url');
  return encodeTransactionId({
    keyId: input.keyId,
    timestampMs: input.timestampMs,
    nonceHex: input.nonce,
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

describe('signer asset hashing and module shape', () => {
  it('hashes complete bytes; same content always produces the same hash', () => {
    const runtime = getSignerRuntimeAsset();
    expect(runtime.bytes.length).toBeGreaterThan(0);
    expect(runtime.bytes.length).toBeLessThanOrEqual(SIGNER_RUNTIME_BYTE_CAP);
    expect(runtime.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(runtime.fileName).toBe(`runtime.${runtime.contentHash}.mjs`);
    // Hash is over complete runtime bytes.
    expect(createHash('sha256').update(runtime.bytes).digest('hex')).toBe(runtime.contentHash);

    const entry = { keyId: 'hash-01', key: keyBytes(1), acceptFrom: NOW - 60000, acceptUntil: NOW + 60000 };
    const first = getSignerKeyModuleAsset({
      entry,
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      runtimeFileName: runtime.fileName,
    });
    const second = getSignerKeyModuleAsset({
      entry,
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      runtimeFileName: runtime.fileName,
    });
    expect(first.contentHash).toBe(second.contentHash);
    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(true);
    expect(first.bytes.length).toBeLessThanOrEqual(SIGNER_KEY_MODULE_BYTE_CAP);
    expect(first.fileName).toBe(`signer.${first.contentHash}.mjs`);
    expect(createHash('sha256').update(first.bytes).digest('hex')).toBe(first.contentHash);
  });

  it('embeds key bytes with a safe literal and a single relative runtime import', () => {
    const runtime = getSignerRuntimeAsset();
    const source = buildSignerKeyModuleSource({
      keyId: 'shape-01',
      key: keyBytes(2),
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      runtimeFileName: runtime.fileName,
    });
    expect(source).toContain(`from ${JSON.stringify(`./${runtime.fileName}`)}`);
    expect(source).not.toMatch(/from\s+["']@web-ts-toolkit/);
    expect(source).not.toMatch(/from\s+["']express["']/);
    expect(source).toContain('export const signer = createRequestSigner({');
    expect(source).toContain(`keyId: ${JSON.stringify('shape-01')}`);
    expect(source).toContain(`publicOrigin: ${JSON.stringify(PUBLIC_ORIGIN)}`);
    expect(source).toContain(`replayNamespace: ${JSON.stringify(NAMESPACE)}`);
    expect(source).not.toContain('signSource');
    expect(source).not.toContain('eval(');
    expect(source).not.toContain('new Function');
    // Key bytes as a canonical JSON number array (safe serializer).
    expect(source).toContain(JSON.stringify(Array.from(keyBytes(2))));
  });
});

describe('signer bundle router over HTTP', () => {
  it('serves metadata for the current active key with old-module overlap', async () => {
    const oldKey = keyBytes(11);
    const newKey = keyBytes(12);
    const provider = createStaticKeyProvider({
      currentKeyId: 'new-01',
      keys: [
        { keyId: 'old-01', key: oldKey, acceptFrom: NOW - 60000, acceptUntil: NOW + 60000 },
        { keyId: 'new-01', key: newKey, acceptFrom: NOW - 1000, acceptUntil: NOW + 120000 },
      ],
    });
    const app = express();
    app.use(
      '/attestation',
      createSignerBundleRouter({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: provider,
        basePath: '/attestation',
        now: () => NOW,
      }),
    );
    const { baseUrl, close } = await startApp(app);
    try {
      const metaRes = await fetch(`${baseUrl}/attestation/signer-meta`, { redirect: 'manual' });
      expect(metaRes.status).toBe(200);
      expect(metaRes.headers.get('cache-control')).toContain('no-store');
      expect(metaRes.headers.get('content-type')).toContain('application/json');
      const meta = (await metaRes.json()) as {
        version: number;
        keyId: string;
        signerUrl: string;
        publicOrigin: string;
        replayNamespace: string;
      };
      expect(meta.version).toBe(1);
      expect(meta.keyId).toBe('new-01');
      expect(meta.publicOrigin).toBe(PUBLIC_ORIGIN);
      expect(meta.replayNamespace).toBe(NAMESPACE);
      expect(meta.signerUrl.startsWith(`${PUBLIC_ORIGIN}/attestation/signer.`)).toBe(true);
      expect(meta.signerUrl.endsWith('.mjs')).toBe(true);
      const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
      expect(metaBytes.length).toBeLessThanOrEqual(4096);

      // Current module is served immutable with correct MIME/nosniff.
      const signerPath = new URL(meta.signerUrl).pathname;
      const keyRes = await fetch(`${baseUrl}${signerPath}`, { redirect: 'manual' });
      expect(keyRes.status).toBe(200);
      expect(keyRes.headers.get('cache-control')).toContain('immutable');
      expect(keyRes.headers.get('content-type')).toContain('text/javascript');
      expect(keyRes.headers.get('x-content-type-options')).toBe('nosniff');
      expect(keyRes.headers.get('location')).toBeNull();
      const keyText = await keyRes.text();
      expect(keyText).toContain('export const signer');

      // Old module remains usable during overlap (same router, old hash).
      const runtime = getSignerRuntimeAsset();
      const oldAsset = getSignerKeyModuleAsset({
        entry: { keyId: 'old-01', key: oldKey, acceptFrom: NOW - 60000, acceptUntil: NOW + 60000 },
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        runtimeFileName: runtime.fileName,
      });
      const oldRes = await fetch(`${baseUrl}/attestation/${oldAsset.fileName}`, { redirect: 'manual' });
      expect(oldRes.status).toBe(200);
      expect((await oldRes.text()).length).toBeGreaterThan(0);

      // Runtime asset is served immutable.
      const runtimeRes = await fetch(`${baseUrl}/attestation/${runtime.fileName}`, { redirect: 'manual' });
      expect(runtimeRes.status).toBe(200);
      expect(runtimeRes.headers.get('cache-control')).toContain('immutable');
      expect(runtimeRes.headers.get('x-content-type-options')).toBe('nosniff');
      expect(await runtimeRes.text()).toContain('createRequestSigner');
    } finally {
      await close();
    }
  });

  it('returns controlled 404/410 for retired, unknown, and malformed assets', async () => {
    const provider = createRotatingKeyProvider({
      currentKeyId: 'live-01',
      keys: [{ keyId: 'live-01', key: keyBytes(21), acceptFrom: NOW - 60000, acceptUntil: NOW + 60000 }],
    });
    const app = express();
    app.use(
      '/attestation',
      createSignerBundleRouter({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: provider,
        now: () => NOW,
      }),
    );
    const { baseUrl, close } = await startApp(app);
    try {
      // Unknown but well-formed hash: 410 (retired/unknown), no redirect.
      const unknownRes = await fetch(`${baseUrl}/attestation/signer.${'a'.repeat(64)}.mjs`, { redirect: 'manual' });
      expect(unknownRes.status).toBe(410);
      expect(unknownRes.headers.get('location')).toBeNull();
      expect(unknownRes.headers.get('cache-control')).toContain('no-store');

      const unknownRuntime = await fetch(`${baseUrl}/attestation/runtime.${'b'.repeat(64)}.mjs`, {
        redirect: 'manual',
      });
      expect(unknownRuntime.status).toBe(410);

      // Malformed hashes: 404, no redirect, no state change.
      for (const bad of [
        '/attestation/signer.nothex.mjs',
        '/attestation/signer.abc.mjs',
        '/attestation/signer..mjs',
        '/attestation/runtime.nothex.mjs',
        '/attestation/signer-meta-extra',
      ]) {
        const res = await fetch(`${baseUrl}${bad}`, { redirect: 'manual' });
        expect([404, 410]).toContain(res.status);
        expect(res.headers.get('location')).toBeNull();
      }

      // Retire live-01 by replacing with live-02 only.
      provider.replace({
        currentKeyId: 'live-02',
        keys: [{ keyId: 'live-02', key: keyBytes(22), acceptFrom: NOW - 1000, acceptUntil: NOW + 60000 }],
      });
      const runtime = getSignerRuntimeAsset();
      const retiredAsset = getSignerKeyModuleAsset({
        entry: { keyId: 'live-01', key: keyBytes(21), acceptFrom: NOW - 60000, acceptUntil: NOW + 60000 },
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        runtimeFileName: runtime.fileName,
      });
      const retiredRes = await fetch(`${baseUrl}/attestation/${retiredAsset.fileName}`, {
        redirect: 'manual',
      });
      expect(retiredRes.status).toBe(410);

      // Discovery during replacement still serves the new current.
      const metaRes = await fetch(`${baseUrl}/attestation/signer-meta`);
      expect(metaRes.status).toBe(200);
      const meta = (await metaRes.json()) as { keyId: string };
      expect(meta.keyId).toBe('live-02');
    } finally {
      await close();
    }
  });

  it.each([
    { basePath: '/', publicPathPrefix: '', externalPath: '' },
    { basePath: '/', publicPathPrefix: '/prefix', externalPath: '/prefix' },
    { basePath: '/custom', publicPathPrefix: '', externalPath: '/custom' },
    { basePath: '/custom', publicPathPrefix: '/prefix', externalPath: '/prefix/custom' },
  ])(
    'serves published signer and relative runtime URLs at basePath=$basePath, prefix=$publicPathPrefix',
    async ({ basePath, publicPathPrefix, externalPath }) => {
      const entry = { keyId: 'url-01', key: keyBytes(31), acceptFrom: NOW - 1000, acceptUntil: NOW + 60000 };
      const provider = createStaticKeyProvider({ currentKeyId: entry.keyId, keys: [entry] });
      const app = express();
      app.use(
        basePath,
        createSignerBundleRouter({
          publicOrigin: PUBLIC_ORIGIN,
          replayNamespace: NAMESPACE,
          keyProvider: provider,
          basePath,
          publicPathPrefix,
          now: () => NOW,
        }),
      );
      // Model an upstream stripping the external prefix before the application's
      // own relative mount. Fetch the published external paths through it.
      const upstream = express();
      upstream.use(publicPathPrefix || '/', app);
      const { baseUrl, close } = await startApp(upstream);
      try {
        const metaRes = await fetch(`${baseUrl}${externalPath}/signer-meta`, {
          redirect: 'manual',
          headers: {
            host: 'untrusted.example',
            forwarded: 'host=untrusted.example;proto=http',
            'x-forwarded-host': 'untrusted.example',
            'x-forwarded-proto': 'http',
            'x-forwarded-prefix': '/untrusted',
          },
        });
        expect(metaRes.status).toBe(200);
        expect(metaRes.headers.get('cache-control')).toBe('no-store');
        expect(metaRes.headers.get('location')).toBeNull();
        const meta = (await metaRes.json()) as { signerUrl: string };
        const runtime = getSignerRuntimeAsset();
        const keyAsset = getSignerKeyModuleAsset({
          entry,
          publicOrigin: PUBLIC_ORIGIN,
          replayNamespace: NAMESPACE,
          runtimeFileName: runtime.fileName,
        });
        expect.soft(meta).toEqual({
          version: 1,
          keyId: entry.keyId,
          signerUrl: `${PUBLIC_ORIGIN}${externalPath}/${keyAsset.fileName}`,
          publicOrigin: PUBLIC_ORIGIN,
          replayNamespace: NAMESPACE,
        });
        expect(Buffer.byteLength(JSON.stringify(meta))).toBeLessThanOrEqual(4096);

        const keyRes = await fetch(`${baseUrl}${new URL(meta.signerUrl).pathname}`, { redirect: 'manual' });
        expect(keyRes.status).toBe(200);
        expect(keyRes.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
        expect(keyRes.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
        expect(keyRes.headers.get('x-content-type-options')).toBe('nosniff');
        expect(keyRes.headers.get('location')).toBeNull();
        expect(keyRes.headers.get('access-control-allow-origin')).toBeNull();
        const keyBody = Buffer.from(await keyRes.arrayBuffer());
        expect(keyBody.equals(Buffer.from(keyAsset.bytes))).toBe(true);
        const keyHash = createHash('sha256').update(keyBody).digest('hex');
        expect(new URL(meta.signerUrl).pathname).toBe(`${externalPath}/signer.${keyHash}.mjs`);

        // Resolve the actual served import, rather than assuming a runtime URL.
        const specifier = /from "(\.\/runtime\.[0-9a-f]{64}\.mjs)"/.exec(keyBody.toString('utf8'))?.[1];
        expect(specifier).toBe(`./${runtime.fileName}`);
        const runtimeUrl = new URL(specifier as string, meta.signerUrl);
        expect(runtimeUrl.href).toBe(`${PUBLIC_ORIGIN}${externalPath}/${runtime.fileName}`);
        const runtimeRes = await fetch(`${baseUrl}${runtimeUrl.pathname}`, { redirect: 'manual' });
        expect(runtimeRes.status).toBe(200);
        expect(runtimeRes.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
        expect(runtimeRes.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
        expect(runtimeRes.headers.get('x-content-type-options')).toBe('nosniff');
        expect(runtimeRes.headers.get('location')).toBeNull();
        expect(runtimeRes.headers.get('access-control-allow-origin')).toBeNull();
        const runtimeBody = Buffer.from(await runtimeRes.arrayBuffer());
        expect(runtimeBody.equals(Buffer.from(runtime.bytes))).toBe(true);
        const runtimeHash = createHash('sha256').update(runtimeBody).digest('hex');
        expect(runtimeUrl.pathname).toBe(`${externalPath}/runtime.${runtimeHash}.mjs`);
      } finally {
        await close();
      }
    },
  );

  it('fails metadata with 503 when the current key is not active', async () => {
    const provider = createStaticKeyProvider({
      currentKeyId: 'expired-01',
      keys: [{ keyId: 'expired-01', key: keyBytes(41), acceptFrom: NOW - 120000, acceptUntil: NOW - 60000 }],
    });
    const app = express();
    app.use(
      '/attestation',
      createSignerBundleRouter({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: provider,
        now: () => NOW,
      }),
    );
    const { baseUrl, close } = await startApp(app);
    try {
      const metaRes = await fetch(`${baseUrl}/attestation/signer-meta`);
      expect(metaRes.status).toBe(503);
      const body = (await metaRes.json()) as { code: string };
      expect(body.code).toBe('ATTESTATION_KEYS_UNAVAILABLE');
    } finally {
      await close();
    }
  });

  it.each([
    { boundary: 'at activation', start: NOW - 1, finish: NOW, status: 200 },
    { boundary: 'before activation', start: NOW - 2, finish: NOW - 1, status: 503 },
    { boundary: 'just before retirement', start: NOW, finish: NOW + 99, status: 200 },
    { boundary: 'at retirement', start: NOW, finish: NOW + 100, status: 503 },
    { boundary: 'after retirement', start: NOW, finish: NOW + 101, status: 503 },
    { boundary: 'after a backward clock crosses activation', start: NOW + 1, finish: NOW - 1, status: 503 },
  ])('checks current-key eligibility $boundary after a deferred provider', async ({ start, finish, status }) => {
    const snapshot: AttestationKeySnapshot = {
      currentKeyId: 'gated-01',
      keys: [
        { keyId: 'gated-01', key: keyBytes(42), acceptFrom: NOW, acceptUntil: NOW + 100 },
        // An eligible retained key must not substitute for an inactive current.
        { keyId: 'other-01', key: keyBytes(43), acceptFrom: NOW - 60000, acceptUntil: NOW + 60000 },
      ],
    };
    const gate = deferred<AttestationKeySnapshot>();
    const getSnapshot = vi.fn(() => gate.promise);
    let nowMs = start;
    const app = express();
    app.use(
      '/attestation',
      createSignerBundleRouter({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: { getSnapshot },
        now: () => nowMs,
      }),
    );
    const { baseUrl, close } = await startApp(app);
    const pending = fetch(`${baseUrl}/attestation/signer-meta`, { redirect: 'manual' });
    try {
      await expect.poll(() => getSnapshot.mock.calls.length).toBe(1);
      nowMs = finish;
      gate.resolve(snapshot);
      const response = await pending;
      if (status === 200) {
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toMatchObject({ keyId: 'gated-01' });
      } else {
        await expectOperationalFailure(response, 503, KEYS_UNAVAILABLE_PAYLOAD);
      }
      expect(getSnapshot).toHaveBeenCalledTimes(1);
    } finally {
      gate.resolve(snapshot);
      try {
        await pending;
      } finally {
        await close();
      }
    }
  });

  it.each([
    { failure: 'NaN', read: () => Number.NaN },
    { failure: 'infinity', read: () => Number.POSITIVE_INFINITY },
    { failure: 'negative time', read: () => -1 },
    { failure: 'fractional time', read: () => NOW + 0.5 },
    { failure: 'unsafe integer', read: () => Number.MAX_SAFE_INTEGER + 1 },
    {
      failure: 'throwing clock',
      read: () => {
        throw new Error('private clock diagnostics');
      },
    },
    {
      failure: 'typed stale-key throw',
      read: () => {
        throw new AttestationError('ATTESTATION_STALE_KEY');
      },
    },
  ])('returns a fixed internal error for post-provider $failure', async ({ read }) => {
    const snapshot: AttestationKeySnapshot = {
      currentKeyId: 'clock-01',
      keys: [{ keyId: 'clock-01', key: keyBytes(44), acceptFrom: NOW - 60000, acceptUntil: NOW + 60000 }],
    };
    const gate = deferred<AttestationKeySnapshot>();
    const getSnapshot = vi.fn(() => gate.promise);
    let readClock: () => number = () => NOW;
    const app = express();
    app.use(
      '/attestation',
      createSignerBundleRouter({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: { getSnapshot },
        now: () => readClock(),
      }),
    );
    const { baseUrl, close } = await startApp(app);
    const pending = fetch(`${baseUrl}/attestation/signer-meta`, { redirect: 'manual' });
    try {
      await expect.poll(() => getSnapshot.mock.calls.length).toBe(1);
      readClock = read;
      gate.resolve(snapshot);
      await expectOperationalFailure(await pending, 500, INTERNAL_ERROR_PAYLOAD);
      expect(getSnapshot).toHaveBeenCalledTimes(1);
    } finally {
      gate.resolve(snapshot);
      try {
        await pending;
      } finally {
        await close();
      }
    }
  });

  it('rejects an invalid initial clock before calling the provider', async () => {
    const getSnapshot = vi.fn((): AttestationKeySnapshot => {
      throw new Error('provider must not run');
    });
    const app = express();
    app.use(
      '/attestation',
      createSignerBundleRouter({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: { getSnapshot },
        now: () => Number.NaN,
      }),
    );
    const { baseUrl, close } = await startApp(app);
    try {
      await expectOperationalFailure(await fetch(`${baseUrl}/attestation/signer-meta`), 500, INTERNAL_ERROR_PAYLOAD);
      expect(getSnapshot).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it.each(['throw', 'reject', 'snapshot accessor', 'oversized snapshot'] as const)(
    'keeps %s failures operational for discovery and key assets',
    async (failure) => {
      let entryReads = 0;
      const oversizedKeys = Array.from({ length: 17 }, (_, index) => ({
        keyId: `oversized-${index}`,
        get key() {
          entryReads += 1;
          return keyBytes(index);
        },
        acceptFrom: NOW - 60000,
        acceptUntil: NOW + 60000,
      }));
      const getSnapshot = vi.fn((): AttestationKeySnapshot | Promise<AttestationKeySnapshot> => {
        const error = new AttestationError('ATTESTATION_STALE_KEY');
        error.message = 'private provider diagnostics';
        switch (failure) {
          case 'throw':
            throw error;
          case 'reject':
            return Promise.reject(error);
          case 'snapshot accessor':
            return {
              get currentKeyId(): string {
                throw error;
              },
              keys: [],
            };
          case 'oversized snapshot':
            return { currentKeyId: 'oversized-0', keys: oversizedKeys };
        }
      });
      const app = express();
      app.use(
        '/attestation',
        createSignerBundleRouter({
          publicOrigin: PUBLIC_ORIGIN,
          replayNamespace: NAMESPACE,
          keyProvider: { getSnapshot },
          now: () => NOW,
        }),
      );
      const { baseUrl, close } = await startApp(app);
      try {
        for (const assetPath of ['signer-meta', `signer.${'a'.repeat(64)}.mjs`]) {
          const response = await fetch(`${baseUrl}/attestation/${assetPath}`, { redirect: 'manual' });
          await expectOperationalFailure(response, 503, KEYS_UNAVAILABLE_PAYLOAD);
        }
        expect(getSnapshot).toHaveBeenCalledTimes(2);
        expect(entryReads).toBe(0);
      } finally {
        await close();
      }
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'bounds provider waits and ignores late %s before recovery',
    async (settlement) => {
      const entry = { keyId: 'timeout-01', key: keyBytes(45), acceptFrom: NOW - 60000, acceptUntil: NOW + 60000 };
      const snapshot: AttestationKeySnapshot = { currentKeyId: entry.keyId, keys: [entry] };
      const gate = deferred<AttestationKeySnapshot>();
      const getSnapshot = vi
        .fn<() => AttestationKeySnapshot | Promise<AttestationKeySnapshot>>()
        .mockReturnValueOnce(gate.promise)
        .mockReturnValue(snapshot);
      const now = vi.fn(() => NOW);
      const app = express();
      app.use(
        '/attestation',
        createSignerBundleRouter({
          publicOrigin: PUBLIC_ORIGIN,
          replayNamespace: NAMESPACE,
          keyProvider: { getSnapshot },
          now,
          operationTimeoutMs: 20,
        }),
      );
      const { baseUrl, close } = await startApp(app);
      try {
        const response = await fetch(`${baseUrl}/attestation/signer-meta`);
        await expectOperationalFailure(response, 503, KEYS_UNAVAILABLE_PAYLOAD);
        const clockReadsAtTimeout = now.mock.calls.length;
        let lateSnapshotReads = 0;
        if (settlement === 'resolve') {
          gate.resolve({
            get currentKeyId() {
              lateSnapshotReads += 1;
              return entry.keyId;
            },
            keys: [entry],
          });
        } else {
          gate.reject(new Error('late provider diagnostics'));
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(lateSnapshotReads).toBe(0);
        expect(now).toHaveBeenCalledTimes(clockReadsAtTimeout);

        const recovered = await fetch(`${baseUrl}/attestation/signer-meta`);
        expect(recovered.status).toBe(200);
        expect(await recovered.json()).toMatchObject({ keyId: entry.keyId });
        expect(getSnapshot).toHaveBeenCalledTimes(2);
      } finally {
        gate.resolve(snapshot);
        await close();
      }
    },
  );

  it('accepts signatures from HTTP-served modules via ATT-02 (nonbrowser caller)', async () => {
    const key = keyBytes(51);
    const provider = createStaticKeyProvider({
      currentKeyId: 'serve-01',
      keys: [{ keyId: 'serve-01', key, acceptFrom: NOW - 60000, acceptUntil: NOW + 60000 }],
    });
    const store = createMemoryAttestationStore({ now: () => NOW });
    const guard = createRequestAttestationMiddleware({
      publicOrigin: PUBLIC_ORIGIN,
      replayNamespace: NAMESPACE,
      keyProvider: provider,
      store,
      now: () => NOW,
    });
    const app = express();
    app.use(
      '/attestation',
      createSignerBundleRouter({
        publicOrigin: PUBLIC_ORIGIN,
        replayNamespace: NAMESPACE,
        keyProvider: provider,
        now: () => NOW,
      }),
    );
    app.use('/api', guard);
    app.post('/api/submit', (_req, res) => res.status(200).json({ ok: true }));
    const { baseUrl, close } = await startApp(app);
    try {
      // Nonbrowser caller reads distributed material and signs with Node crypto.
      const meta = (await (await fetch(`${baseUrl}/attestation/signer-meta`)).json()) as {
        keyId: string;
        signerUrl: string;
      };
      expect(meta.keyId).toBe('serve-01');
      const signerPath = new URL(meta.signerUrl).pathname;
      const moduleText = await (await fetch(`${baseUrl}${signerPath}`)).text();
      expect(moduleText).toContain('export const signer');

      const transactionId = signWithNode({
        keyId: 'serve-01',
        key,
        timestampMs: NOW,
        nonce: nonceHex(),
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: '',
        bodyHashHex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // pragma: allowlist secret
      });
      const guarded = await fetch(`${baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'x-client-transaction-id': transactionId },
      });
      expect(guarded.status).toBe(200);

      // The served key module itself imports in Node (via temp file) and signs.
      const runtime = getSignerRuntimeAsset();
      const runtimeDir = mkdtempSync(path.join(os.tmpdir(), 'att-runtime-'));
      const runtimePath = path.join(runtimeDir, runtime.fileName);
      writeFileSync(runtimePath, Buffer.from(runtime.bytes));
      const moduleDir = mkdtempSync(path.join(os.tmpdir(), 'att-module-'));
      const moduleFileName = `signer.${createHash('sha256').update(Buffer.from(moduleText, 'utf8')).digest('hex')}.mjs`;
      // Rewrite the relative runtime specifier to the temp runtime file URL for Node import.
      const runtimeUrl = pathToFileURL(runtimePath).href;
      const nodeSource = moduleText.replace(
        `from ${JSON.stringify(`./${runtime.fileName}`)}`,
        `from ${JSON.stringify(runtimeUrl)}`,
      );
      const modulePath = path.join(moduleDir, moduleFileName);
      writeFileSync(modulePath, nodeSource);
      const imported = (await import(pathToFileURL(modulePath).href)) as {
        signer: { sign: (input: never) => Promise<string> };
      };
      expect(typeof imported.signer.sign).toBe('function');
      const moduleTransactionId = await imported.signer.sign({
        method: 'POST',
        requestTarget: '/api/submit',
        contentType: '',
        bodyHashHex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // pragma: allowlist secret
        timestampMs: NOW,
        nonceHex: nonceHex(),
      } as never);
      const viaModule = await fetch(`${baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'x-client-transaction-id': moduleTransactionId },
      });
      expect(viaModule.status).toBe(200);
    } finally {
      await close();
    }
  }, 30000);
});

describe('real Chromium imports HTTP-served key/runtime modules (Playwright)', () => {
  it('creates a signature in Chromium accepted by ATT-02', async () => {
    const key = keyBytes(61);
    const app = express();
    // Minimal document for same-origin evaluation.
    app.get('/', (_req, res) => res.type('html').send('<html><body>attestation</body></html>'));
    const basePath = '/attestation';
    // Public origin must be the loopback server origin for same-origin import.
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.on('listening', () => resolve()));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const loopOrigin = baseUrl;
    const loopNamespace = 'att-browser-e2e';
    const provider = createStaticKeyProvider({
      currentKeyId: 'browser-01',
      keys: [{ keyId: 'browser-01', key, acceptFrom: NOW - 60000, acceptUntil: NOW + 60000 }],
    });
    const store = createMemoryAttestationStore({ now: () => NOW });
    const guard = createRequestAttestationMiddleware({
      publicOrigin: loopOrigin,
      replayNamespace: loopNamespace,
      keyProvider: provider,
      store,
      now: () => NOW,
    });
    const router = createSignerBundleRouter({
      publicOrigin: loopOrigin,
      replayNamespace: loopNamespace,
      keyProvider: provider,
      basePath,
      now: () => NOW,
    });
    app.use(basePath, router);
    app.use('/api', guard);
    app.post('/api/submit', (_req, res) => res.status(200).json({ ok: true }));

    const browser = await chromium.launch();
    try {
      const meta = (await (await fetch(`${baseUrl}${basePath}/signer-meta`)).json()) as {
        keyId: string;
        signerUrl: string;
      };
      expect(meta.keyId).toBe('browser-01');
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      // Pass the evaluation as a string so Vite does not rewrite the native
      // dynamic `import()` to `__vite_ssr_dynamic_import__` (which does not
      // exist in the real Chromium page). The string is evaluated natively
      // in the browser against the HTTP-served Express asset.
      const transactionId = (await page.evaluate(
        [
          `(async () => {`,
          `  const signerUrl = ${JSON.stringify(meta.signerUrl)};`,
          `  const mod = await import(signerUrl);`,
          `  if (typeof mod.signer?.sign !== 'function') {`,
          `    throw new Error('imported module does not export signer.sign');`,
          `  }`,
          `  return mod.signer.sign({`,
          `    method: 'POST',`,
          `    requestTarget: '/api/submit',`,
          `    contentType: '',`,
          `    bodyHashHex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',`, // pragma: allowlist secret
          `    timestampMs: 1780000000000,`,
          `    nonceHex: '0123456789abcdef0123456789abcdef',`, // pragma: allowlist secret
          `  });`,
          `})()`,
        ].join('\n'),
      )) as string;
      expect(typeof transactionId).toBe('string');
      expect(transactionId.length).toBeGreaterThan(0);
      await page.close();

      // The Chromium-minted proof is accepted by the Express guard.
      // Fresh nonce required: the browser proof used a fixed nonce above for
      // determinism, so mint a fresh browser proof for the guarded call would
      // need a second evaluation; instead verify this exact proof once (it is
      // unused so far) then confirm replay on retry.
      const first = await fetch(`${baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'x-client-transaction-id': transactionId },
      });
      expect(first.status).toBe(200);
      const replay = await fetch(`${baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'x-client-transaction-id': transactionId },
      });
      expect(replay.status).toBe(403);
      const replayBody = (await replay.json()) as { code: string };
      expect(replayBody.code).toBe('ATTESTATION_REPLAY');
    } finally {
      await browser.close();
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  }, 60000);
});
