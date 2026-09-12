import { PdfReaderError } from './errors';
import type { ConvertOptions, PageRange, ViewportScale } from './types';

export interface ResolvedConvertOptions {
  pageRange?: PageRange;
  viewportScale: ViewportScale;
  imageFormat: 'image/png' | 'image/jpeg';
  jpegQuality: number;
  includePageImage: boolean;
  pageImageOutput: 'data-url' | 'blob';
  includeText: boolean;
  includeEmbeddedImages: boolean;
  signal?: AbortSignal;
}

export function resolveConvertOptions(options: ConvertOptions): ResolvedConvertOptions {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new PdfReaderError('INVALID_OPTION', 'Convert options must be an object.');
  }
  const raw = options as Record<string, unknown>;

  if (raw.pageRange !== undefined) validatePageRange(raw.pageRange as PageRange);
  if (raw.viewportScale !== undefined) validateViewportScaleShape(raw.viewportScale);
  if (raw.imageFormat !== undefined) validateImageFormat(raw.imageFormat);
  if (raw.pageImageOutput !== undefined) validatePageImageOutput(raw.pageImageOutput as unknown);
  validateBooleanFlag(raw.includePageImage, 'includePageImage');
  validateBooleanFlag(raw.includeText, 'includeText');
  validateBooleanFlag(raw.includeEmbeddedImages, 'includeEmbeddedImages');

  const resolved: ResolvedConvertOptions = {
    pageRange: options.pageRange,
    viewportScale: options.viewportScale ?? 1.5,
    imageFormat: options.imageFormat ?? 'image/png',
    jpegQuality: options.jpegQuality ?? 0.92,
    includePageImage: options.includePageImage ?? true,
    pageImageOutput: options.pageImageOutput ?? 'data-url',
    includeText: options.includeText ?? true,
    includeEmbeddedImages: options.includeEmbeddedImages ?? false,
    signal: options.signal,
  };

  if (typeof resolved.viewportScale === 'number') {
    assertPositiveFinite(resolved.viewportScale, 'viewportScale');
  } else if (typeof resolved.viewportScale !== 'function') {
    throw new PdfReaderError('INVALID_OPTION', 'viewportScale must be a positive finite number or a function.');
  }
  if (!Number.isFinite(resolved.jpegQuality) || resolved.jpegQuality < 0 || resolved.jpegQuality > 1) {
    throw new PdfReaderError('INVALID_OPTION', 'jpegQuality must be a finite number from 0 through 1.');
  }
  if (resolved.pageImageOutput !== 'data-url' && resolved.pageImageOutput !== 'blob') {
    throw new PdfReaderError('INVALID_OPTION', 'pageImageOutput must be either "data-url" or "blob".');
  }
  if (resolved.imageFormat !== 'image/png' && resolved.imageFormat !== 'image/jpeg') {
    throw new PdfReaderError('INVALID_OPTION', 'imageFormat must be either "image/png" or "image/jpeg".');
  }
  validatePageRange(resolved.pageRange);
  return resolved;
}

export function resolvePageNumbers(pageRange: PageRange | undefined, numPages: number): [number, number] {
  if (pageRange === undefined) return [1, numPages];
  if (typeof pageRange === 'number') return [pageRange, pageRange];
  if (!Array.isArray(pageRange) || pageRange.length !== 2) {
    throw new PdfReaderError('INVALID_OPTION', 'pageRange tuple must have exactly two page numbers.');
  }
  return [
    Math.min(pageRange[0] as number, pageRange[1] as number),
    Math.max(pageRange[0] as number, pageRange[1] as number),
  ];
}

export function assertPositiveFinite(value: number, option: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PdfReaderError('INVALID_OPTION', `${option} must be a positive finite number.`);
  }
}

function validatePageRange(pageRange: PageRange | undefined): void {
  if (pageRange === undefined) return;
  if (typeof pageRange === 'number') {
    if (!Number.isSafeInteger(pageRange) || pageRange < 1) {
      throw new PdfReaderError('INVALID_OPTION', 'pageRange values must be positive safe integers.');
    }
    return;
  }
  if (!Array.isArray(pageRange)) {
    throw new PdfReaderError('INVALID_OPTION', 'pageRange must be a page number or a two-element tuple.');
  }
  if (pageRange.length !== 2) {
    throw new PdfReaderError('INVALID_OPTION', 'pageRange tuple must have exactly two page numbers.');
  }
  if (!(0 in pageRange) || !(1 in pageRange)) {
    throw new PdfReaderError('INVALID_OPTION', 'pageRange tuple must not be sparse.');
  }
  if (pageRange.some((value) => !Number.isSafeInteger(value) || (value as number) < 1)) {
    throw new PdfReaderError('INVALID_OPTION', 'pageRange values must be positive safe integers.');
  }
}

function validateViewportScaleShape(value: unknown): void {
  if (typeof value === 'number' || typeof value === 'function') return;
  throw new PdfReaderError('INVALID_OPTION', 'viewportScale must be a positive finite number or a function.');
}

function validateImageFormat(value: unknown): void {
  if (value === 'image/png' || value === 'image/jpeg') return;
  throw new PdfReaderError('INVALID_OPTION', 'imageFormat must be either "image/png" or "image/jpeg".');
}

function validatePageImageOutput(value: unknown): void {
  if (value === 'data-url' || value === 'blob') return;
  throw new PdfReaderError('INVALID_OPTION', 'pageImageOutput must be either "data-url" or "blob".');
}

function validateBooleanFlag(value: unknown, option: string): void {
  if (value === undefined) return;
  if (typeof value !== 'boolean') {
    throw new PdfReaderError('INVALID_OPTION', `${option} must be a boolean.`);
  }
}
