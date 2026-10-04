/**
 * ATT-01 canonical primitives: UTF-8, unpadded canonical base64url, and
 * whitespace-free canonical JSON arrays.
 *
 * Browser-safe: implemented on `TextEncoder`/`TextDecoder` and manual
 * base64url tables only. No `Buffer`, no Node built-ins, no dependencies.
 */
import { AttestationProtocolError } from './types.js';

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; // pragma: allowlist secret

const BASE64URL_DECODE_TABLE: Readonly<Record<string, number>> = (() => {
  const table: Record<string, number> = Object.create(null);
  for (let index = 0; index < BASE64URL_ALPHABET.length; index += 1) {
    table[BASE64URL_ALPHABET[index]] = index;
  }
  return table;
})();

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

/** UTF-8 encode without BOM. */
export function utf8Encode(text: string): Uint8Array {
  if (typeof text !== 'string') {
    throw new AttestationProtocolError('expected a string for UTF-8 encoding');
  }
  return textEncoder.encode(text);
}

/** UTF-8 decode; rejects lone surrogates and invalid sequences. */
export function utf8Decode(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) {
    throw new AttestationProtocolError('expected a Uint8Array for UTF-8 decoding');
  }
  try {
    return textDecoder.decode(bytes);
  } catch {
    throw new AttestationProtocolError('input is not valid UTF-8');
  }
}

/** UTF-8 byte length of a string. */
export function utf8ByteLength(text: string): number {
  return utf8Encode(text).length;
}

/**
 * Unpadded canonical base64url encode.
 *
 * @param bytes raw bytes to encode.
 */
export function base64urlEncode(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) {
    throw new AttestationProtocolError('expected a Uint8Array for base64url encoding');
  }
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const triplet = (first << 16) | (second << 8) | third;
    out += BASE64URL_ALPHABET[(triplet >> 18) & 0x3f];
    out += BASE64URL_ALPHABET[(triplet >> 12) & 0x3f];
    if (index + 1 < bytes.length) {
      out += BASE64URL_ALPHABET[(triplet >> 6) & 0x3f];
    }
    if (index + 2 < bytes.length) {
      out += BASE64URL_ALPHABET[triplet & 0x3f];
    }
  }
  return out;
}

/**
 * Strict canonical base64url decode.
 *
 * Rejects padding (`=`), foreign alphabets, impossible lengths
 * (`length % 4 === 1`), and non-canonical trailing bits (decode/re-encode
 * must reproduce the input exactly).
 */
export function base64urlDecode(input: string): Uint8Array {
  if (typeof input !== 'string' || input.length === 0) {
    throw new AttestationProtocolError('base64url input must be a non-empty string');
  }
  for (const char of input) {
    if (!(char in BASE64URL_DECODE_TABLE)) {
      throw new AttestationProtocolError('base64url input uses a non-canonical alphabet or padding');
    }
  }
  if (input.length % 4 === 1) {
    throw new AttestationProtocolError('base64url input has an impossible length');
  }
  const outLength = Math.floor((input.length * 6) / 8);
  const out = new Uint8Array(outLength);
  let cursor = 0;
  let buffer = 0;
  let bits = 0;
  for (const char of input) {
    buffer = (buffer << 6) | (BASE64URL_DECODE_TABLE[char] as number);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[cursor] = (buffer >> bits) & 0xff;
      cursor += 1;
    }
  }
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
    throw new AttestationProtocolError('base64url input has non-canonical trailing bits');
  }
  const canonical = base64urlEncode(out);
  if (canonical !== input) {
    throw new AttestationProtocolError('base64url input is not canonical');
  }
  return out;
}

/**
 * Whitespace-free canonical JSON serialization of a JSON value, as UTF-8
 * bytes. `JSON.stringify` output is already whitespace-free; anything it
 * cannot represent (`undefined`, functions, circular graphs) is rejected.
 */
export function canonicalJsonBytes(value: unknown): Uint8Array {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    throw new AttestationProtocolError('value is not JSON-serializable');
  }
  if (typeof text !== 'string') {
    throw new AttestationProtocolError('value is not JSON-serializable');
  }
  return utf8Encode(text);
}

/**
 * Strict canonical JSON array parse.
 *
 * The raw text must round-trip `JSON.parse`/`JSON.stringify` byte-for-byte,
 * which rejects whitespace, alternate numeric spellings (`1.0`, `1e3`,
 * `+1`, `-0`), non-minimal string escapes, and duplicate-key-tolerant
 * reserialization. The parsed value must be an array of exactly
 * `expectedLength` elements when given.
 */
export function parseCanonicalJsonArray(text: string, expectedLength?: number): unknown[] {
  if (typeof text !== 'string') {
    throw new AttestationProtocolError('canonical JSON input must be a string');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AttestationProtocolError('input is not valid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new AttestationProtocolError('canonical JSON input must be an array');
  }
  if (JSON.stringify(parsed) !== text) {
    throw new AttestationProtocolError('JSON input is not in canonical form');
  }
  if (expectedLength !== undefined && parsed.length !== expectedLength) {
    throw new AttestationProtocolError(`canonical JSON array must have exactly ${expectedLength} elements`);
  }
  return parsed;
}

/** Assert a value is a non-negative safe-integer epoch-millisecond count. */
export function assertTimestampMs(name: string, value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new AttestationProtocolError(`${name} must be a non-negative safe integer`);
  }
}
