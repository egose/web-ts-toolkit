// src/shared/types.ts
var PROTOCOL_VERSION = 1;
var MAC_INPUT_LABEL = "wtt-request-signature";
var DEFAULT_ATTESTATION_HEADER = "x-client-transaction-id";
var ATTESTATION_ERROR_RESPONSE_HEADER = "x-attestation-error";
var REPLAY_KEY_PREFIX = "att:v1:";
var KEY_BYTES_LENGTH = 32;
var NONCE_BYTES_LENGTH = 16;
var MAC_BYTES_LENGTH = 32;
var MAX_KEY_ID_LENGTH = 64;
var MAX_REPLAY_NAMESPACE_LENGTH = 128;
var MAX_ENCODED_TRANSACTION_ID_BYTES = 1024;
var MAX_REQUEST_TARGET_BYTES = 8192;
var MAX_CONTENT_TYPE_BYTES = 256;
var MAX_PUBLIC_ORIGIN_BYTES = 512;
var MIN_REPLAY_KEY_BYTES = 1;
var MAX_REPLAY_KEY_BYTES = 256;
var MAX_HEADER_NAME_BYTES = 128;
var DEFAULT_MAX_BODY_BYTES = 1048576;
var MAX_BODY_BYTES_HARD_CAP = 16777216;
var DEFAULT_MAX_AGE_MS = 3e4;
var MIN_MAX_AGE_MS = 1e3;
var MAX_MAX_AGE_MS = 12e4;
var DEFAULT_CLOCK_SKEW_MS = 5e3;
var MIN_CLOCK_SKEW_MS = 0;
var MAX_CLOCK_SKEW_MS = 3e4;
var DEFAULT_CLUSTER_CLOCK_GUARD_MS = 5e3;
var MIN_CLUSTER_CLOCK_GUARD_MS = 0;
var MAX_CLUSTER_CLOCK_GUARD_MS = 3e4;
var GLOBAL_MAX_RETENTION_MS = 24e4;
var EMPTY_BODY_SHA256_HEX = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
var AttestationProtocolError = class extends Error {
  name = "AttestationProtocolError";
  constructor(message) {
    super(`[express-request-attestation] ${message}`);
  }
};

// src/shared/canonical.ts
var BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
var BASE64URL_DECODE_TABLE = (() => {
  const table = /* @__PURE__ */ Object.create(null);
  for (let index = 0; index < BASE64URL_ALPHABET.length; index += 1) {
    table[BASE64URL_ALPHABET[index]] = index;
  }
  return table;
})();
var textEncoder = new TextEncoder();
var textDecoder = new TextDecoder("utf-8", { fatal: true });
function utf8Encode(text) {
  if (typeof text !== "string") {
    throw new AttestationProtocolError("expected a string for UTF-8 encoding");
  }
  return textEncoder.encode(text);
}
function utf8Decode(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new AttestationProtocolError("expected a Uint8Array for UTF-8 decoding");
  }
  try {
    return textDecoder.decode(bytes);
  } catch {
    throw new AttestationProtocolError("input is not valid UTF-8");
  }
}
function utf8ByteLength(text) {
  return utf8Encode(text).length;
}
function base64urlEncode(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new AttestationProtocolError("expected a Uint8Array for base64url encoding");
  }
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const triplet = first << 16 | second << 8 | third;
    out += BASE64URL_ALPHABET[triplet >> 18 & 63];
    out += BASE64URL_ALPHABET[triplet >> 12 & 63];
    if (index + 1 < bytes.length) {
      out += BASE64URL_ALPHABET[triplet >> 6 & 63];
    }
    if (index + 2 < bytes.length) {
      out += BASE64URL_ALPHABET[triplet & 63];
    }
  }
  return out;
}
function base64urlDecode(input) {
  if (typeof input !== "string" || input.length === 0) {
    throw new AttestationProtocolError("base64url input must be a non-empty string");
  }
  for (const char of input) {
    if (!(char in BASE64URL_DECODE_TABLE)) {
      throw new AttestationProtocolError("base64url input uses a non-canonical alphabet or padding");
    }
  }
  if (input.length % 4 === 1) {
    throw new AttestationProtocolError("base64url input has an impossible length");
  }
  const outLength = Math.floor(input.length * 6 / 8);
  const out = new Uint8Array(outLength);
  let cursor = 0;
  let buffer = 0;
  let bits = 0;
  for (const char of input) {
    buffer = buffer << 6 | BASE64URL_DECODE_TABLE[char];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[cursor] = buffer >> bits & 255;
      cursor += 1;
    }
  }
  if (bits > 0 && (buffer & (1 << bits) - 1) !== 0) {
    throw new AttestationProtocolError("base64url input has non-canonical trailing bits");
  }
  const canonical = base64urlEncode(out);
  if (canonical !== input) {
    throw new AttestationProtocolError("base64url input is not canonical");
  }
  return out;
}
function canonicalJsonBytes(value) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    throw new AttestationProtocolError("value is not JSON-serializable");
  }
  if (typeof text !== "string") {
    throw new AttestationProtocolError("value is not JSON-serializable");
  }
  return utf8Encode(text);
}
function parseCanonicalJsonArray(text, expectedLength) {
  if (typeof text !== "string") {
    throw new AttestationProtocolError("canonical JSON input must be a string");
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AttestationProtocolError("input is not valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new AttestationProtocolError("canonical JSON input must be an array");
  }
  if (JSON.stringify(parsed) !== text) {
    throw new AttestationProtocolError("JSON input is not in canonical form");
  }
  if (expectedLength !== void 0 && parsed.length !== expectedLength) {
    throw new AttestationProtocolError(
      `canonical JSON array must have exactly ${expectedLength} elements`
    );
  }
  return parsed;
}
function assertTimestampMs(name, value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new AttestationProtocolError(`${name} must be a non-negative safe integer`);
  }
}

// src/shared/codec.ts
var KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
var REPLAY_NAMESPACE_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
var NONCE_HEX_PATTERN = /^[0-9a-f]{32}$/;
var BODY_HASH_HEX_PATTERN = /^[0-9a-f]{64}$/;
var HTTP_TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
var HEX_BYTE_PATTERN = /^[0-9a-fA-F]{2}$/;
var RESERVED_HEADER_NAMES = /* @__PURE__ */ new Set([
  "authorization",
  "proxy-authenticate",
  "proxy-authorization",
  "www-authenticate",
  "cookie",
  "set-cookie",
  "host",
  "origin",
  "content-encoding",
  "content-length",
  "content-type",
  "transfer-encoding",
  ATTESTATION_ERROR_RESPONSE_HEADER
]);
function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "[::1]" || /^127\./.test(hostname);
}
function validateKeyId(keyId) {
  if (typeof keyId !== "string" || !KEY_ID_PATTERN.test(keyId) || keyId.length > MAX_KEY_ID_LENGTH) {
    throw new AttestationProtocolError("keyId must match [A-Za-z0-9_-]{1,64}");
  }
}
function validateReplayNamespace(namespace) {
  if (typeof namespace !== "string" || !REPLAY_NAMESPACE_PATTERN.test(namespace) || namespace.length > MAX_REPLAY_NAMESPACE_LENGTH) {
    throw new AttestationProtocolError("replayNamespace must match [A-Za-z0-9_-]{1,128}");
  }
}
function validateNonceHex(nonceHex) {
  if (typeof nonceHex !== "string" || !NONCE_HEX_PATTERN.test(nonceHex)) {
    throw new AttestationProtocolError("nonceHex must be exactly 32 lowercase hex characters");
  }
}
function validateBodyHashHex(bodyHashHex) {
  if (typeof bodyHashHex !== "string" || !BODY_HASH_HEX_PATTERN.test(bodyHashHex)) {
    throw new AttestationProtocolError("bodyHashHex must be exactly 64 lowercase hex characters");
  }
}
function validateMac(mac) {
  if (typeof mac !== "string" || mac.length !== 43) {
    throw new AttestationProtocolError("mac must be exactly 43 base64url characters");
  }
  const decoded = base64urlDecode(mac);
  if (decoded.length !== MAC_BYTES_LENGTH) {
    throw new AttestationProtocolError("mac must decode to 32 bytes");
  }
}
function validateKeyBytes(key) {
  if (!(key instanceof Uint8Array) || key.length !== KEY_BYTES_LENGTH) {
    throw new AttestationProtocolError("signing key must be exactly 32 bytes");
  }
}
function validatePublicOrigin(origin) {
  if (typeof origin !== "string") {
    throw new AttestationProtocolError("publicOrigin must be a string");
  }
  if (origin.length === 0 || utf8ByteLength(origin) > MAX_PUBLIC_ORIGIN_BYTES) {
    throw new AttestationProtocolError(
      `publicOrigin must be 1-${MAX_PUBLIC_ORIGIN_BYTES} UTF-8 bytes`
    );
  }
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new AttestationProtocolError("publicOrigin must be a valid HTTP(S) origin");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AttestationProtocolError("publicOrigin must use http or https");
  }
  if (url.username !== "" || url.password !== "") {
    throw new AttestationProtocolError("publicOrigin must not contain userinfo");
  }
  const canonical = `${url.protocol}//${url.host}`;
  if (origin !== canonical) {
    throw new AttestationProtocolError(
      "publicOrigin must be canonical (lowercase, no path, no trailing slash, no default port)"
    );
  }
  if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
    throw new AttestationProtocolError("http publicOrigin is allowed only for loopback development");
  }
}
function normalizeMethod(method) {
  if (typeof method !== "string" || method.length === 0 || !HTTP_TOKEN_PATTERN.test(method)) {
    throw new AttestationProtocolError("method must be a non-empty valid HTTP token");
  }
  return method.toUpperCase();
}
function normalizeContentType(contentType) {
  if (contentType === void 0 || contentType === null) {
    return "";
  }
  if (typeof contentType !== "string") {
    throw new AttestationProtocolError("contentType must be a string");
  }
  const trimmed = contentType.replace(/^[ \t]+|[ \t]+$/g, "");
  for (const char of trimmed) {
    const code = char.codePointAt(0);
    if (code === 9 || code === 32) {
      continue;
    }
    if (code < 32 || code === 127) {
      throw new AttestationProtocolError("contentType must not contain control characters");
    }
  }
  if (utf8ByteLength(trimmed) > MAX_CONTENT_TYPE_BYTES) {
    throw new AttestationProtocolError(
      `contentType must be at most ${MAX_CONTENT_TYPE_BYTES} UTF-8 bytes`
    );
  }
  return trimmed;
}
function assertValidPercentEscapes(target) {
  for (let index = 0; index < target.length; index += 1) {
    if (target[index] !== "%") {
      continue;
    }
    const hex = target.slice(index + 1, index + 3);
    if (!HEX_BYTE_PATTERN.test(hex)) {
      throw new AttestationProtocolError("requestTarget contains a malformed percent escape");
    }
    index += 2;
  }
}
function percentDecodeSegment(segment) {
  return segment.replace(
    /%[0-9a-fA-F]{2}/g,
    (escape) => String.fromCharCode(Number.parseInt(escape.slice(1), 16))
  );
}
function canonicalizeRequestTarget(target) {
  if (typeof target !== "string") {
    throw new AttestationProtocolError("requestTarget must be a string");
  }
  if (target.length === 0) {
    throw new AttestationProtocolError("requestTarget must not be empty");
  }
  if (utf8ByteLength(target) > MAX_REQUEST_TARGET_BYTES) {
    throw new AttestationProtocolError(
      `requestTarget must be at most ${MAX_REQUEST_TARGET_BYTES} UTF-8 bytes`
    );
  }
  if (!target.startsWith("/")) {
    throw new AttestationProtocolError("requestTarget must be an origin-form target starting with /");
  }
  if (target.startsWith("//")) {
    throw new AttestationProtocolError("requestTarget must not resolve as an authority");
  }
  for (const char of target) {
    const code = char.codePointAt(0);
    if (code <= 32 || code === 127) {
      throw new AttestationProtocolError("requestTarget must not contain controls or raw spaces");
    }
    if (char === "#" || char === "\\") {
      throw new AttestationProtocolError("requestTarget must not contain fragments or backslashes");
    }
  }
  assertValidPercentEscapes(target);
  const queryIndex = target.indexOf("?");
  const path = queryIndex === -1 ? target : target.slice(0, queryIndex);
  for (const segment of path.split("/")) {
    if (segment === "." || segment === "..") {
      throw new AttestationProtocolError("requestTarget must not contain dot segments");
    }
    const decoded = percentDecodeSegment(segment).toLowerCase();
    if (decoded === "." || decoded === "..") {
      throw new AttestationProtocolError("requestTarget must not contain encoded dot segments");
    }
  }
  if (queryIndex === target.length - 1) {
    return target.slice(0, queryIndex);
  }
  return target;
}
function validateHeaderName(name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new AttestationProtocolError("headerName must be a non-empty string");
  }
  if (utf8ByteLength(name) > MAX_HEADER_NAME_BYTES) {
    throw new AttestationProtocolError(
      `headerName must be at most ${MAX_HEADER_NAME_BYTES} UTF-8 bytes`
    );
  }
  if (!HTTP_TOKEN_PATTERN.test(name)) {
    throw new AttestationProtocolError("headerName must be a valid HTTP token");
  }
  if (RESERVED_HEADER_NAMES.has(name.toLowerCase())) {
    throw new AttestationProtocolError(`headerName must not collide with reserved header ${name}`);
  }
}
function extractSingleHeaderValue(raw) {
  if (raw === void 0) {
    return null;
  }
  const values = (Array.isArray(raw) ? raw : [raw]).filter((entry) => entry !== void 0);
  if (values.length === 0) {
    return null;
  }
  if (values.length > 1) {
    throw new AttestationProtocolError("duplicate signature headers are not allowed");
  }
  const value = values[0];
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  if (value.includes(",")) {
    throw new AttestationProtocolError("comma-joined signature headers are not allowed");
  }
  return value;
}
function validateReplayKey(replayKey) {
  if (typeof replayKey !== "string") {
    throw new AttestationProtocolError("replayKey must be a string");
  }
  const length = replayKey.length;
  if (length < MIN_REPLAY_KEY_BYTES || length > MAX_REPLAY_KEY_BYTES) {
    throw new AttestationProtocolError(
      `replayKey must be ${MIN_REPLAY_KEY_BYTES}-${MAX_REPLAY_KEY_BYTES} characters`
    );
  }
  for (const char of replayKey) {
    const code = char.codePointAt(0);
    if (code < 32 || code > 126) {
      throw new AttestationProtocolError("replayKey must be printable ASCII");
    }
  }
}
function buildMacInputBytes(fields) {
  validateReplayNamespace(fields.replayNamespace);
  validatePublicOrigin(fields.publicOrigin);
  validateKeyId(fields.keyId);
  assertTimestampMs("timestampMs", fields.timestampMs);
  validateNonceHex(fields.nonceHex);
  const method = normalizeMethod(fields.method);
  const requestTarget = canonicalizeRequestTarget(fields.requestTarget);
  const contentType = normalizeContentType(fields.contentType);
  validateBodyHashHex(fields.bodyHashHex);
  const tuple = [
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
    fields.bodyHashHex
  ];
  return canonicalJsonBytes(tuple);
}
function buildReplayKeyPreimageBytes(input) {
  validateReplayNamespace(input.replayNamespace);
  validatePublicOrigin(input.publicOrigin);
  validateNonceHex(input.nonceHex);
  return canonicalJsonBytes([input.replayNamespace, input.publicOrigin, input.nonceHex]);
}
function encodeTransactionId(fields) {
  validateKeyId(fields.keyId);
  assertTimestampMs("timestampMs", fields.timestampMs);
  validateNonceHex(fields.nonceHex);
  validateMac(fields.mac);
  const encoded = base64urlEncode(canonicalJsonBytes([
    PROTOCOL_VERSION,
    fields.keyId,
    fields.timestampMs,
    fields.nonceHex,
    fields.mac
  ]));
  if (utf8ByteLength(encoded) > MAX_ENCODED_TRANSACTION_ID_BYTES) {
    throw new AttestationProtocolError(
      `encoded transactionId must be at most ${MAX_ENCODED_TRANSACTION_ID_BYTES} bytes`
    );
  }
  return encoded;
}
function decodeTransactionId(headerValue) {
  if (typeof headerValue !== "string" || headerValue.length === 0) {
    throw new AttestationProtocolError("transactionId must be a non-empty string");
  }
  if (utf8ByteLength(headerValue) > MAX_ENCODED_TRANSACTION_ID_BYTES) {
    throw new AttestationProtocolError(
      `encoded transactionId must be at most ${MAX_ENCODED_TRANSACTION_ID_BYTES} bytes`
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
  assertTimestampMs("timestampMs", timestampMs);
  validateNonceHex(nonceHex);
  validateMac(mac);
  return {
    keyId,
    timestampMs,
    nonceHex,
    mac
  };
}

// src/shared/time-policy.ts
function assertPolicyField(name, value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new AttestationProtocolError(`${name} must be a safe integer in [${min}, ${max}]`);
  }
}
function resolveTimePolicy(options = {}) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new AttestationProtocolError("time policy options must be an object");
  }
  const allowed = /* @__PURE__ */ new Set(["maxAgeMs", "clockSkewMs", "clusterClockGuardMs"]);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) {
      throw new AttestationProtocolError(`unknown time policy option ${key}`);
    }
  }
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const clockSkewMs = options.clockSkewMs ?? DEFAULT_CLOCK_SKEW_MS;
  const clusterClockGuardMs = options.clusterClockGuardMs ?? DEFAULT_CLUSTER_CLOCK_GUARD_MS;
  assertPolicyField("maxAgeMs", maxAgeMs, MIN_MAX_AGE_MS, MAX_MAX_AGE_MS);
  assertPolicyField("clockSkewMs", clockSkewMs, MIN_CLOCK_SKEW_MS, MAX_CLOCK_SKEW_MS);
  assertPolicyField(
    "clusterClockGuardMs",
    clusterClockGuardMs,
    MIN_CLUSTER_CLOCK_GUARD_MS,
    MAX_CLUSTER_CLOCK_GUARD_MS
  );
  return Object.freeze({ maxAgeMs, clockSkewMs, clusterClockGuardMs });
}
function evaluateProofTiming(input) {
  assertTimestampMs("timestampMs", input.timestampMs);
  assertTimestampMs("nowMs", input.nowMs);
  assertTimestampMs("acceptFrom", input.acceptFrom);
  assertTimestampMs("acceptUntil", input.acceptUntil);
  if (input.acceptFrom >= input.acceptUntil) {
    throw new AttestationProtocolError("key acceptance window must satisfy acceptFrom < acceptUntil");
  }
  const { timestampMs, nowMs, acceptFrom, acceptUntil, policy } = input;
  const active = acceptFrom <= nowMs && nowMs < acceptUntil;
  if (!active) {
    const timeDeadlineMs2 = safeAdd3(timestampMs, policy.maxAgeMs, policy.clockSkewMs);
    const proofDeadlineMs2 = timeDeadlineMs2 === null ? acceptUntil : Math.min(timeDeadlineMs2, acceptUntil);
    return {
      decision: "stale-key",
      timeDeadlineMs: timeDeadlineMs2,
      proofDeadlineMs: proofDeadlineMs2,
      retainUntilMs: safeAdd(proofDeadlineMs2, policy.clusterClockGuardMs)
    };
  }
  if (timestampMs > nowMs + policy.clockSkewMs) {
    const timeDeadlineMs2 = safeAdd3(timestampMs, policy.maxAgeMs, policy.clockSkewMs);
    const proofDeadlineMs2 = timeDeadlineMs2 === null ? acceptUntil : Math.min(timeDeadlineMs2, acceptUntil);
    return {
      decision: "future",
      timeDeadlineMs: timeDeadlineMs2,
      proofDeadlineMs: proofDeadlineMs2,
      retainUntilMs: safeAdd(proofDeadlineMs2, policy.clusterClockGuardMs)
    };
  }
  const timeDeadlineMs = safeAdd3(timestampMs, policy.maxAgeMs, policy.clockSkewMs);
  if (timeDeadlineMs === null) {
    return { decision: "expired", timeDeadlineMs: null, proofDeadlineMs: null, retainUntilMs: null };
  }
  const proofDeadlineMs = Math.min(timeDeadlineMs, acceptUntil);
  if (nowMs >= proofDeadlineMs) {
    return {
      decision: "expired",
      timeDeadlineMs,
      proofDeadlineMs,
      retainUntilMs: safeAdd(proofDeadlineMs, policy.clusterClockGuardMs)
    };
  }
  return {
    decision: "valid",
    timeDeadlineMs,
    proofDeadlineMs,
    retainUntilMs: safeAdd(proofDeadlineMs, policy.clusterClockGuardMs)
  };
}
function safeAdd(first, second) {
  const sum = first + second;
  return Number.isSafeInteger(sum) ? sum : null;
}
function safeAdd3(first, second, third) {
  const sum = first + second + third;
  return Number.isSafeInteger(sum) ? sum : null;
}
function maxVerifierRemainingMs(policy) {
  return policy.maxAgeMs + 2 * policy.clockSkewMs + policy.clusterClockGuardMs;
}
function maxStoreAdmissionMs(policy) {
  return Math.min(
    GLOBAL_MAX_RETENTION_MS,
    policy.maxAgeMs + 2 * policy.clockSkewMs + 2 * policy.clusterClockGuardMs
  );
}
function checkRetentionAdmissible(input) {
  assertTimestampMs("retainUntilMs", input.retainUntilMs);
  assertTimestampMs("nowMs", input.nowMs);
  const { retainUntilMs, nowMs, policy } = input;
  if (retainUntilMs <= nowMs) {
    return "expired";
  }
  const remaining = retainUntilMs - nowMs;
  if (!Number.isSafeInteger(remaining)) {
    return "overlong";
  }
  if (remaining > GLOBAL_MAX_RETENTION_MS) {
    return "overlong";
  }
  if (remaining > maxStoreAdmissionMs(policy)) {
    return "overlong";
  }
  return "admissible";
}

// src/client-errors.ts
var SignerClientError = class extends Error {
  name = "SignerClientError";
  code;
  constructor(code, message, options) {
    super(`[express-request-attestation] ${message}`);
    this.code = code;
    if (options?.cause !== void 0) {
      this.cause = options.cause;
    }
  }
};
function isSignerClientError(error) {
  return error instanceof SignerClientError;
}

// src/request-signer.ts
var REQUEST_SIGNER_OPTION_KEYS = /* @__PURE__ */ new Set([
  "keyId",
  "key",
  "publicOrigin",
  "replayNamespace"
]);
var SIGN_INPUT_KEYS = /* @__PURE__ */ new Set([
  "method",
  "requestTarget",
  "contentType",
  "bodyHashHex",
  "timestampMs",
  "nonceHex"
]);
function requireTextEncoder() {
  const encoder = globalThis.TextEncoder;
  if (typeof encoder !== "function") {
    throw new SignerClientError(
      "SIGNER_PREPARATION_FAILED",
      "TextEncoder is unavailable. Signing requires a browser secure context with TextEncoder support."
    );
  }
}
function requireSecureContext() {
  const flag = globalThis.isSecureContext;
  if (flag === false) {
    throw new SignerClientError(
      "SIGNER_PREPARATION_FAILED",
      "Signing requires a secure context (https or loopback http). crypto.subtle is unavailable in insecure contexts."
    );
  }
}
function requireSubtle() {
  requireSecureContext();
  requireTextEncoder();
  const cryptoRef = globalThis.crypto;
  const subtle = cryptoRef?.subtle;
  if (subtle === void 0 || typeof subtle.importKey !== "function" || typeof subtle.sign !== "function" || typeof subtle.digest !== "function") {
    throw new SignerClientError(
      "SIGNER_PREPARATION_FAILED",
      "WebCrypto subtle is unavailable. Signing requires a secure context with crypto.subtle (HMAC-SHA-256) support."
    );
  }
  return subtle;
}
function requireGetRandomValues() {
  const cryptoRef = globalThis.crypto;
  const getRandomValues = cryptoRef?.getRandomValues;
  if (typeof getRandomValues !== "function") {
    throw new SignerClientError(
      "SIGNER_PREPARATION_FAILED",
      "crypto.getRandomValues is unavailable. Nonce generation requires a secure context with getRandomValues support; no Math.random fallback is used."
    );
  }
  return getRandomValues.bind(cryptoRef);
}
function hexEncode(bytes) {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}
async function hashBodySha256Hex(body) {
  if (!(body instanceof Uint8Array)) {
    throw new AttestationProtocolError("body must be a Uint8Array");
  }
  const subtle = requireSubtle();
  let digest;
  try {
    digest = await subtle.digest("SHA-256", body);
  } catch (error) {
    throw new SignerClientError("SIGNER_PREPARATION_FAILED", "Body hashing failed: WebCrypto digest is unavailable.", {
      cause: error
    });
  }
  return hexEncode(new Uint8Array(digest));
}
function generateNonceHex() {
  const getRandomValues = requireGetRandomValues();
  const bytes = new Uint8Array(16);
  try {
    getRandomValues(bytes);
  } catch (error) {
    throw new SignerClientError(
      "SIGNER_PREPARATION_FAILED",
      "Nonce generation failed: crypto.getRandomValues is unavailable.",
      { cause: error }
    );
  }
  return hexEncode(bytes);
}
function createRequestSigner(options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new AttestationProtocolError("request signer options must be an object");
  }
  for (const key of Object.keys(options)) {
    if (!REQUEST_SIGNER_OPTION_KEYS.has(key)) {
      throw new AttestationProtocolError(`unknown request signer option ${key}`);
    }
  }
  validateKeyId(options.keyId);
  validatePublicOrigin(options.publicOrigin);
  validateReplayNamespace(options.replayNamespace);
  validateKeyBytes(options.key);
  const keyId = options.keyId;
  const publicOrigin = options.publicOrigin;
  const replayNamespace = options.replayNamespace;
  const keyCopy = new Uint8Array(options.key);
  let cachedKey = null;
  async function getCryptoKey() {
    if (cachedKey !== null) {
      return cachedKey;
    }
    const subtle = requireSubtle();
    const pending = (async () => {
      try {
        return await subtle.importKey(
          "raw",
          keyCopy,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
      } catch (error) {
        throw new SignerClientError(
          "SIGNER_PREPARATION_FAILED",
          "WebCrypto key import failed: HMAC-SHA-256 with a non-extractable key is required.",
          { cause: error }
        );
      }
    })();
    cachedKey = pending;
    try {
      await pending;
    } catch {
      cachedKey = null;
      throw pending;
    }
    return pending;
  }
  async function sign(input) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new AttestationProtocolError("sign input must be an object");
    }
    for (const key of Object.keys(input)) {
      if (!SIGN_INPUT_KEYS.has(key)) {
        throw new AttestationProtocolError(`unknown sign input field ${key}`);
      }
    }
    const record = input;
    const method = normalizeMethod(record.method);
    const requestTarget = canonicalizeRequestTarget(record.requestTarget);
    const contentType = normalizeContentType(record.contentType);
    validateBodyHashHex(record.bodyHashHex);
    assertTimestampMs("timestampMs", record.timestampMs);
    validateNonceHex(record.nonceHex);
    const timestampMs = record.timestampMs;
    const nonceHex = record.nonceHex;
    const bodyHashHex = record.bodyHashHex;
    const macInput = buildMacInputBytes({
      replayNamespace,
      publicOrigin,
      keyId,
      timestampMs,
      nonceHex,
      method,
      requestTarget,
      contentType,
      bodyHashHex
    });
    const subtle = requireSubtle();
    const cryptoKey = await getCryptoKey();
    let signature;
    try {
      signature = await subtle.sign("HMAC", cryptoKey, macInput);
    } catch (error) {
      throw new SignerClientError("SIGNER_PREPARATION_FAILED", "WebCrypto signing failed.", {
        cause: error
      });
    }
    const mac = base64urlEncode(new Uint8Array(signature));
    return encodeTransactionId({ keyId, timestampMs, nonceHex, mac });
  }
  const signer = {
    version: 1,
    keyId,
    publicOrigin,
    replayNamespace,
    sign
  };
  return Object.freeze(signer);
}

// src/signer-client.ts
var SIGNER_METADATA_BYTE_CAP = 4096;
var DEFAULT_SIGNER_LOAD_TIMEOUT_MS = 5e3;
var MIN_SIGNER_LOAD_TIMEOUT_MS = 1;
var MAX_SIGNER_LOAD_TIMEOUT_MS = 6e4;
var FETCH_BUNDLE_OPTION_KEYS = /* @__PURE__ */ new Set([
  "metadataUrl",
  "apiOrigin",
  "replayNamespace",
  "fetch",
  "loadModule",
  "signal"
]);
var SIGNER_CLIENT_OPTION_KEYS = /* @__PURE__ */ new Set([
  "metadataUrl",
  "apiOrigin",
  "replayNamespace",
  "fetch",
  "loadModule",
  "loadTimeoutMs"
]);
function isLoopbackHostname2(hostname) {
  return hostname === "localhost" || hostname === "[::1]" || /^127\./.test(hostname);
}
function resolveFetch(candidate) {
  if (candidate === void 0) {
    const globalFetch = globalThis.fetch;
    if (typeof globalFetch !== "function") {
      throw new SignerClientError(
        "SIGNER_PREPARATION_FAILED",
        "fetch is unavailable. Signer discovery requires a fetch implementation."
      );
    }
    return globalFetch;
  }
  if (typeof candidate !== "function") {
    throw new AttestationProtocolError("signer client fetch must be a function");
  }
  return candidate;
}
function resolveLoadModule(candidate) {
  if (candidate === void 0) {
    const loader = (moduleUrl) => import(moduleUrl);
    return loader;
  }
  if (typeof candidate !== "function") {
    throw new AttestationProtocolError("signer client loadModule must be a function");
  }
  return candidate;
}
function validateApiOrigin(value) {
  validatePublicOrigin(value);
  return value;
}
function validateMetadataUrl(value, apiOrigin) {
  if (typeof value !== "string" || value.length === 0) {
    throw new AttestationProtocolError("metadataUrl must be a non-empty string");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new AttestationProtocolError("metadataUrl must be an absolute URL");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new SignerClientError("SIGNER_ORIGIN_MISMATCH", "Signer metadata URL must not contain userinfo.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SignerClientError("SIGNER_ORIGIN_MISMATCH", "Signer metadata URL must use http or https.");
  }
  if (parsed.protocol === "http:" && !isLoopbackHostname2(parsed.hostname)) {
    throw new SignerClientError(
      "SIGNER_ORIGIN_MISMATCH",
      "Signer metadata http URL is allowed only for loopback development."
    );
  }
  let expected;
  try {
    expected = new URL(apiOrigin);
  } catch {
    throw new AttestationProtocolError("apiOrigin must be a valid origin");
  }
  if (parsed.origin !== expected.origin) {
    throw new SignerClientError(
      "SIGNER_ORIGIN_MISMATCH",
      "Signer metadata URL origin does not match the configured API origin."
    );
  }
  return value;
}
function validateLoadTimeoutMs(value) {
  if (value === void 0) {
    return DEFAULT_SIGNER_LOAD_TIMEOUT_MS;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < MIN_SIGNER_LOAD_TIMEOUT_MS || value > MAX_SIGNER_LOAD_TIMEOUT_MS) {
    throw new AttestationProtocolError(
      `loadTimeoutMs must be a safe integer in [${MIN_SIGNER_LOAD_TIMEOUT_MS}, ${MAX_SIGNER_LOAD_TIMEOUT_MS}]`
    );
  }
  return value;
}
function validateBundleConfig(options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new AttestationProtocolError("fetchSignerBundle options must be an object");
  }
  for (const key of Object.keys(options)) {
    if (!FETCH_BUNDLE_OPTION_KEYS.has(key)) {
      throw new AttestationProtocolError(`unknown fetchSignerBundle option ${key}`);
    }
  }
  const apiOrigin = validateApiOrigin(options.apiOrigin);
  validateReplayNamespace(options.replayNamespace);
  const replayNamespace = options.replayNamespace;
  const metadataUrl = validateMetadataUrl(options.metadataUrl, apiOrigin);
  const fetchImpl = resolveFetch(options.fetch);
  const loadModule = resolveLoadModule(options.loadModule);
  const signal = options.signal;
  if (signal !== void 0 && !(signal instanceof AbortSignal)) {
    throw new AttestationProtocolError("fetchSignerBundle signal must be an AbortSignal");
  }
  return { metadataUrl, apiOrigin, replayNamespace, fetchImpl, loadModule, signal };
}
function resolveSignerModuleUrl(signerUrl, metadataUrl, apiOrigin) {
  if (typeof signerUrl !== "string" || signerUrl.length === 0) {
    throw new SignerClientError("SIGNER_ORIGIN_MISMATCH", "Signer metadata signerUrl must be a non-empty string.");
  }
  let resolved;
  try {
    resolved = new URL(signerUrl, metadataUrl);
  } catch {
    throw new SignerClientError("SIGNER_ORIGIN_MISMATCH", "Signer module URL is not a valid URL.");
  }
  if (resolved.username !== "" || resolved.password !== "") {
    throw new SignerClientError("SIGNER_ORIGIN_MISMATCH", "Signer module URL must not contain userinfo.");
  }
  if (resolved.protocol !== "https:" && resolved.protocol !== "http:") {
    throw new SignerClientError("SIGNER_ORIGIN_MISMATCH", "Signer module URL must use http or https.");
  }
  if (resolved.protocol === "http:" && !isLoopbackHostname2(resolved.hostname)) {
    throw new SignerClientError(
      "SIGNER_ORIGIN_MISMATCH",
      "Signer module http URL is allowed only for loopback development."
    );
  }
  let expected;
  try {
    expected = new URL(apiOrigin);
  } catch {
    throw new AttestationProtocolError("apiOrigin must be a valid origin");
  }
  if (resolved.origin !== expected.origin) {
    throw new SignerClientError(
      "SIGNER_ORIGIN_MISMATCH",
      "Signer module origin does not match the configured API origin."
    );
  }
  if (!resolved.pathname.endsWith(".mjs")) {
    throw new SignerClientError("SIGNER_ORIGIN_MISMATCH", "Signer module URL must target a .mjs module path.");
  }
  if (resolved.hash !== "") {
    throw new SignerClientError("SIGNER_ORIGIN_MISMATCH", "Signer module URL must not contain a fragment.");
  }
  return resolved.href;
}
async function readBoundedMetadataDocument(response, fetchImplName) {
  void fetchImplName;
  let bytes = null;
  let text = null;
  if (typeof response.arrayBuffer === "function") {
    let buffer;
    try {
      buffer = await response.arrayBuffer();
    } catch (error) {
      if (error instanceof SignerClientError) {
        throw error;
      }
      const name = error.name;
      if (name === "AbortError" || response.signal !== void 0) {
        throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer discovery was aborted.");
      }
      throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer metadata fetch failed.");
    }
    const view = new Uint8Array(buffer);
    if (view.byteLength > SIGNER_METADATA_BYTE_CAP) {
      throw new SignerClientError(
        "SIGNER_LOAD_FAILED",
        `Signer metadata exceeds the ${SIGNER_METADATA_BYTE_CAP}-byte cap.`
      );
    }
    bytes = view;
  } else if (typeof response.text === "function") {
    try {
      text = await response.text();
    } catch {
      throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer metadata fetch failed.");
    }
    if (utf8ByteLength(text) > SIGNER_METADATA_BYTE_CAP) {
      throw new SignerClientError(
        "SIGNER_LOAD_FAILED",
        `Signer metadata exceeds the ${SIGNER_METADATA_BYTE_CAP}-byte cap.`
      );
    }
  } else {
    throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer metadata response is unreadable.");
  }
  let raw;
  if (text !== null) {
    raw = text;
  } else {
    try {
      raw = utf8Decode(bytes);
    } catch {
      throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer metadata is not valid UTF-8.");
    }
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer metadata is not valid JSON.");
  }
}
function validateMetadataDocument(document, expected) {
  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer metadata must be a JSON object.");
  }
  const record = document;
  if (record["version"] !== PROTOCOL_VERSION) {
    throw new SignerClientError("SIGNER_MODULE_INVALID", "Signer metadata version must be 1.");
  }
  try {
    validateKeyId(record["keyId"]);
  } catch {
    throw new SignerClientError("SIGNER_MODULE_INVALID", "Signer metadata keyId is invalid.");
  }
  if (typeof record["signerUrl"] !== "string" || record["signerUrl"].length === 0) {
    throw new SignerClientError("SIGNER_ORIGIN_MISMATCH", "Signer metadata signerUrl is invalid.");
  }
  try {
    validatePublicOrigin(record["publicOrigin"]);
  } catch {
    throw new SignerClientError("SIGNER_ORIGIN_MISMATCH", "Signer metadata publicOrigin is invalid.");
  }
  try {
    validateReplayNamespace(record["replayNamespace"]);
  } catch {
    throw new SignerClientError("SIGNER_ORIGIN_MISMATCH", "Signer metadata replayNamespace is invalid.");
  }
  if (record["publicOrigin"] !== expected.apiOrigin) {
    throw new SignerClientError(
      "SIGNER_ORIGIN_MISMATCH",
      "Signer metadata origin does not match the configured API origin."
    );
  }
  if (record["replayNamespace"] !== expected.replayNamespace) {
    throw new SignerClientError(
      "SIGNER_ORIGIN_MISMATCH",
      "Signer metadata namespace does not match the configured replay namespace."
    );
  }
  return {
    version: 1,
    keyId: record["keyId"],
    signerUrl: record["signerUrl"],
    publicOrigin: record["publicOrigin"],
    replayNamespace: record["replayNamespace"]
  };
}
function validateSignerModule(candidate, metadata) {
  if (typeof candidate === "string") {
    throw new SignerClientError(
      "SIGNER_MODULE_INVALID",
      "Signer module must be an ESM namespace with a signer export, not a JS source string."
    );
  }
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new SignerClientError("SIGNER_MODULE_INVALID", "Signer module namespace is invalid.");
  }
  const record = candidate;
  if ("signSource" in record) {
    throw new SignerClientError(
      "SIGNER_MODULE_INVALID",
      "Signer module must export signer without evaluated source strings."
    );
  }
  const signer = record["signer"];
  if (signer === null || typeof signer !== "object" || Array.isArray(signer)) {
    throw new SignerClientError("SIGNER_MODULE_INVALID", "Signer module must export a signer object.");
  }
  const entry = signer;
  if (entry["version"] !== PROTOCOL_VERSION) {
    throw new SignerClientError("SIGNER_MODULE_INVALID", "Imported signer version must be 1.");
  }
  try {
    validateKeyId(entry["keyId"]);
  } catch {
    throw new SignerClientError("SIGNER_MODULE_INVALID", "Imported signer keyId is invalid.");
  }
  try {
    validatePublicOrigin(entry["publicOrigin"]);
  } catch {
    throw new SignerClientError("SIGNER_MODULE_INVALID", "Imported signer origin is invalid.");
  }
  try {
    validateReplayNamespace(entry["replayNamespace"]);
  } catch {
    throw new SignerClientError("SIGNER_MODULE_INVALID", "Imported signer namespace is invalid.");
  }
  if (entry["keyId"] !== metadata.keyId) {
    throw new SignerClientError("SIGNER_MODULE_INVALID", "Imported signer key does not match discovery metadata.");
  }
  if (entry["publicOrigin"] !== metadata.publicOrigin) {
    throw new SignerClientError("SIGNER_MODULE_INVALID", "Imported signer origin does not match discovery metadata.");
  }
  if (entry["replayNamespace"] !== metadata.replayNamespace) {
    throw new SignerClientError(
      "SIGNER_MODULE_INVALID",
      "Imported signer namespace does not match discovery metadata."
    );
  }
  if (typeof entry["sign"] !== "function") {
    throw new SignerClientError("SIGNER_MODULE_INVALID", "Imported signer sign function is invalid.");
  }
  return { signer };
}
async function fetchMetadataDocument(config) {
  if (config.signal?.aborted) {
    throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer discovery was aborted.");
  }
  let response;
  try {
    response = await config.fetchImpl(config.metadataUrl, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      ...config.signal === void 0 ? {} : { signal: config.signal }
    });
  } catch (error) {
    if (error instanceof SignerClientError) {
      throw error;
    }
    const name = error.name;
    if (name === "AbortError" || config.signal?.aborted) {
      throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer discovery was aborted.");
    }
    throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer metadata fetch failed.");
  }
  if (response.ok !== true) {
    throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer metadata fetch failed.");
  }
  const document = await readBoundedMetadataDocument(response, "fetch");
  return validateMetadataDocument(document, {
    apiOrigin: config.apiOrigin,
    replayNamespace: config.replayNamespace
  });
}
async function importValidatedModule(config, metadata) {
  const moduleUrl = resolveSignerModuleUrl(metadata.signerUrl, config.metadataUrl, config.apiOrigin);
  let candidate;
  try {
    candidate = await config.loadModule(moduleUrl);
  } catch (error) {
    if (error instanceof SignerClientError) {
      throw error;
    }
    const name = error.name;
    if (name === "AbortError" || config.signal?.aborted) {
      throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer module load was aborted.");
    }
    throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer module import failed.");
  }
  return validateSignerModule(candidate, metadata);
}
async function fetchSignerBundle(options) {
  const config = validateBundleConfig(options);
  const metadata = await fetchMetadataDocument(config);
  return importValidatedModule(config, metadata);
}
function isRetirementRetryCandidate(error) {
  if (!(error instanceof SignerClientError)) {
    return false;
  }
  return error.code === "SIGNER_LOAD_FAILED" || error.code === "SIGNER_MODULE_INVALID";
}
function createSignerClient(options) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new AttestationProtocolError("signer client options must be an object");
  }
  for (const key of Object.keys(options)) {
    if (!SIGNER_CLIENT_OPTION_KEYS.has(key)) {
      throw new AttestationProtocolError(`unknown signer client option ${key}`);
    }
  }
  const apiOrigin = validateApiOrigin(options.apiOrigin);
  validateReplayNamespace(options.replayNamespace);
  const replayNamespace = options.replayNamespace;
  const metadataUrl = validateMetadataUrl(options.metadataUrl, apiOrigin);
  const fetchImpl = resolveFetch(options.fetch);
  const loadModule = resolveLoadModule(options.loadModule);
  const loadTimeoutMs = validateLoadTimeoutMs(options.loadTimeoutMs);
  let active = null;
  let pending = null;
  let pendingGeneration = 0;
  let generation = 0;
  let disposed = false;
  let currentAborter = null;
  function throwIfDisposed() {
    if (disposed) {
      throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer client is disposed.");
    }
  }
  async function loadWithSingleRetirement(signal) {
    const base = {
      metadataUrl,
      apiOrigin,
      replayNamespace,
      fetchImpl,
      loadModule,
      signal
    };
    const first = await fetchMetadataDocument(base);
    try {
      const module = await importValidatedModule(base, first);
      return module.signer;
    } catch (importError) {
      if (!isRetirementRetryCandidate(importError)) {
        throw importError;
      }
      if (signal.aborted) {
        throw importError;
      }
      const second = await fetchMetadataDocument(base);
      if (second.keyId === first.keyId) {
        throw importError;
      }
      if (signal.aborted) {
        throw importError;
      }
      const module = await importValidatedModule(base, second);
      return module.signer;
    }
  }
  function startLoad() {
    const myGeneration = generation;
    pendingGeneration = myGeneration;
    const aborter = new AbortController();
    currentAborter = aborter;
    let timer;
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        try {
          aborter.abort();
        } catch {
        }
        reject(new SignerClientError("SIGNER_LOAD_TIMEOUT", "Signer load timed out."));
      }, loadTimeoutMs);
      const handle = timer;
      if (typeof handle.unref === "function") {
        handle.unref();
      }
    });
    const actual = loadWithSingleRetirement(aborter.signal);
    const raced = Promise.race([actual, timeout]);
    actual.then(
      () => void 0,
      () => void 0
    );
    const tracked = raced.then(
      (signer) => {
        if (timer !== void 0) {
          clearTimeout(timer);
        }
        if (disposed || myGeneration !== generation) {
          throw new SignerClientError("SIGNER_LOAD_FAILED", "Signer load was superseded.");
        }
        active = signer;
        if (pending === tracked) {
          pending = null;
        }
        currentAborter = null;
        return signer;
      },
      (error) => {
        if (timer !== void 0) {
          clearTimeout(timer);
        }
        if (pending === tracked) {
          pending = null;
        }
        if (error instanceof SignerClientError && error.code === "SIGNER_LOAD_TIMEOUT") {
          generation += 1;
        }
        currentAborter = null;
        throw error;
      }
    );
    pending = tracked;
    return tracked;
  }
  const client = {
    getSigner() {
      throwIfDisposed();
      if (active !== null) {
        return Promise.resolve(active);
      }
      if (pending !== null && pendingGeneration === generation) {
        return pending;
      }
      if (pending !== null && pendingGeneration !== generation) {
        pending = null;
      }
      return startLoad();
    },
    invalidate(observedKeyId) {
      if (disposed) {
        return;
      }
      if (typeof observedKeyId !== "string" || observedKeyId.length === 0) {
        return;
      }
      if (active !== null) {
        let matches;
        try {
          matches = active.keyId === observedKeyId;
        } catch {
          return;
        }
        if (!matches) {
          return;
        }
        active = null;
        generation += 1;
        pending = null;
        return;
      }
      generation += 1;
      pending = null;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      active = null;
      generation += 1;
      try {
        currentAborter?.abort();
      } catch {
      }
      currentAborter = null;
      pending = null;
    }
  };
  return Object.freeze(client);
}

// src/signer.ts
function notImplemented(name, owner) {
  throw new Error(
    `[express-request-attestation] ${name} is a typed ATT-01 scaffold and is implemented by ${owner}.`
  );
}
async function fetchWithAttestation(_input, _init, _options) {
  void _input;
  void _init;
  void _options;
  return notImplemented("fetchWithAttestation", "ATT-07");
}
export {
  ATTESTATION_ERROR_RESPONSE_HEADER,
  AttestationProtocolError,
  DEFAULT_ATTESTATION_HEADER,
  DEFAULT_CLOCK_SKEW_MS,
  DEFAULT_CLUSTER_CLOCK_GUARD_MS,
  DEFAULT_MAX_AGE_MS,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_SIGNER_LOAD_TIMEOUT_MS,
  EMPTY_BODY_SHA256_HEX,
  GLOBAL_MAX_RETENTION_MS,
  KEY_BYTES_LENGTH,
  MAC_BYTES_LENGTH,
  MAC_INPUT_LABEL,
  MAX_BODY_BYTES_HARD_CAP,
  MAX_CLOCK_SKEW_MS,
  MAX_CLUSTER_CLOCK_GUARD_MS,
  MAX_CONTENT_TYPE_BYTES,
  MAX_ENCODED_TRANSACTION_ID_BYTES,
  MAX_HEADER_NAME_BYTES,
  MAX_KEY_ID_LENGTH,
  MAX_MAX_AGE_MS,
  MAX_PUBLIC_ORIGIN_BYTES,
  MAX_REPLAY_KEY_BYTES,
  MAX_REPLAY_NAMESPACE_LENGTH,
  MAX_REQUEST_TARGET_BYTES,
  MIN_CLOCK_SKEW_MS,
  MIN_CLUSTER_CLOCK_GUARD_MS,
  MIN_MAX_AGE_MS,
  MIN_REPLAY_KEY_BYTES,
  NONCE_BYTES_LENGTH,
  PROTOCOL_VERSION,
  REPLAY_KEY_PREFIX,
  SIGNER_METADATA_BYTE_CAP,
  SignerClientError,
  assertTimestampMs,
  base64urlDecode,
  base64urlEncode,
  buildMacInputBytes,
  buildReplayKeyPreimageBytes,
  canonicalJsonBytes,
  canonicalizeRequestTarget,
  checkRetentionAdmissible,
  createRequestSigner,
  createSignerClient,
  decodeTransactionId,
  encodeTransactionId,
  evaluateProofTiming,
  extractSingleHeaderValue,
  fetchSignerBundle,
  fetchWithAttestation,
  generateNonceHex,
  hashBodySha256Hex,
  isSignerClientError,
  maxStoreAdmissionMs,
  maxVerifierRemainingMs,
  normalizeContentType,
  normalizeMethod,
  parseCanonicalJsonArray,
  resolveTimePolicy,
  utf8ByteLength,
  utf8Decode,
  utf8Encode,
  validateBodyHashHex,
  validateHeaderName,
  validateKeyBytes,
  validateKeyId,
  validateMac,
  validateNonceHex,
  validatePublicOrigin,
  validateReplayKey,
  validateReplayNamespace
};
