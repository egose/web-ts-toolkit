/**
 * ATT-07 bounded request-body materialization (task sections 4.3/4.6).
 *
 * Browser-safe ONLY: no Node built-ins, Express/Redis types, `Buffer`,
 * `NodeJS`, or `node:*` imports. Part of the `./signer` closure typechecked
 * by `tsconfig.signer-browser.json` (`types: []`).
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
 *   cancelled on limit/deadline/abort/error so no stream is left flowing.
 * - `assertSupportedBodyInit(body)` rejects caller JSON objects (docs use
 *   `JSON.stringify`) and other non-`BodyInit` values before a `Request` is
 *   built. Supported finite values (`string`, `URLSearchParams`, `Blob`,
 *   `ArrayBuffer`/views, `FormData`, `ReadableStream`, `null`) pass through;
 *   `FormData` itself is never read via `.arrayBuffer()` — callers serialize
 *   it through a `Request` first and this module reads that request's bytes,
 *   preserving the generated multipart boundary.
 * - `FormData` boundary preservation is owned by the caller in
 *   `attested-fetch.ts`: the bytes captured here are reused verbatim for the
 *   original attempt and the single stale-key retry, never reconstructed.
 *
 * No storage API, DOM mutation, global network patch, import-time I/O, or
 * polling timers. One-shot read deadlines use a single `setTimeout` per
 * materialization with cleanup (`sideEffects: false` still holds: timers
 * exist only while a read is in flight).
 */

import { AttestationProtocolError } from './shared/types.js';
import { DEFAULT_MAX_BODY_BYTES, MAX_BODY_BYTES_HARD_CAP } from './shared/types.js';
import { SignerClientError } from './client-errors.js';

/** Default body budget for prepared fetch: 1 MiB (matches server default). */
export const DEFAULT_ATTESTED_FETCH_MAX_BODY_BYTES = DEFAULT_MAX_BODY_BYTES as number;

/** Hard v1 cap for prepared fetch: 16 MiB (matches server hard cap). */
export const ATTESTED_FETCH_MAX_BODY_BYTES_HARD_CAP = MAX_BODY_BYTES_HARD_CAP as number;

/** Default bounded read deadline for one body materialization: 5000 ms. */
export const DEFAULT_ATTESTED_FETCH_BODY_READ_TIMEOUT_MS = 5000 as const;

const MIN_BODY_READ_TIMEOUT_MS = 1 as const;
const MAX_BODY_READ_TIMEOUT_MS = 60000 as const;

export interface MaterializeRequestBodyOptions {
  readonly maxBodyBytes?: number;
  readonly signal?: AbortSignal | null | undefined;
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
 *
 * - `request.body === null` yields zero bytes (actually empty request).
 * - A used (`bodyUsed`) or locked body fails locally; the original `Request`
 *   should be cloned before reading when reuse is required (see
 *   `attested-fetch.ts`, which clones for reading so the caller's `Request`
 *   stays reusable when feasible).
 * - Exceeding `maxBodyBytes` cancels the reader and throws
 *   `SIGNER_PREPARATION_FAILED` (client-side 413 analogue: never sent).
 * - Deadline expiry cancels the reader and throws
 *   `SIGNER_PREPARATION_FAILED` (stalled read). Caller abort cancels and
 *   throws the abort reason.
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
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = body.getReader();
  } catch {
    throw new SignerClientError(
      'SIGNER_PREPARATION_FAILED',
      'Request body is locked. Clone the Request before sending or pass a fresh body.',
    );
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  let settled = false;

  function cleanup(): void {
    settled = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (onAbort !== undefined && signal !== null && signal !== undefined) {
      try {
        signal.removeEventListener('abort', onAbort);
      } catch {
        // Listener removal is best-effort.
      }
      onAbort = undefined;
    }
  }

  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      if (settled) {
        return;
      }
      try {
        void reader.cancel();
      } catch {
        // Cancel is best-effort; the rejection below still stops the read.
      }
      reject(new SignerClientError('SIGNER_PREPARATION_FAILED', `Request body read timed out after ${timeoutMs} ms.`));
    }, timeoutMs);
    const handle = timer as unknown as { readonly unref?: unknown };
    if (typeof handle.unref === 'function') {
      (handle.unref as () => void)();
    }
  });
  // Prevent an unhandled rejection when the read finishes before the deadline.
  deadline.then(
    () => undefined,
    () => undefined,
  );

  if (signal !== null && signal !== undefined) {
    const abortPromise = new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        try {
          void reader.cancel();
        } catch {
          // Best-effort cancel; rejection below still stops the read.
        }
        reject(toAbortError(signal));
      };
      try {
        signal.addEventListener('abort', onAbort, { once: true });
      } catch {
        // If listeners are unsupported, the aborted check below still applies.
      }
    });
    abortPromise.then(
      () => undefined,
      () => undefined,
    );
    // Race the read against both deadline and caller abort.
    try {
      const result = await Promise.race([readLoop(), deadline, abortPromise]);
      cleanup();
      try {
        reader.releaseLock();
      } catch {
        // Release is best-effort after a successful read.
      }
      return result;
    } catch (error) {
      cleanup();
      try {
        reader.releaseLock();
      } catch {
        // Release is best-effort after failure.
      }
      throw error;
    }
  }

  async function readLoop(): Promise<Uint8Array> {
    for (;;) {
      if (signal?.aborted === true) {
        try {
          await reader.cancel();
        } catch {
          // Best-effort.
        }
        throw toAbortError(signal);
      }
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        try {
          await reader.cancel();
        } catch {
          // Best-effort.
        }
        if (error instanceof SignerClientError) {
          throw error;
        }
        throw new SignerClientError('SIGNER_PREPARATION_FAILED', 'Request body read failed.');
      }
      if (chunk.done === true) {
        break;
      }
      const value = chunk.value;
      if (!(value instanceof Uint8Array)) {
        try {
          await reader.cancel();
        } catch {
          // Best-effort.
        }
        throw new SignerClientError('SIGNER_PREPARATION_FAILED', 'Request body chunk is not bytes.');
      }
      total += value.byteLength;
      if (total > maxBodyBytes) {
        try {
          await reader.cancel();
        } catch {
          // Best-effort.
        }
        throw new SignerClientError(
          'SIGNER_PREPARATION_FAILED',
          `Request body exceeds the configured ${maxBodyBytes}-byte limit.`,
        );
      }
      chunks.push(value.slice());
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of chunks) {
      out.set(part, offset);
      offset += part.byteLength;
    }
    return out;
  }

  try {
    const result = await Promise.race([readLoop(), deadline]);
    cleanup();
    try {
      reader.releaseLock();
    } catch {
      // Best-effort.
    }
    return result;
  } catch (error) {
    cleanup();
    try {
      reader.releaseLock();
    } catch {
      // Best-effort.
    }
    throw error;
  }
}
