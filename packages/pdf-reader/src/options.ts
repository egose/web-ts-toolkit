import { PdfReaderError } from './errors';
import type { ConvertOptions, PageRange, ViewportScale } from './types';

export interface ResolvedConvertOptions {
  pageRange?: PageRange;
  viewportScale: ViewportScale;
  imageFormat: 'image/png' | 'image/jpeg';
  jpegQuality: number;
  includePageImage: boolean;
  includeText: boolean;
  includeEmbeddedImages: boolean;
  signal?: AbortSignal;
}

export function resolveConvertOptions(options: ConvertOptions): ResolvedConvertOptions {
  const resolved: ResolvedConvertOptions = {
    pageRange: options.pageRange,
    viewportScale: options.viewportScale ?? 1.5,
    imageFormat: options.imageFormat ?? 'image/png',
    jpegQuality: options.jpegQuality ?? 0.92,
    includePageImage: options.includePageImage ?? true,
    includeText: options.includeText ?? true,
    includeEmbeddedImages: options.includeEmbeddedImages ?? false,
    signal: options.signal,
  };

  if (typeof resolved.viewportScale === 'number') {
    assertPositiveFinite(resolved.viewportScale, 'viewportScale');
  }
  if (!Number.isFinite(resolved.jpegQuality) || resolved.jpegQuality < 0 || resolved.jpegQuality > 1) {
    throw new PdfReaderError('INVALID_OPTION', 'jpegQuality must be a finite number from 0 through 1.');
  }
  validatePageRange(resolved.pageRange);
  return resolved;
}

export function resolvePageNumbers(pageRange: PageRange | undefined, numPages: number): [number, number] {
  if (pageRange === undefined) return [1, numPages];
  if (typeof pageRange === 'number') return [pageRange, pageRange];
  return [Math.min(...pageRange), Math.max(...pageRange)];
}

export function assertPositiveFinite(value: number, option: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PdfReaderError('INVALID_OPTION', `${option} must be a positive finite number.`);
  }
}

function validatePageRange(pageRange: PageRange | undefined): void {
  if (pageRange === undefined) return;
  const values = typeof pageRange === 'number' ? [pageRange] : pageRange;
  if (values.some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new PdfReaderError('INVALID_OPTION', 'pageRange values must be positive safe integers.');
  }
}
