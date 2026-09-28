import { PdfReaderError } from './errors';

/** Private structural boundary: accept signals from other realms without cloning live state. */
export function resolveSignal(value: unknown): AbortSignal | undefined {
  if (value === undefined) return undefined;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as Partial<AbortSignal>;
    if (
      typeof candidate.aborted === 'boolean' &&
      typeof candidate.addEventListener === 'function' &&
      typeof candidate.removeEventListener === 'function'
    ) {
      return candidate as AbortSignal;
    }
  }
  throw new PdfReaderError(
    'INVALID_OPTION',
    'signal must have a boolean aborted and callable addEventListener/removeEventListener methods; omit it or use undefined for no signal.',
  );
}
