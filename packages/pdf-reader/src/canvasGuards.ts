import { PdfReaderError, type PdfReaderErrorCode } from './errors';

/**
 * Maximum timer value accepted for caller-local deadlines.
 *
 * Browsers and Node clamp `setTimeout` delays larger than `2^31 - 1` ms
 * (about 24.8 days): Node emits a TimeoutOverflowWarning and fires after
 * 1 ms, which would turn a long deadline into an immediate timeout.
 * Deadlines above this bound are rejected with `INVALID_OPTION` so a
 * caller typo cannot silently become an instant `DEADLINE_EXCEEDED`.
 */
export const MAX_TIMER_MS = 2_147_483_647;

export interface SafeCanvasDimensions {
  pixelWidth: number;
  pixelHeight: number;
  pixels: number;
}

/**
 * Shared positive-safe-dimension guard for page and embedded canvases.
 *
 * Rejects zero, negative, non-finite, non-integer, and unsafe dimensions
 * before any canvas is allocated. Throws with the caller-supplied limit
 * code (`CANVAS_LIMIT_EXCEEDED` for pages, `IMAGE_LIMIT_EXCEEDED` for
 * embedded images) so page/embedded behavior cannot drift.
 */
export function resolveSafeCanvasDimensions(
  width: unknown,
  height: unknown,
  limit: number,
  code: PdfReaderErrorCode,
  subject: string,
): SafeCanvasDimensions {
  const pixelWidth = typeof width === 'number' ? Math.ceil(width) : Number.NaN;
  const pixelHeight = typeof height === 'number' ? Math.ceil(height) : Number.NaN;
  if (!Number.isSafeInteger(pixelWidth) || pixelWidth <= 0 || !Number.isSafeInteger(pixelHeight) || pixelHeight <= 0) {
    throw new PdfReaderError(code, `${subject} has invalid canvas dimensions.`);
  }
  const pixels = pixelWidth * pixelHeight;
  if (!Number.isSafeInteger(pixels) || pixels <= 0 || pixels > limit) {
    const detail = Number.isSafeInteger(pixels) ? `${pixels}` : 'unsafe';
    throw new PdfReaderError(code, `${subject} requires ${detail} pixels; limit is ${limit}.`);
  }
  return { pixelWidth, pixelHeight, pixels };
}

/**
 * Shared encode-result guard for data-URL output.
 *
 * Browsers may return the sentinel `data:,` for unencodable dimensions or
 * fall back to a different MIME type when the requested one is unsupported.
 * Publishing either with the requested MIME claim would be a false success.
 */
export function isValidDataUrlForMime(dataUrl: unknown, mimeType: string): boolean {
  if (typeof dataUrl !== 'string') return false;
  if (dataUrl === 'data:,') return false;
  if (!dataUrl.startsWith(`data:${mimeType}`)) return false;
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return false;
  if (comma === dataUrl.length - 1) return false;
  const prefix = `data:${mimeType}`;
  if (dataUrl.length <= prefix.length + 1) return false;
  return true;
}

/**
 * Shared encode-result guard for Blob output.
 *
 * Rejects empty blobs and MIME mismatches so a fallback encoding cannot be
 * published with a false MIME claim.
 */
export function isValidBlobForMime(blob: unknown, mimeType: string): blob is Blob {
  if (blob === null || typeof blob !== 'object') return false;
  const candidate = blob as { size?: unknown; type?: unknown };
  if (typeof candidate.size !== 'number' || typeof candidate.type !== 'string') return false;
  if (candidate.size <= 0) return false;
  if (candidate.type !== mimeType) return false;
  return true;
}
