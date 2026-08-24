import { OPS, Util } from 'pdfjs-dist';
import type { PageViewport, PDFPageProxy } from 'pdfjs-dist';

import { PdfReaderError } from './errors';
import { getTransformedUnitBounds } from './geometry';
import type { ExtractedImage, PdfReaderLogger, TransformMatrix } from './types';

const identityTransform: TransformMatrix = [1, 0, 0, 1, 0, 0];
const propagatedErrorCodes = new Set([
  'ABORTED',
  'DESTROYED',
  'IMAGE_LIMIT_EXCEEDED',
  'IMAGE_COUNT_LIMIT_EXCEEDED',
  'IMAGE_TOTAL_PIXELS_LIMIT_EXCEEDED',
  'OPERATOR_LIMIT_EXCEEDED',
]);

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
  maxImages: number;
  maxTotalPixels: number;
  maxOperators: number;
  logger?: PdfReaderLogger;
  throwIfAborted(signal?: AbortSignal): void;
  throwIfDestroyed(): void;
}

interface ImageDimensions {
  width: number;
  height: number;
  pixels: number;
}

interface ResolvedPaintedImage {
  image: PdfImageObject;
  label: string;
  reference?: string;
}

interface EncodedImage {
  dataUrl: string;
  dimensions: ImageDimensions;
  size: number;
}

export async function extractEmbeddedImages(
  page: PDFPageProxy,
  viewport: PageViewport,
  options: ExtractEmbeddedImagesOptions,
): Promise<ExtractedImage[]> {
  const operators = await page.getOperatorList();
  enforceOperatorLimit(operators.fnArray.length, options.maxOperators);
  const images: ExtractedImage[] = [];
  const stack: TransformMatrix[] = [];
  let transform: TransformMatrix = identityTransform;
  let totalPixels = 0;
  const encodedXObjects = new Map<string, EncodedImage>();

  try {
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
        const args = operators.argsArray[index];
        const reference = operation === OPS.paintInlineImageXObject ? undefined : readImageReference(args);
        let encoded = reference ? encodedXObjects.get(reference) : undefined;
        if (encoded) {
          enforceNextImageLimits(images.length, totalPixels, encoded.dimensions.pixels, options);
        } else {
          const paintedImage = await resolvePaintedImage(page, operation, args, index);
          options.throwIfDestroyed();
          options.throwIfAborted(options.signal);
          if (!paintedImage) continue;

          const dimensions = readImageDimensions(paintedImage.image, options.maxPixels);
          if (!dimensions || !isSupportedImageSource(paintedImage.image)) {
            warn(
              options.logger,
              `Skipped embedded image ${paintedImage.label}: unsupported PDF.js image shape or data layout.`,
            );
            continue;
          }
          enforceNextImageLimits(images.length, totalPixels, dimensions.pixels, options);
          const dataUrl = imageToDataUrl(paintedImage.image, dimensions, options);
          if (!dataUrl) {
            warn(
              options.logger,
              `Skipped embedded image ${paintedImage.label}: unsupported PDF.js image shape or data layout.`,
            );
            continue;
          }
          encoded = { dataUrl, dimensions, size: imageByteLength(paintedImage.image) };
          if (paintedImage.reference) encodedXObjects.set(paintedImage.reference, encoded);
        }
        totalPixels += encoded.dimensions.pixels;

        const bounds = getTransformedUnitBounds(transform);
        images.push({
          dataUrl: encoded.dataUrl,
          x: bounds.left,
          y: bounds.top,
          width: bounds.width,
          height: bounds.height,
          size: encoded.size,
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
  } finally {
    encodedXObjects.clear();
  }

  return images;
}

function readImageReference(args: unknown): string | undefined {
  const reference = Array.isArray(args) ? args[0] : undefined;
  return typeof reference === 'string' ? reference : undefined;
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

  const reference = readImageReference(args);
  if (!reference) return undefined;
  const image = (await page.objs.get(reference)) as PdfImageObject;
  return { image, label: reference, reference };
}

function imageToDataUrl(
  image: PdfImageObject,
  dimensions: ImageDimensions,
  options: ExtractEmbeddedImagesOptions,
): string | undefined {
  const canvas = allocateCanvas(dimensions.width, dimensions.height, options.maxPixels, options.createCanvas);
  try {
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    if (typeof ImageBitmap !== 'undefined' && image.bitmap instanceof ImageBitmap) {
      context.drawImage(image.bitmap, 0, 0);
      return canvas.toDataURL('image/png');
    }

    if (!ArrayBuffer.isView(image.data)) return undefined;
    const source = new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength);
    const rgba = toRgba(source, dimensions);
    if (!rgba) return undefined;
    const pixels = context.createImageData(dimensions.width, dimensions.height);
    pixels.data.set(rgba);
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    releaseCanvas(canvas);
  }
}

function toRgba(data: Uint8ClampedArray, dimensions: ImageDimensions): Uint8ClampedArray | undefined {
  const rgbaLength = multiplySafe(dimensions.pixels, 4);
  const rgbLength = multiplySafe(dimensions.pixels, 3);
  if (rgbaLength === undefined || rgbLength === undefined) {
    throw new PdfReaderError('IMAGE_LIMIT_EXCEEDED', 'embedded image has unsafe decoded pixel dimensions.');
  }
  if (data.length === rgbaLength) return data;
  if (data.length !== dimensions.pixels && data.length !== rgbLength) return undefined;

  const channels = data.length / dimensions.pixels;
  const rgba = new Uint8ClampedArray(rgbaLength);
  for (let pixel = 0; pixel < dimensions.pixels; pixel += 1) {
    const input = pixel * channels;
    const output = pixel * 4;
    rgba[output] = data[input];
    rgba[output + 1] = channels === 1 ? data[input] : data[input + 1];
    rgba[output + 2] = channels === 1 ? data[input] : data[input + 2];
    rgba[output + 3] = channels === 4 ? data[input + 3] : 255;
  }
  return rgba;
}

function enforceOperatorLimit(count: number, limit: number): void {
  if (!Number.isSafeInteger(count) || count > limit) {
    throw new PdfReaderError('OPERATOR_LIMIT_EXCEEDED', `PDF page has ${count} operators; limit is ${limit}.`);
  }
}

function enforceNextImageLimits(
  currentImageCount: number,
  currentTotalPixels: number,
  nextPixels: number,
  options: ExtractEmbeddedImagesOptions,
): void {
  const nextImageCount = currentImageCount + 1;
  if (!Number.isSafeInteger(nextImageCount) || nextImageCount > options.maxImages) {
    throw new PdfReaderError(
      'IMAGE_COUNT_LIMIT_EXCEEDED',
      `PDF page has more than ${options.maxImages} extractable embedded images.`,
    );
  }

  const nextTotalPixels = currentTotalPixels + nextPixels;
  if (!Number.isSafeInteger(nextTotalPixels) || nextTotalPixels > options.maxTotalPixels) {
    throw new PdfReaderError(
      'IMAGE_TOTAL_PIXELS_LIMIT_EXCEEDED',
      `PDF page embedded images require more than ${options.maxTotalPixels} decoded pixels.`,
    );
  }
}

function readImageDimensions(image: PdfImageObject, limit: number): ImageDimensions | undefined {
  const { width, height } = image;
  if (width === undefined || height === undefined) return undefined;
  if (typeof width !== 'number' || typeof height !== 'number') return undefined;

  const pixelWidth = Math.ceil(width);
  const pixelHeight = Math.ceil(height);
  const pixels = multiplySafe(pixelWidth, pixelHeight);
  if (pixelWidth <= 0 || pixelHeight <= 0 || pixels === undefined || pixels > limit) {
    throw new PdfReaderError('IMAGE_LIMIT_EXCEEDED', `embedded image requires ${pixels} pixels; limit is ${limit}.`);
  }
  return { width: pixelWidth, height: pixelHeight, pixels };
}

function isSupportedImageSource(image: PdfImageObject): boolean {
  return (typeof ImageBitmap !== 'undefined' && image.bitmap instanceof ImageBitmap) || ArrayBuffer.isView(image.data);
}

function multiplySafe(left: number, right: number): number | undefined {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) return undefined;
  const product = left * right;
  return Number.isSafeInteger(product) ? product : undefined;
}

function allocateCanvas(
  width: number,
  height: number,
  limit: number,
  createCanvas: () => HTMLCanvasElement,
): HTMLCanvasElement {
  const pixelWidth = Math.ceil(width);
  const pixelHeight = Math.ceil(height);
  const pixels = multiplySafe(pixelWidth, pixelHeight);
  if (pixels === undefined || pixels > limit) {
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
