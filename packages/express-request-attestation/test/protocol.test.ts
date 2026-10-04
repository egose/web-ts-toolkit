/**
 * ATT-01 protocol/codec/target tests.
 *
 * Fixture-driven cases cross-check production helpers against the committed
 * independent `test/fixtures/protocol-v1.json` expectations (computed with
 * raw node:crypto, never with the helpers under test). Rejection cases cover
 * canonical base64url/numeric/array rules, every MAC-protected field, and
 * all section 4.2/4.3 bounds before decode/allocation.
 */
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  base64urlDecode,
  base64urlEncode,
  buildMacInputBytes,
  buildReplayKeyPreimageBytes,
  canonicalizeRequestTarget,
  decodeTransactionId,
  deriveAttestationReplayKey,
  encodeTransactionId,
  extractSingleHeaderValue,
  hashBodySha256Hex,
  normalizeContentType,
  normalizeMethod,
  validateHeaderName,
  validatePublicOrigin,
} from '../src/index.js';
import {
  EMPTY_BODY_SHA256_HEX,
  MAX_CONTENT_TYPE_BYTES,
  MAX_ENCODED_TRANSACTION_ID_BYTES,
  MAX_REQUEST_TARGET_BYTES,
} from '../src/index.js';

interface FixtureCase {
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
  bodyTextUtf8: string | null;
  bodyHashHex: string;
  macInput?: string;
  mac?: string;
  transactionId?: string;
  variants?: { contentType: string; macInput: string; mac: string; transactionId: string }[];
}

interface FixtureDoc {
  version: number;
  emptyBodySha256Hex: string;
  cases: FixtureCase[];
}

const doc = JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'protocol-v1.json'), 'utf8')) as FixtureDoc;

function directMac(keyHex: string, macInput: string): string {
  return createHmac('sha256', Buffer.from(keyHex, 'hex')).update(macInput, 'utf8').digest('base64url');
}

describe('protocol-v1 fixtures (independent node:crypto expectations)', () => {
  it('declares version 1 and the empty-body digest', () => {
    expect(doc.version).toBe(1);
    expect(doc.emptyBodySha256Hex).toBe(EMPTY_BODY_SHA256_HEX);
    expect(EMPTY_BODY_SHA256_HEX).toBe(createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
  });

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
        it(`matches independent bytes/mac/envelope (${label})`, () => {
          const body = new Uint8Array(Buffer.from(fixture.bodyBase64, 'base64'));
          // Independent digest check (no production helper involved).
          expect(createHash('sha256').update(body).digest('hex')).toBe(fixture.bodyHashHex);
          // Production digest helper agrees with the committed digest.
          expect(hashBodySha256Hex(body)).toBe(fixture.bodyHashHex);
          // Production MAC-input framing is byte-identical to the fixture.
          const framed = buildMacInputBytes({
            replayNamespace: fixture.replayNamespace,
            publicOrigin: fixture.publicOrigin,
            keyId: fixture.keyId,
            timestampMs: fixture.timestampMs,
            nonceHex: fixture.nonceHex,
            method: fixture.method,
            requestTarget: fixture.requestTarget,
            contentType: variant.contentType,
            bodyHashHex: fixture.bodyHashHex,
          });
          expect(Buffer.from(framed).toString('utf8')).toBe(variant.macInput);
          // Independent HMAC matches the committed mac; mac is 43 chars / 32 bytes.
          expect(directMac(fixture.keyHex, variant.macInput as string)).toBe(variant.mac);
          expect((variant.mac as string).length).toBe(43);
          expect(base64urlDecode(variant.mac as string).length).toBe(32);
          // Production envelope encode matches; decode round-trips every field.
          expect(
            encodeTransactionId({
              keyId: fixture.keyId,
              timestampMs: fixture.timestampMs,
              nonceHex: fixture.nonceHex,
              mac: variant.mac as string,
            }),
          ).toBe(variant.transactionId);
          expect(decodeTransactionId(variant.transactionId)).toEqual({
            keyId: fixture.keyId,
            timestampMs: fixture.timestampMs,
            nonceHex: fixture.nonceHex,
            mac: variant.mac,
          });
          // Replay-key derivation matches direct SHA-256 of the preimage.
          const preimage = buildReplayKeyPreimageBytes({
            replayNamespace: fixture.replayNamespace,
            publicOrigin: fixture.publicOrigin,
            nonceHex: fixture.nonceHex,
          });
          const expectedKey = `att:v1:${createHash('sha256').update(preimage).digest('hex')}`;
          expect(
            deriveAttestationReplayKey({
              replayNamespace: fixture.replayNamespace,
              publicOrigin: fixture.publicOrigin,
              nonceHex: fixture.nonceHex,
            }),
          ).toBe(expectedKey);
        });
      }

      it('binds every MAC-protected field (tampering changes the mac)', () => {
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
        const expected = variants[0].mac as string;
        const tampered = [
          { ...base, replayNamespace: `${base.replayNamespace}-other` },
          { ...base, publicOrigin: 'https://other.example.com' },
          { ...base, keyId: 'other-key-01' },
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
        for (const fields of tampered) {
          const macInput = Buffer.from(buildMacInputBytes(fields)).toString('utf8');
          expect(directMac(fixture.keyHex, macInput)).not.toBe(expected);
        }
      });
    });
  }

  it('proves content-type binding (same bytes, different types, different MACs)', () => {
    const fixture = doc.cases.find((entry) => entry.name === 'content-type-change');
    expect(fixture?.variants).toHaveLength(2);
    const [first, second] = fixture?.variants as {
      mac: string;
      macInput: string;
      transactionId: string;
    }[];
    expect(first.mac).not.toBe(second.mac);
    expect(first.macInput).not.toBe(second.macInput);
    expect(first.transactionId).not.toBe(second.transactionId);
  });

  it('treats a lone empty ? as no search string on both sides', () => {
    expect(canonicalizeRequestTarget('/items?')).toBe('/items');
    expect(canonicalizeRequestTarget('/?')).toBe('/');
    const fixture = doc.cases.find((entry) => entry.name === 'empty-search-question');
    expect(fixture?.requestTarget).toBe('/items');
    // A signer holding "/items?" frames identical bytes to one holding "/items".
    const withQuestion = buildMacInputBytes({
      replayNamespace: fixture?.replayNamespace as string,
      publicOrigin: fixture?.publicOrigin as string,
      keyId: fixture?.keyId as string,
      timestampMs: fixture?.timestampMs as number,
      nonceHex: fixture?.nonceHex as string,
      method: 'GET',
      requestTarget: '/items?',
      contentType: '',
      bodyHashHex: fixture?.bodyHashHex as string,
    });
    expect(Buffer.from(withQuestion).toString('utf8')).toBe(fixture?.macInput);
  });
});

describe('strict envelope rejection', () => {
  const valid = doc.cases[0].transactionId as string;

  it('rejects padding, foreign alphabets, and impossible lengths', () => {
    expect(() => decodeTransactionId(`${valid}=`)).toThrow();
    expect(() => decodeTransactionId(valid.replace(/A/g, '+'))).toThrow();
    expect(() => decodeTransactionId('ABC')).toThrow();
    expect(() => decodeTransactionId('')).toThrow();
    expect(() => decodeTransactionId(42)).toThrow();
  });

  it('enforces the 1024-byte bound before decoding', () => {
    expect(() => decodeTransactionId('A'.repeat(MAX_ENCODED_TRANSACTION_ID_BYTES + 1))).toThrow();
    expect(() => decodeTransactionId('A'.repeat(MAX_ENCODED_TRANSACTION_ID_BYTES))).toThrow();
  });

  it('rejects non-canonical JSON: whitespace and alternate numeric spellings', () => {
    const raw = Buffer.from(base64urlDecode(valid)).toString('utf8');
    const spaced = base64urlEncode(new TextEncoder().encode(raw.replaceAll(',', ', ')));
    expect(() => decodeTransactionId(spaced)).toThrow();
    const parsed = JSON.parse(raw) as unknown[];
    // "1.0" timestamp spelling.
    const dotZero = base64urlEncode(
      new TextEncoder().encode(
        JSON.stringify([1, parsed[1], parsed[2], parsed[3], parsed[4]]).replace('1780000000000', '1780000000000.0'),
      ),
    );
    expect(() => decodeTransactionId(dotZero)).toThrow();
    // Exponential spelling.
    const exp = base64urlEncode(
      new TextEncoder().encode(
        JSON.stringify([1, parsed[1], parsed[2], parsed[3], parsed[4]]).replace('1780000000000', '1.78e12'),
      ),
    );
    expect(() => decodeTransactionId(exp)).toThrow();
  });

  it('rejects wrong length arrays and unknown versions', () => {
    const encode = (value: unknown): string => base64urlEncode(new TextEncoder().encode(JSON.stringify(value)));
    const parsed = JSON.parse(Buffer.from(base64urlDecode(valid)).toString('utf8')) as unknown[];
    expect(() => decodeTransactionId(encode([...parsed, 'extra']))).toThrow();
    expect(() => decodeTransactionId(encode(parsed.slice(0, 4)))).toThrow();
    expect(() => decodeTransactionId(encode([2, parsed[1], parsed[2], parsed[3], parsed[4]]))).toThrow();
    expect(() => decodeTransactionId(encode({ version: 1 }))).toThrow();
  });

  it('rejects malformed fields', () => {
    const encode = (value: unknown): string => base64urlEncode(new TextEncoder().encode(JSON.stringify(value)));
    const [version, keyId, ts, nonce, mac] = JSON.parse(
      Buffer.from(base64urlDecode(valid)).toString('utf8'),
    ) as unknown[];
    expect(() => decodeTransactionId(encode([version, 42, ts, nonce, mac]))).toThrow();
    expect(() => decodeTransactionId(encode([version, '', ts, nonce, mac]))).toThrow();
    expect(() => decodeTransactionId(encode([version, 'bad id!', ts, nonce, mac]))).toThrow();
    expect(() => decodeTransactionId(encode([version, 'x'.repeat(65), ts, nonce, mac]))).toThrow();
    expect(() => decodeTransactionId(encode([version, keyId, -1, nonce, mac]))).toThrow();
    expect(() => decodeTransactionId(encode([version, keyId, 1.5, nonce, mac]))).toThrow();
    expect(() => decodeTransactionId(encode([version, keyId, Number.MAX_SAFE_INTEGER + 1, nonce, mac]))).toThrow();
    expect(() => decodeTransactionId(encode([version, keyId, '1780000000000', nonce, mac]))).toThrow();
    expect(() => decodeTransactionId(encode([version, keyId, ts, 'ABCDEF0123456789ABCDEF0123456789', mac]))).toThrow(); // pragma: allowlist secret
    expect(() => decodeTransactionId(encode([version, keyId, ts, 'abcd', mac]))).toThrow();
    expect(() => decodeTransactionId(encode([version, keyId, ts, nonce, 'short']))).toThrow();
    expect(() => decodeTransactionId(encode([version, keyId, ts, nonce, `${mac}=`]))).toThrow();
    expect(() => decodeTransactionId(encode([version, keyId, ts, nonce, 'A'.repeat(42)]))).toThrow();
  });
});

describe('request target rules (section 4.3)', () => {
  it('preserves encoded bytes, order, duplicates, plus, and spelling', () => {
    expect(canonicalizeRequestTarget('/files/a%2Fb%3Fc%40d%25e/seven?x=%2F&y=%3F')).toBe(
      '/files/a%2Fb%3Fc%40d%25e/seven?x=%2F&y=%3F',
    );
    expect(canonicalizeRequestTarget('/search?tag=a&tag=b&tag=a&q=x+y&lang=en')).toBe(
      '/search?tag=a&tag=b&tag=a&q=x+y&lang=en',
    );
    expect(canonicalizeRequestTarget('/a//b///c/')).toBe('/a//b///c/');
    expect(canonicalizeRequestTarget('/A%2fB')).toBe('/A%2fB');
  });

  it('rejects authority forms, fragments, backslashes, controls, and bad escapes', () => {
    for (const bad of [
      '',
      'https://example.com/x',
      '//evil.com/x',
      '/a#b',
      '/a\\b',
      '/a b',
      '/a\tb',
      '/a\x01b',
      '/a\x7fb',
      '/a%2',
      '/a%zz',
      '/a%',
      '/.',
      '/./x',
      '/a/./b',
      '/../x',
      '/a/../b',
      '/a/%2e/b',
      '/a/%2E/b',
      '/a/%2e%2e/b',
      '/a/%252e%252e/b',
    ]) {
      if (bad === '/a/%252e%252e/b') {
        // Double-encoded dots are preserved bytes, not dot segments.
        expect(canonicalizeRequestTarget(bad)).toBe(bad);
        continue;
      }
      expect(() => canonicalizeRequestTarget(bad), bad).toThrow();
    }
  });

  it('enforces the 8192-byte bound before allocation', () => {
    expect(() => canonicalizeRequestTarget(`/${'a'.repeat(MAX_REQUEST_TARGET_BYTES)}`)).toThrow();
    expect(canonicalizeRequestTarget(`/${'a'.repeat(MAX_REQUEST_TARGET_BYTES - 2)}`)).toBeDefined();
  });
});

describe('method, content-type, origin, header, and key rules', () => {
  it('uppercases methods and rejects non-tokens', () => {
    expect(normalizeMethod('get')).toBe('GET');
    expect(normalizeMethod('Post')).toBe('POST');
    expect(() => normalizeMethod('')).toThrow();
    expect(() => normalizeMethod('GE T')).toThrow();
  });

  it('trims outer whitespace, preserves boundaries, and bounds content types', () => {
    expect(normalizeContentType(undefined)).toBe('');
    expect(normalizeContentType(null)).toBe('');
    expect(normalizeContentType('  text/plain; charset=utf-8\t ')).toBe('text/plain; charset=utf-8');
    expect(normalizeContentType('multipart/form-data; boundary=----x')).toBe('multipart/form-data; boundary=----x');
    expect(() => normalizeContentType('text/plain\r\n injected: 1')).toThrow();
    expect(normalizeContentType('a'.repeat(MAX_CONTENT_TYPE_BYTES))).toHaveLength(MAX_CONTENT_TYPE_BYTES);
    expect(() => normalizeContentType('a'.repeat(MAX_CONTENT_TYPE_BYTES + 1))).toThrow();
  });

  it('requires canonical HTTPS origins except loopback development', () => {
    expect(() => validatePublicOrigin('https://attestation.example.com')).not.toThrow();
    expect(() => validatePublicOrigin('http://localhost:3000')).not.toThrow();
    expect(() => validatePublicOrigin('http://127.0.0.1:8080')).not.toThrow();
    for (const bad of [
      'http://attestation.example.com',
      'https://user@example.com',
      'https://example.com/path',
      'https://example.com/',
      'https://example.com?q=1',
      'HTTPS://EXAMPLE.COM',
      'https://Example.com',
      'https://example.com:443',
      'wss://example.com',
      'not-a-url',
      '',
      `https://${'a'.repeat(600)}.com`,
    ]) {
      expect(() => validatePublicOrigin(bad), bad).toThrow();
    }
  });

  it('validates header names and detects duplicates', () => {
    expect(() => validateHeaderName('x-client-transaction-id')).not.toThrow();
    expect(() => validateHeaderName('X-Custom-Sig_1')).not.toThrow();
    for (const bad of ['', 'bad name', 'a,b', 'Authorization', 'COOKIE', 'Content-Type', 'x-attestation-error']) {
      expect(() => validateHeaderName(bad), bad).toThrow();
    }
    expect(extractSingleHeaderValue(undefined)).toBeNull();
    expect(extractSingleHeaderValue('abc')).toBe('abc');
    expect(extractSingleHeaderValue(['abc'])).toBe('abc');
    expect(() => extractSingleHeaderValue(['a', 'b'])).toThrow();
    expect(() => extractSingleHeaderValue('a, b')).toThrow();
    expect(extractSingleHeaderValue([])).toBeNull();
  });
});
