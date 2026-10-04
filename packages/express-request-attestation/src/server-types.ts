/**
 * ATT-01 server-side interfaces and fixed HTTP errors (task section 4.5).
 *
 * Server-specific ONLY: this module may reference Express/Redis types but is
 * imported exclusively by the `.` entry. The `./signer` entry never imports
 * it, so browser declarations stay free of server types.
 */

/** One accepted key: exactly 32 bytes with an explicit acceptance window. */
export interface AttestationKeyEntry {
  readonly keyId: string;
  /** Exactly 32 bytes; snapshots are owned/copy-isolated. */
  readonly key: Uint8Array;
  /** Nonnegative safe-integer epoch ms; `acceptFrom < acceptUntil`. */
  readonly acceptFrom: number;
  readonly acceptUntil: number;
}

/** Keyring snapshot returned by `AttestationKeyProvider.getSnapshot()`. */
export interface AttestationKeySnapshot {
  /** Must name a present active entry. At most 16 retained keys. */
  readonly currentKeyId: string;
  readonly keys: readonly AttestationKeyEntry[];
}

/** Input snapshot for static/rotating providers (owned/copied on entry). */
export interface AttestationKeySnapshotInput {
  readonly currentKeyId: string;
  readonly keys: readonly {
    readonly keyId: string;
    readonly key: Uint8Array;
    readonly acceptFrom: number;
    readonly acceptUntil: number;
  }[];
}

/**
 * Typed key provider. Returns an owned, copy-isolated snapshot (or a promise
 * of one). Provider/read failure is operational `503`, never a stale-key
 * client error. External cron/KMS/config code owns provisioning and refresh;
 * there is no default polling timer.
 */
export interface AttestationKeyProvider {
  getSnapshot(): AttestationKeySnapshot | Promise<AttestationKeySnapshot>;
}

/** Rotating provider with explicit atomic replacement (ATT-05). */
export interface AttestationRotatingKeyProvider extends AttestationKeyProvider {
  replace(snapshot: AttestationKeySnapshotInput): void;
}

/** Atomic bounded replay-store reservation input. */
export interface AttestationStoreReserveInput {
  /** Opaque key: `att:v1:` + SHA-256 hex of `[namespace, origin, nonceHex]`. */
  readonly replayKey: string;
  /** Absolute retention deadline (safe-integer epoch ms, section 4.4). */
  readonly retainUntilMs: number;
}

export type AttestationStoreReserveResult = 'reserved' | 'duplicate' | 'expired';

/**
 * Bounded replay store. `reserve` returns `duplicate` for an admitted nonce,
 * `expired` when the retention deadline has elapsed, and throws typed errors
 * on capacity exhaustion or unavailability. The adapter never interprets
 * caller-supplied nonce strings as already authenticated.
 */
export interface AttestationStore {
  reserve(input: AttestationStoreReserveInput): Promise<AttestationStoreReserveResult>;
}

/**
 * Narrow structural Redis client contract (ATT-04). The library never creates,
 * connects, or closes clients and never imports a Redis driver; callers
 * inject any compatible client (e.g. `node-redis`). Redis stays a dev
 * dependency for integration tests, not a runtime dependency.
 */
export interface AttestationRedisClient {
  sendCommand(args: string[]): Promise<unknown>;
}

/** Options for `createRequestAttestationMiddleware` (implemented in ATT-02). */
export interface CreateRequestAttestationMiddlewareOptions {
  /** Static canonical HTTPS origin (loopback http allowed in development). */
  readonly publicOrigin: string;
  readonly replayNamespace: string;
  /** Upstream-stripped prefix to re-prepend after `req.originalUrl`. */
  readonly publicPathPrefix?: string;
  readonly keyProvider: AttestationKeyProvider;
  readonly store: AttestationStore;
  readonly maxAgeMs?: number;
  readonly clockSkewMs?: number;
  readonly clusterClockGuardMs?: number;
  readonly headerName?: string;
  readonly now?: () => number;
  /** Bounds async provider/store waits; default 5000 ms. */
  readonly operationTimeoutMs?: number;
}

/** Options for `createAttestationBodyCapture` (implemented in ATT-02). */
export interface CreateAttestationBodyCaptureOptions {
  /** Parser/body budget, default 1 MiB, hard cap 16 MiB. */
  readonly maxBodyBytes?: number;
}

/**
 * Package-owned body-capture integration: an Express parser `verify`
 * callback storing digest/count in per-request state plus a narrow error
 * handler mapping parser size/encoding failures to section 4.5 errors.
 */
export interface AttestationBodyCapture {
  readonly verify: (req: unknown, res: unknown, body: unknown, encoding: string) => void;
  readonly errorHandler: (err: unknown, req: unknown, res: unknown, next: (err?: unknown) => void) => void;
}

/** Options for `createSignerBundleRouter` (implemented in ATT-05). */
export interface CreateSignerBundleRouterOptions {
  readonly publicOrigin: string;
  readonly replayNamespace: string;
  readonly keyProvider: AttestationKeyProvider;
  /** Relative mount base path used only to publish external URLs. */
  readonly basePath?: string;
  readonly publicPathPrefix?: string;
  readonly now?: () => number;
  readonly operationTimeoutMs?: number;
}

/** Options for `createMemoryAttestationStore` (implemented in ATT-03). */
export interface CreateMemoryAttestationStoreOptions {
  readonly maxEntries?: number;
  readonly now?: () => number;
}

/** Options for `createRedisAttestationStore` (implemented in ATT-04). */
export interface CreateRedisAttestationStoreOptions {
  readonly client: AttestationRedisClient;
  readonly keyPrefix?: string;
  readonly maxEntries?: number;
}

/** Fixed section 4.5 error codes with their HTTP status and message. */
export type AttestationErrorCode =
  | 'ATTESTATION_MISSING'
  | 'ATTESTATION_MALFORMED'
  | 'ATTESTATION_STALE_KEY'
  | 'ATTESTATION_EXPIRED'
  | 'ATTESTATION_FUTURE'
  | 'ATTESTATION_INVALID_SIGNATURE'
  | 'ATTESTATION_REPLAY'
  | 'ATTESTATION_BODY_TOO_LARGE'
  | 'ATTESTATION_UNSUPPORTED_ENCODING'
  | 'ATTESTATION_BODY_CAPTURE_REQUIRED'
  | 'ATTESTATION_INTERNAL_ERROR'
  | 'ATTESTATION_KEYS_UNAVAILABLE'
  | 'ATTESTATION_REPLAY_UNAVAILABLE';

const ERROR_DETAILS: Record<AttestationErrorCode, { readonly status: number; readonly message: string }> = {
  ATTESTATION_MISSING: { status: 403, message: 'Request signature is required.' },
  ATTESTATION_MALFORMED: { status: 403, message: 'Request signature is invalid.' },
  ATTESTATION_STALE_KEY: { status: 403, message: 'Request signing key is no longer accepted.' },
  ATTESTATION_EXPIRED: { status: 403, message: 'Request signature has expired.' },
  ATTESTATION_FUTURE: { status: 403, message: 'Request signature timestamp is ahead of the allowed clock window.' },
  ATTESTATION_INVALID_SIGNATURE: { status: 403, message: 'Request signature does not match.' },
  ATTESTATION_REPLAY: { status: 403, message: 'Request signature was already used.' },
  ATTESTATION_BODY_TOO_LARGE: { status: 413, message: 'Request body exceeds the configured byte limit.' },
  ATTESTATION_UNSUPPORTED_ENCODING: { status: 415, message: 'Request body encoding is unsupported.' },
  ATTESTATION_BODY_CAPTURE_REQUIRED: { status: 500, message: 'Request body capture is not configured.' },
  ATTESTATION_INTERNAL_ERROR: { status: 500, message: 'Request signature verification failed.' },
  ATTESTATION_KEYS_UNAVAILABLE: { status: 503, message: 'Request signing keys are unavailable.' },
  ATTESTATION_REPLAY_UNAVAILABLE: { status: 503, message: 'Request replay protection is unavailable.' },
};

/**
 * Typed attestation failure carrying a fixed code/status/message. Responses
 * use `{ code, message }` JSON with `Cache-Control: no-store` and never echo
 * raw keys, nonces, signatures, bodies, provider errors, or requested IDs.
 */
export class AttestationError extends Error {
  override readonly name = 'AttestationError';
  readonly code: AttestationErrorCode;
  readonly status: number;

  constructor(code: AttestationErrorCode) {
    super(ERROR_DETAILS[code].message);
    this.code = code;
    this.status = ERROR_DETAILS[code].status;
  }
}

export function isAttestationError(error: unknown): error is AttestationError {
  return error instanceof AttestationError;
}

/** Response payload shape for attestation failures (no raw diagnostics). */
export function toAttestationErrorPayload(error: AttestationError): {
  readonly code: AttestationErrorCode;
  readonly message: string;
} {
  return { code: error.code, message: error.message };
}
