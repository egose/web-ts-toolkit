/**
 * ATT-01 shared wire codec: strict transaction-ID envelope framing, MAC input
 * construction, and every field/target/content-type/origin/header validator.
 *
 * Bounds are enforced BEFORE decoding, recursion, or allocation. All helpers
 * are browser-safe (no hashing here: hashing needs WebCrypto async on the
 * client and `node:crypto` on the server, so this module validates digests
 * and builds byte preimages while each entry hashes with its own runtime).
 */
import {
  assertTimestampMs,
  base64urlDecode,
  base64urlEncode,
  canonicalJsonBytes,
  parseCanonicalJsonArray,
  utf8ByteLength,
  utf8Decode,
} from './canonical.js';
import {
  ATTESTATION_ERROR_RESPONSE_HEADER,
  AttestationProtocolError,
  KEY_BYTES_LENGTH,
  MAC_BYTES_LENGTH,
  MAC_INPUT_LABEL,
  MAX_CONTENT_TYPE_BYTES,
  MAX_ENCODED_TRANSACTION_ID_BYTES,
  MAX_HEADER_NAME_BYTES,
  MAX_KEY_ID_LENGTH,
  MAX_PUBLIC_ORIGIN_BYTES,
  MAX_REPLAY_KEY_BYTES,
  MAX_REPLAY_NAMESPACE_LENGTH,
  MAX_REQUEST_TARGET_BYTES,
  MIN_REPLAY_KEY_BYTES,
  PROTOCOL_VERSION,
  type AttestationMacInput,
  type MacInputFields,
  type TransactionIdFields,
} from './types.js';

const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const REPLAY_NAMESPACE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const NONCE_HEX_PATTERN = /^[0-9a-f]{32}$/;
const BODY_HASH_HEX_PATTERN = /^[0-9a-f]{64}$/;
const HTTP_TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const HEX_BYTE_PATTERN = /^[0-9a-fA-F]{2}$/;

/**
 * Header names that must never be configured as the signature field: auth
 * and cookie credentials, host/origin addressing, body metadata, and the
 * package's own stale-key response marker.
 */
const RESERVED_HEADER_NAMES: ReadonlySet<string> = new Set([
  'authorization',
  'proxy-authenticate',
  'proxy-authorization',
  'www-authenticate',
  'cookie',
  'set-cookie',
  'host',
  'origin',
  'content-encoding',
  'content-length',
  'content-type',
  'transfer-encoding',
  ATTESTATION_ERROR_RESPONSE_HEADER,
]);

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '[::1]' || /^127\./.test(hostname);
}

/** Key IDs match `[A-Za-z0-9_-]{1,64}` (task section 4.1 snapshot rules). */
export function validateKeyId(keyId: unknown): asserts keyId is string {
  if (typeof keyId !== 'string' || !KEY_ID_PATTERN.test(keyId) || keyId.length > MAX_KEY_ID_LENGTH) {
    throw new AttestationProtocolError('keyId must match [A-Za-z0-9_-]{1,64}');
  }
}

/** Replay namespaces match `[A-Za-z0-9_-]{1,128}`. */
export function validateReplayNamespace(namespace: unknown): asserts namespace is string {
  if (
    typeof namespace !== 'string' ||
    !REPLAY_NAMESPACE_PATTERN.test(namespace) ||
    namespace.length > MAX_REPLAY_NAMESPACE_LENGTH
  ) {
    throw new AttestationProtocolError('replayNamespace must match [A-Za-z0-9_-]{1,128}');
  }
}

/** Nonces are exactly 32 lowercase hex chars (16 random bytes). */
export function validateNonceHex(nonceHex: unknown): asserts nonceHex is string {
  if (typeof nonceHex !== 'string' || !NONCE_HEX_PATTERN.test(nonceHex)) {
    throw new AttestationProtocolError('nonceHex must be exactly 32 lowercase hex characters');
  }
}

/** Body digests are lowercase hex SHA-256 (32 bytes). */
export function validateBodyHashHex(bodyHashHex: unknown): asserts bodyHashHex is string {
  if (typeof bodyHashHex !== 'string' || !BODY_HASH_HEX_PATTERN.test(bodyHashHex)) {
    throw new AttestationProtocolError('bodyHashHex must be exactly 64 lowercase hex characters');
  }
}

/** MACs are exactly 43 canonical base64url chars decoding to 32 bytes. */
export function validateMac(mac: unknown): asserts mac is string {
  if (typeof mac !== 'string' || mac.length !== 43) {
    throw new AttestationProtocolError('mac must be exactly 43 base64url characters');
  }
  const decoded = base64urlDecode(mac);
  if (decoded.length !== MAC_BYTES_LENGTH) {
    throw new AttestationProtocolError('mac must decode to 32 bytes');
  }
}

/** HMAC key material is exactly 32 bytes. */
export function validateKeyBytes(key: unknown): asserts key is Uint8Array {
  if (!(key instanceof Uint8Array) || key.length !== KEY_BYTES_LENGTH) {
    throw new AttestationProtocolError('signing key must be exactly 32 bytes');
  }
}

/**
 * Canonical HTTP(S) origin validation. The value must already be canonical:
 * lowercase scheme/host, no userinfo, no path/query/fragment, no trailing
 * slash, no redundant default port. HTTPS is required except for loopback
 * development (`localhost`, `127.0.0.0/8`, `[::1]`). Never derive this from
 * `Host`, `Forwarded`, or `X-Forwarded-*` — it is static configuration.
 */
export function validatePublicOrigin(origin: unknown): asserts origin is string {
  if (typeof origin !== 'string') {
    throw new AttestationProtocolError('publicOrigin must be a string');
  }
  if (origin.length === 0 || utf8ByteLength(origin) > MAX_PUBLIC_ORIGIN_BYTES) {
    throw new AttestationProtocolError(`publicOrigin must be 1-${MAX_PUBLIC_ORIGIN_BYTES} UTF-8 bytes`);
  }
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new AttestationProtocolError('publicOrigin must be a valid HTTP(S) origin');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AttestationProtocolError('publicOrigin must use http or https');
  }
  if (url.username !== '' || url.password !== '') {
    throw new AttestationProtocolError('publicOrigin must not contain userinfo');
  }
  const canonical = `${url.protocol}//${url.host}`;
  if (origin !== canonical) {
    throw new AttestationProtocolError(
      'publicOrigin must be canonical (lowercase, no path, no trailing slash, no default port)',
    );
  }
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) {
    throw new AttestationProtocolError('http publicOrigin is allowed only for loopback development');
  }
}

/**
 * Actual method normalized to uppercase. The method is a valid HTTP token;
 * lowercase input such as `get` normalizes to `GET` on both sides.
 */
export function normalizeMethod(method: unknown): string {
  if (typeof method !== 'string' || method.length === 0 || !HTTP_TOKEN_PATTERN.test(method)) {
    throw new AttestationProtocolError('method must be a non-empty valid HTTP token');
  }
  return method.toUpperCase();
}

/**
 * Single final `Content-Type` value with outer HTTP whitespace (SP/HTAB)
 * trimmed; remaining bytes — including a generated multipart boundary — are
 * preserved. Missing values normalize to `""`. Controls are rejected and
 * the normalized value is bounded to 256 UTF-8 bytes.
 */
export function normalizeContentType(contentType: unknown): string {
  if (contentType === undefined || contentType === null) {
    return '';
  }
  if (typeof contentType !== 'string') {
    throw new AttestationProtocolError('contentType must be a string');
  }
  // Strip only outer OWS (SP / HTAB); interior bytes are preserved verbatim.
  const trimmed = contentType.replace(/^[ \t]+|[ \t]+$/g, '');
  for (const char of trimmed) {
    const code = char.codePointAt(0) as number;
    if (code === 0x09 || code === 0x20) {
      continue;
    }
    if (code < 0x20 || code === 0x7f) {
      throw new AttestationProtocolError('contentType must not contain control characters');
    }
  }
  if (utf8ByteLength(trimmed) > MAX_CONTENT_TYPE_BYTES) {
    throw new AttestationProtocolError(`contentType must be at most ${MAX_CONTENT_TYPE_BYTES} UTF-8 bytes`);
  }
  return trimmed;
}

function assertValidPercentEscapes(target: string): void {
  for (let index = 0; index < target.length; index += 1) {
    if (target[index] !== '%') {
      continue;
    }
    const hex = target.slice(index + 1, index + 3);
    if (!HEX_BYTE_PATTERN.test(hex)) {
      throw new AttestationProtocolError('requestTarget contains a malformed percent escape');
    }
    index += 2;
  }
}

function percentDecodeSegment(segment: string): string {
  return segment.replace(/%[0-9a-fA-F]{2}/g, (escape) => String.fromCharCode(Number.parseInt(escape.slice(1), 16)));
}

/**
 * Canonical origin-form request target.
 *
 * The signer uses the final `Request.url` pathname plus raw search string;
 * Express uses `req.originalUrl` plus a configured stripped-proxy prefix.
 * Either way the ENCODED bytes are preserved: reserved path escapes, case and
 * spelling of percent escapes, trailing/doubled slashes, duplicate query
 * parameters, query order, and `+` all survive untouched — no `req.query`
 * sorting, no JSON query reserialization, no decoding.
 *
 * The single normalization both sides apply: a lone empty `?` is treated as
 * no search string (`/items?` signs as `/items`).
 *
 * Rejected before any allocation: non-origin forms, `//authority` targets,
 * fragments, backslashes, controls, raw spaces, malformed percent escapes,
 * and canonical/noncanonical dot-segment forms (including `%2e` spellings).
 */
export function canonicalizeRequestTarget(target: unknown): string {
  if (typeof target !== 'string') {
    throw new AttestationProtocolError('requestTarget must be a string');
  }
  if (target.length === 0) {
    throw new AttestationProtocolError('requestTarget must not be empty');
  }
  if (utf8ByteLength(target) > MAX_REQUEST_TARGET_BYTES) {
    throw new AttestationProtocolError(`requestTarget must be at most ${MAX_REQUEST_TARGET_BYTES} UTF-8 bytes`);
  }
  if (!target.startsWith('/')) {
    throw new AttestationProtocolError('requestTarget must be an origin-form target starting with /');
  }
  if (target.startsWith('//')) {
    throw new AttestationProtocolError('requestTarget must not resolve as an authority');
  }
  for (const char of target) {
    const code = char.codePointAt(0) as number;
    if (code <= 0x20 || code === 0x7f) {
      throw new AttestationProtocolError('requestTarget must not contain controls or raw spaces');
    }
    if (char === '#' || char === '\\') {
      throw new AttestationProtocolError('requestTarget must not contain fragments or backslashes');
    }
  }
  assertValidPercentEscapes(target);
  const queryIndex = target.indexOf('?');
  const path = queryIndex === -1 ? target : target.slice(0, queryIndex);
  for (const segment of path.split('/')) {
    if (segment === '.' || segment === '..') {
      throw new AttestationProtocolError('requestTarget must not contain dot segments');
    }
    const decoded = percentDecodeSegment(segment).toLowerCase();
    if (decoded === '.' || decoded === '..') {
      throw new AttestationProtocolError('requestTarget must not contain encoded dot segments');
    }
  }
  if (queryIndex === target.length - 1) {
    return target.slice(0, queryIndex);
  }
  return target;
}

/**
 * Configured signature header-name validation. Names must be valid HTTP
 * tokens and must not collide with auth, cookie, host/origin, body-metadata,
 * or the package's `x-attestation-error` response marker.
 */
export function validateHeaderName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.length === 0) {
    throw new AttestationProtocolError('headerName must be a non-empty string');
  }
  if (utf8ByteLength(name) > MAX_HEADER_NAME_BYTES) {
    throw new AttestationProtocolError(`headerName must be at most ${MAX_HEADER_NAME_BYTES} UTF-8 bytes`);
  }
  if (!HTTP_TOKEN_PATTERN.test(name)) {
    throw new AttestationProtocolError('headerName must be a valid HTTP token');
  }
  if (RESERVED_HEADER_NAMES.has(name.toLowerCase())) {
    throw new AttestationProtocolError(`headerName must not collide with reserved header ${name}`);
  }
}

/**
 * Exactly-one incoming signature field. Returns `null` when absent (the
 * server maps that to `ATTESTATION_MISSING`); throws on duplicate raw-header
 * presentations or comma-joined values instead of selecting one value.
 */
export function extractSingleHeaderValue(raw: string | readonly string[] | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  const values = (Array.isArray(raw) ? raw : [raw]).filter((entry) => entry !== undefined);
  if (values.length === 0) {
    return null;
  }
  if (values.length > 1) {
    throw new AttestationProtocolError('duplicate signature headers are not allowed');
  }
  const value = values[0] as string;
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  if (value.includes(',')) {
    throw new AttestationProtocolError('comma-joined signature headers are not allowed');
  }
  return value;
}

/** Opaque replay keys are 1-256 printable ASCII bytes; never truncated. */
export function validateReplayKey(replayKey: unknown): asserts replayKey is string {
  if (typeof replayKey !== 'string') {
    throw new AttestationProtocolError('replayKey must be a string');
  }
  const length = replayKey.length;
  if (length < MIN_REPLAY_KEY_BYTES || length > MAX_REPLAY_KEY_BYTES) {
    throw new AttestationProtocolError(`replayKey must be ${MIN_REPLAY_KEY_BYTES}-${MAX_REPLAY_KEY_BYTES} characters`);
  }
  for (const char of replayKey) {
    const code = char.codePointAt(0) as number;
    if (code < 0x20 || code > 0x7e) {
      throw new AttestationProtocolError('replayKey must be printable ASCII');
    }
  }
}

/**
 * Exact MAC input bytes: `UTF8(JSON(["wtt-request-signature",1,...])))`.
 * Method, target, and content type are normalized exactly as the verifier
 * normalizes them, so both sides frame identical bytes.
 */
export function buildMacInputBytes(fields: MacInputFields): Uint8Array {
  validateReplayNamespace(fields.replayNamespace);
  validatePublicOrigin(fields.publicOrigin);
  validateKeyId(fields.keyId);
  assertTimestampMs('timestampMs', fields.timestampMs);
  validateNonceHex(fields.nonceHex);
  const method = normalizeMethod(fields.method);
  const requestTarget = canonicalizeRequestTarget(fields.requestTarget);
  const contentType = normalizeContentType(fields.contentType);
  validateBodyHashHex(fields.bodyHashHex);
  const tuple: AttestationMacInput = [
    MAC_INPUT_LABEL,
    PROTOCOL_VERSION,
    fields.replayNamespace,
    fields.publicOrigin,
    fields.keyId,
    fields.timestampMs,
    fields.nonceHex,
    method,
    requestTarget,
    contentType,
    fields.bodyHashHex,
  ];
  return canonicalJsonBytes(tuple);
}

/**
 * Canonical replay-key preimage bytes: `UTF8(JSON([namespace, origin,
 * nonceHex]))`. The caller hashes these with SHA-256 and prefixes the hex
 * with `att:v1:` — the nonce stays single-use across accepted rotations in
 * one protection space, while path, token, session, key ID, and instance
 * stay OUT of the key.
 */
export function buildReplayKeyPreimageBytes(input: {
  readonly replayNamespace: string;
  readonly publicOrigin: string;
  readonly nonceHex: string;
}): Uint8Array {
  validateReplayNamespace(input.replayNamespace);
  validatePublicOrigin(input.publicOrigin);
  validateNonceHex(input.nonceHex);
  return canonicalJsonBytes([input.replayNamespace, input.publicOrigin, input.nonceHex]);
}

/**
 * Encode the transaction-ID envelope `[1,keyId,timestampMs,nonceHex,mac]`
 * as unpadded base64url UTF-8 JSON. The 1024-byte bound is enforced on the
 * encoded output.
 */
export function encodeTransactionId(fields: TransactionIdFields): string {
  validateKeyId(fields.keyId);
  assertTimestampMs('timestampMs', fields.timestampMs);
  validateNonceHex(fields.nonceHex);
  validateMac(fields.mac);
  const encoded = base64urlEncode(
    canonicalJsonBytes([PROTOCOL_VERSION, fields.keyId, fields.timestampMs, fields.nonceHex, fields.mac]),
  );
  if (utf8ByteLength(encoded) > MAX_ENCODED_TRANSACTION_ID_BYTES) {
    throw new AttestationProtocolError(
      `encoded transactionId must be at most ${MAX_ENCODED_TRANSACTION_ID_BYTES} bytes`,
    );
  }
  return encoded;
}

/**
 * Strict envelope decode. The 1024-byte bound is enforced BEFORE decoding;
 * then canonical base64url, UTF-8, canonical JSON array shape, version 1,
 * and every field rule are enforced. Unknown versions, extra array fields,
 * alternate numeric spellings, padding, and duplicate protocol material all
 * throw.
 */
export function decodeTransactionId(headerValue: unknown): TransactionIdFields {
  if (typeof headerValue !== 'string' || headerValue.length === 0) {
    throw new AttestationProtocolError('transactionId must be a non-empty string');
  }
  if (utf8ByteLength(headerValue) > MAX_ENCODED_TRANSACTION_ID_BYTES) {
    throw new AttestationProtocolError(
      `encoded transactionId must be at most ${MAX_ENCODED_TRANSACTION_ID_BYTES} bytes`,
    );
  }
  const bytes = base64urlDecode(headerValue);
  const text = utf8Decode(bytes);
  const envelope = parseCanonicalJsonArray(text, 5);
  const [version, keyId, timestampMs, nonceHex, mac] = envelope;
  if (version !== PROTOCOL_VERSION) {
    throw new AttestationProtocolError(`unsupported transactionId version ${String(version)}`);
  }
  validateKeyId(keyId);
  assertTimestampMs('timestampMs', timestampMs);
  validateNonceHex(nonceHex);
  validateMac(mac);
  return {
    keyId,
    timestampMs,
    nonceHex,
    mac,
  };
}
