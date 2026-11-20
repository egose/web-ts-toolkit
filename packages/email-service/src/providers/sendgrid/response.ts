import type { IncomingMessage } from 'node:http';
import { SENDGRID_RESPONSE_MAX_BYTES } from '../../constants';
import type { ProviderResult, SendGridSnapshot } from '../../contracts/provider';
import { retryHint } from './retry-hint';

const STATUS_PREFIX = 'HTTP/1.';
const TOKEN_PUNCTUATION = "!#$%&'*+-.^_`|~";
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._=-]{0,127}$/;
const REJECTIONS = new Set([400, 401, 403, 404, 405, 413]);
const METADATA = new Set([
  'connection',
  'content-length',
  'content-encoding',
  'content-type',
  'transfer-encoding',
  'trailer',
  'upgrade',
  'retry-after',
  'x-ratelimit-reset',
  'x-message-id',
]);

function isTokenByte(byte: number): boolean {
  return (
    (byte >= 48 && byte <= 57) ||
    (byte >= 65 && byte <= 90) ||
    (byte >= 97 && byte <= 122) ||
    TOKEN_PUNCTUATION.includes(String.fromCharCode(byte))
  );
}

function trimOws(value: string): string {
  const space = (index: number) => value[index] === ' ' || value[index] === '\t';
  let start = 0;
  let end = value.length;
  while (start < end && space(start)) start++;
  while (end > start && space(end - 1)) end--;
  return value.slice(start, end);
}

/**
 * Count actual decrypted wire bytes, including headers and chunk overhead, before Node parses them.
 * Check the exact status line and strict CRLF (no folded fields) without retaining raw wire data.
 */
export class ResponseWire {
  size = 0;
  headBytes = 0;
  statusCode = 0;
  httpVersion = '';
  #lineBytes = 0;
  #statusLine = true;
  #colon = false;
  #cr = false;

  push(chunk: Buffer): boolean {
    const start = this.size;
    this.size += chunk.byteLength;
    if (this.size > SENDGRID_RESPONSE_MAX_BYTES) return false;
    if (this.headBytes) return true;
    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i]!;
      if (this.#cr) {
        if (byte !== 10) return false;
        if (this.#statusLine) {
          if (this.#lineBytes < 13) return false;
          this.#statusLine = false;
        } else if (!this.#lineBytes) {
          this.headBytes = start + i + 1;
          return true;
        } else if (!this.#colon) return false;
        this.#cr = false;
        this.#colon = false;
        this.#lineBytes = 0;
      } else if (byte === 13) {
        this.#cr = true;
      } else {
        if ((byte < 32 && byte !== 9) || byte === 127) return false;
        const pos = this.#lineBytes++;
        if (this.#statusLine) {
          if (!this.#statusByte(pos, byte)) return false;
        } else if (!this.#colon) {
          if (byte === 58 && pos > 0) this.#colon = true;
          else if (!isTokenByte(byte)) return false;
        }
      }
    }
    return true;
  }

  #statusByte(pos: number, byte: number): boolean {
    if (pos < STATUS_PREFIX.length) return byte === STATUS_PREFIX.charCodeAt(pos);
    if (pos === 7) {
      if (byte !== 48 && byte !== 49) return false;
      this.httpVersion = byte === 48 ? '1.0' : '1.1';
    }
    if (pos === 8 || pos === 12) return byte === 32;
    if (pos >= 9 && pos <= 11) {
      if (byte < (pos === 9 ? 49 : 48) || byte > (pos === 9 ? 53 : 57)) return false;
      this.statusCode = this.statusCode * 10 + byte - 48;
    }
    return true;
  }
}

/** Verify the complete unextended chunked frame (Node alone can drop bytes following a complete frame). */
export class ChunkFraming {
  #phase: 'size' | 'sizeLf' | 'data' | 'dataCr' | 'dataLf' | 'endCr' | 'endLf' | 'done' = 'size';
  #size = 0;
  #digits = 0;

  get complete(): boolean {
    return this.#phase === 'done';
  }

  push(chunk: Buffer, offset: number): boolean {
    while (offset < chunk.length) {
      if (this.#phase === 'data') {
        const length = Math.min(this.#size, chunk.length - offset);
        offset += length;
        this.#size -= length;
        if (!this.#size) this.#phase = 'dataCr';
        continue;
      }
      const byte = chunk[offset++]!;
      switch (this.#phase) {
        case 'size': {
          if (byte === 13 && this.#digits) {
            this.#phase = 'sizeLf';
          } else {
            const digit = byte >= 48 && byte <= 57 ? byte - 48 : (byte | 32) - 87;
            if ((byte < 48 || byte > 57) && ((byte | 32) < 97 || (byte | 32) > 102)) return false;
            this.#size = this.#size * 16 + digit;
            if (this.#size > SENDGRID_RESPONSE_MAX_BYTES) return false;
            this.#digits++;
          }
          break;
        }
        case 'sizeLf':
          if (byte !== 10) return false;
          this.#digits = 0;
          this.#phase = this.#size ? 'data' : 'endCr';
          break;
        case 'dataCr':
          if (byte !== 13) return false;
          this.#phase = 'dataLf';
          break;
        case 'dataLf':
          if (byte !== 10) return false;
          this.#phase = 'size';
          break;
        case 'endCr':
          if (byte !== 13) return false;
          this.#phase = 'endLf';
          break;
        case 'endLf':
          if (byte !== 10) return false;
          this.#phase = 'done';
          break;
        case 'done':
          return false;
      }
    }
    return true;
  }
}

export function readResponseHead(
  response: IncomingMessage,
  wire: ResponseWire,
  mode: SendGridSnapshot['provider']['mode'],
  apiKey: string,
  now: number,
): { framing: number | 'chunked'; result: ProviderResult } | undefined {
  const { rawHeaders, httpVersion, statusCode } = response;
  if (!wire.headBytes || statusCode !== wire.statusCode || httpVersion !== wire.httpVersion || rawHeaders.length % 2) {
    return;
  }
  const fields = new Map<string, string | null>();
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i]!.toLowerCase();
    if (!METADATA.has(name)) continue;
    // Unlike IncomingMessage.headers, this never joins or silently discards repeated fields.
    fields.set(name, fields.has(name) ? null : trimOws(rawHeaders[i + 1]!));
  }
  const length = fields.get('content-length');
  const transfer = fields.get('transfer-encoding');
  const encoding = fields.get('content-encoding');
  if (
    (encoding !== undefined && encoding?.toLowerCase() !== 'identity') ||
    fields.get('connection') === null ||
    fields.get('content-type') === null ||
    fields.has('trailer') ||
    fields.has('upgrade')
  ) {
    return;
  }
  let framing: number | 'chunked';
  if (transfer !== undefined) {
    if (transfer?.toLowerCase() !== 'chunked' || length !== undefined || httpVersion !== '1.1') return;
    framing = 'chunked';
  } else {
    // A close-delimited body cannot prove it wasn't cut short. Require explicit framing.
    if (typeof length !== 'string' || !/^\d+$/.test(length)) return;
    framing = Number(length);
    if (framing > SENDGRID_RESPONSE_MAX_BYTES - wire.headBytes) return;
  }

  const stage = 'http';
  let result: ProviderResult;
  if (statusCode === 202 && mode === 'live') {
    const id = fields.get('x-message-id');
    result = {
      outcome: 'accepted',
      retry: 'never',
      stage,
      reason: 'sendgrid_accepted',
      // An opaque provider ID is optional; do not expose an echoed credential, even with a prefix/suffix.
      ...(id && IDENTIFIER.test(id) && !id.includes(apiKey) ? { providerMessageId: id } : {}),
    };
  } else if (statusCode === 200 && mode === 'sandbox') {
    result = { outcome: 'validated', retry: 'never', stage, reason: 'sendgrid_validated' };
  } else if (statusCode === 429) {
    const after = fields.get('retry-after');
    const reset = fields.get('x-ratelimit-reset');
    if (after === null || reset === null) return; // Do not silently shorten an ambiguous retry floor.
    const hint = retryHint(after, reset, now);
    result = {
      outcome: 'rejected',
      retry: 'safe_transient',
      stage,
      reason: 'sendgrid_throttled',
      ...(hint ? { retryHint: hint } : {}),
    };
  } else if (REJECTIONS.has(statusCode)) {
    result = { outcome: 'rejected', retry: 'never', stage, reason: 'sendgrid_rejected' };
  } else {
    result = { outcome: 'unknown', retry: 'never', stage, reason: 'transport_uncertain' };
  }
  return { framing, result };
}
