/**
 * `@web-ts-toolkit/express-request-attestation` — server (Express) entry.
 *
 * Named exports only. This module may import Node built-ins (`node:*`) and
 * the optional Express peer; those stay external in the bundle and resolve
 * from the backend consumer's runtime. Browser consumers import `./signer`
 * instead and never load this graph.
 *
 * Final public surface (ATT-08/MONGO-03 verified): the shared protocol (codec,
 * canonical form, time policy), server option/type declarations, fixed HTTP
 * errors, Node hashing helpers, verify-before-reserve middleware with parser
 * body capture, bounded memory, Redis, and MongoDB replay stores, owned key
 * rotation, and the relative signer-asset router. Prepared signed fetch lives
 * in the `./signer` entry.
 *
 * Public HMAC material delivered in JavaScript stays accessible to every
 * caller despite rotation; this entry provides request-format consistency
 * and replay detection, not device/browser authenticity, human-user,
 * session, or bot-prevention guarantees. Authentication remains independent
 * (bearer/DPoP via existing public APIs); every auth retry re-signs.
 */
import { createHash } from 'node:crypto';

import { buildReplayKeyPreimageBytes, validateReplayKey } from './shared/codec.js';
import { AttestationProtocolError, REPLAY_KEY_PREFIX } from './shared/types.js';

// Shared protocol: codec, canonical primitives, time policy, DTOs/constants.
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

// Server option/type declarations and fixed HTTP errors.
export { AttestationError, isAttestationError, toAttestationErrorPayload } from './server-types.js';
export type {
  AttestationErrorCode,
  AttestationKeyEntry,
  AttestationKeyProvider,
  AttestationKeySnapshot,
  AttestationKeySnapshotInput,
  AttestationRedisClient,
  AttestationRotatingKeyProvider,
  AttestationBodyCapture,
  AttestationStore,
  AttestationStoreReserveInput,
  AttestationStoreReserveResult,
  CreateAttestationBodyCaptureOptions,
  CreateRedisAttestationStoreOptions,
  CreateRequestAttestationMiddlewareOptions,
  CreateMemoryAttestationStoreOptions,
  CreateSignerBundleRouterOptions,
} from './server-types.js';

/**
 * SHA-256 hex digest of the exact submitted body bytes. An actually empty
 * request hashes zero bytes (`EMPTY_BODY_SHA256_HEX`). The signed bytes and
 * the captured bytes must be the same representation (parser capture uses
 * `inflate: false`; identity/no content-encoding only).
 */
export function hashBodySha256Hex(body: Uint8Array): string {
  if (!(body instanceof Uint8Array)) {
    throw new AttestationProtocolError('body must be a Uint8Array');
  }
  return createHash('sha256').update(body).digest('hex');
}

/**
 * Derive the opaque replay key `att:v1:` + SHA-256 hex of
 * `JSON([replayNamespace, publicOrigin, nonceHex])`. The key carries no
 * instance ID, path, token, session, or key ID, so nonce single-use spans
 * accepted rotations in one protection space.
 */
export function deriveAttestationReplayKey(input: {
  readonly replayNamespace: string;
  readonly publicOrigin: string;
  readonly nonceHex: string;
}): string {
  const preimage = buildReplayKeyPreimageBytes(input);
  const digest = createHash('sha256').update(preimage).digest('hex');
  const replayKey = `${REPLAY_KEY_PREFIX}${digest}`;
  validateReplayKey(replayKey);
  return replayKey;
}

// ---------------------------------------------------------------------------
// ATT-02/03/04/05 implementations. Signatures follow task section 4.
// ---------------------------------------------------------------------------

/** ATT-02: verify-before-reserve Express middleware. */
export { createRequestAttestationMiddleware } from './middleware.js';
export type {
  AttestationDiagnosticEvent,
  AttestationDiagnosticHook,
  CreateRequestAttestationMiddlewareOptionsWithDiagnostic,
} from './middleware.js';

/** ATT-02: parser body-capture integration. */
export { createAttestationBodyCapture, getAttestationBodyRecord } from './body-capture.js';
export type { AttestationBodyCaptureWithRecord, AttestationBodyRecord } from './body-capture.js';

/** ATT-02: pure verification helpers (no replay allocation). */
export {
  assertAllowedContentEncoding,
  checkProofTiming,
  copyAttestationSnapshot,
  deriveReplayKey,
  resolveContentType,
  resolveRequestTarget,
  verifyAttestationProof,
} from './verify.js';
export type { AttestationVerifiedProof, AttestationVerifyInput } from './verify.js';

// ATT-03: bounded atomic memory replay store and its capacity error.
export { AttestationCapacityError, createMemoryAttestationStore } from './stores/memory.js';

// ATT-04: shared bounded Redis replay admission over one same-slot ledger.
export {
  AttestationRedisStoreError,
  createRedisAttestationStore,
  REDIS_ATTESTATION_STORE_DEFAULT_KEY_PREFIX,
  REDIS_ATTESTATION_STORE_DEFAULT_MAX_ENTRIES,
} from './stores/redis.js';

// MONGO-01: shared bounded MongoDB replay admission over two collections.
export {
  AttestationMongoStoreError,
  createMongoAttestationStore,
  MONGO_ATTESTATION_STORE_DEFAULT_CAPACITY_COLLECTION,
  MONGO_ATTESTATION_STORE_DEFAULT_MAX_ENTRIES,
  MONGO_ATTESTATION_STORE_DEFAULT_PROOFS_COLLECTION,
} from './stores/mongodb.js';
export type {
  CreateMongoAttestationStoreOptions,
  MongoAttestationStoreCollection,
  MongoAttestationStoreDb,
  MongoAttestationStoreSession,
} from './stores/mongodb.js';

// ATT-05: owned key rotation (static/rotating providers plus key generation).
export { createRotatingKeyProvider, createStaticKeyProvider, generateAttestationKey } from './keys.js';

// ATT-05: relative signer-asset router with immutable content-addressed modules.
export { createSignerBundleRouter } from './signer-bundle.js';
