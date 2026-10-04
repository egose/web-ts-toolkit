/**
 * ATT-02 verify-before-reserve Express middleware (task sections 4.4-4.5).
 *
 * Stage order per request (spies + handler counters in
 * `test/verification-order.test.ts` prove this; status codes alone do not):
 *
 * 1. single-header extraction (missing/duplicate/comma-joined rejected),
 * 2. owned provider snapshot (`getSnapshot` bounded by `operationTimeoutMs`),
 * 3. first time/deadline + request-target/content-type/body/HMAC check,
 * 4. time recheck immediately before reservation (async provider delay that
 *    crosses the deadline cannot reserve),
 * 5. one atomic `store.reserve({ replayKey, retainUntilMs })` bounded by
 *    `operationTimeoutMs` (`duplicate`/`expired`/failure mapped to fixed
 *    errors; uncertain timeouts never call `next`, never fall back to memory,
 *    and never release a possibly committed reservation),
 * 6. final time/deadline check before `next()` (a store delay that crosses
 *    the deadline cannot execute the handler; the committed reservation is
 *    intentionally NOT released),
 * 7. `next()` exactly once on success.
 *
 * A successful reservation is never released: not on final-check failure,
 * not on handler exceptions, not on lost responses. A fresh proof is
 * required for every new application attempt. The guard never sets
 * `req.auth`, never consumes OIDC records, and contains no hardcoded
 * health/asset exclusions — mount it on selected routes only.
 *
 * Controlled failures respond directly with fixed section 4.5
 * `{ code, message }` JSON plus `Cache-Control: no-store`. Only a
 * pre-handler stale-key rejection carries `X-Attestation-Error: stale-key`
 * (the single stale-key retry signal). No raw key/nonce/signature/body,
 * provider diagnostics, or requested key IDs are echoed, and no
 * `WWW-Authenticate` header is emitted. An optional `onDiagnostic` hook
 * receives only allowlisted `{ code, status }`; its failure never changes
 * rejection/acceptance.
 */
import { resolveTimePolicy } from './shared/time-policy.js';
import { EMPTY_BODY_SHA256_HEX } from './shared/types.js';
import { validateHeaderName, validatePublicOrigin, validateReplayNamespace } from './shared/codec.js';
import { assertTimestampMs } from './shared/canonical.js';
import { AttestationProtocolError, DEFAULT_ATTESTATION_HEADER } from './shared/types.js';
import type { ResolvedTimePolicy } from './shared/types.js';
import { AttestationError } from './errors.js';
import type {
  AttestationErrorCode,
  AttestationKeySnapshot,
  CreateRequestAttestationMiddlewareOptions,
} from './server-types.js';
import { getAttestationBodyRecord } from './body-capture.js';
import { checkProofTiming, copyAttestationSnapshot, verifyAttestationProof } from './verify.js';
import { AttestationCapacityError } from './stores/memory.js';

export interface AttestationDiagnosticEvent {
  readonly code: AttestationErrorCode;
  readonly status: number;
}

export type AttestationDiagnosticHook = (event: AttestationDiagnosticEvent) => void;

export type CreateRequestAttestationMiddlewareOptionsWithDiagnostic = CreateRequestAttestationMiddlewareOptions & {
  readonly onDiagnostic?: AttestationDiagnosticHook;
};

interface ResolvedMiddlewareConfig {
  readonly publicOrigin: string;
  readonly replayNamespace: string;
  readonly publicPathPrefix: string;
  readonly keyProvider: NonNullable<CreateRequestAttestationMiddlewareOptions['keyProvider']>;
  readonly store: NonNullable<CreateRequestAttestationMiddlewareOptions['store']>;
  readonly policy: ResolvedTimePolicy;
  readonly headerName: string;
  readonly headerNameLower: string;
  readonly now: () => number;
  readonly operationTimeoutMs: number;
  readonly onDiagnostic: AttestationDiagnosticHook | undefined;
}

const MIDDLEWARE_OPTION_KEYS: ReadonlySet<string> = new Set([
  'publicOrigin',
  'replayNamespace',
  'publicPathPrefix',
  'keyProvider',
  'store',
  'maxAgeMs',
  'clockSkewMs',
  'clusterClockGuardMs',
  'headerName',
  'now',
  'operationTimeoutMs',
  'onDiagnostic',
]);

const DEFAULT_OPERATION_TIMEOUT_MS = 5000;
const MIN_OPERATION_TIMEOUT_MS = 1;
const MAX_OPERATION_TIMEOUT_MS = 60000;

class AttestationOperationTimeoutError extends Error {
  override readonly name = 'AttestationOperationTimeoutError';
}

function validatePublicPathPrefix(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new AttestationProtocolError('publicPathPrefix must be a string');
  }
  if (value === '') {
    return '';
  }
  if (!value.startsWith('/')) {
    throw new AttestationProtocolError('publicPathPrefix must start with /');
  }
  if (value.endsWith('/')) {
    throw new AttestationProtocolError('publicPathPrefix must not end with /');
  }
  if (value.includes('?') || value.includes('#') || value.includes('\\')) {
    throw new AttestationProtocolError('publicPathPrefix must not contain query, fragment, or backslashes');
  }
  for (const char of value) {
    const code = char.codePointAt(0) as number;
    if (code <= 0x20 || code === 0x7f) {
      throw new AttestationProtocolError('publicPathPrefix must not contain controls or spaces');
    }
  }
  return value;
}

function checkedNow(now: () => number): number {
  let value: number;
  try {
    value = now();
  } catch {
    throw new AttestationError('ATTESTATION_INTERNAL_ERROR');
  }
  try {
    assertTimestampMs('nowMs', value);
  } catch {
    throw new AttestationError('ATTESTATION_INTERNAL_ERROR');
  }
  return value;
}

function withOperationTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new AttestationOperationTimeoutError(`operation timed out after ${ms} ms`));
    }, ms);
    if (typeof (timer as unknown as { unref?: () => void }).unref === 'function') {
      (timer as unknown as { unref: () => void }).unref();
    }
  });
  const raced = Promise.race([task, timeout]) as Promise<T>;
  return raced.finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

function emitDiagnostic(hook: AttestationDiagnosticHook | undefined, error: AttestationError): void {
  if (hook === undefined) {
    return;
  }
  try {
    hook({ code: error.code, status: error.status });
  } catch {
    // Diagnostic failure never changes rejection/acceptance.
  }
}

function sendControlledError(
  res: unknown,
  error: AttestationError,
  hooks: { onDiagnostic: AttestationDiagnosticHook | undefined },
): void {
  emitDiagnostic(hooks.onDiagnostic, error);
  const target = res as {
    headersSent?: boolean;
    setHeader?: (name: string, value: string) => void;
    set?: (name: string, value: string) => void;
    status?: (code: number) => { json: (body: unknown) => void };
  };
  if (target?.headersSent === true) {
    return;
  }
  if (typeof target.setHeader === 'function') {
    target.setHeader('Cache-Control', 'no-store');
  } else if (typeof target.set === 'function') {
    target.set('Cache-Control', 'no-store');
  }
  if (error.code === 'ATTESTATION_STALE_KEY') {
    if (typeof target.setHeader === 'function') {
      target.setHeader('X-Attestation-Error', 'stale-key');
    } else if (typeof target.set === 'function') {
      target.set('X-Attestation-Error', 'stale-key');
    }
  }
  if (typeof target.status === 'function') {
    target.status(error.status).json({ code: error.code, message: error.message });
  }
}

/** Extract the single raw header value; duplicate presentations => MALFORMED. */
function extractRawHeader(req: unknown, lowerName: string): string | readonly string[] | undefined {
  const record = req as {
    readonly headers?: Record<string, string | string[] | undefined>;
    readonly rawHeaders?: unknown;
  };
  const headers = record.headers;
  const rawHeaders = record.rawHeaders;
  let rawCount = 0;
  let firstRaw: string | undefined;
  if (Array.isArray(rawHeaders)) {
    for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
      const name = rawHeaders[index];
      const value = rawHeaders[index + 1];
      if (typeof name === 'string' && name.toLowerCase() === lowerName) {
        rawCount += 1;
        if (firstRaw === undefined && typeof value === 'string') {
          firstRaw = value;
        }
      }
    }
  }
  if (rawCount > 1) {
    throw new AttestationError('ATTESTATION_MALFORMED');
  }
  const value = headers?.[lowerName];
  if (value === undefined) {
    if (rawCount === 1 && firstRaw !== undefined) {
      return firstRaw;
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    const filtered = value.filter((entry) => entry !== undefined);
    if (filtered.length === 0) {
      return undefined;
    }
    if (filtered.length > 1) {
      throw new AttestationError('ATTESTATION_MALFORMED');
    }
    return filtered[0] as string;
  }
  return value;
}

/**
 * Resolve the body digest for this request: the capture record when present,
 * the empty digest for actually empty requests, or
 * `ATTESTATION_BODY_CAPTURE_REQUIRED` for nonempty uncaptured bodies (never
 * silently the empty digest).
 */
function resolveBodyDigestHex(req: unknown): string {
  const record = getAttestationBodyRecord(req);
  if (record !== undefined) {
    return record.digestHex;
  }
  const snapshot = req as {
    readonly headers?: Record<string, string | string[] | undefined>;
    readonly body?: unknown;
  };
  const headers = snapshot.headers ?? {};
  const contentLengthRaw = headers['content-length'];
  if (typeof contentLengthRaw === 'string' && contentLengthRaw.trim() !== '') {
    const parsed = Number(contentLengthRaw.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      throw new AttestationError('ATTESTATION_BODY_CAPTURE_REQUIRED');
    }
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new AttestationError('ATTESTATION_BODY_CAPTURE_REQUIRED');
    }
  } else if (Array.isArray(contentLengthRaw) && contentLengthRaw.length > 0) {
    for (const entry of contentLengthRaw) {
      if (typeof entry === 'string' && entry.trim() !== '') {
        const parsed = Number(entry.trim());
        if (!Number.isSafeInteger(parsed) || parsed !== 0) {
          throw new AttestationError('ATTESTATION_BODY_CAPTURE_REQUIRED');
        }
      }
    }
  }
  const transferEncoding = headers['transfer-encoding'];
  if (typeof transferEncoding === 'string' && transferEncoding.trim() !== '') {
    throw new AttestationError('ATTESTATION_BODY_CAPTURE_REQUIRED');
  }
  if (Array.isArray(transferEncoding) && transferEncoding.length > 0) {
    const nonEmpty = transferEncoding.some((entry) => typeof entry === 'string' && entry.trim() !== '');
    if (nonEmpty) {
      throw new AttestationError('ATTESTATION_BODY_CAPTURE_REQUIRED');
    }
  }
  const body = (snapshot as { readonly body?: unknown }).body;
  if (body !== undefined && body !== null) {
    if (typeof body === 'string' && body.length > 0) {
      throw new AttestationError('ATTESTATION_BODY_CAPTURE_REQUIRED');
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body) && body.length > 0) {
      throw new AttestationError('ATTESTATION_BODY_CAPTURE_REQUIRED');
    }
    if (body instanceof Uint8Array && body.length > 0) {
      throw new AttestationError('ATTESTATION_BODY_CAPTURE_REQUIRED');
    }
    if (Array.isArray(body) && body.length > 0) {
      throw new AttestationError('ATTESTATION_BODY_CAPTURE_REQUIRED');
    }
    if (typeof body === 'object' && !Array.isArray(body)) {
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) {
        // handled above
      } else if (!(body instanceof Uint8Array)) {
        const keys = Object.keys(body as Record<string, unknown>);
        if (keys.length > 0) {
          throw new AttestationError('ATTESTATION_BODY_CAPTURE_REQUIRED');
        }
      }
    }
  }
  return EMPTY_BODY_SHA256_HEX;
}

function resolveConfig(options: CreateRequestAttestationMiddlewareOptionsWithDiagnostic): ResolvedMiddlewareConfig {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new AttestationProtocolError('attestation middleware options must be an object');
  }
  for (const key of Object.keys(options)) {
    if (!MIDDLEWARE_OPTION_KEYS.has(key)) {
      throw new AttestationProtocolError(`unknown attestation middleware option ${key}`);
    }
  }
  validatePublicOrigin(options.publicOrigin);
  validateReplayNamespace(options.replayNamespace);
  const publicPathPrefix = validatePublicPathPrefix(options.publicPathPrefix);
  const keyProvider = (options as { readonly keyProvider?: unknown }).keyProvider;
  if (
    keyProvider === null ||
    typeof keyProvider !== 'object' ||
    typeof (keyProvider as { getSnapshot?: unknown }).getSnapshot !== 'function'
  ) {
    throw new AttestationProtocolError('attestation middleware keyProvider must expose getSnapshot()');
  }
  const store = (options as { readonly store?: unknown }).store;
  if (store === null || typeof store !== 'object' || typeof (store as { reserve?: unknown }).reserve !== 'function') {
    throw new AttestationProtocolError('attestation middleware store must expose reserve()');
  }
  const policy = resolveTimePolicy({
    ...(options.maxAgeMs === undefined ? {} : { maxAgeMs: options.maxAgeMs }),
    ...(options.clockSkewMs === undefined ? {} : { clockSkewMs: options.clockSkewMs }),
    ...(options.clusterClockGuardMs === undefined ? {} : { clusterClockGuardMs: options.clusterClockGuardMs }),
  });
  const headerName = options.headerName ?? DEFAULT_ATTESTATION_HEADER;
  validateHeaderName(headerName);
  const now = options.now ?? Date.now;
  if (typeof now !== 'function') {
    throw new AttestationProtocolError('attestation middleware now must be a function');
  }
  const operationTimeoutMs = options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(operationTimeoutMs) ||
    operationTimeoutMs < MIN_OPERATION_TIMEOUT_MS ||
    operationTimeoutMs > MAX_OPERATION_TIMEOUT_MS
  ) {
    throw new AttestationProtocolError(
      `operationTimeoutMs must be a safe integer in [${MIN_OPERATION_TIMEOUT_MS}, ${MAX_OPERATION_TIMEOUT_MS}]`,
    );
  }
  const onDiagnostic = (options as { readonly onDiagnostic?: unknown }).onDiagnostic;
  if (onDiagnostic !== undefined && typeof onDiagnostic !== 'function') {
    throw new AttestationProtocolError('attestation middleware onDiagnostic must be a function');
  }
  return Object.freeze({
    publicOrigin: options.publicOrigin,
    replayNamespace: options.replayNamespace,
    publicPathPrefix,
    keyProvider: keyProvider as NonNullable<CreateRequestAttestationMiddlewareOptions['keyProvider']>,
    store: store as NonNullable<CreateRequestAttestationMiddlewareOptions['store']>,
    policy,
    headerName,
    headerNameLower: headerName.toLowerCase(),
    now: now as () => number,
    operationTimeoutMs,
    onDiagnostic: onDiagnostic as AttestationDiagnosticHook | undefined,
  });
}

/**
 * Create the verify-before-reserve Express guard.
 *
 * Required `publicOrigin`/`replayNamespace`/services are validated once and
 * frozen; key snapshots are owned per request while service references stay
 * live. Async provider/store waits are bounded by `operationTimeoutMs`
 * (default 5000 ms, allowed 1-60000 ms); a late settlement after the bound
 * can never resume the rejected request, call `next`, or release a possibly
 * committed reservation.
 */
export function createRequestAttestationMiddleware(
  options: CreateRequestAttestationMiddlewareOptionsWithDiagnostic,
): (req: unknown, res: unknown, next: (err?: unknown) => void) => void {
  const config = resolveConfig(options);

  const middleware = (req: unknown, res: unknown, next: (err?: unknown) => void): void => {
    void Promise.resolve()
      .then(async () => {
        let nowMs = checkedNow(config.now);

        let headerValue: string | readonly string[] | undefined;
        try {
          headerValue = extractRawHeader(req, config.headerNameLower);
        } catch (error) {
          if (error instanceof AttestationError) {
            sendControlledError(res, error, config);
            return;
          }
          throw error;
        }

        let snapshotRaw: AttestationKeySnapshot | Promise<AttestationKeySnapshot>;
        try {
          const pending = config.keyProvider.getSnapshot();
          snapshotRaw = await withOperationTimeout(Promise.resolve(pending), config.operationTimeoutMs);
        } catch (error) {
          if (error instanceof AttestationError) {
            sendControlledError(res, error, config);
            return;
          }
          sendControlledError(res, new AttestationError('ATTESTATION_KEYS_UNAVAILABLE'), config);
          return;
        }

        let snapshot: AttestationKeySnapshot;
        try {
          snapshot = copyAttestationSnapshot(snapshotRaw);
        } catch (error) {
          if (error instanceof AttestationError) {
            sendControlledError(res, error, config);
            return;
          }
          sendControlledError(res, new AttestationError('ATTESTATION_KEYS_UNAVAILABLE'), config);
          return;
        }

        const record = req as {
          readonly method?: unknown;
          readonly originalUrl?: unknown;
          readonly url?: unknown;
          readonly headers?: Record<string, string | string[] | undefined>;
        };
        const originalUrl = typeof record.originalUrl === 'string' ? record.originalUrl : record.url;
        const contentTypeHeader = (record.headers?.['content-type'] as string | string[] | undefined) ?? undefined;
        const contentEncodingHeader =
          (record.headers?.['content-encoding'] as string | string[] | undefined) ?? undefined;

        let bodyDigestHex: string;
        try {
          bodyDigestHex = resolveBodyDigestHex(req);
        } catch (error) {
          if (error instanceof AttestationError) {
            sendControlledError(res, error, config);
            return;
          }
          throw error;
        }

        let verified: Awaited<ReturnType<typeof verifyAttestationProof>>;
        try {
          verified = verifyAttestationProof({
            headerValue,
            method: record.method,
            originalUrl,
            publicPathPrefix: config.publicPathPrefix,
            contentTypeHeader,
            contentEncodingHeader,
            bodyDigestHex,
            snapshot,
            nowMs,
            policy: config.policy,
            replayNamespace: config.replayNamespace,
            publicOrigin: config.publicOrigin,
          });
        } catch (error) {
          if (error instanceof AttestationError) {
            sendControlledError(res, error, config);
            return;
          }
          sendControlledError(res, new AttestationError('ATTESTATION_INTERNAL_ERROR'), config);
          return;
        }

        nowMs = checkedNow(config.now);
        let rechecked: typeof verified.timing;
        try {
          rechecked = checkProofTiming({
            timestampMs: verified.timestampMs,
            nowMs,
            keyEntry: verified.keyEntry,
            policy: config.policy,
          });
        } catch (error) {
          if (error instanceof AttestationError) {
            sendControlledError(res, error, config);
            return;
          }
          sendControlledError(res, new AttestationError('ATTESTATION_INTERNAL_ERROR'), config);
          return;
        }
        const retainUntilMs = rechecked.retainUntilMs;
        if (retainUntilMs === null || !Number.isSafeInteger(retainUntilMs)) {
          sendControlledError(res, new AttestationError('ATTESTATION_EXPIRED'), config);
          return;
        }

        let reserveResult: string;
        try {
          const pending = config.store.reserve({
            replayKey: verified.replayKey,
            retainUntilMs: retainUntilMs as number,
          });
          reserveResult = await withOperationTimeout(Promise.resolve(pending), config.operationTimeoutMs);
        } catch (error) {
          if (error instanceof AttestationCapacityError) {
            sendControlledError(res, new AttestationError('ATTESTATION_REPLAY_UNAVAILABLE'), config);
            return;
          }
          sendControlledError(res, new AttestationError('ATTESTATION_REPLAY_UNAVAILABLE'), config);
          return;
        }
        if (reserveResult === 'duplicate') {
          sendControlledError(res, new AttestationError('ATTESTATION_REPLAY'), config);
          return;
        }
        if (reserveResult === 'expired') {
          sendControlledError(res, new AttestationError('ATTESTATION_EXPIRED'), config);
          return;
        }
        if (reserveResult !== 'reserved') {
          sendControlledError(res, new AttestationError('ATTESTATION_REPLAY_UNAVAILABLE'), config);
          return;
        }

        nowMs = checkedNow(config.now);
        try {
          checkProofTiming({
            timestampMs: verified.timestampMs,
            nowMs,
            keyEntry: verified.keyEntry,
            policy: config.policy,
          });
        } catch (error) {
          if (error instanceof AttestationError) {
            // The reservation stays committed; a fresh proof is required to
            // retry. Never release here.
            sendControlledError(res, error, config);
            return;
          }
          sendControlledError(res, new AttestationError('ATTESTATION_INTERNAL_ERROR'), config);
          return;
        }

        // Success: exactly one `next()` with no arguments. Later application
        // errors are not attestation failures and cannot carry the stale-key
        // marker. The reservation stays committed even if the handler throws.
        next();
      })
      .catch((error: unknown) => {
        if (error instanceof AttestationError) {
          const target = res as { headersSent?: boolean };
          if (target?.headersSent !== true) {
            sendControlledError(res, error, config);
          }
          return;
        }
        const target = res as {
          headersSent?: boolean;
          setHeader?: (name: string, value: string) => void;
          set?: (name: string, value: string) => void;
          status?: (code: number) => { json: (body: unknown) => void };
        };
        if (target?.headersSent === true) {
          try {
            next(error);
          } catch {
            // Express owns further handling once headers are sent.
          }
          return;
        }
        sendControlledError(res, new AttestationError('ATTESTATION_INTERNAL_ERROR'), config);
      });
  };

  return middleware;
}
