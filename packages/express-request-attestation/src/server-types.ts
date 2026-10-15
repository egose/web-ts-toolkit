/**
 * Server-side key, replay-store, and Express integration contracts, exported
 * from `@web-ts-toolkit/express-request-attestation`. Browser consumers use
 * the separate `/signer` entry, which needs no server dependencies or types.
 */

/** One accepted key: exactly 32 bytes with an explicit acceptance window. */
export interface AttestationKeyEntry {
  /** Unique provisioning ID matching `[A-Za-z0-9_-]{1,64}`; never remap a live ID. */
  readonly keyId: string;
  /** Exactly 32 bytes; snapshots are owned/copy-isolated. */
  readonly key: Uint8Array;
  /** Inclusive activation, nonnegative safe-integer epoch ms; less than `acceptUntil`. */
  readonly acceptFrom: number;
  /** Exclusive retirement in epoch ms. Identical for this ID on every verifier in the protection space. */
  readonly acceptUntil: number;
}

/** Keyring snapshot returned by `AttestationKeyProvider.getSnapshot()`. */
export interface AttestationKeySnapshot {
  /** Names a present entry; discovery additionally requires it active at its post-provider clock. */
  readonly currentKeyId: string;
  /** 1–16 retained entries, with identical material/windows across the protection space. */
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
 * of one). Provider throws, rejected reads, malformed snapshots, and timeouts
 * become fixed `503 ATTESTATION_KEYS_UNAVAILABLE`, without a stale-key marker.
 * External cron/KMS/config code owns provisioning, refresh, and dependency
 * deadlines; there is no polling timer or cancellation of underlying work.
 */
export interface AttestationKeyProvider {
  getSnapshot(): AttestationKeySnapshot | Promise<AttestationKeySnapshot>;
}

/** Rotating provider with explicit atomic replacement and copy-isolated reads. */
export interface AttestationRotatingKeyProvider extends AttestationKeyProvider {
  /** Rejects invalid/remapped retained IDs atomically; does not cancel requests using an earlier snapshot. */
  replace(snapshot: AttestationKeySnapshotInput): void;
}

/** Atomic bounded replay-store reservation input. */
export interface AttestationStoreReserveInput {
  /** Opaque key: `att:v1:` + SHA-256 hex of `[namespace, origin, nonceHex]`. */
  readonly replayKey: string;
  /**
   * Absolute safe-integer epoch-ms deadline:
   * `min(timestampMs + maxAgeMs + clockSkewMs, key.acceptUntil) + clusterClockGuardMs`.
   * Retain until this deadline; never clamp it or extend it on a duplicate.
   */
  readonly retainUntilMs: number;
}

/** One atomic admission: inserted, already live (no extension), or deadline already elapsed. */
export type AttestationStoreReserveResult = 'reserved' | 'duplicate' | 'expired';

/**
 * Bounded replay store. `reserve` returns `duplicate` for an admitted nonce,
 * `expired` when the retention deadline has elapsed, and throws typed errors
 * on capacity exhaustion or unavailability. Verify proofs before reserving;
 * the store does not verify signatures. Successful or possibly committed
 * reservations are never released on handler failure, timeout, or lost response.
 * Shared verifiers must use identical time policies and key acceptance windows.
 * Direct calls have no package-level wait timeout; callers own driver deadlines.
 */
export interface AttestationStore {
  reserve(input: AttestationStoreReserveInput): Promise<AttestationStoreReserveResult>;
}

/**
 * Narrow structural Redis client contract. Inject an already-connected compatible
 * client (for example `node-redis`). The caller owns connection, error listeners,
 * command/queue deadlines, and shutdown; this package never imports a driver.
 */
export interface AttestationRedisClient {
  sendCommand(args: string[]): Promise<unknown>;
}

/**
 * Express guard configuration. All guards in one `(publicOrigin, replayNamespace)`
 * share replay state, identical time policies, and identical per-key acceptance
 * windows. Migrate live policy changes to a new namespace rather than mixing
 * policies or extending old key deadlines over already-admitted proofs.
 */
export interface CreateRequestAttestationMiddlewareOptions {
  /** Static canonical HTTPS origin (loopback HTTP allowed); never derive from request headers. */
  readonly publicOrigin: string;
  /** Protection-space identifier matching `[A-Za-z0-9_-]{1,128}`; must match signers. */
  readonly replayNamespace: string;
  /** Upstream-stripped prefix to prepend to `req.originalUrl`; default empty, no trailing slash. */
  readonly publicPathPrefix?: string;
  /** Caller-owned live provider; each request validates and copies its bounded snapshot. */
  readonly keyProvider: AttestationKeyProvider;
  /** Atomic shared nonce admission after successful verification; no fallback on store failure. */
  readonly store: AttestationStore;
  /** Maximum proof age, default 30000 ms; safe integer in 1000–120000. */
  readonly maxAgeMs?: number;
  /** Client clock allowance, default 5000 ms; safe integer in 0–30000. */
  readonly clockSkewMs?: number;
  /** Maximum pairwise verifier/store clock difference, default 5000 ms (0–30000); retention only. */
  readonly clusterClockGuardMs?: number;
  /** Single proof header; default `x-client-transaction-id`. Must pass shared HTTP name validation. */
  readonly headerName?: string;
  /** Default `Date.now`; every call must return nonnegative safe-integer epoch ms or the guard fails with 500. */
  readonly now?: () => number;
  /**
   * Each async provider/store wait, default 5000 ms; integer range 1–60000.
   * Does not cancel underlying work. Configure driver deadlines separately;
   * a timed-out reservation may commit but can never resume the handler.
   */
  readonly operationTimeoutMs?: number;
}

/** Exact-byte capture for Express parsers; use the same limit and `inflate: false` on the parser. */
export interface CreateAttestationBodyCaptureOptions {
  /** Parser/body budget, default 1 MiB, hard cap 16 MiB. */
  readonly maxBodyBytes?: number;
}

/**
 * Package-owned body-capture integration: an Express parser `verify`
 * callback storing digest/count in per-request state plus a narrow error
 * handler mapping parser size/encoding failures to fixed 413/415 errors.
 * These callbacks assign directly to Express parser/error-handler types.
 */
export interface AttestationBodyCapture {
  /** Attach as the parser's `verify` callback; observes bytes without changing `req.body`. */
  readonly verify: (req: unknown, res: unknown, body: unknown, encoding: string) => void;
  /** Mount after parsers and before the guard; other parser errors pass to `next(err)`. */
  readonly errorHandler: (err: unknown, req: unknown, res: unknown, next: (err?: unknown) => void) => void;
}

/** Trusted asset-distribution configuration; the caller owns mounting, CORS, and CSP. */
export interface CreateSignerBundleRouterOptions {
  /** Static canonical HTTPS origin (loopback HTTP allowed); never derived from Host/Forwarded headers. */
  readonly publicOrigin: string;
  /** Protection-space namespace matching the verifier and browser client. */
  readonly replayNamespace: string;
  /** Caller-owned provider; discovery publishes only the current key active after the provider read. */
  readonly keyProvider: AttestationKeyProvider;
  /**
   * Default `/attestation`. Mount the relative router at this path yourself.
   * `/` publishes `/signer-meta`, `/signer.<hash>.mjs`, and `/runtime.<hash>.mjs`.
   */
  readonly basePath?: string;
  /** Prefix stripped by the upstream proxy, default empty; prepend once to published URLs, not the app mount. */
  readonly publicPathPrefix?: string;
  /** Default `Date.now`; nonnegative safe-integer epoch ms, checked before and after discovery's provider read. */
  readonly now?: () => number;
  /** Per-provider wait bound, default 5000 ms (1–60000); does not cancel provider work. Timeout returns fixed 503. */
  readonly operationTimeoutMs?: number;
}

/** Process-local replay storage, shared only by callers reusing the same store object. */
export interface CreateMemoryAttestationStoreOptions {
  /** Positive safe-integer capacity; default 50000. Live entries are never evicted. */
  readonly maxEntries?: number;
  /** Default `Date.now`; nonnegative safe-integer epoch ms, synchronized with verifier clocks. */
  readonly now?: () => number;
}

/** Shared Redis replay ledger; the caller owns the connected client and dependency deadlines. */
export interface CreateRedisAttestationStoreOptions {
  readonly client: AttestationRedisClient;
  /** Default `wtt-attestation`; 1–256 characters. All instances in a protection space share this ledger prefix. */
  readonly keyPrefix?: string;
  /** Positive safe-integer capacity; default 50000, identical for every client sharing the prefix. */
  readonly maxEntries?: number;
}

/** Fixed verifier error codes; `AttestationError` supplies the stable HTTP status and message. */
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
