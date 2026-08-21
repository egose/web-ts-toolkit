import { getDocument } from 'pdfjs-dist';
import type { PageViewport, PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

import { extractEmbeddedImages } from './embeddedImages';
import { PdfReaderError } from './errors';
import { assertPositiveFinite, resolveConvertOptions, resolvePageNumbers } from './options';
import type {
  ConvertOptions,
  LoadOptions,
  PageImageMimeType,
  PageImageOutputMode,
  PageImageResult,
  PageResult,
  PdfDocumentInitParameters,
  PdfReaderOptions,
  PdfReaderState,
  PdfReaderSourceInfo,
  PdfSource,
  PdfTypedArray,
  ViewportScale,
} from './types';

const defaultLimits = {
  maxDocumentPages: 1_000,
  maxCanvasPixels: 40_000_000,
  maxEmbeddedImagePixels: 25_000_000,
} as const;

interface LoadState {
  task?: PDFDocumentLoadingTask;
  promise: Promise<PDFDocumentProxy>;
  destroyPromise?: Promise<void>;
  destroyed: boolean;
}

interface ResolvedLoadOptions {
  signal?: AbortSignal;
  deadlineMs?: number;
}

interface ResolvedLimits {
  maxSourceBytes?: number;
  maxDocumentPages: number;
  maxCanvasPixels: number;
  maxEmbeddedImagePixels: number;
}

/** Browser PDF reader with bounded canvas allocation and deterministic cleanup. */
export class PDFReader {
  readonly #source: PdfSource;
  readonly #createCanvas: () => HTMLCanvasElement;
  readonly #logger: PdfReaderOptions['logger'];
  readonly #limits: ResolvedLimits;
  readonly #sourcePolicy: PdfReaderOptions['sourcePolicy'];
  #loadingState?: LoadState;
  #loadingTask?: PDFDocumentLoadingTask;
  #document?: PDFDocumentProxy;
  #destroyPromise?: Promise<void>;
  readonly #activeRenderTasks = new Set<RenderTask>();
  #activePageWorkCount = 0;
  #destroyed = false;
  #lastLoadFailed = false;

  public constructor(source: PdfSource, options: PdfReaderOptions = {}) {
    this.#source = source;
    this.#createCanvas = options.canvasFactory ?? (() => document.createElement('canvas'));
    this.#logger = options.logger;
    this.#limits = { ...defaultLimits, ...options.limits };
    this.#sourcePolicy = options.sourcePolicy;
    this.#validateLimits();
  }

  public get numPages(): number | undefined {
    return this.#document?.numPages;
  }

  /** Current lifecycle state for load, iteration/rendering, retry, and teardown boundaries. */
  public get state(): PdfReaderState {
    if (this.#destroyed) return 'destroyed';
    if (this.#activePageWorkCount > 0) return 'iterating';
    if (this.#document) return 'loaded';
    if (this.#loadingState) return 'loading';
    if (this.#lastLoadFailed) return 'failed';
    return 'new';
  }

  /** Loads once and returns the underlying PDF.js document proxy. */
  public load(signal?: AbortSignal): Promise<PDFDocumentProxy>;
  public load(options?: LoadOptions): Promise<PDFDocumentProxy>;
  public load(options?: AbortSignal | LoadOptions): Promise<PDFDocumentProxy> {
    const resolved = this.#resolveLoadOptions(options);
    this.#throwIfAborted(resolved.signal);
    this.#throwIfDestroyed();
    if (this.#document) return Promise.resolve(this.#document);

    return this.#load(resolved);
  }

  async #load(options: ResolvedLoadOptions): Promise<PDFDocumentProxy> {
    const state = this.#getOrCreateLoadState();
    try {
      const documentProxy = await this.#awaitWithSignal(state.promise, options.signal, options.deadlineMs);
      this.#throwIfDestroyed();
      this.#throwIfAborted(options.signal);
      return documentProxy;
    } catch (error) {
      this.#throwIfDestroyed();
      this.#throwIfAborted(options.signal);
      throw error;
    }
  }

  /** Streams page results so callers do not need to retain the entire document conversion in memory. */
  public async *pages(options: ConvertOptions = {}): AsyncGenerator<PageResult> {
    this.#throwIfDestroyed();
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
      this.#throwIfDestroyed();
      this.#throwIfAborted(resolved.signal);
      let page: PDFPageProxy | undefined;
      let ownsActivePageWork = false;
      try {
        this.#activePageWorkCount += 1;
        ownsActivePageWork = true;
        page = await documentProxy.getPage(pageNumber);
        const result = await this.#processPage(page, pageNumber, documentProxy.numPages, resolved);
        page.cleanup();
        page = undefined;
        this.#activePageWorkCount -= 1;
        ownsActivePageWork = false;
        yield result;
      } catch (error) {
        this.#rethrowLifecycleError(error, resolved.signal);
      } finally {
        if (ownsActivePageWork) this.#activePageWorkCount -= 1;
        page?.cleanup();
      }
    }
  }

  /** Collects `pages()` into an array. Prefer `pages()` for large documents. */
  public async convert(options: ConvertOptions = {}): Promise<PageResult[]> {
    const results: PageResult[] = [];
    for await (const page of this.pages(options)) results.push(page);
    return results;
  }

  /** Terminates the loading task and document resources. The reader cannot be reused afterwards. */
  public async destroy(): Promise<void> {
    if (this.#destroyPromise) return this.#destroyPromise;
    this.#destroyed = true;
    const loadingTask = this.#loadingTask;
    const loadingState = this.#loadingState;
    this.#loadingTask = undefined;
    this.#document = undefined;
    this.#loadingState = undefined;
    this.#destroyPromise = (async () => {
      for (const renderTask of this.#activeRenderTasks) renderTask.cancel();
      if (loadingTask) {
        await loadingTask.destroy();
        return;
      }
      if (!loadingState) return;
      loadingState.destroyed = true;
      loadingState.destroyPromise ??= loadingState.task ? loadingState.task.destroy() : Promise.resolve();
      await loadingState.destroyPromise;
    })();
    await this.#destroyPromise;
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
    this.#throwIfDestroyed();
    if (options.includeText) {
      try {
        result.text = await page.getTextContent();
      } catch (error) {
        this.#rethrowLifecycleError(error, options.signal);
      }
    }
    this.#throwIfAborted(options.signal);
    this.#throwIfDestroyed();
    if (options.includeEmbeddedImages) {
      try {
        result.images = await extractEmbeddedImages(page, viewport, {
          signal: options.signal,
          createCanvas: this.#createCanvas,
          maxPixels: this.#limits.maxEmbeddedImagePixels,
          logger: this.#logger,
          throwIfAborted: (signal) => this.#throwIfAborted(signal),
          throwIfDestroyed: () => this.#throwIfDestroyed(),
        });
      } catch (error) {
        this.#rethrowLifecycleError(error, options.signal);
      }
    }
    this.#throwIfAborted(options.signal);
    this.#throwIfDestroyed();
    if (options.includePageImage) {
      const canvas = this.#allocateCanvas(viewport.width, viewport.height, this.#limits.maxCanvasPixels, 'page');
      try {
        const context = canvas.getContext('2d');
        if (!context) {
          throw this.#createUnsupportedEnvironmentError(`Failed to create a 2D canvas context for page ${pageNumber}.`);
        }
        const renderTask = page.render({ canvas, canvasContext: context, viewport });
        await this.#waitForRender(renderTask, options.signal);
        result.pageImage = await this.#encodePageImage(
          canvas,
          options.imageFormat,
          options.pageImageOutput,
          options.jpegQuality,
          options.signal,
        );
      } finally {
        this.#releaseCanvas(canvas);
      }
    }
    return result;
  }

  async #encodePageImage(
    canvas: HTMLCanvasElement,
    mimeType: PageImageMimeType,
    output: PageImageOutputMode,
    jpegQuality: number,
    signal?: AbortSignal,
  ): Promise<PageImageResult> {
    this.#throwIfDestroyed();
    this.#throwIfAborted(signal);
    const quality = mimeType === 'image/jpeg' ? jpegQuality : undefined;

    if (output === 'data-url') {
      const dataUrl = quality === undefined ? canvas.toDataURL(mimeType) : canvas.toDataURL(mimeType, quality);
      this.#throwIfDestroyed();
      this.#throwIfAborted(signal);
      return { kind: 'data-url', mimeType, dataUrl };
    }

    const blob = await this.#encodeCanvasToBlob(canvas, mimeType, quality, signal);
    this.#throwIfDestroyed();
    this.#throwIfAborted(signal);
    return { kind: 'blob', mimeType, blob };
  }

  #resolveViewport(page: PDFPageProxy, viewportScale: ViewportScale): PageViewport {
    if (typeof viewportScale === 'number') return page.getViewport({ scale: viewportScale });
    const base = page.getViewport({ scale: 1 });
    const scale = viewportScale(base.width, base.height);
    assertPositiveFinite(scale, 'viewportScale callback result');
    return page.getViewport({ scale });
  }

  async #encodeCanvasToBlob(
    canvas: HTMLCanvasElement,
    mimeType: PageImageMimeType,
    quality: number | undefined,
    signal?: AbortSignal,
  ): Promise<Blob> {
    if (typeof canvas.toBlob !== 'function') {
      throw this.#createUnsupportedEnvironmentError(
        'Canvas Blob encoding is not supported by this canvas implementation.',
      );
    }
    this.#throwIfAborted(signal);

    return await new Promise<Blob>((resolve, reject) => {
      let settled = false;
      const onAbort = () => settle(() => reject(this.#createAbortedError()));
      const cleanup = () => signal?.removeEventListener('abort', onAbort);
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const resolveBlob = (blob: Blob | null) => {
          if (!blob) {
            settle(() =>
              reject(this.#createUnsupportedEnvironmentError(`Canvas Blob encoding returned null for ${mimeType}.`)),
            );
            return;
          }
          settle(() => resolve(blob));
        };
        if (quality === undefined) {
          canvas.toBlob(resolveBlob, mimeType);
        } else {
          canvas.toBlob(resolveBlob, mimeType, quality);
        }
      } catch (error) {
        settle(() => reject(error));
      }
    });
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
    this.#activeRenderTasks.add(renderTask);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await renderTask.promise;
      this.#throwIfDestroyed();
      this.#throwIfAborted(signal);
    } catch (error) {
      this.#rethrowLifecycleError(error, signal);
    } finally {
      signal?.removeEventListener('abort', abort);
      this.#activeRenderTasks.delete(renderTask);
    }
  }

  #releaseCanvas(canvas: HTMLCanvasElement): void {
    canvas.width = 0;
    canvas.height = 0;
  }

  #getOrCreateLoadState(): LoadState {
    const existing = this.#loadingState;
    if (existing) return existing;

    this.#lastLoadFailed = false;
    const state = { destroyed: false } as LoadState;
    state.promise = (async () => {
      try {
        const policyResult = this.#enforceSourcePolicy();
        if (this.#isPromiseLike(policyResult)) await policyResult;
        if (state.destroyed || this.#destroyed) {
          throw this.#createDestroyedError();
        }
        const task = getDocument(this.#toPdfJsSource(this.#source));
        state.task = task;
        const documentProxy = await task.promise;
        if (state.destroyed || state.destroyPromise) {
          await state.destroyPromise?.catch(() => undefined);
          throw this.#createDestroyedError();
        }
        if (documentProxy.numPages > this.#limits.maxDocumentPages) {
          await task.destroy();
          throw new PdfReaderError(
            'PAGE_LIMIT_EXCEEDED',
            `PDF has ${documentProxy.numPages} pages; limit is ${this.#limits.maxDocumentPages}.`,
          );
        }
        this.#throwIfDestroyed();
        this.#loadingTask = task;
        this.#document = documentProxy;
        this.#lastLoadFailed = false;
        return documentProxy;
      } catch (error) {
        if (state.destroyed || state.destroyPromise || this.#destroyed) {
          await state.destroyPromise?.catch(() => undefined);
          throw this.#createDestroyedError();
        }
        this.#lastLoadFailed = true;
        throw error;
      } finally {
        if (this.#loadingState === state) this.#loadingState = undefined;
      }
    })();
    state.promise.catch(() => undefined);
    this.#loadingState = state;
    return state;
  }

  async #awaitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal, deadlineMs?: number): Promise<T> {
    this.#throwIfAborted(signal);
    if (!signal && deadlineMs === undefined) return promise;

    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const onAbort = () => settle(() => reject(this.#createAbortedError()));
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        if (timer !== undefined) clearTimeout(timer);
      };
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const timer =
        deadlineMs === undefined
          ? undefined
          : setTimeout(() => settle(() => reject(this.#createDeadlineExceededError())), deadlineMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      promise
        .then(
          (value) => settle(() => resolve(value)),
          (error) => settle(() => reject(error)),
        )
        .catch(() => undefined);
    });
  }

  #createAbortedError(): PdfReaderError {
    return new PdfReaderError('ABORTED', 'PDF operation was aborted.');
  }

  #createDestroyedError(): PdfReaderError {
    return new PdfReaderError('DESTROYED', 'PDFReader has been destroyed.');
  }

  #createDeadlineExceededError(): PdfReaderError {
    return new PdfReaderError('DEADLINE_EXCEEDED', 'PDF load exceeded the configured deadline.');
  }

  #createUnsupportedEnvironmentError(message: string): PdfReaderError {
    return new PdfReaderError('UNSUPPORTED_ENVIRONMENT', message);
  }

  #rethrowLifecycleError(error: unknown, signal?: AbortSignal): never {
    this.#throwIfDestroyed();
    this.#throwIfAborted(signal);
    throw error;
  }

  #throwIfDestroyed(): void {
    if (this.#destroyed) throw this.#createDestroyedError();
  }

  #throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw this.#createAbortedError();
  }

  #resolveLoadOptions(options?: AbortSignal | LoadOptions): ResolvedLoadOptions {
    if (!options) return {};
    if (this.#isAbortSignal(options)) return { signal: options };
    if (options.deadlineMs !== undefined && (!Number.isFinite(options.deadlineMs) || options.deadlineMs <= 0)) {
      throw new PdfReaderError('INVALID_OPTION', 'deadlineMs must be a positive finite number.');
    }
    return options;
  }

  #isAbortSignal(value: AbortSignal | LoadOptions): value is AbortSignal {
    return 'aborted' in value && 'addEventListener' in value && 'removeEventListener' in value;
  }

  #enforceSourcePolicy(): Promise<void> | void {
    const source = this.#inspectSource(this.#source);
    if (
      source.byteLength !== undefined &&
      this.#limits.maxSourceBytes !== undefined &&
      source.byteLength > this.#limits.maxSourceBytes
    ) {
      throw new PdfReaderError(
        'SOURCE_LIMIT_EXCEEDED',
        `PDF source is ${source.byteLength} bytes; limit is ${this.#limits.maxSourceBytes}.`,
      );
    }
    if (!this.#sourcePolicy) return;
    try {
      const result = this.#sourcePolicy(source);
      if (!this.#isPromiseLike(result)) return;
      return result.catch((error: unknown) => {
        if (error instanceof PdfReaderError) throw error;
        throw new PdfReaderError('SOURCE_POLICY_VIOLATION', 'PDF source rejected by sourcePolicy.');
      });
    } catch (error) {
      if (error instanceof PdfReaderError) throw error;
      throw new PdfReaderError('SOURCE_POLICY_VIOLATION', 'PDF source rejected by sourcePolicy.');
    }
  }

  #isPromiseLike(value: Promise<void> | void): value is Promise<void> {
    return value instanceof Promise;
  }

  #inspectSource(source: PdfSource): PdfReaderSourceInfo {
    if (typeof source === 'string') {
      return {
        rawSource: source,
        kind: 'url',
        url: source,
        hasHttpHeaders: false,
        withCredentials: false,
      };
    }
    if (typeof URL !== 'undefined' && source instanceof URL) {
      return {
        rawSource: source,
        kind: 'url',
        url: source.toString(),
        hasHttpHeaders: false,
        withCredentials: false,
      };
    }
    const byteLength = this.#knownByteLength(source);
    if (byteLength !== undefined) {
      return {
        rawSource: source,
        kind: 'bytes',
        byteLength,
        hasHttpHeaders: false,
        withCredentials: false,
      };
    }

    const candidate = source as Record<string, unknown>;
    const headers = this.#readHttpHeaders(candidate.httpHeaders);
    return {
      rawSource: source,
      kind: 'document-init-parameters',
      url: this.#readUrl(candidate.url),
      byteLength: this.#knownByteLength(candidate.data),
      hasHttpHeaders: headers !== undefined,
      httpHeaders: headers,
      withCredentials: candidate.withCredentials === true,
    };
  }

  #toPdfJsSource(source: PdfSource): PdfDocumentInitParameters {
    if (typeof source === 'string') return { url: source };
    if (source instanceof URL) return { url: source };
    if (source instanceof ArrayBuffer || this.#isPdfTypedArray(source) || Array.isArray(source))
      return { data: source };
    return source;
  }

  #isPdfTypedArray(source: PdfSource): source is PdfTypedArray {
    return ArrayBuffer.isView(source) && !(source instanceof DataView);
  }

  #knownByteLength(value: unknown): number | undefined {
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (Array.isArray(value) && value.every((entry) => Number.isFinite(entry))) return value.length;
    return undefined;
  }

  #readUrl(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (typeof URL !== 'undefined' && value instanceof URL) return value.toString();
    return undefined;
  }

  #readHttpHeaders(value: unknown): Readonly<Record<string, string>> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    if (entries.length === 0) return undefined;
    return Object.freeze(Object.fromEntries(entries));
  }

  #validateLimits(): void {
    for (const [name, value] of Object.entries(this.#limits)) {
      if (value === undefined) continue;
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new PdfReaderError('INVALID_OPTION', `${name} must be a positive safe integer.`);
      }
    }
  }
}
