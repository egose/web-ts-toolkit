/**
 * `@web-ts-toolkit/express-request-attestation/signer` — browser entry.
 *
 * Browser-safe named exports only. This entry requires no Express, Redis,
 * MongoDB, Buffer, or Node types/runtime graph. Browser-only TypeScript apps
 * can use ES2022 + DOM/DOM.Iterable libraries with `types: []`.
 *
 * Required browser capabilities (feature-detected on use, never at import):
 * a secure context, `TextEncoder`/`TextDecoder`, `crypto.subtle`
 * (HMAC-SHA-256, non-extractable keys), and `crypto.getRandomValues`.
 * Import time performs no network requests, timers, key generation, or
 * storage access (`sideEffects: false`).
 *
 * Public surface: WebCrypto signing plus the
 * generation-aware ESM module client, bounded body materialization, and
 * prepared signed fetch with one stale-key retry.
 * Public HMAC material delivered in JavaScript stays accessible to every
 * caller despite non-extractable `CryptoKey` wrapping; this entry provides
 * request-format consistency and replay detection, not device/browser
 * authenticity, human-user, session, or bot-prevention guarantees.
 */

// Shared browser-safe protocol: codec, canonical primitives, time policy, DTOs.
export {
  buildMacInputBytes,
  buildReplayKeyPreimageBytes,
  canonicalizeRequestTarget,
  decodeTransactionId,
  encodeTransactionId,
  extractSingleHeaderValue,
  normalizeContentType,
  normalizeMethod,
  validateBodyHashHex,
  validateHeaderName,
  validateKeyBytes,
  validateKeyId,
  validateMac,
  validateNonceHex,
  validatePublicOrigin,
  validateReplayKey,
  validateReplayNamespace,
} from './shared/codec.js';
export {
  assertTimestampMs,
  base64urlDecode,
  base64urlEncode,
  canonicalJsonBytes,
  parseCanonicalJsonArray,
  utf8ByteLength,
  utf8Decode,
  utf8Encode,
} from './shared/canonical.js';
export {
  checkRetentionAdmissible,
  evaluateProofTiming,
  maxStoreAdmissionMs,
  maxVerifierRemainingMs,
  resolveTimePolicy,
} from './shared/time-policy.js';
export {
  ATTESTATION_ERROR_RESPONSE_HEADER,
  AttestationProtocolError,
  DEFAULT_ATTESTATION_HEADER,
  DEFAULT_CLOCK_SKEW_MS,
  DEFAULT_CLUSTER_CLOCK_GUARD_MS,
  DEFAULT_MAX_AGE_MS,
  DEFAULT_MAX_BODY_BYTES,
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
  MIN_CLUSTER_CLOCK_GUARD_MS,
  MIN_CLOCK_SKEW_MS,
  MIN_MAX_AGE_MS,
  MIN_REPLAY_KEY_BYTES,
  NONCE_BYTES_LENGTH,
  PROTOCOL_VERSION,
  REPLAY_KEY_PREFIX,
} from './shared/types.js';
export type {
  AttestationEnvelope,
  AttestationMacInput,
  MacInputFields,
  ProofTiming,
  ProofTimingDecision,
  RequestSigner,
  RequestSignerOptions,
  ResolvedTimePolicy,
  RetentionAdmission,
  SignInput,
  TimePolicyOptions,
  TransactionIdFields,
} from './shared/types.js';

// Typed client failures.
export { isSignerClientError, SignerClientError } from './client-errors.js';
export type { SignerClientErrorCode } from './client-errors.js';

// Low-level WebCrypto HMAC signer plus browser-safe helpers.
export { createRequestSigner, generateNonceHex, hashBodySha256Hex } from './request-signer.js';

// Bounded discovery plus generation-aware single-flight client.
export {
  createSignerClient,
  DEFAULT_SIGNER_LOAD_TIMEOUT_MS,
  fetchSignerBundle,
  SIGNER_METADATA_BYTE_CAP,
} from './signer-client.js';
export type {
  FetchSignerBundleOptions,
  SignerClient,
  SignerClientOptions,
  SignerModule,
  SignerModuleLoader,
} from './signer-client.js';

// Bounded body materialization plus prepared fetch with one stale-key retry.
export {
  ATTESTED_FETCH_MAX_BODY_BYTES_HARD_CAP,
  DEFAULT_ATTESTED_FETCH_BODY_READ_TIMEOUT_MS,
  DEFAULT_ATTESTED_FETCH_MAX_BODY_BYTES,
  assertSupportedBodyInit,
  materializeRequestBodyBytes,
} from './request-body.js';
export type { MaterializeRequestBodyOptions } from './request-body.js';
export {
  DEFAULT_ATTESTED_FETCH_BODY_READ_TIMEOUT_MS as DEFAULT_ATTESTED_FETCH_BODY_TIMEOUT_MS,
  fetchWithAttestation,
} from './attested-fetch.js';
export type { FetchWithAttestationOptions } from './attested-fetch.js';
