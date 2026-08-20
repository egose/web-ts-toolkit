import { OPS, Util } from 'pdfjs-dist';
import type { PageViewport, PDFPageProxy } from 'pdfjs-dist';

import { PdfReaderError } from './errors';
import { getTransformedUnitBounds } from './geometry';
import type { ExtractedImage, PdfReaderLogger, TransformMatrix } from './types';

const identityTransform: TransformMatrix = [1, 0, 0, 1, 0, 0];
const propagatedErrorCodes = new Set(['ABORTED', 'DESTROYED', 'IMAGE_LIMIT_EXCEEDED']);

interface PdfImageObject {
  width?: unknown;
  height?: unknown;
  bitmap?: unknown;
  data?: unknown;
  dataLen?: unknown;
}

interface ExtractEmbeddedImagesOptions {
  signal?: AbortSignal;
  createCanvas: () => HTMLCanvasElement;
  maxPixels: number;
  logger?: PdfReaderLogger;
  throwIfAborted(signal?: AbortSignal): void;
  throwIfDestroyed(): void;
}

interface ResolvedPaintedImage {
  image: PdfImageObject;
  label: string;
}

export async function extractEmbeddedImages(
  page: PDFPageProxy,
  viewport: PageViewport,
  options: ExtractEmbeddedImagesOptions,
): Promise<ExtractedImage[]> {
  const operators = await page.getOperatorList();
  const images: ExtractedImage[] = [];
  const stack: TransformMatrix[] = [];
  let transform: TransformMatrix = identityTransform;

  for (let index = 0; index < operators.fnArray.length; index += 1) {
    options.throwIfDestroyed();
    options.throwIfAborted(options.signal);

    const operation = operators.fnArray[index];
    if (operation === OPS.save) {
      stack.push([...transform]);
      continue;
    }
    if (operation === OPS.restore || operation === OPS.paintFormXObjectEnd) {
      transform = stack.pop() ?? identityTransform;
      continue;
    }
    if (operation === OPS.transform) {
      const next = readTransformArgs(operators.argsArray[index]);
      if (next) transform = Util.transform(transform, next) as unknown as TransformMatrix;
      continue;
    }
    if (operation === OPS.paintFormXObjectBegin) {
      stack.push([...transform]);
      const next = readTransformMatrix(operators.argsArray[index]?.[0]);
      if (next) transform = Util.transform(transform, next) as unknown as TransformMatrix;
      continue;
    }
    if (operation === OPS.paintImageMaskXObject) {
      warn(options.logger, 'Skipped embedded image operator paintImageMaskXObject: image masks are not supported.');
      continue;
    }

    if (
      operation !== OPS.paintXObject &&
      operation !== OPS.paintImageXObject &&
      operation !== OPS.paintInlineImageXObject
    ) {
      continue;
    }

    try {
      const paintedImage = await resolvePaintedImage(page, operation, operators.argsArray[index], index);
      if (!paintedImage) continue;
      const dataUrl = imageToDataUrl(paintedImage.image, options);
      if (!dataUrl) {
        warn(
          options.logger,
          `Skipped embedded image ${paintedImage.label}: unsupported PDF.js image shape or data layout.`,
        );
        continue;
      }

      const bounds = getTransformedUnitBounds(transform);
      images.push({
        dataUrl,
        x: bounds.left,
        y: bounds.top,
        width: bounds.width,
        height: bounds.height,
        size: imageByteLength(paintedImage.image),
        mimeType: 'image/png',
        pageWidth: viewport.width / viewport.scale,
        pageHeight: viewport.height / viewport.scale,
        transform: [...transform],
      });
    } catch (error) {
      options.throwIfDestroyed();
      options.throwIfAborted(options.signal);
      if (shouldPropagateEmbeddedImageError(error)) throw error;
      const label = readOperationLabel(operation, operators.argsArray[index], index);
      warn(options.logger, `Failed to extract embedded image ${label}.`, error);
    }
  }

  return images;
}

async function resolvePaintedImage(
  page: PDFPageProxy,
  operation: number,
  args: unknown,
  index: number,
): Promise<ResolvedPaintedImage | undefined> {
  if (operation === OPS.paintInlineImageXObject) {
    const inlineImage = Array.isArray(args) ? args[0] : undefined;
    if (!inlineImage || typeof inlineImage !== 'object') return undefined;
    return { image: inlineImage as PdfImageObject, label: `inline@${index}` };
  }

  const reference = Array.isArray(args) ? args[0] : undefined;
  if (typeof reference !== 'string') return undefined;
  const image = (await page.objs.get(reference)) as PdfImageObject;
  return { image, label: reference };
}

function imageToDataUrl(image: PdfImageObject, options: ExtractEmbeddedImagesOptions): string | undefined {
  const width = image.width;
  const height = image.height;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    (width as number) <= 0 ||
    (height as number) <= 0
  ) {
    return undefined;
  }

  const canvas = allocateCanvas(width as number, height as number, options.maxPixels, options.createCanvas);
  try {
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    if (typeof ImageBitmap !== 'undefined' && image.bitmap instanceof ImageBitmap) {
      context.drawImage(image.bitmap, 0, 0);
      return canvas.toDataURL('image/png');
    }

    if (!ArrayBuffer.isView(image.data)) return undefined;
    const source = new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength);
    const rgba = toRgba(source, width as number, height as number);
    if (!rgba) return undefined;
    const pixels = context.createImageData(width as number, height as number);
    pixels.data.set(rgba);
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    releaseCanvas(canvas);
  }
}

function toRgba(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray | undefined {
  const pixels = width * height;
  if (data.length === pixels * 4) return data;
  if (data.length !== pixels && data.length !== pixels * 3) return undefined;

  const channels = data.length / pixels;
  const rgba = new Uint8ClampedArray(pixels * 4);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const input = pixel * channels;
    const output = pixel * 4;
    rgba[output] = data[input];
    rgba[output + 1] = channels === 1 ? data[input] : data[input + 1];
    rgba[output + 2] = channels === 1 ? data[input] : data[input + 2];
    rgba[output + 3] = channels === 4 ? data[input + 3] : 255;
  }
  return rgba;
}

function allocateCanvas(
  width: number,
  height: number,
  limit: number,
  createCanvas: () => HTMLCanvasElement,
): HTMLCanvasElement {
  const pixelWidth = Math.ceil(width);
  const pixelHeight = Math.ceil(height);
  const pixels = pixelWidth * pixelHeight;
  if (!Number.isSafeInteger(pixels) || pixels > limit) {
    throw new PdfReaderError('IMAGE_LIMIT_EXCEEDED', `embedded image requires ${pixels} pixels; limit is ${limit}.`);
  }
  const canvas = createCanvas();
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  return canvas;
}

function imageByteLength(image: PdfImageObject): number {
  if (typeof image.dataLen === 'number' && Number.isFinite(image.dataLen)) return image.dataLen;
  return ArrayBuffer.isView(image.data) ? image.data.byteLength : 0;
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

function readTransformMatrix(value: unknown): TransformMatrix | undefined {
  const values = readNumericTuple(value, 6);
  if (!values) return undefined;
  return values as unknown as TransformMatrix;
}

function readTransformArgs(value: unknown): TransformMatrix | undefined {
  return readTransformMatrix(value) ?? readTransformMatrix(Array.isArray(value) ? value[0] : undefined);
}

function readNumericTuple(value: unknown, length: number): number[] | undefined {
  if (Array.isArray(value)) {
    if (value.length !== length) return undefined;
    if (value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) return undefined;
    return [...value];
  }

  if (!value || typeof value !== 'object') return undefined;
  const entries: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const entry = (value as Record<number, unknown>)[index];
    if (typeof entry !== 'number' || !Number.isFinite(entry)) return undefined;
    entries.push(entry);
  }
  return entries;
}

function readOperationLabel(operation: number, args: unknown, index: number): string {
  if (operation === OPS.paintInlineImageXObject) return `inline@${index}`;
  const reference = Array.isArray(args) ? args[0] : undefined;
  return typeof reference === 'string' ? reference : `operator@${index}`;
}

function shouldPropagateEmbeddedImageError(error: unknown): error is PdfReaderError {
  return error instanceof PdfReaderError && propagatedErrorCodes.has(error.code);
}

function warn(logger: PdfReaderLogger | undefined, message: string, error?: unknown): void {
  logger?.warn(message, error);
}
