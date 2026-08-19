import { getDocument, OPS, Util } from 'pdfjs-dist';
import type { PageViewport, PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

import { PdfReaderError } from './errors';
import { getTransformedUnitBounds } from './geometry';
import { assertPositiveFinite, resolveConvertOptions, resolvePageNumbers } from './options';
import type {
  ConvertOptions,
  ExtractedImage,
  PageResult,
  PdfReaderOptions,
  PdfSource,
  TransformMatrix,
  ViewportScale,
} from './types';

const identityTransform: TransformMatrix = [1, 0, 0, 1, 0, 0];
const defaultLimits = {
  maxDocumentPages: 1_000,
  maxCanvasPixels: 40_000_000,
  maxEmbeddedImagePixels: 25_000_000,
} as const;

interface PdfImageObject {
  width?: unknown;
  height?: unknown;
  bitmap?: unknown;
  data?: unknown;
  dataLen?: unknown;
}

/** Browser PDF reader with bounded canvas allocation and deterministic cleanup. */
export class PDFReader {
  readonly #source: PdfSource;
  readonly #createCanvas: () => HTMLCanvasElement;
  readonly #logger: PdfReaderOptions['logger'];
  readonly #limits: Required<NonNullable<PdfReaderOptions['limits']>>;
  #loadingTask?: PDFDocumentLoadingTask;
  #document?: PDFDocumentProxy;
  #destroyed = false;

  public constructor(source: PdfSource, options: PdfReaderOptions = {}) {
    this.#source = source;
    this.#createCanvas = options.canvasFactory ?? (() => document.createElement('canvas'));
    this.#logger = options.logger;
    this.#limits = { ...defaultLimits, ...options.limits };
    this.#validateLimits();
  }

  public get numPages(): number | undefined {
    return this.#document?.numPages;
  }

  /** Loads once and returns the underlying PDF.js document proxy. */
  public async load(signal?: AbortSignal): Promise<PDFDocumentProxy> {
    this.#throwIfAborted(signal);
    if (this.#destroyed) throw new Error('PDFReader has been destroyed.');
    if (this.#document) return this.#document;

    const task = (this.#loadingTask ??= getDocument(this.#source));
    const abort = () => void task.destroy();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const documentProxy = await task.promise;
      this.#throwIfAborted(signal);
      if (documentProxy.numPages > this.#limits.maxDocumentPages) {
        await documentProxy.destroy();
        throw new PdfReaderError(
          'PAGE_LIMIT_EXCEEDED',
          `PDF has ${documentProxy.numPages} pages; limit is ${this.#limits.maxDocumentPages}.`,
        );
      }
      this.#document = documentProxy;
      return documentProxy;
    } catch (error) {
      this.#loadingTask = undefined;
      this.#throwIfAborted(signal);
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }

  /** Streams page results so callers do not need to retain the entire document conversion in memory. */
  public async *pages(options: ConvertOptions = {}): AsyncGenerator<PageResult> {
    const documentProxy = this.#document;
    if (!documentProxy) {
      throw new PdfReaderError('DOCUMENT_NOT_LOADED', 'Document not loaded. Call load() first.');
    }
    const resolved = resolveConvertOptions(options);
    const [start, end] = resolvePageNumbers(resolved.pageRange, documentProxy.numPages);
    if (start > documentProxy.numPages) {
      throw new PdfReaderError('INVALID_OPTION', `pageRange starts after the last page (${documentProxy.numPages}).`);
    }

    for (let pageNumber = start; pageNumber <= Math.min(end, documentProxy.numPages); pageNumber += 1) {
      this.#throwIfAborted(resolved.signal);
      const page = await documentProxy.getPage(pageNumber);
      try {
        yield await this.#processPage(page, pageNumber, documentProxy.numPages, resolved);
      } finally {
        page.cleanup();
      }
    }
  }

  /** Collects `pages()` into an array. Prefer `pages()` for large documents. */
  public async convert(options: ConvertOptions = {}): Promise<PageResult[]> {
    const results: PageResult[] = [];
    for await (const page of this.pages(options)) results.push(page);
    return results;
  }

  /** Terminates the loading task, document, and worker. The reader cannot be reused afterwards. */
  public async destroy(): Promise<void> {
    if (this.#destroyed) return;
    this.#destroyed = true;
    const documentProxy = this.#document;
    const loadingTask = this.#loadingTask;
    this.#document = undefined;
    this.#loadingTask = undefined;
    if (documentProxy) await documentProxy.destroy();
    else if (loadingTask) await loadingTask.destroy();
  }

  async #processPage(
    page: PDFPageProxy,
    pageNumber: number,
    numPages: number,
    options: ReturnType<typeof resolveConvertOptions>,
  ): Promise<PageResult> {
    const viewport = this.#resolveViewport(page, options.viewportScale);
    const result: PageResult = {
      numPages,
      pageNumber,
      pageIndex: pageNumber - 1,
      viewport,
      images: [],
    };

    this.#throwIfAborted(options.signal);
    if (options.includeText) result.text = await page.getTextContent();
    this.#throwIfAborted(options.signal);
    if (options.includeEmbeddedImages) result.images = await this.#extractImages(page, viewport, options.signal);
    this.#throwIfAborted(options.signal);
    if (options.includePageImage) {
      const canvas = this.#allocateCanvas(viewport.width, viewport.height, this.#limits.maxCanvasPixels, 'page');
      try {
        const context = canvas.getContext('2d');
        if (!context) throw new Error(`Failed to create a 2D canvas context for page ${pageNumber}.`);
        const renderTask = page.render({ canvas, canvasContext: context, viewport });
        await this.#waitForRender(renderTask, options.signal);
        result.dataUrl = canvas.toDataURL(options.imageFormat, options.jpegQuality);
        result.mimeType = options.imageFormat;
      } finally {
        this.#releaseCanvas(canvas);
      }
    }
    return result;
  }

  #resolveViewport(page: PDFPageProxy, viewportScale: ViewportScale): PageViewport {
    if (typeof viewportScale === 'number') return page.getViewport({ scale: viewportScale });
    const base = page.getViewport({ scale: 1 });
    const scale = viewportScale(base.width, base.height);
    assertPositiveFinite(scale, 'viewportScale callback result');
    return page.getViewport({ scale });
  }

  async #extractImages(page: PDFPageProxy, viewport: PageViewport, signal?: AbortSignal): Promise<ExtractedImage[]> {
    const operators = await page.getOperatorList();
    const images: ExtractedImage[] = [];
    const stack: TransformMatrix[] = [];
    let transform: TransformMatrix = identityTransform;

    for (let index = 0; index < operators.fnArray.length; index += 1) {
      this.#throwIfAborted(signal);
      const operation = operators.fnArray[index];
      if (operation === OPS.save) {
        stack.push([...transform]);
      } else if (operation === OPS.restore) {
        transform = stack.pop() ?? identityTransform;
      } else if (operation === OPS.transform) {
        transform = Util.transform(transform, operators.argsArray[index] as number[]) as unknown as TransformMatrix;
      } else if (
        operation === OPS.paintXObject ||
        operation === OPS.paintImageXObject ||
        operation === OPS.paintInlineImageXObject
      ) {
        const reference = operators.argsArray[index]?.[0];
        try {
          const image = (
            operation === OPS.paintInlineImageXObject ? reference : await page.objs.get(reference)
          ) as PdfImageObject;
          const dataUrl = this.#imageToDataUrl(image);
          if (!dataUrl) continue;
          const bounds = getTransformedUnitBounds(transform);
          images.push({
            dataUrl,
            x: bounds.left,
            y: bounds.top,
            width: bounds.width,
            height: bounds.height,
            size: this.#imageByteLength(image),
            mimeType: 'image/png',
            pageWidth: viewport.width / viewport.scale,
            pageHeight: viewport.height / viewport.scale,
            transform: [...transform],
          });
        } catch (error) {
          if (error instanceof PdfReaderError || signal?.aborted) throw error;
          this.#logger?.warn(`Failed to extract embedded image ${String(reference)}.`, error);
        }
      }
    }
    return images;
  }

  #imageToDataUrl(image: PdfImageObject): string | undefined {
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
    const canvas = this.#allocateCanvas(
      width as number,
      height as number,
      this.#limits.maxEmbeddedImagePixels,
      'embedded image',
    );
    try {
      const context = canvas.getContext('2d');
      if (!context) return undefined;
      if (typeof ImageBitmap !== 'undefined' && image.bitmap instanceof ImageBitmap) {
        context.drawImage(image.bitmap, 0, 0);
      } else if (ArrayBuffer.isView(image.data)) {
        const source = new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength);
        const rgba = this.#toRgba(source, width as number, height as number);
        if (!rgba) return undefined;
        const pixels = context.createImageData(width as number, height as number);
        pixels.data.set(rgba);
        context.putImageData(pixels, 0, 0);
      } else {
        return undefined;
      }
      return canvas.toDataURL('image/png');
    } finally {
      this.#releaseCanvas(canvas);
    }
  }

  #toRgba(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray | undefined {
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
      rgba[output + 3] = 255;
    }
    return rgba;
  }

  #allocateCanvas(width: number, height: number, limit: number, subject: string): HTMLCanvasElement {
    const pixelWidth = Math.ceil(width);
    const pixelHeight = Math.ceil(height);
    const pixels = pixelWidth * pixelHeight;
    if (!Number.isSafeInteger(pixels) || pixels > limit) {
      const code = subject === 'page' ? 'CANVAS_LIMIT_EXCEEDED' : 'IMAGE_LIMIT_EXCEEDED';
      throw new PdfReaderError(code, `${subject} requires ${pixels} pixels; limit is ${limit}.`);
    }
    const canvas = this.#createCanvas();
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    return canvas;
  }

  async #waitForRender(renderTask: RenderTask, signal?: AbortSignal): Promise<void> {
    const abort = () => renderTask.cancel();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await renderTask.promise;
      this.#throwIfAborted(signal);
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }

  #imageByteLength(image: PdfImageObject): number {
    if (typeof image.dataLen === 'number' && Number.isFinite(image.dataLen)) return image.dataLen;
    return ArrayBuffer.isView(image.data) ? image.data.byteLength : 0;
  }

  #releaseCanvas(canvas: HTMLCanvasElement): void {
    canvas.width = 0;
    canvas.height = 0;
  }

  #throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new PdfReaderError('ABORTED', 'PDF operation was aborted.');
  }

  #validateLimits(): void {
    for (const [name, value] of Object.entries(this.#limits)) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new PdfReaderError('INVALID_OPTION', `${name} must be a positive safe integer.`);
      }
    }
  }
}
