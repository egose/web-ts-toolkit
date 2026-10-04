import { createHash, createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createDpopNoncePolicy, DPOP_NONCE_MAX_BYTES } from '../src/dpop-nonce';
import type { OidcVaultDpopNonceOptions } from '../src/types';

const NOW = 1_800_000_000_000;
const SECRET = new Uint8Array(32).fill(37);
const NAMESPACE = JSON.stringify(['api', 'https://api.example.com', 'nonce-tests']);
const CONTEXT_DIGEST = createHash('sha256').update(NAMESPACE).digest('base64url');
const JKT = createHash('sha256').update('nonce-key-a').digest('base64url');
const OTHER_JKT = createHash('sha256').update('nonce-key-b').digest('base64url');
const RANDOM = Buffer.alloc(16, 19).toString('base64url');

// Adversarial issuer-authentic inputs test payload validation independently of
// MAC rejection. This is test-only wire construction, not a trusted proof API.
const signBytes = (bytes: Buffer): string => {
  const encoded = bytes.toString('base64url');
  const mac = createHmac('sha256', SECRET)
    .update('@web-ts-toolkit/express-oidc-vault/dpop-nonce/v1\0')
    .update(`v1.${encoded}`)
    .digest('base64url');
  return `v1.${encoded}.${mac}`;
};
const signPayload = (payload: unknown): string => signBytes(Buffer.from(JSON.stringify(payload), 'utf8'));
const payload = (): unknown[] => [RANDOM, NOW, NOW + 60_000, CONTEXT_DIGEST, JKT];
const readPayload = (nonce: string): unknown[] =>
  JSON.parse(Buffer.from(nonce.split('.')[1]!, 'base64url').toString('utf8'));
const policy = (overrides: Partial<OidcVaultDpopNonceOptions & { namespace: string }> = {}) =>
  createDpopNoncePolicy({ secret: SECRET, namespace: NAMESPACE, ...overrides });

describe('DBJWT-07 stateless versioned HMAC nonce policy', () => {
  it('issues distinct random128 challenges authenticated with the documented domain and fixed-size context digest', () => {
    const signer = policy();
    const first = signer.issue(JKT, NOW);
    const second = signer.issue(JKT, NOW);
    expect(first).not.toBe(second);
    const decoded = readPayload(first);
    expect(decoded.slice(1)).toEqual([NOW, NOW + 60_000, CONTEXT_DIGEST, JKT]);
    expect(Buffer.from(decoded[0] as string, 'base64url')).toHaveLength(16);
    expect(signPayload(decoded)).toBe(first);
    expect(signer.verify(first, JKT, NOW)).toBe(true);
    expect(signer.verify(second, JKT, NOW)).toBe(true);
    expect(Object.isFrozen(signer)).toBe(true);
    expect(Object.keys(signer)).toEqual(['issue', 'verify']);
  });

  it('allows independent instances and every live older nonce after issuing newer challenges', () => {
    const first = policy();
    const second = policy({ secret: Uint8Array.from(SECRET) });
    const older = first.issue(JKT, NOW);
    const newer = second.issue(JKT, NOW + 1000);
    for (let parallelProof = 0; parallelProof < 20; parallelProof += 1) {
      expect(second.verify(older, JKT, NOW + 2000)).toBe(true);
      expect(first.verify(newer, JKT, NOW + 2000)).toBe(true);
    }
  });

  it.each([1, 60, 300])(
    'enforces the %i-second lifetime at the exact epoch-millisecond boundary',
    (lifetimeSeconds) => {
      const signer = policy({ lifetimeSeconds });
      const nonce = signer.issue(JKT, NOW);
      expect(readPayload(nonce).slice(1, 3)).toEqual([NOW, NOW + lifetimeSeconds * 1000]);
      expect(signer.verify(nonce, JKT, NOW + lifetimeSeconds * 1000 - 1)).toBe(true);
      expect(signer.verify(nonce, JKT, NOW + lifetimeSeconds * 1000)).toBe(false);
      expect(signer.verify(nonce, JKT, NOW - 1)).toBe(false);
    },
  );

  it.each([
    { name: 'wrong key', jkt: OTHER_JKT, namespace: NAMESPACE, secret: SECRET },
    {
      name: 'wrong context',
      jkt: JKT,
      namespace: JSON.stringify(['vault', 'https://api.example.com', '/auth', 'issuer', 'client']),
      secret: SECRET,
    },
    { name: 'wrong secret', jkt: JKT, namespace: NAMESPACE, secret: new Uint8Array(32).fill(71) },
  ])('rejects $name without maintaining a previous-secret or nonce list', ({ jkt, namespace, secret }) => {
    const nonce = policy().issue(JKT, NOW);
    const other = policy({ namespace, secret });
    expect(other.verify(nonce, jkt, NOW)).toBe(false);
    expect(other.verify(other.issue(jkt, NOW), jkt, NOW)).toBe(true);
  });

  it('owns Buffer/subarray secret bytes despite later caller mutation and frozen option containers', () => {
    const buffer = Buffer.alloc(64, 37);
    const options = Object.freeze({ secret: buffer.subarray(16, 48), namespace: NAMESPACE });
    const signer = createDpopNoncePolicy(options);
    buffer.fill(97);
    const nonce = signer.issue(JKT, NOW);
    expect(policy().verify(nonce, JKT, NOW)).toBe(true);
    expect(createDpopNoncePolicy(options).verify(nonce, JKT, NOW)).toBe(false);
  });

  it('keeps the wire value under 512 bytes even with a very long namespace and maximum safe epochs', () => {
    const namespace = JSON.stringify([
      'vault',
      `https://${'long-config.'.repeat(10_000)}example.com`,
      '/auth',
      'issuer',
      'client',
    ]);
    const signer = policy({ namespace, lifetimeSeconds: 300 });
    const issuedAt = Number.MAX_SAFE_INTEGER - 300_000;
    const nonce = signer.issue(JKT, issuedAt);
    expect(Buffer.byteLength(nonce)).toBeLessThanOrEqual(DPOP_NONCE_MAX_BYTES);
    expect(readPayload(nonce).slice(1, 4)).toEqual([
      issuedAt,
      Number.MAX_SAFE_INTEGER,
      createHash('sha256').update(namespace).digest('base64url'),
    ]);
    expect(nonce).not.toContain('long-config');
    expect(signer.verify(nonce, JKT, Number.MAX_SAFE_INTEGER - 1)).toBe(true);
    expect(signer.verify(nonce, JKT, Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(policy({ lifetimeSeconds: 1 }).verify(policy({ lifetimeSeconds: 1 }).issue(JKT, 0), JKT, 0)).toBe(true);
  });

  it.each([undefined, null, [], 'shared-secret', new Uint8Array(31), Buffer.alloc(31)])(
    'rejects a missing/non-byte/short secret %j at construction',
    (secret) => {
      expect(() => policy({ secret: secret as Uint8Array })).toThrow('at least 32 bytes');
    },
  );

  it.each([0, -1, 0.5, 301, Infinity, -Infinity, NaN, null, '60'])(
    'rejects invalid nonce lifetime %j',
    (lifetimeSeconds) => {
      expect(() => policy({ lifetimeSeconds: lifetimeSeconds as number })).toThrow('1 through 300');
    },
  );

  it.each(['', undefined, null, 123])('requires a resolved namespace %j', (namespace) => {
    expect(() => policy({ namespace: namespace as string })).toThrow('namespace');
  });

  it.each([
    { name: 'wrong thumbprint', jkt: 'raw-unverified-key', now: NOW },
    { name: 'noncanonical thumbprint', jkt: `${JKT}=`, now: NOW },
    { name: 'negative epoch', jkt: JKT, now: -1 },
    { name: 'fractional epoch', jkt: JKT, now: NOW + 0.5 },
    { name: 'NaN epoch', jkt: JKT, now: NaN },
    { name: 'infinite epoch', jkt: JKT, now: Infinity },
    { name: 'unsafe epoch', jkt: JKT, now: Number.MAX_SAFE_INTEGER + 1 },
    { name: 'overflowing expiry', jkt: JKT, now: Number.MAX_SAFE_INTEGER },
  ])('rejects $name before nonce issuance', ({ jkt, now }) => {
    expect(() => policy().issue(jkt, now)).toThrow('safe live epoch');
    expect(policy().verify(signPayload(payload()), jkt, now)).toBe(false);
  });

  it.each([
    undefined,
    null,
    123,
    {},
    '',
    'v1',
    'v1.payload',
    'v2.payload.mac',
    'x'.repeat(512),
    'x'.repeat(513),
    'é'.repeat(257),
  ])('rejects malformed/type/byte-bounded nonce input %j', (nonce) => {
    expect(policy().verify(nonce, JKT, NOW)).toBe(false);
  });

  it('rejects tampering, wrong domain, noncanonical base64url, joined/extra segments and header injection', () => {
    const nonce = signPayload(payload());
    const [version, encoded, mac] = nonce.split('.') as [string, string, string];
    const wrongDomainMac = createHmac('sha256', SECRET).update(`v1.${encoded}`).digest('base64url');
    const wrongPayload = `${encoded[0] === 'A' ? 'B' : 'A'}${encoded.slice(1)}`;
    for (const malformed of [
      `${version}.${wrongPayload}.${mac}`,
      `${version}.${encoded}.${wrongDomainMac}`,
      `${version}.${encoded}=.${mac}`,
      `${version}.${encoded}.${mac}=`,
      `${nonce}.`,
      `${nonce}.extra`,
      ` ${nonce}`,
      `${nonce}, ${nonce}`,
      `${nonce}\r\nInjected: true`,
    ])
      expect(policy().verify(malformed, JKT, NOW)).toBe(false);
  });

  it.each([
    { name: 'object payload', value: { random: RANDOM } },
    { name: 'missing tuple field', value: payload().slice(0, 4) },
    { name: 'extra tuple field', value: [...payload(), 'extension'] },
    { name: 'short random', index: 0, value: Buffer.alloc(15).toString('base64url') },
    { name: 'excessive random', index: 0, value: Buffer.alloc(17).toString('base64url') },
    { name: 'noncanonical random', index: 0, value: `${RANDOM.slice(0, -1)}B` },
    { name: 'string issuance', index: 1, value: String(NOW) },
    { name: 'negative issuance', index: 1, value: -1 },
    { name: 'future issuance', index: 1, value: NOW + 1000 },
    { name: 'fractional issuance', index: 1, value: NOW + 0.5 },
    { name: 'unsafe expiry', index: 2, value: Number.MAX_SAFE_INTEGER + 1 },
    { name: 'fractional expiry', index: 2, value: NOW + 1000.5 },
    { name: 'zero lifetime', index: 2, value: NOW },
    { name: 'negative lifetime', index: 2, value: NOW - 1000 },
    { name: 'subsecond lifetime', index: 2, value: NOW + 999 },
    { name: 'noninteger-second lifetime', index: 2, value: NOW + 1001 },
    { name: 'lifetime above configured bound', index: 2, value: NOW + 61_000 },
    { name: 'lifetime above global bound', index: 2, value: NOW + 301_000 },
    { name: 'wrong namespace digest', index: 3, value: createHash('sha256').update('other').digest('base64url') },
    { name: 'raw namespace', index: 3, value: NAMESPACE },
    { name: 'wrong jkt', index: 4, value: OTHER_JKT },
    { name: 'missing jkt', index: 4, value: null },
  ])('rejects an issuer-authentic malformed payload: $name', (input) => {
    const modified = payload();
    if (input.index !== undefined) modified[input.index] = input.value;
    const nonce = signPayload(input.index === undefined ? input.value : modified);
    expect(policy().verify(nonce, JKT, NOW)).toBe(false);
  });

  it('rejects issuer-authentic non-JSON/noncanonical JSON and cannot accept stale nonces', () => {
    const invalidUtf8 = Buffer.from(JSON.stringify(payload()));
    invalidUtf8[2] = 0xff;
    for (const bytes of [
      Buffer.from('not-json'),
      Buffer.from(`${JSON.stringify(payload())} `),
      Buffer.from(JSON.stringify(payload()).replace(String(NOW), `${NOW}.0`)),
      invalidUtf8,
    ])
      expect(policy().verify(signBytes(bytes), JKT, NOW)).toBe(false);
    expect(policy().verify(signPayload(payload()), JKT, NOW + 60_000)).toBe(false);
    expect(policy().verify(signPayload(payload()), JKT, NOW + 60_001)).toBe(false);
  });
});
