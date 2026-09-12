import { OPS, Util } from 'pdfjs-dist';
import type { PageViewport, PDFPageProxy } from 'pdfjs-dist';

import { PdfReaderError } from './errors';
import { isValidDataUrlForMime, resolveSafeCanvasDimensions } from './canvasGuards';
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
  kind?: unknown;
}

/**
 * PDF.js image layouts observed from the supported peer minor.
 *
 * Values mirror `ImageKind` in the installed `pdfjs-dist` worker
 * (`GRAYSCALE_1BPP: 1`, `RGB_24BPP: 2`, `RGBA_32BPP: 3`). Kept private so
 * PDF.js internals never leak into public declarations.
 */
const ImageKind = {
  GRAYSCALE_1BPP: 1,
  RGB_24BPP: 2,
  RGBA_32BPP: 3,
} as const;

/**
 * Private discriminated normalized image ready for canvas encoding.
 *
 * `bitmap` borrows the PDF.js-owned bitmap (never closed by the extractor;
 * PDF.js releases it through `page.cleanup()`/document destruction).
 * `rgba` is either a shared view over PDF.js RGBA bytes or a freshly
 * allocated RGBA buffer for RGB/gray-8/unpacked 1-bit sources.
 */
type NormalizedImage = { format: 'bitmap'; bitmap: ImageBitmap } | { format: 'rgba'; rgba: Uint8ClampedArray };

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
  /**
   * Reader-owned cancellation/wait contract for operator retrieval.
   *
   * Reuses `PDFReader.#awaitWithSignal` so abort/destroy settle promptly
   * without cancelling upstream PDF.js work; late operator lists are dropped
   * and late rejections observed, never processed after cancellation wins.
   */
  awaitWithCancellation: <T>(pending: Promise<T>) => Promise<T>;
}

interface ImageDimensions {
  width: number;
  height: number;
  pixels: number;
}

/**
 * Structural view of PDF.js's `PDFObjects` store (`page.objs` /
 * `page.commonObjs`). `get` without a callback returns resolved data or
 * throws when unresolved; `get` with a callback resolves later through the
 * callback (the same primitive the renderer uses to suspend on dependencies).
 */
interface ImageObjectStore {
  has(id: string): boolean;
  get(id: string, callback?: (data: PdfImageObject) => void): PdfImageObject | null;
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
  // Shared wait contract: prompt ABORTED/DESTROYED without cancelling upstream
  // PDF.js operator work; a late list is dropped, never traversed.
  const operators = await options.awaitWithCancellation(page.getOperatorList());
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
          const paintedImage = await resolvePaintedImage(page, operation, args, index, options);
          options.throwIfDestroyed();
          options.throwIfAborted(options.signal);
          if (!paintedImage) continue;

          const dimensions = readImageDimensions(paintedImage.image, options.maxPixels);
          if (!dimensions) {
            warn(
              options.logger,
              `Skipped embedded image ${paintedImage.label}: unsupported PDF.js image shape or data layout.`,
            );
            continue;
          }
          enforceNextImageLimits(images.length, totalPixels, dimensions.pixels, options);
          // Validate the declared pixel layout before allocating any canvas:
          // malformed/unsupported sources return undefined here without
          // allocating canvas or conversion buffers.
          const normalized = normalizeImageSource(paintedImage.image, dimensions);
          if (!normalized) {
            warn(
              options.logger,
              `Skipped embedded image ${paintedImage.label}: unsupported PDF.js image shape or data layout.`,
            );
            continue;
          }
          const dataUrl = imageToDataUrl(normalized, dimensions, options);
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
  options: ExtractEmbeddedImagesOptions,
): Promise<ResolvedPaintedImage | undefined> {
  if (operation === OPS.paintInlineImageXObject) {
    const inlineImage = Array.isArray(args) ? args[0] : undefined;
    if (!inlineImage || typeof inlineImage !== 'object') return undefined;
    return { image: inlineImage as PdfImageObject, label: `inline@${index}` };
  }

  const reference = readImageReference(args);
  if (!reference) return undefined;
  const image = await awaitResolvedImageObject(selectImageStore(page, reference), reference, options);
  if (!image || typeof image !== 'object') return undefined;
  return { image, label: reference, reference };
}

/**
 * Mirrors `CanvasGraphics.getObject` in the supported peer: `g_`-prefixed IDs
 * live in the document-wide `commonObjs` store (cross-page shared images
 * globalized by the worker once a Ref repeats across pages), everything else
 * lives in the page-local `objs` store. Falls back to `page.objs` when
 * `commonObjs` is absent so legacy shapes never crash the lookup.
 */
function selectImageStore(page: PDFPageProxy, reference: string): ImageObjectStore {
  if (reference.startsWith('g_') && page.commonObjs) return page.commonObjs as unknown as ImageObjectStore;
  return page.objs as unknown as ImageObjectStore;
}

/**
 * Returns the resolved image object, awaiting readiness for not-yet-decoded
 * IDs via callback-form `get(id, cb)` — the same primitive the renderer uses
 * to suspend on `OPS.dependency` entries. The wait is raced through the
 * PDFR3-05 `awaitWithCancellation` contract so abort/destroy settle promptly;
 * a late resolution is then dropped by that contract, never processed, and a
 * late rejection is observed rather than left unhandled. The returned bitmap
 * (if any) stays borrowed: PDF.js owns its lifetime and the extractor never
 * calls `close()`.
 */
async function awaitResolvedImageObject(
  store: ImageObjectStore,
  reference: string,
  options: ExtractEmbeddedImagesOptions,
): Promise<PdfImageObject> {
  if (typeof store?.has === 'function' && store.has(reference)) {
    return store.get(reference) as PdfImageObject;
  }
  if (typeof store?.has !== 'function') {
    // Legacy/mock stores without readiness tracking: synchronous lookup only.
    return store.get(reference) as PdfImageObject;
  }
  return options.awaitWithCancellation(
    new Promise<PdfImageObject>((resolve, reject) => {
      try {
        store.get(reference, (data: PdfImageObject) => resolve(data));
      } catch (error) {
        reject(error);
      }
    }),
  );
}

function imageToDataUrl(
  normalized: NormalizedImage,
  dimensions: ImageDimensions,
  options: ExtractEmbeddedImagesOptions,
): string | undefined {
  const canvas = allocateCanvas(dimensions.width, dimensions.height, options.maxPixels, options.createCanvas);
  try {
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    if (normalized.format === 'bitmap') {
      // Borrowed: PDF.js owns bitmap lifetime; never call close() here.
      context.drawImage(normalized.bitmap, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      return isValidDataUrlForMime(dataUrl, 'image/png') ? dataUrl : undefined;
    }

    const pixels = context.createImageData(dimensions.width, dimensions.height);
    pixels.data.set(normalized.rgba);
    context.putImageData(pixels, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    return isValidDataUrlForMime(dataUrl, 'image/png') ? dataUrl : undefined;
  } finally {
    releaseCanvas(canvas);
  }
}

/**
 * Normalizes a PDF.js image object into a bitmap reference or RGBA bytes.
 *
 * When `kind` is declared (the supported-peer worker always declares it for
 * decoded XObjects), the layout is enforced strictly: RGBA shares the source
 * buffer, RGB and 8-bit gray expand, and 1-bit packed rows are unpacked
 * MSB-first (`1` = white, `0` = black, matching PDF.js
 * `convertBlackAndWhiteToRGBA` defaults; worker-side `needsDecode`
 * inversion is already applied to `data` before it reaches this boundary).
 * Packed 1-bit rows use `ceil(width / 8)` bytes per row, so widths not
 * divisible by eight skip padding bits at each row end.
 *
 * When `kind` is absent (legacy inline/mock shapes), unambiguous 1/3/4
 * bytes-per-pixel layouts are still accepted by length so existing RGB/RGBA
 * behavior is preserved; anything else is unsupported. Unknown `kind`
 * values and length mismatches return `undefined` (warn/skip) rather than
 * guessed pixels. All length math uses safe integers and every mismatch
 * returns before allocating the RGBA scratch buffer.
 */
function normalizeImageSource(image: PdfImageObject, dimensions: ImageDimensions): NormalizedImage | undefined {
  if (typeof ImageBitmap !== 'undefined' && image.bitmap instanceof ImageBitmap) {
    return { format: 'bitmap', bitmap: image.bitmap };
  }
  if (!ArrayBuffer.isView(image.data)) return undefined;
  const source = new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  const kind = typeof image.kind === 'number' ? image.kind : undefined;

  if (kind === ImageKind.RGBA_32BPP) {
    const rgbaLength = multiplySafe(dimensions.pixels, 4);
    if (rgbaLength === undefined || source.length !== rgbaLength) return undefined;
    return { format: 'rgba', rgba: source };
  }
  if (kind === ImageKind.RGB_24BPP) {
    const rgbLength = multiplySafe(dimensions.pixels, 3);
    const rgbaLength = multiplySafe(dimensions.pixels, 4);
    if (rgbLength === undefined || rgbaLength === undefined || source.length !== rgbLength) return undefined;
    return { format: 'rgba', rgba: expandRgbToRgba(source, dimensions.pixels, rgbaLength) };
  }
  if (kind === ImageKind.GRAYSCALE_1BPP) {
    const rowBytes = Math.ceil(dimensions.width / 8);
    const packedLength = multiplySafe(rowBytes, dimensions.height);
    const rgbaLength = multiplySafe(dimensions.pixels, 4);
    if (packedLength === undefined || rgbaLength === undefined || source.length !== packedLength) return undefined;
    return { format: 'rgba', rgba: unpackOneBitToRgba(source, dimensions, rowBytes, rgbaLength) };
  }
  if (kind !== undefined) return undefined;

  // Legacy path for images without a declared kind: accept only exact
  // 4/3/1 bytes-per-pixel layouts, never packed bits.
  const rgbaLength = multiplySafe(dimensions.pixels, 4);
  const rgbLength = multiplySafe(dimensions.pixels, 3);
  if (rgbaLength === undefined || rgbLength === undefined) {
    throw new PdfReaderError('IMAGE_LIMIT_EXCEEDED', 'embedded image has unsafe decoded pixel dimensions.');
  }
  if (source.length === rgbaLength) return { format: 'rgba', rgba: source };
  if (source.length === rgbLength)
    return { format: 'rgba', rgba: expandRgbToRgba(source, dimensions.pixels, rgbaLength) };
  if (source.length === dimensions.pixels) {
    return { format: 'rgba', rgba: expandGray8ToRgba(source, dimensions.pixels, rgbaLength) };
  }
  return undefined;
}

function expandRgbToRgba(source: Uint8ClampedArray, pixels: number, rgbaLength: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(rgbaLength);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const input = pixel * 3;
    const output = pixel * 4;
    rgba[output] = source[input] ?? 0;
    rgba[output + 1] = source[input + 1] ?? 0;
    rgba[output + 2] = source[input + 2] ?? 0;
    rgba[output + 3] = 255;
  }
  return rgba;
}

function expandGray8ToRgba(source: Uint8ClampedArray, pixels: number, rgbaLength: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(rgbaLength);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const output = pixel * 4;
    const gray = source[pixel] ?? 0;
    rgba[output] = gray;
    rgba[output + 1] = gray;
    rgba[output + 2] = gray;
    rgba[output + 3] = 255;
  }
  return rgba;
}

function unpackOneBitToRgba(
  packed: Uint8ClampedArray,
  dimensions: ImageDimensions,
  rowBytes: number,
  rgbaLength: number,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(rgbaLength);
  for (let row = 0; row < dimensions.height; row += 1) {
    for (let column = 0; column < dimensions.width; column += 1) {
      const byte = packed[row * rowBytes + (column >> 3)] ?? 0;
      const bit = (byte >> (7 - (column & 7))) & 1;
      const value = bit === 1 ? 255 : 0;
      const output = (row * dimensions.width + column) * 4;
      rgba[output] = value;
      rgba[output + 1] = value;
      rgba[output + 2] = value;
      rgba[output + 3] = 255;
    }
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

  const { pixelWidth, pixelHeight, pixels } = resolveSafeCanvasDimensions(
    width,
    height,
    limit,
    'IMAGE_LIMIT_EXCEEDED',
    'embedded image',
  );
  return { width: pixelWidth, height: pixelHeight, pixels };
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
  const { pixelWidth, pixelHeight } = resolveSafeCanvasDimensions(
    width,
    height,
    limit,
    'IMAGE_LIMIT_EXCEEDED',
    'embedded image',
  );
  const canvas = createCanvas();
  try {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  } catch (error) {
    try {
      releaseCanvas(canvas);
    } catch {
      // Release is best-effort; preserve the original allocation failure.
    }
    throw error;
  }
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
