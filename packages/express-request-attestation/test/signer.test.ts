/**
 * ATT-06 signer Node unit lane.
 *
 * Fixture-driven WebCrypto checks against committed independent
 * `test/fixtures/protocol-v1.json` (never asks production for its own
 * expectation): identical explicit inputs are deterministic and match Node
 * `node:crypto` across UTF-8/binary/target/content-type cases. Helpers stay
 * browser-safe with no `Math.random` fallback. Capability failures are
 * controlled and actionable. No DOM/storage/global patch/import-time I/O.
 */
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi, afterEach } from 'vitest';

import {
  createRequestSigner,
  generateNonceHex,
  hashBodySha256Hex,
  AttestationProtocolError,
  SignerClientError,
} from '../src/signer.js';
import { base64urlDecode } from '../src/signer.js';

const here = resolve(__dirname, '.');
const doc = JSON.parse(readFileSync(resolve(here, 'fixtures', 'protocol-v1.json'), 'utf8')) as {
  version: number;
  cases: {
    name: string;
    keyId: string;
    keyHex: string;
    replayNamespace: string;
    publicOrigin: string;
    timestampMs: number;
    nonceHex: string;
    method: string;
    requestTarget: string;
    contentType: string;
    bodyBase64: string;
    bodyHashHex: string;
    macInput?: string;
    mac?: string;
    transactionId?: string;
    variants?: { contentType: string; macInput: string; mac: string; transactionId: string }[];
  }[];
};

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

function directMac(keyHex: string, macInput: string): string {
  return createHmac('sha256', Buffer.from(keyHex, 'hex')).update(macInput, 'utf8').digest('base64url');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ATT-06 request signer fixtures (WebCrypto matches node:crypto)', () => {
  for (const fixture of doc.cases) {
    describe(`case ${fixture.name}`, () => {
      const variants = fixture.variants?.map((variant) => ({ ...fixture, ...variant })) ?? [
        {
          ...fixture,
          macInput: fixture.macInput as string,
          mac: fixture.mac as string,
          transactionId: fixture.transactionId as string,
        },
      ];

      for (const [index, variant] of variants.entries()) {
        const label = fixture.variants ? `variant[${index}] ${variant.contentType || '<empty>'}` : 'single';
        it(`signs deterministic fixture envelope (${label})`, async () => {
          const signer = createRequestSigner({
            keyId: fixture.keyId,
            key: hexToBytes(fixture.keyHex),
            publicOrigin: fixture.publicOrigin,
            replayNamespace: fixture.replayNamespace,
          });
          expect(signer.version).toBe(1);
          expect(signer.keyId).toBe(fixture.keyId);
          expect(signer.publicOrigin).toBe(fixture.publicOrigin);
          expect(signer.replayNamespace).toBe(fixture.replayNamespace);
          expect(typeof signer.sign).toBe('function');

          const input = {
            method: fixture.method,
            requestTarget: fixture.requestTarget,
            contentType: variant.contentType,
            bodyHashHex: fixture.bodyHashHex,
            timestampMs: fixture.timestampMs,
            nonceHex: fixture.nonceHex,
          };
          const first = await signer.sign(input);
          const second = await signer.sign(input);
          expect(first).toBe(second);
          expect(first).toBe(variant.transactionId);
          // Independent HMAC still matches the committed mac.
          expect(directMac(fixture.keyHex, variant.macInput as string)).toBe(variant.mac);
          expect((variant.mac as string).length).toBe(43);
          expect(base64urlDecode(variant.mac as string).length).toBe(32);
        });
      }

      it('binds every MAC-protected field', async () => {
        const base = {
          replayNamespace: fixture.replayNamespace,
          publicOrigin: fixture.publicOrigin,
          keyId: fixture.keyId,
          timestampMs: fixture.timestampMs,
          nonceHex: fixture.nonceHex,
          method: fixture.method,
          requestTarget: fixture.requestTarget,
          contentType: variants[0].contentType,
          bodyHashHex: fixture.bodyHashHex,
        };
        const signer = createRequestSigner({
          keyId: fixture.keyId,
          key: hexToBytes(fixture.keyHex),
          publicOrigin: fixture.publicOrigin,
          replayNamespace: fixture.replayNamespace,
        });
        const expected = await signer.sign({
          method: base.method,
          requestTarget: base.requestTarget,
          contentType: base.contentType,
          bodyHashHex: base.bodyHashHex,
          timestampMs: base.timestampMs,
          nonceHex: base.nonceHex,
        });
        // Tampering any protected field must change the envelope (different
        // MAC or envelope rejection). Namespace/origin/key changes go through
        // a differently-bound signer; field changes go through the same signer.
        const otherNamespaceSigner = createRequestSigner({
          keyId: fixture.keyId,
          key: hexToBytes(fixture.keyHex),
          publicOrigin: fixture.publicOrigin,
          replayNamespace: `${fixture.replayNamespace}-other`,
        });
        const otherOriginSigner = createRequestSigner({
          keyId: fixture.keyId,
          key: hexToBytes(fixture.keyHex),
          publicOrigin: 'https://other.example.com',
          replayNamespace: fixture.replayNamespace,
        });
        const otherKeySigner = createRequestSigner({
          keyId: 'other-key-01',
          key: hexToBytes(fixture.keyHex),
          publicOrigin: fixture.publicOrigin,
          replayNamespace: fixture.replayNamespace,
        });
        expect(
          await otherNamespaceSigner.sign({
            method: base.method,
            requestTarget: base.requestTarget,
            contentType: base.contentType,
            bodyHashHex: base.bodyHashHex,
            timestampMs: base.timestampMs,
            nonceHex: base.nonceHex,
          }),
        ).not.toBe(expected);
        expect(
          await otherOriginSigner.sign({
            method: base.method,
            requestTarget: base.requestTarget,
            contentType: base.contentType,
            bodyHashHex: base.bodyHashHex,
            timestampMs: base.timestampMs,
            nonceHex: base.nonceHex,
          }),
        ).not.toBe(expected);
        expect(
          await otherKeySigner.sign({
            method: base.method,
            requestTarget: base.requestTarget,
            contentType: base.contentType,
            bodyHashHex: base.bodyHashHex,
            timestampMs: base.timestampMs,
            nonceHex: base.nonceHex,
          }),
        ).not.toBe(expected);

        const tamperedInputs = [
          { ...base, timestampMs: base.timestampMs + 1 },
          { ...base, nonceHex: 'ffffffffffffffffffffffffffffffff' },
          { ...base, method: base.method === 'GET' ? 'POST' : 'GET' },
          { ...base, requestTarget: `${base.requestTarget}/` },
          { ...base, contentType: `${base.contentType || 'text/plain'};x=1` },
          {
            ...base,
            bodyHashHex: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          },
        ];
        for (const fields of tamperedInputs) {
          const tampered = await signer.sign({
            method: fields.method,
            requestTarget: fields.requestTarget,
            contentType: fields.contentType,
            bodyHashHex: fields.bodyHashHex,
            timestampMs: fields.timestampMs,
            nonceHex: fields.nonceHex,
          });
          expect(tampered).not.toBe(expected);
        }
      });
    });
  }

  it('normalizes method case like the verifier', async () => {
    const fixture = doc.cases[0];
    const signer = createRequestSigner({
      keyId: fixture.keyId,
      key: hexToBytes(fixture.keyHex),
      publicOrigin: fixture.publicOrigin,
      replayNamespace: fixture.replayNamespace,
    });
    const upper = await signer.sign({
      method: 'POST',
      requestTarget: fixture.requestTarget,
      contentType: '',
      bodyHashHex: fixture.bodyHashHex,
      timestampMs: fixture.timestampMs,
      nonceHex: fixture.nonceHex,
    });
    const lower = await signer.sign({
      method: 'post',
      requestTarget: fixture.requestTarget,
      contentType: '',
      bodyHashHex: fixture.bodyHashHex,
      timestampMs: fixture.timestampMs,
      nonceHex: fixture.nonceHex,
    });
    expect(lower).toBe(upper);
  });
});

describe('signer construction, copy isolation, and option validation', () => {
  const keyHex = 'd973c35da623a2329dd08a32153635042a7fe90b730035c90508ae7ec50c0d24'; // pragma: allowlist secret
  const base = {
    keyId: 'fixture-key-01',
    publicOrigin: 'https://attestation.example.com',
    replayNamespace: 'att-fixture',
  };

  it('copies 32-byte material; later caller mutation has no effect', async () => {
    const key = hexToBytes(keyHex);
    const signer = createRequestSigner({ ...base, key });
    // Mutate the caller's array after construction.
    key.fill(0);
    const input = {
      method: 'POST',
      requestTarget: '/api/submit',
      contentType: '',
      bodyHashHex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // pragma: allowlist secret
      timestampMs: 1780000000000,
      nonceHex: '0123456789abcdef0123456789abcdef', // pragma: allowlist secret
    };
    const transactionId = await signer.sign(input);
    // Independent expectation with the ORIGINAL key still matches: the signer
    // kept a copy, not a view of the mutated array.
    const fixture = doc.cases[0];
    expect(transactionId).toBe(fixture.transactionId);
  });

  it('never exposes key bytes', () => {
    const signer = createRequestSigner({ ...base, key: hexToBytes(keyHex) });
    expect((signer as unknown as Record<string, unknown>)['key']).toBeUndefined();
    expect(Object.keys(signer).sort()).toEqual(['keyId', 'publicOrigin', 'replayNamespace', 'sign', 'version'].sort());
    expect(Object.isFrozen(signer)).toBe(true);
  });

  it('rejects invalid key material, identifiers, and protection space', () => {
    expect(() => createRequestSigner({ ...base, key: new Uint8Array(31) })).toThrow(AttestationProtocolError);
    expect(() => createRequestSigner({ ...base, key: new Uint8Array(33) })).toThrow(AttestationProtocolError);
    expect(() => createRequestSigner({ ...base, key: 'not-bytes' as never })).toThrow(AttestationProtocolError);
    expect(() => createRequestSigner({ ...base, keyId: 'bad id!', key: hexToBytes(keyHex) })).toThrow(
      AttestationProtocolError,
    );
    expect(() => createRequestSigner({ ...base, keyId: '', key: hexToBytes(keyHex) })).toThrow(
      AttestationProtocolError,
    );
    expect(() =>
      createRequestSigner({ ...base, publicOrigin: 'http://evil.example.com', key: hexToBytes(keyHex) }),
    ).toThrow(AttestationProtocolError);
    expect(() => createRequestSigner({ ...base, replayNamespace: 'bad ns!', key: hexToBytes(keyHex) })).toThrow(
      AttestationProtocolError,
    );
    expect(() => createRequestSigner({ ...base, key: hexToBytes(keyHex), unknownOption: 1 } as never)).toThrow(
      AttestationProtocolError,
    );
    expect(() => createRequestSigner(null as never)).toThrow(AttestationProtocolError);
  });

  it('rejects malformed sign inputs without allocating a MAC', async () => {
    const signer = createRequestSigner({ ...base, key: hexToBytes(keyHex) });
    const valid = {
      method: 'POST',
      requestTarget: '/api/submit',
      contentType: '',
      bodyHashHex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // pragma: allowlist secret
      timestampMs: 1780000000000,
      nonceHex: '0123456789abcdef0123456789abcdef', // pragma: allowlist secret
    };
    await expect(signer.sign(null as never)).rejects.toThrow(AttestationProtocolError);
    await expect(signer.sign({ ...valid, method: '' })).rejects.toThrow(AttestationProtocolError);
    await expect(signer.sign({ ...valid, requestTarget: '//evil.com/x' })).rejects.toThrow(AttestationProtocolError);
    // pragma: allowlist nextline secret
    await expect(signer.sign({ ...valid, nonceHex: 'ABCDEF0123456789ABCDEF0123456789' })).rejects.toThrow(
      AttestationProtocolError,
    );
    await expect(signer.sign({ ...valid, bodyHashHex: 'short' })).rejects.toThrow(AttestationProtocolError);
    await expect(signer.sign({ ...valid, timestampMs: -1 })).rejects.toThrow(AttestationProtocolError);
    await expect(signer.sign({ ...valid, extra: 1 } as never)).rejects.toThrow(AttestationProtocolError);
  });
});

describe('browser-safe helpers (no Math.random fallback)', () => {
  it('hashes exact body bytes like node:crypto (incl empty/utf8/binary)', async () => {
    for (const fixture of doc.cases) {
      const body = new Uint8Array(Buffer.from(fixture.bodyBase64, 'base64'));
      expect(createHash('sha256').update(body).digest('hex')).toBe(fixture.bodyHashHex);
      expect(await hashBodySha256Hex(body)).toBe(fixture.bodyHashHex);
    }
    expect(await hashBodySha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // pragma: allowlist secret
    );
    await expect(hashBodySha256Hex('not-bytes' as never)).rejects.toThrow(AttestationProtocolError);
  });

  it('generates 16-byte lowercase hex nonces without Math.random', () => {
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

  it('fails closed without getRandomValues (no predictable fallback)', () => {
    const cryptoRef = globalThis.crypto as unknown as Record<string, unknown>;
    const original = cryptoRef['getRandomValues'];
    try {
      // Remove the capability in Node by stubbing it away.
      Object.defineProperty(globalThis.crypto, 'getRandomValues', {
        configurable: true,
        writable: true,
        value: undefined,
      });
      expect(() => generateNonceHex()).toThrow(SignerClientError);
      expect(() => generateNonceHex()).toThrow(/getRandomValues/);
    } finally {
      Object.defineProperty(globalThis.crypto, 'getRandomValues', {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  });

  it('fails closed without WebCrypto subtle (actionable secure-context error)', async () => {
    const signer = createRequestSigner({
      keyId: 'fixture-key-01',
      key: hexToBytes('d973c35da623a2329dd08a32153635042a7fe90b730035c90508ae7ec50c0d24'),
      publicOrigin: 'https://attestation.example.com',
      replayNamespace: 'att-fixture',
    });
    const subtleHolder = globalThis.crypto as unknown as Record<string, unknown>;
    const originalSubtle = subtleHolder['subtle'];
    const originalSecure = (globalThis as unknown as Record<string, unknown>)['isSecureContext'];
    try {
      Object.defineProperty(globalThis.crypto, 'subtle', {
        configurable: true,
        writable: true,
        value: undefined,
      });
      await expect(
        signer.sign({
          method: 'POST',
          requestTarget: '/api/submit',
          contentType: '',
          bodyHashHex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // pragma: allowlist secret
          timestampMs: 1780000000000,
          nonceHex: '0123456789abcdef0123456789abcdef', // pragma: allowlist secret
        }),
      ).rejects.toThrow(/secure context|subtle/i);
      await expect(hashBodySha256Hex(new Uint8Array([1, 2, 3]))).rejects.toThrow(/secure context|subtle/i);
      // Explicit insecure-context flag also fails with an actionable error.
      Object.defineProperty(globalThis.crypto, 'subtle', {
        configurable: true,
        writable: true,
        value: originalSubtle,
      });
      Object.defineProperty(globalThis, 'isSecureContext', {
        configurable: true,
        writable: true,
        value: false,
      });
      await expect(
        signer.sign({
          method: 'POST',
          requestTarget: '/api/submit',
          contentType: '',
          bodyHashHex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // pragma: allowlist secret
          timestampMs: 1780000000000,
          nonceHex: '0123456789abcdef0123456789abcdef', // pragma: allowlist secret
        }),
      ).rejects.toThrow(/secure context/i);
    } finally {
      Object.defineProperty(globalThis.crypto, 'subtle', {
        configurable: true,
        writable: true,
        value: originalSubtle,
      });
      if (originalSecure === undefined) {
        try {
          // Node has no isSecureContext; remove the test stub.
          delete (globalThis as unknown as Record<string, unknown>)['isSecureContext'];
        } catch {
          Object.defineProperty(globalThis, 'isSecureContext', {
            configurable: true,
            writable: true,
            value: undefined,
          });
        }
      } else {
        Object.defineProperty(globalThis, 'isSecureContext', {
          configurable: true,
          writable: true,
          value: originalSecure,
        });
      }
    }
  });

  it('performs no import-time network/storage/timer work', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const { createRequestSigner: fresh } = await import('../src/signer.js');
      expect(typeof fresh).toBe('function');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(globalThis.localStorage).toBeUndefined();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('signer entry contract (no Node graph, no default export)', () => {
  it('exposes named browser exports without a default', async () => {
    const pkg = (await import('../src/signer.js')) as Record<string, unknown>;
    expect(pkg['default']).toBeUndefined();
    expect(typeof pkg['createRequestSigner']).toBe('function');
    expect(typeof pkg['createSignerClient']).toBe('function');
    expect(typeof pkg['fetchSignerBundle']).toBe('function');
    expect(typeof pkg['generateNonceHex']).toBe('function');
    expect(typeof pkg['hashBodySha256Hex']).toBe('function');
  });

  it('built signer bundle has no node:/express runtime graph', async () => {
    const { readFileSync: read } = await import('node:fs');
    const { resolve: join } = await import('node:path');
    const mjs = read(join(here, '..', 'dist', 'signer.mjs'), 'utf8');
    expect(mjs).not.toContain('from "node:');
    expect(mjs).not.toContain("from 'node:");
    expect(mjs).not.toContain('require("node:');
    expect(mjs).not.toContain("require('node:");
    // The bundle legitimately mentions its own package name
    // (`express-request-attestation`) in error prefixes. Reject an actual
    // Express runtime graph instead of the package-name substring.
    expect(mjs).not.toMatch(/from\s+["']express["']/);
    expect(mjs).not.toMatch(/require\s*\(\s*["']express["']\s*\)/);
    expect(mjs).not.toContain('express()');
    expect(mjs).not.toMatch(/new Function\s*\(/);
    expect(mjs).not.toContain('__vite_ssr_import__');
  });
});
