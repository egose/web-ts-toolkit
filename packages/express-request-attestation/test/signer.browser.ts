/**
 * ATT-06 real-Chromium signer/module-contract tests.
 *
 * Runs in real Headless Chromium through Vitest's Playwright provider
 * (`vitest.browser.config.mts`) against the BUILT `../dist/signer.mjs` — not
 * the TypeScript source — so this is genuine WebCrypto/native-runtime
 * evidence. jsdom is intentionally not used.
 *
 * Coverage mirrors the Node lane at browser fidelity:
 * - committed independent HMAC fixtures match real-browser WebCrypto across
 *   UTF-8/binary/target/content-type cases; identical explicit inputs are
 *   deterministic and every version/key/origin/namespace field is protected;
 * - built entry loads with named exports, no default export, and no
 *   Node/Express runtime globals;
 * - helpers stay browser-safe (no `Math.random`); unavailable capabilities
 *   fail as controlled actionable errors;
 * - typed ESM module loading through injected fixture loaders validates
 *   origin/namespace/version; concurrent `getSigner` callers share one load;
 * - no browser storage writes, DOM mutation, or import-time network work.
 *
 * Actual generated key/runtime modules are verified by ATT-05; this file uses
 * fixture ESM loaders (no network) plus the real built signer, avoiding a
 * dependency cycle.
 */
import { describe, expect, it, vi } from 'vitest';

// Built output under test: the exact ESM an installed browser consumer loads.
import {
  AttestationProtocolError,
  DEFAULT_SIGNER_LOAD_TIMEOUT_MS,
  SIGNER_METADATA_BYTE_CAP,
  SignerClientError,
  createRequestSigner,
  createSignerClient,
  fetchSignerBundle,
  generateNonceHex,
  hashBodySha256Hex,
} from '../dist/signer.mjs';
import type { RequestSigner } from '../dist/signer.mjs';

const API_ORIGIN = 'https://attestation.example.com';
const NAMESPACE = 'att-fixture';
const METADATA_URL = 'https://attestation.example.com/attestation/signer-meta';
const KEY_ID = 'fixture-key-01';
const KEY_HEX = 'd973c35da623a2329dd08a32153635042a7fe90b730035c90508ae7ec50c0d24'; // pragma: allowlist secret
const SIGNER_URL = 'https://attestation.example.com/attestation/signer.abc123.mjs';
const EMPTY_BODY_SHA256_HEX = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // pragma: allowlist secret

interface FixtureVector {
  readonly name: string;
  readonly nonceHex: string;
  readonly method: string;
  readonly requestTarget: string;
  readonly contentType: string;
  readonly bodyHashHex: string;
  readonly transactionId: string;
  readonly macLength: 43;
}

const TIMESTAMP_MS = 1780000000000;

// Committed independent vectors (copied from test/fixtures/protocol-v1.json,
// computed with raw node:crypto — never with the helper under test).
const VECTORS: readonly FixtureVector[] = [
  {
    name: 'empty-body',
    nonceHex: '0123456789abcdef0123456789abcdef', // pragma: allowlist secret
    method: 'POST',
    requestTarget: '/api/submit',
    contentType: '',
    bodyHashHex: EMPTY_BODY_SHA256_HEX,
    transactionId:
      'WzEsImZpeHR1cmUta2V5LTAxIiwxNzgwMDAwMDAwMDAwLCIwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZiIsIjlsUkJWVUNVb3EybkJXOVNzQzVreHZYcUxHckxxRHFxQWIwbGc2cUstLUEiXQ', // pragma: allowlist secret
    macLength: 43,
  },
  {
    name: 'utf8-body',
    nonceHex: '11111111111111111111111111111111',
    method: 'POST',
    requestTarget: '/api/notes',
    contentType: 'application/json; charset=utf-8',
    bodyHashHex: '0d9c5a1a9e453bb3f69fda79e3ae590d2a861700cfff1b9b33dbfc23d9dc2ca4', // pragma: allowlist secret
    transactionId:
      'WzEsImZpeHR1cmUta2V5LTAxIiwxNzgwMDAwMDAwMDAwLCIxMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMSIsInRDZVBjZ3FOM0dxVDhIWFR6MFpYT3c2U2pxRE5kUEtlWVRoVGthdTJNcEkiXQ', // pragma: allowlist secret
    macLength: 43,
  },
  {
    name: 'binary-body',
    nonceHex: '22222222222222222222222222222222',
    method: 'PUT',
    requestTarget: '/api/blob/7',
    contentType: 'application/octet-stream',
    bodyHashHex: '916d450069db02289b316a4402798df104417fe06cc163760fd98d33951cec3f', // pragma: allowlist secret
    transactionId:
      'WzEsImZpeHR1cmUta2V5LTAxIiwxNzgwMDAwMDAwMDAwLCIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMiIsIlBaZWVfVTM5eXNuSXk3ZFV5eDFLOUZkdjJ0d2dVVjNnNFN1UDAyYUNwakUiXQ', // pragma: allowlist secret
    macLength: 43,
  },
  {
    name: 'reserved-path-escapes',
    nonceHex: '33333333333333333333333333333333',
    method: 'GET',
    requestTarget: '/files/a%2Fb%3Fc%40d%25e/seven?x=%2F&y=%3F',
    contentType: '',
    bodyHashHex: EMPTY_BODY_SHA256_HEX,
    transactionId:
      'WzEsImZpeHR1cmUta2V5LTAxIiwxNzgwMDAwMDAwMDAwLCIzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMyIsIjZzMWt3R0xMUDhfTWlxc21OUjdKVDlRMlRHX19JSFBnZktYR2VGMGhmaVEiXQ', // pragma: allowlist secret
    macLength: 43,
  },
  {
    name: 'duplicate-queries',
    nonceHex: '44444444444444444444444444444444',
    method: 'GET',
    requestTarget: '/search?tag=a&tag=b&tag=a&q=x+y&lang=en',
    contentType: '',
    bodyHashHex: EMPTY_BODY_SHA256_HEX,
    transactionId:
      'WzEsImZpeHR1cmUta2V5LTAxIiwxNzgwMDAwMDAwMDAwLCI0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NCIsIlpqTDFyMUJfZENubExVYnBOaE45cVE2al9ZaVFPdnRDX24zM2ZYdlRfR3MiXQ', // pragma: allowlist secret
    macLength: 43,
  },
];

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const atobFn = (globalThis as unknown as { readonly atob: (s: string) => string }).atob;
  const binary = atobFn(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

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

describe('built signer entry contract (real Chromium, dist/signer.mjs)', () => {
  it('exposes named browser exports without a default export', async () => {
    const pkg = (await import('../dist/signer.mjs')) as Record<string, unknown>;
    expect(pkg['default']).toBeUndefined();
    expect(typeof pkg['createRequestSigner']).toBe('function');
    expect(typeof pkg['createSignerClient']).toBe('function');
    expect(typeof pkg['fetchSignerBundle']).toBe('function');
    expect(typeof pkg['generateNonceHex']).toBe('function');
    expect(typeof pkg['hashBodySha256Hex']).toBe('function');
  });

  it('loads with no Node/Express runtime globals', () => {
    const globals = globalThis as unknown as Record<string, unknown>;
    expect(globals['process']).toBeUndefined();
    expect(globals['Buffer']).toBeUndefined();
    expect(globals['require']).toBeUndefined();
    expect(globals['__vite_ssr_import__']).toBeUndefined();
    expect(SIGNER_METADATA_BYTE_CAP).toBe(4096);
    expect(DEFAULT_SIGNER_LOAD_TIMEOUT_MS).toBe(5000);
  });

  it('performs no import-time network, storage, or DOM work', async () => {
    const globals = globalThis as unknown as Record<string, unknown>;
    const doc = globals['document'] as
      | { readonly body?: { readonly innerHTML?: unknown }; readonly head?: { readonly childElementCount?: number } }
      | undefined;
    const bodyBefore = doc?.body?.innerHTML;
    const headChildrenBefore = doc?.head?.childElementCount;
    const storage = globals['localStorage'] as { readonly length?: number } | undefined;
    const storageLengthBefore = storage?.length;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const fresh = (await import('../dist/signer.mjs')) as Record<string, unknown>;
      expect(typeof fresh['createRequestSigner']).toBe('function');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
    expect(doc?.body?.innerHTML).toBe(bodyBefore);
    expect(doc?.head?.childElementCount).toBe(headChildrenBefore);
    if (storage !== undefined && storageLengthBefore !== undefined) {
      expect(storage.length).toBe(storageLengthBefore);
    }
  });
});

describe('real-browser WebCrypto determinism (committed fixtures)', () => {
  for (const vector of VECTORS) {
    it(`signs the ${vector.name} envelope deterministically`, async () => {
      const signer = createRequestSigner({
        keyId: KEY_ID,
        key: hexToBytes(KEY_HEX),
        publicOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
      });
      expect(signer.version).toBe(1);
      expect(signer.keyId).toBe(KEY_ID);
      expect(signer.publicOrigin).toBe(API_ORIGIN);
      expect(signer.replayNamespace).toBe(NAMESPACE);
      const input = {
        method: vector.method,
        requestTarget: vector.requestTarget,
        contentType: vector.contentType,
        bodyHashHex: vector.bodyHashHex,
        timestampMs: TIMESTAMP_MS,
        nonceHex: vector.nonceHex,
      };
      const first = await signer.sign(input);
      const second = await signer.sign(input);
      expect(first).toBe(second);
      expect(first).toBe(vector.transactionId);
      expect(vector.transactionId.length).toBeGreaterThan(0);
      expect(vector.macLength).toBe(43);
    });
  }

  it('binds every MAC-protected field in the browser', async () => {
    const vector = VECTORS[0] as FixtureVector;
    const signer = createRequestSigner({
      keyId: KEY_ID,
      key: hexToBytes(KEY_HEX),
      publicOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
    });
    const base = {
      method: vector.method,
      requestTarget: vector.requestTarget,
      contentType: vector.contentType,
      bodyHashHex: vector.bodyHashHex,
      timestampMs: TIMESTAMP_MS,
      nonceHex: vector.nonceHex,
    };
    const expected = await signer.sign(base);
    const otherNamespace = createRequestSigner({
      keyId: KEY_ID,
      key: hexToBytes(KEY_HEX),
      publicOrigin: API_ORIGIN,
      replayNamespace: `${NAMESPACE}-other`,
    });
    const otherOrigin = createRequestSigner({
      keyId: KEY_ID,
      key: hexToBytes(KEY_HEX),
      publicOrigin: 'https://other.example.com',
      replayNamespace: NAMESPACE,
    });
    const otherKey = createRequestSigner({
      keyId: 'other-key-01',
      key: hexToBytes(KEY_HEX),
      publicOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
    });
    for (const other of [otherNamespace, otherOrigin, otherKey]) {
      expect(await other.sign(base)).not.toBe(expected);
    }
    const tampered = [
      { ...base, timestampMs: TIMESTAMP_MS + 1 },
      { ...base, nonceHex: 'ffffffffffffffffffffffffffffffff' },
      { ...base, method: 'GET' },
      { ...base, requestTarget: `${base.requestTarget}/` },
      { ...base, contentType: 'text/plain;x=1' },
      {
        ...base,
        bodyHashHex: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      },
    ];
    for (const fields of tampered) {
      expect(await signer.sign(fields)).not.toBe(expected);
    }
  });

  it('hashes exact body bytes in the browser (empty/UTF-8/binary)', async () => {
    expect(await hashBodySha256Hex(new Uint8Array(0))).toBe(EMPTY_BODY_SHA256_HEX);
    expect(await hashBodySha256Hex(utf8Bytes('{"note":"héllo 🌍"}'))).toBe(
      '0d9c5a1a9e453bb3f69fda79e3ae590d2a861700cfff1b9b33dbfc23d9dc2ca4', // pragma: allowlist secret
    );
    expect(await hashBodySha256Hex(base64ToBytes('AAECA/r7/P3+/wAQIEhlbGxv'))).toBe(
      '916d450069db02289b316a4402798df104417fe06cc163760fd98d33951cec3f', // pragma: allowlist secret
    );
    await expect(hashBodySha256Hex('not-bytes' as never)).rejects.toThrow(AttestationProtocolError);
  });

  it('generates 128-bit hex nonces without Math.random', () => {
    const randomSpy = vi.spyOn(Math, 'random');
    try {
      const first = generateNonceHex();
      const second = generateNonceHex();
      expect(first).toMatch(/^[0-9a-f]{32}$/);
      expect(second).toMatch(/^[0-9a-f]{32}$/);
      expect(first).not.toBe(second);
      expect(randomSpy).not.toHaveBeenCalled();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it('fails closed on malformed signer options/inputs', async () => {
    expect(() =>
      createRequestSigner({
        keyId: KEY_ID,
        key: new Uint8Array(31),
        publicOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
      }),
    ).toThrow(AttestationProtocolError);
    expect(() =>
      createRequestSigner({
        keyId: 'bad id!',
        key: hexToBytes(KEY_HEX),
        publicOrigin: API_ORIGIN,
        replayNamespace: NAMESPACE,
      }),
    ).toThrow(AttestationProtocolError);
    const signer = createRequestSigner({
      keyId: KEY_ID,
      key: hexToBytes(KEY_HEX),
      publicOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
    });
    await expect(
      signer.sign({
        method: 'POST',
        requestTarget: '//evil.com/x',
        contentType: '',
        bodyHashHex: EMPTY_BODY_SHA256_HEX,
        timestampMs: TIMESTAMP_MS,
        nonceHex: '0123456789abcdef0123456789abcdef', // pragma: allowlist secret
      }),
    ).rejects.toThrow(AttestationProtocolError);
  });

  it('reports unavailable WebCrypto as an actionable local error', async () => {
    const signer = createRequestSigner({
      keyId: KEY_ID,
      key: hexToBytes(KEY_HEX),
      publicOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
    });
    const input = {
      method: 'POST',
      requestTarget: '/api/submit',
      contentType: '',
      bodyHashHex: EMPTY_BODY_SHA256_HEX,
      timestampMs: TIMESTAMP_MS,
      nonceHex: '0123456789abcdef0123456789abcdef', // pragma: allowlist secret
    };
    // Sanity: real WebCrypto works in this Chromium before stubbing.
    await expect(signer.sign(input)).resolves.toBe(VECTORS[0]?.transactionId);
    const cryptoHolder = globalThis.crypto as unknown as Record<string, unknown>;
    const originalSubtle = cryptoHolder['subtle'];
    let stubbed: boolean;
    try {
      Object.defineProperty(globalThis.crypto, 'subtle', {
        configurable: true,
        writable: true,
        value: undefined,
      });
      stubbed = cryptoHolder['subtle'] === undefined;
    } catch {
      stubbed = false;
    }
    try {
      if (stubbed) {
        await expect(signer.sign(input)).rejects.toThrow(SignerClientError);
        await expect(signer.sign(input)).rejects.toThrow(/secure context|subtle/i);
        await expect(hashBodySha256Hex(new Uint8Array([1, 2, 3]))).rejects.toThrow(/secure context|subtle/i);
      } else {
        // crypto.subtle is non-configurable here: record positive WebCrypto
        // evidence instead of faking a capability failure.
        await expect(signer.sign(input)).resolves.toBe(VECTORS[0]?.transactionId);
      }
    } finally {
      if (stubbed) {
        Object.defineProperty(globalThis.crypto, 'subtle', {
          configurable: true,
          writable: true,
          value: originalSubtle,
        });
      }
    }
    // Capability restored: signing works again.
    await expect(signer.sign(input)).resolves.toBe(VECTORS[0]?.transactionId);
  });
});

describe('browser module-contract client (fixture loaders, built entry)', () => {
  function mockFetch(response: Response): {
    fetchImpl: typeof fetch;
    calls: { url: string; init?: RequestInit }[];
  } {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      // Return a fresh clone per discovery fetch: a Response body is
      // single-use, so reusing the same object across the invalidate/reload
      // second fetch would read an already-disturbed body and fail.
      return response.clone();
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }

  it('loads a fixture signer through bounded discovery with native-loader defaults', async () => {
    const { fetchImpl, calls } = mockFetch(
      new Response(JSON.stringify(makeMetadata()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const seen: string[] = [];
    const bundle = await fetchSignerBundle({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule: async (moduleUrl: string) => {
        seen.push(moduleUrl);
        return { signer: makeSigner() };
      },
    });
    expect(bundle.signer.keyId).toBe(KEY_ID);
    expect(calls).toHaveLength(1);
    const init = calls[0]?.init as RequestInit & { cache?: string; credentials?: string; redirect?: string };
    expect(init.cache).toBe('no-store');
    expect(init.credentials).toBe('omit');
    expect(init.redirect).toBe('error');
    expect(seen).toEqual([SIGNER_URL]);
  });

  it('rejects mocked metadata that selects an unexpected origin/namespace/version', async () => {
    const loader = async (): Promise<{ signer: RequestSigner }> => ({ signer: makeSigner() });
    for (const meta of [
      makeMetadata({ publicOrigin: 'https://other.example.com' }),
      makeMetadata({ replayNamespace: 'other-ns' }),
      makeMetadata({ version: 2 }),
    ]) {
      const { fetchImpl } = mockFetch(new Response(JSON.stringify(meta), { status: 200 }));
      await expect(
        fetchSignerBundle({
          metadataUrl: METADATA_URL,
          apiOrigin: API_ORIGIN,
          replayNamespace: NAMESPACE,
          fetch: fetchImpl,
          loadModule: loader,
        }),
      ).rejects.toThrow(SignerClientError);
    }
  });

  it('rejects script-string evaluation paths and malformed signers', async () => {
    const { fetchImpl } = mockFetch(new Response(JSON.stringify(makeMetadata()), { status: 200 }));
    for (const candidate of [
      'export const signer = 1;',
      { signSource: 'export const signer = 1;' },
      { signer: { ...makeSigner(), keyId: 'other-key-01' } },
      { signer: { ...makeSigner(), sign: 'nope' } },
    ]) {
      await expect(
        fetchSignerBundle({
          metadataUrl: METADATA_URL,
          apiOrigin: API_ORIGIN,
          replayNamespace: NAMESPACE,
          fetch: mockFetch(new Response(JSON.stringify(makeMetadata()), { status: 200 })).fetchImpl,
          loadModule: (async () => candidate) as never,
        }),
      ).rejects.toMatchObject({ code: 'SIGNER_MODULE_INVALID' });
    }
    void fetchImpl;
  });

  it('shares one load across concurrent getSigner callers with generation-aware invalidate/dispose', async () => {
    const { fetchImpl, calls } = mockFetch(new Response(JSON.stringify(makeMetadata()), { status: 200 }));
    let loaderCalls = 0;
    const client = createSignerClient({
      metadataUrl: METADATA_URL,
      apiOrigin: API_ORIGIN,
      replayNamespace: NAMESPACE,
      fetch: fetchImpl,
      loadModule: async () => {
        loaderCalls += 1;
        return { signer: makeSigner() };
      },
    });
    const [first, second] = await Promise.all([client.getSigner(), client.getSigner()]);
    expect(first).toBe(second);
    expect(calls).toHaveLength(1);
    expect(loaderCalls).toBe(1);
    // A late stale rejection for an unknown key never evicts the active signer.
    client.invalidate('stale-key-99');
    expect(await client.getSigner()).toBe(first);
    expect(calls).toHaveLength(1);
    // Observing the active key evicts; dispose is terminal.
    client.invalidate(KEY_ID);
    const reloaded = await client.getSigner();
    expect(reloaded.keyId).toBe(KEY_ID);
    expect(reloaded).not.toBe(first);
    expect(calls).toHaveLength(2);
    client.dispose();
    expect(() => client.getSigner()).toThrow(SignerClientError);
  });
});
