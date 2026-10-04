/**
 * ATT-02 Express body-parser capture integration (task sections 4.2-4.3, 4.5).
 *
 * Expected mount order (documented contract):
 *
 * ```ts
 * const capture = createAttestationBodyCapture({ maxBodyBytes });
 * const guard = createRequestAttestationMiddleware({ ... });
 *
 * // 1. Parsers observe the exact submitted bytes. Use the SAME byte limit
 * //    and `inflate: false` everywhere so the signed bytes and the captured
 * //    bytes are the same representation (identity / no Content-Encoding only;
 * //    compression is rejected by the guard with 415).
 * app.use(express.json({ limit: maxBodyBytes, verify: capture.verify, inflate: false }));
 * app.use(express.urlencoded({ extended: false, limit: maxBodyBytes, verify: capture.verify, inflate: false }));
 * app.use(express.raw({ type: 'application/octet-stream', limit: maxBodyBytes, verify: capture.verify, inflate: false }));
 * // Multipart exact bytes: capture with `express.raw({ type: 'multipart/*', ... })`
 * // so the boundary bytes are preserved verbatim for hashing.
 *
 * // 2. Capture error mapping runs BEFORE the guard so over-limit / encoding
 * //    failures (which occur before the guard) produce fixed 413/415 errors
 * //    without allocating replay state.
 * app.use(capture.errorHandler);
 *
 * // 3. Guard reserves replay state only after a valid signature + deadline.
 * app.use('/api', guard);
 *
 * // 4. Application handlers run only after successful reservation + final
 * //    deadline check. `req.body` remains usable downstream.
 * app.post('/api/submit', handler);
 * ```
 *
 * State: package-owned `WeakMap` keyed by the request object stores
 * `{ digestHex, byteLength }` where `digestHex` is lowercase hex
 * SHA-256 of the EXACT bytes passed to `verify` and `byteLength` is the
 * exact byte count. No user-writable field (`req.body`, client headers, or a
 * client-provided hash) is trusted. `getRecord` returns a frozen copy or
 * `undefined` when the parser never captured (empty bodies legitimately have
 * no record; nonempty uncaptured bodies are rejected by the guard with
 * `500 ATTESTATION_BODY_CAPTURE_REQUIRED`).
 *
 * `verify` never mutates `req.body`; it only observes. `errorHandler` is
 * narrow: only supported parser size/encoding failures map to section 4.5;
 * every other parser error retains application/parser policy via `next(err)`.
 */
import { createHash } from 'node:crypto';

import { AttestationProtocolError, DEFAULT_MAX_BODY_BYTES, MAX_BODY_BYTES_HARD_CAP } from './shared/types.js';
import { AttestationError } from './errors.js';
import type { AttestationBodyCapture, CreateAttestationBodyCaptureOptions } from './server-types.js';

export interface AttestationBodyRecord {
  readonly digestHex: string;
  readonly byteLength: number;
}

export interface AttestationBodyCaptureWithRecord extends AttestationBodyCapture {
  readonly getRecord: (req: unknown) => AttestationBodyRecord | undefined;
  readonly maxBodyBytes: number;
}

const BODY_CAPTURE_OPTION_KEYS: ReadonlySet<string> = new Set(['maxBodyBytes']);

/** Package-owned per-request digest/count state. Never keyed by user input. */
const bodyRecords = new WeakMap<object, AttestationBodyRecord>();

function toBytes(body: unknown): Uint8Array | null {
  if (body === null || body === undefined) {
    return null;
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) {
    return new Uint8Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
  }
  if (body instanceof Uint8Array) {
    return new Uint8Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
  }
  if (typeof body === 'string') {
    return new TextEncoder().encode(body);
  }
  return null;
}

/**
 * Read the package-owned capture record for `req`, or `undefined` when the
 * configured parser never invoked `verify` for this request. Returns a frozen
 * copy; caller mutation cannot corrupt stored state. Never trusts
 * `req.body` or any client-supplied digest field.
 */
export function getAttestationBodyRecord(req: unknown): AttestationBodyRecord | undefined {
  if (req === null || (typeof req !== 'object' && typeof req !== 'function')) {
    return undefined;
  }
  const record = bodyRecords.get(req as object);
  if (record === undefined) {
    return undefined;
  }
  return Object.freeze({ digestHex: record.digestHex, byteLength: record.byteLength });
}

function isParserSizeError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') {
    return false;
  }
  const record = error as { readonly type?: unknown; readonly status?: unknown; readonly statusCode?: unknown };
  if (record.type === 'entity.too.large') {
    return true;
  }
  return false;
}

function isParserEncodingError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') {
    return false;
  }
  const record = error as { readonly type?: unknown };
  return record.type === 'charset.unsupported' || record.type === 'encoding.unsupported';
}

function sendCaptureError(
  res: unknown,
  status: number,
  code: 'ATTESTATION_BODY_TOO_LARGE' | 'ATTESTATION_UNSUPPORTED_ENCODING',
): void {
  const error = new AttestationError(code);
  const target = res as {
    setHeader?: (name: string, value: string) => void;
    set?: (name: string, value: string) => void;
    status?: (code: number) => { json: (body: unknown) => void };
    statusCode?: number;
    json?: (body: unknown) => void;
  };
  if (typeof target.setHeader === 'function') {
    target.setHeader('Cache-Control', 'no-store');
  } else if (typeof target.set === 'function') {
    target.set('Cache-Control', 'no-store');
  }
  if (typeof target.status === 'function') {
    target.status(status).json({ code: error.code, message: error.message });
    return;
  }
  throw new AttestationProtocolError('attestation body capture error handler requires an Express response');
}

/**
 * Create the parser `verify` callback + narrow error mapper.
 *
 * `maxBodyBytes` defaults to 1 MiB and must be a positive safe integer up to
 * the v1 hard cap of 16 MiB. Configure the SAME value as the Express parser
 * `limit` option and always use `inflate: false`. Applications may choose a
 * smaller limit. Over-limit bodies fail in the parser (mapped to 413 before
 * the guard) before any replay allocation.
 */
export function createAttestationBodyCapture(
  options: CreateAttestationBodyCaptureOptions = {},
): AttestationBodyCaptureWithRecord {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new AttestationProtocolError('attestation body capture options must be an object');
  }
  for (const key of Object.keys(options)) {
    if (!BODY_CAPTURE_OPTION_KEYS.has(key)) {
      throw new AttestationProtocolError(`unknown attestation body capture option ${key}`);
    }
  }
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new AttestationProtocolError('maxBodyBytes must be a positive safe integer');
  }
  if (maxBodyBytes > MAX_BODY_BYTES_HARD_CAP) {
    throw new AttestationProtocolError(
      `maxBodyBytes must be at most ${MAX_BODY_BYTES_HARD_CAP} bytes (16 MiB v1 hard cap)`,
    );
  }

  const verify = (req: unknown, _res: unknown, body: unknown, _encoding?: string): void => {
    void _encoding;
    if (req === null || (typeof req !== 'object' && typeof req !== 'function')) {
      return;
    }
    const bytes = toBytes(body);
    if (bytes === null) {
      return;
    }
    if (bytes.length > maxBodyBytes) {
      const overflow = new Error('Request body exceeds the configured byte limit.') as Error & {
        type: string;
        status: number;
        statusCode: number;
      };
      overflow.type = 'entity.too.large';
      overflow.status = 413;
      overflow.statusCode = 413;
      throw overflow;
    }
    const digestHex = createHash('sha256').update(bytes).digest('hex');
    bodyRecords.set(req as object, Object.freeze({ digestHex, byteLength: bytes.length }));
  };

  const errorHandler = (err: unknown, _req: unknown, res: unknown, next: (err?: unknown) => void): void => {
    if (err === null || err === undefined) {
      next();
      return;
    }
    const target = res as { headersSent?: boolean } | undefined;
    if (target?.headersSent === true) {
      next(err);
      return;
    }
    if (isParserSizeError(err)) {
      sendCaptureError(res, 413, 'ATTESTATION_BODY_TOO_LARGE');
      return;
    }
    if (isParserEncodingError(err)) {
      sendCaptureError(res, 415, 'ATTESTATION_UNSUPPORTED_ENCODING');
      return;
    }
    next(err);
  };

  const getRecord = (req: unknown): AttestationBodyRecord | undefined => getAttestationBodyRecord(req);

  return Object.freeze({
    verify,
    errorHandler,
    getRecord,
    maxBodyBytes,
  });
}
