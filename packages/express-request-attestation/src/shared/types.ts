/**
 * Shared browser-safe v1 protocol types, constants, and error type.
 *
 * Both public entries (`.` and `./signer`) export these types. The browser
 * entry requires no Node, Express, Redis, or MongoDB dependencies or types.
 *
 * Protocol summary:
 *
 * ```text
 * nonceHex    = lowercase hex of 16 cryptographically random bytes
 * bodyHashHex = lowercase hex of SHA-256(exact submitted body bytes)
 * macInput    = UTF8(JSON.stringify([
 *   "wtt-request-signature", 1, replayNamespace, publicOrigin,
 *   keyId, timestampMs, nonceHex, method, requestTarget, contentType, bodyHashHex
 * ]))
 * mac           = base64url(HMAC-SHA-256(key, macInput))
 * transactionId = base64url(UTF8(JSON.stringify([1, keyId, timestampMs, nonceHex, mac])))
 * ```
 *
 * All encodings are UTF-8. Base64url is unpadded and canonical
 * (decode/re-encode must match). JSON arrays carry no whitespace.
 */

/** Frozen wire protocol version. Unknown versions are rejected. */
export const PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

/** Domain-separation label that opens every MAC input tuple. */
export const MAC_INPUT_LABEL = 'wtt-request-signature' as const;

/** Default signature header field name. */
export const DEFAULT_ATTESTATION_HEADER = 'x-client-transaction-id' as const;

/** Package response marker used only for the pre-handler stale-key signal. */
export const ATTESTATION_ERROR_RESPONSE_HEADER = 'x-attestation-error' as const;

/** Prefix for opaque replay keys derived per protection space + nonce. */
export const REPLAY_KEY_PREFIX = 'att:v1:' as const;

/** Exact HMAC key length in bytes. */
export const KEY_BYTES_LENGTH = 32 as const;
/** Random nonce length in bytes (serialized as 32 lowercase hex chars). */
export const NONCE_BYTES_LENGTH = 16 as const;
/** Raw HMAC-SHA-256 output length in bytes (43 unpadded base64url chars). */
export const MAC_BYTES_LENGTH = 32 as const;

/** Key identifiers match `[A-Za-z0-9_-]{1,64}`. */
export const MAX_KEY_ID_LENGTH = 64 as const;
/** Replay namespaces match `[A-Za-z0-9_-]{1,128}`. */
export const MAX_REPLAY_NAMESPACE_LENGTH = 128 as const;

/** Encoded transaction-ID header value: at most 1024 UTF-8 bytes. */
export const MAX_ENCODED_TRANSACTION_ID_BYTES = 1024 as const;
/** Canonical request target: at most 8192 UTF-8 bytes. */
export const MAX_REQUEST_TARGET_BYTES = 8192 as const;
/** Normalized content type: at most 256 UTF-8 bytes. */
export const MAX_CONTENT_TYPE_BYTES = 256 as const;
/** Canonical public origin: at most 512 UTF-8 bytes. */
export const MAX_PUBLIC_ORIGIN_BYTES = 512 as const;
/** Opaque replay keys: 1-256 printable ASCII bytes. */
export const MIN_REPLAY_KEY_BYTES = 1 as const;
export const MAX_REPLAY_KEY_BYTES = 256 as const;
/** Configured signature header names: valid HTTP tokens, at most 128 bytes. */
export const MAX_HEADER_NAME_BYTES = 128 as const;

/** Default parser/body byte budget (1 MiB); hard v1 cap is 16 MiB. */
export const DEFAULT_MAX_BODY_BYTES = 1048576 as const;
export const MAX_BODY_BYTES_HARD_CAP = 16777216 as const;

/** Time policy defaults and bounds in milliseconds. */
export const DEFAULT_MAX_AGE_MS = 30_000 as const;
export const MIN_MAX_AGE_MS = 1_000 as const;
export const MAX_MAX_AGE_MS = 120_000 as const;
export const DEFAULT_CLOCK_SKEW_MS = 5_000 as const;
export const MIN_CLOCK_SKEW_MS = 0 as const;
export const MAX_CLOCK_SKEW_MS = 30_000 as const;
export const DEFAULT_CLUSTER_CLOCK_GUARD_MS = 5_000 as const;
export const MIN_CLUSTER_CLOCK_GUARD_MS = 0 as const;
export const MAX_CLUSTER_CLOCK_GUARD_MS = 30_000 as const;
/** Global retention ceiling, including the store-clock guard allowance. */
export const GLOBAL_MAX_RETENTION_MS = 240_000 as const;

/** SHA-256 of zero bytes: the digest of an actually empty request body. */
export const EMPTY_BODY_SHA256_HEX = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' as const; // pragma: allowlist secret

/**
 * Error thrown by shared protocol helpers for malformed input, failed
 * canonical checks, bound violations, and invalid option values.
 *
 * Server middleware maps request failures to fixed HTTP errors
 * without echoing key material, nonces, signatures, or request bodies.
 */
export class AttestationProtocolError extends Error {
  override readonly name = 'AttestationProtocolError';

  constructor(message: string) {
    super(`[express-request-attestation] ${message}`);
  }
}

/**
 * Decoded transaction-ID envelope: `[1, keyId, timestampMs, nonceHex, mac]`.
 * Exactly 5 elements; extra array fields are rejected.
 */
export type AttestationEnvelope = readonly [
  version: 1,
  keyId: string,
  timestampMs: number,
  nonceHex: string,
  mac: string,
];

/**
 * MAC input tuple. EVERY protected field participates; altering method,
 * target, query spelling/order, content type, body bytes, namespace, origin,
 * version, key ID, timestamp, or nonce invalidates the MAC.
 */
export type AttestationMacInput = readonly [
  label: 'wtt-request-signature',
  version: 1,
  replayNamespace: string,
  publicOrigin: string,
  keyId: string,
  timestampMs: number,
  nonceHex: string,
  method: string,
  requestTarget: string,
  contentType: string,
  bodyHashHex: string,
];

/** Fields needed to build the MAC input tuple. */
export interface MacInputFields {
  readonly replayNamespace: string;
  readonly publicOrigin: string;
  readonly keyId: string;
  readonly timestampMs: number;
  readonly nonceHex: string;
  /** Actual method, normalized to uppercase. */
  readonly method: string;
  /** Canonical origin-form request target (encoded bytes preserved). */
  readonly requestTarget: string;
  /** Single final content type with outer HTTP whitespace trimmed. */
  readonly contentType: string;
  /** Lowercase hex SHA-256 of the exact submitted body bytes. */
  readonly bodyHashHex: string;
}

/** Fields carried by the encoded transaction-ID envelope. */
export interface TransactionIdFields {
  readonly keyId: string;
  readonly timestampMs: number;
  readonly nonceHex: string;
  /** 43 canonical unpadded base64url chars (32 raw bytes). */
  readonly mac: string;
}

/**
 * Low-level signer input. Callers supply explicit timestamp/nonce/body digest
 * so identical inputs are deterministic; `fetchWithAttestation` chooses fresh
 * timestamps/nonces automatically. Public HMAC proofs do not authenticate users.
 */
export interface SignInput {
  /** Actual request method, normalized to uppercase. */
  readonly method: string;
  /** Externally visible origin-form path/query; preserve percent escapes, slashes, and query order. */
  readonly requestTarget: string;
  /** Final Content-Type including multipart boundary, or empty for an absent field. */
  readonly contentType: string;
  /** Lowercase SHA-256 hex of the exact submitted bytes; hash zero bytes for an empty body. */
  readonly bodyHashHex: string;
  /** Nonnegative safe-integer epoch milliseconds. */
  readonly timestampMs: number;
  /** Fresh 128-bit nonce as 32 lowercase hex characters; use `generateNonceHex()`. */
  readonly nonceHex: string;
}

/**
 * Low-level WebCrypto HMAC signer with immutable protection-space binding.
 * Publicly delivered key material provides no caller/session authentication.
 */
export interface RequestSigner {
  readonly version: 1;
  readonly keyId: string;
  readonly publicOrigin: string;
  readonly replayNamespace: string;
  /** Deterministic for explicit inputs; returns a canonical envelope or rejects with a local protocol/client error. */
  sign(input: SignInput): Promise<string>;
}

/** Explicit key and protection-space binding for `createRequestSigner`. */
export interface RequestSignerOptions {
  /** Provisioned key identifier matching `[A-Za-z0-9_-]{1,64}`. */
  readonly keyId: string;
  /** Exactly 32 bytes; copied on input. Non-extractable wrapping does not hide publicly delivered material. */
  readonly key: Uint8Array;
  /** Static canonical HTTPS origin (loopback HTTP allowed), identical to the verifier. */
  readonly publicOrigin: string;
  /** Namespace matching `[A-Za-z0-9_-]{1,128}`, identical to the verifier. */
  readonly replayNamespace: string;
}

/**
 * Partial time-policy overrides in milliseconds. All verifiers in one
 * `(publicOrigin, replayNamespace)` must share these values, replay state,
 * and per-key acceptance windows. A live policy migration needs a coordinated
 * new protection space, retaining the old ledger through its last `retainUntilMs`.
 */
export interface TimePolicyOptions {
  /** Maximum proof age; default 30000 ms, safe integer in 1000–120000. */
  readonly maxAgeMs?: number;
  /** Client clock allowance; default 5000 ms, safe integer in 0–30000. */
  readonly clockSkewMs?: number;
  /** Pairwise verifier/store clock difference; default 5000 ms (0–30000). Extends retention, not freshness. */
  readonly clusterClockGuardMs?: number;
}

/** Validated, frozen time policy. All values are safe-integer milliseconds. */
export interface ResolvedTimePolicy {
  readonly maxAgeMs: number;
  readonly clockSkewMs: number;
  readonly clusterClockGuardMs: number;
}

/** Proof-timing verdicts. Key lookup happens first: unknown/inactive keys are `stale-key`. */
export type ProofTimingDecision = 'valid' | 'future' | 'expired' | 'stale-key';

/**
 * Result of evaluating one proof's timing. Deadline fields are `null` only
 * when the timestamp is so large that deadline arithmetic leaves safe-integer
 * range; that proof is rejected as `expired`.
 */
export interface ProofTiming {
  readonly decision: ProofTimingDecision;
  /** `timestampMs + maxAgeMs + clockSkewMs`. */
  readonly timeDeadlineMs: number | null;
  /** `min(timeDeadlineMs, acceptUntil)`. */
  readonly proofDeadlineMs: number | null;
  /** `proofDeadlineMs + clusterClockGuardMs`: full replay retention deadline. */
  readonly retainUntilMs: number | null;
}

/** Retention admission verdicts for replay stores. */
export type RetentionAdmission = 'admissible' | 'expired' | 'overlong';
