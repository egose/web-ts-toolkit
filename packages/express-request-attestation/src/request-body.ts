/**
 * Bounded request-body materialization.
 *
 * Browser-safe, using standard same-realm Request and readable byte-stream APIs.
 *
 * A `Request` body is internally a stream. This module reads supported finite
 * requests with a byte-counting reader, cancellation, and a bounded deadline
 * instead of claiming the mere stream type proves the body unsupported.
 * Caller-supplied streaming uploads that exceed the cap, stall past the
 * deadline, or abort are rejected locally without unbounded reads.
 *
 * - `materializeRequestBodyBytes(request, { maxBodyBytes, signal, timeoutMs })`
 *   returns the exact serialized bytes for hashing and for both signed
 *   attempts. Empty (`body === null`) yields zero bytes. The reader is
 *   signaled to cancel on limit/deadline/abort/error without waiting for the
 *   producer's cancellation promise.
 * - `assertSupportedBodyInit(body)` rejects caller JSON objects (docs use
 *   `JSON.stringify`) and other non-`BodyInit` values before a `Request` is
 *   built. Supported finite values (`string`, `URLSearchParams`, `Blob`,
 *   `ArrayBuffer`/views, `FormData`, `ReadableStream`, `null`) pass through;
 *   `FormData` itself is never read via `.arrayBuffer()` — callers serialize
 *   it through a `Request` first and this module reads that request's bytes,
 *   preserving the generated multipart boundary.
 * - `FormData` boundary preservation is owned by the caller in
 *   `fetchWithAttestation`: the bytes captured here are reused verbatim for the
 *   original attempt and the single stale-key retry, never reconstructed.
 *
 * No storage API, DOM mutation, global network patch, import-time I/O, or
 * polling timers. The internal reader owns a one-shot deadline and at most
 * one cooperative-yield timer, both cleaned up when the read settles.
 */

import { AttestationProtocolError } from './shared/types.js';
import { DEFAULT_MAX_BODY_BYTES, MAX_BODY_BYTES_HARD_CAP } from './shared/types.js';
import { SignerClientError } from './client-errors.js';
import { readBoundedByteStream } from './bounded-byte-stream.js';

/** Default body budget for prepared fetch: 1 MiB (matches server default). */
export const DEFAULT_ATTESTED_FETCH_MAX_BODY_BYTES = DEFAULT_MAX_BODY_BYTES as number;

/** Hard v1 cap for prepared fetch: 16 MiB (matches server hard cap). */
export const ATTESTED_FETCH_MAX_BODY_BYTES_HARD_CAP = MAX_BODY_BYTES_HARD_CAP as number;

/** Default bounded read deadline for one body materialization: 5000 ms. */
export const DEFAULT_ATTESTED_FETCH_BODY_READ_TIMEOUT_MS = 5000 as const;

const MIN_BODY_READ_TIMEOUT_MS = 1 as const;
const MAX_BODY_READ_TIMEOUT_MS = 60000 as const;

/** Bounds for consuming one Request body; this helper does not clone its input. */
export interface MaterializeRequestBodyOptions {
  /** Positive safe-integer byte cap; default 1 MiB, hard cap 16 MiB. Covers reader-owned bytes, not native tee queues. */
  readonly maxBodyBytes?: number;
  /** Explicit caller signal for this read; abort preserves its exact reason. Supply `request.signal` if desired. */
  readonly signal?: AbortSignal | null | undefined;
  /** Body-read waiting bound only; default 5000 ms, integer range 1–60000. Expiry uses SIGNER_PREPARATION_FAILED. */
  readonly timeoutMs?: number;
}

function validateMaxBodyBytes(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_ATTESTED_FETCH_MAX_BODY_BYTES;
  }
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new AttestationProtocolError('maxBodyBytes must be a positive safe integer');
  }
  const bytes = value as number;
  if (bytes > ATTESTED_FETCH_MAX_BODY_BYTES_HARD_CAP) {
    throw new AttestationProtocolError(
      `maxBodyBytes must be at most ${ATTESTED_FETCH_MAX_BODY_BYTES_HARD_CAP} bytes (16 MiB v1 hard cap)`,
    );
  }
  return bytes;
}

function validateBodyReadTimeoutMs(value: unknown): number {
  if (value === undefined) {
    return DEFAULT_ATTESTED_FETCH_BODY_READ_TIMEOUT_MS;
  }
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < MIN_BODY_READ_TIMEOUT_MS ||
    value > MAX_BODY_READ_TIMEOUT_MS
  ) {
    throw new AttestationProtocolError(
      `bodyReadTimeoutMs must be a safe integer in [${MIN_BODY_READ_TIMEOUT_MS}, ${MAX_BODY_READ_TIMEOUT_MS}]`,
    );
  }
  return value;
}

function getGlobalConstructor(name: string): (new (...args: never[]) => unknown) | undefined {
  const candidate = (globalThis as unknown as Record<string, unknown>)[name];
  if (typeof candidate === 'function') {
    return candidate as new (...args: never[]) => unknown;
  }
  return undefined;
}

/**
 * Reject caller JSON objects and other non-`BodyInit` values before a
 * `Request` is built. Docs use `JSON.stringify`; a plain object is never a
 * valid Fetch body and must fail locally rather than serialize as
 * `"[object Object]"`.
 */
export function assertSupportedBodyInit(body: unknown): void {
  if (body === undefined || body === null) {
    return;
  }
  if (typeof body === 'string') {
    return;
  }
  const BlobCtor = getGlobalConstructor('Blob');
  if (BlobCtor !== undefined && body instanceof BlobCtor) {
    return;
  }
  const FormDataCtor = getGlobalConstructor('FormData');
  if (FormDataCtor !== undefined && body instanceof FormDataCtor) {
    return;
  }
  const URLSearchParamsCtor = getGlobalConstructor('URLSearchParams');
  if (URLSearchParamsCtor !== undefined && body instanceof URLSearchParamsCtor) {
    return;
  }
  const ReadableStreamCtor = getGlobalConstructor('ReadableStream');
  if (ReadableStreamCtor !== undefined && body instanceof ReadableStreamCtor) {
    return;
  }
  if (body instanceof ArrayBuffer) {
    return;
  }
  if (ArrayBuffer.isView(body)) {
    return;
  }
  // Anything else object-shaped (plain JSON objects, arrays, numbers cast as
  // body) is not a valid Fetch body. Fail with an actionable local error.
  if (typeof body === 'object') {
    throw new SignerClientError(
      'SIGNER_PREPARATION_FAILED',
      'Request body must be a valid Fetch BodyInit (string, URLSearchParams, Blob, ArrayBuffer/view, FormData, or stream). Caller JSON objects must be serialized with JSON.stringify first.',
    );
  }
  throw new SignerClientError('SIGNER_PREPARATION_FAILED', 'Request body type is not supported.');
}

function toAbortError(signal: AbortSignal | null | undefined): unknown {
  if (signal !== null && signal !== undefined) {
    const reason = (signal as AbortSignal & { readonly reason?: unknown }).reason;
    if (reason !== undefined) {
      return reason;
    }
  }
  const DOMExceptionCtor = getGlobalConstructor('DOMException') as
    | (new (message: string, name: string) => unknown)
    | undefined;
  if (DOMExceptionCtor !== undefined) {
    return new DOMExceptionCtor('The operation was aborted.', 'AbortError');
  }
  return new Error('The operation was aborted.');
}

/**
 * Materialize the exact serialized bytes of a `Request` with a byte-counting
 * reader, caller-abort propagation, and a bounded deadline.
 * Defaults: 1 MiB (16 MiB hard cap), 5000 ms read deadline (1–60000), and no
 * implicit signal; pass `signal: request.signal` to follow that Request's abort.
 *
 * - `request.body === null` yields zero bytes (actually empty request).
 * - Consumes the supplied Request; it does not clone. A used (`bodyUsed`) or
 *   locked body fails locally. Clone before calling when reuse is required.
 *   `fetchWithAttestation` owns that clone for inherited bodies, leaving the
 *   caller's finite Request readable for concurrent/repeated calls. Cancelling
 *   the clone cannot cancel a producer still owned by the original tee branch;
 *   native tee queues are outside the reader-owned storage bound.
 * - Exceeding `maxBodyBytes` cancels the reader and throws
 *   `SIGNER_PREPARATION_FAILED` (client-side 413 analogue: never sent).
 * - Deadline expiry cancels the reader and throws
 *   `SIGNER_PREPARATION_FAILED`. Caller abort cancels and
 *   throws the abort reason.
 * - Empty chunks retain no storage; tiny chunks share a geometrically grown
 *   buffer capped at `maxBodyBytes`. Reads check elapsed time and yield
 *   periodically so productive streams allow deadline/abort tasks to run.
 * - Cancellation is best-effort and never awaited; its rejection is observed.
 *   The reader lock, abort listener, and timers are released on settlement.
 */
export async function materializeRequestBodyBytes(
  request: Request,
  options: MaterializeRequestBodyOptions = {},
): Promise<Uint8Array> {
  if (request === null || typeof request !== 'object') {
    throw new AttestationProtocolError('materializeRequestBodyBytes request must be a Request');
  }
  if (typeof (request as { readonly arrayBuffer?: unknown }).arrayBuffer !== 'function') {
    throw new AttestationProtocolError('materializeRequestBodyBytes request must be a Request');
  }
  const maxBodyBytes = validateMaxBodyBytes(options.maxBodyBytes);
  const timeoutMs = validateBodyReadTimeoutMs(options.timeoutMs);
  const signal = options.signal ?? null;

  if (signal?.aborted === true) {
    throw toAbortError(signal);
  }
  if ((request as { readonly bodyUsed?: unknown }).bodyUsed === true) {
    throw new SignerClientError(
      'SIGNER_PREPARATION_FAILED',
      'Request body has already been used. Clone the Request before sending or pass a fresh body.',
    );
  }
  const body = (request as { readonly body?: ReadableStream<Uint8Array> | null }).body;
  if (body === null || body === undefined) {
    return new Uint8Array(0);
  }
  return readBoundedByteStream(body, {
    maxBytes: maxBodyBytes,
    timeoutMs,
    signal,
    error(failure, cause) {
      switch (failure) {
        case 'abort':
          return toAbortError(signal);
        case 'locked':
          return new SignerClientError(
            'SIGNER_PREPARATION_FAILED',
            'Request body is locked. Clone the Request before sending or pass a fresh body.',
          );
        case 'chunk':
          return new SignerClientError('SIGNER_PREPARATION_FAILED', 'Request body chunk is not bytes.');
        case 'limit':
          return new SignerClientError(
            'SIGNER_PREPARATION_FAILED',
            `Request body exceeds the configured ${maxBodyBytes}-byte limit.`,
          );
        case 'timeout':
          return new SignerClientError(
            'SIGNER_PREPARATION_FAILED',
            `Request body read timed out after ${timeoutMs} ms.`,
          );
        case 'read':
          return cause instanceof SignerClientError
            ? cause
            : new SignerClientError('SIGNER_PREPARATION_FAILED', 'Request body read failed.');
      }
    },
  });
}
