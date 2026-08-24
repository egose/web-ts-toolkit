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
  PdfTextContent,
  PdfTypedArray,
  ViewportScale,
} from './types';

const defaultLimits = {
  maxDocumentPages: 1_000,
  maxTextItems: 50_000,
  maxTextCodeUnits: 5_000_000,
  maxOperatorCount: 100_000,
  maxCanvasPixels: 40_000_000,
  maxEmbeddedImagePixels: 25_000_000,
  maxEmbeddedImages: 1_000,
  maxEmbeddedImagePixelsTotal: 100_000_000,
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
  maxTextItems: number;
  maxTextCodeUnits: number;
  maxOperatorCount: number;
  maxCanvasPixels: number;
  maxEmbeddedImagePixels: number;
  maxEmbeddedImages: number;
  maxEmbeddedImagePixelsTotal: number;
}

interface SourceSnapshot {
  pdfJsSource: Readonly<PdfDocumentInitParameters>;
  info: PdfReaderSourceInfo;
}

interface HeaderInspection {
  hasHttpHeaders: boolean;
  httpHeaders?: Readonly<Record<string, string>>;
}

type SourceKind = PdfReaderSourceInfo['kind'];

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
  readonly #destroyController = new AbortController();
  readonly #activeRenderTasks = new Set<RenderTask>();
  #activePageOperation = false;
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
    if (this.#activePageOperation || this.#activePageWorkCount > 0) return 'iterating';
    if (this.#document) return 'loaded';
    if (this.#loadingState) return 'loading';
    if (this.#lastLoadFailed) return 'failed';
    return 'new';
  }

  /**
   * Loads once and returns the borrowed PDF.js document proxy.
   *
   * The returned proxy remains owned by this reader. Callers may inspect it and
   * use supported PDF.js read methods, but must not call `destroy()` on the
   * proxy while the reader owns lifecycle teardown. Call `reader.destroy()` to
   * release document and worker resources.
   */
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
    let ownsPageOperation = false;
    try {
      this.#acquirePageOperation();
      ownsPageOperation = true;
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
    } finally {
      if (ownsPageOperation) this.#releasePageOperation();
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
    this.#destroyController.abort();
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
      await this.#destroyLoadStateTask(loadingState);
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
        const text = await page.getTextContent();
        this.#enforceTextLimits(text);
        result.text = text;
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
          maxImages: this.#limits.maxEmbeddedImages,
          maxTotalPixels: this.#limits.maxEmbeddedImagePixelsTotal,
          maxOperators: this.#limits.maxOperatorCount,
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

  #enforceTextLimits(text: PdfTextContent): void {
    const items = (text as unknown as { items?: unknown }).items;
    if (!Array.isArray(items) || !Number.isSafeInteger(items.length)) {
      throw new PdfReaderError('TEXT_LIMIT_EXCEEDED', 'PDF text content has an unsafe item count.');
    }
    if (items.length > this.#limits.maxTextItems) {
      throw new PdfReaderError(
        'TEXT_LIMIT_EXCEEDED',
        `PDF page has ${items.length} text items; limit is ${this.#limits.maxTextItems}.`,
      );
    }

    let codeUnits = 0;
    for (const item of items) {
      const value = item && typeof item === 'object' ? (item as { str?: unknown }).str : undefined;
      if (typeof value !== 'string') continue;
      codeUnits += value.length;
      if (!Number.isSafeInteger(codeUnits) || codeUnits > this.#limits.maxTextCodeUnits) {
        throw new PdfReaderError(
          'TEXT_LIMIT_EXCEEDED',
          `PDF page text has more than ${this.#limits.maxTextCodeUnits} string code units.`,
        );
      }
    }
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
    this.#throwIfDestroyed();
    this.#throwIfAborted(signal);

    return await new Promise<Blob>((resolve, reject) => {
      let settled = false;
      const onAbort = () => settle(() => reject(this.#createAbortedError()));
      const onDestroy = () => settle(() => reject(this.#createDestroyedError()));
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        this.#destroyController.signal.removeEventListener('abort', onDestroy);
      };
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      this.#destroyController.signal.addEventListener('abort', onDestroy, { once: true });
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
      await this.#awaitWithSignal(renderTask.promise, signal);
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

  #acquirePageOperation(): void {
    this.#throwIfDestroyed();
    if (this.#activePageOperation) {
      throw new PdfReaderError(
        'OPERATION_IN_PROGRESS',
        'Another pages() or convert() operation is already active for this PDFReader.',
      );
    }
    this.#activePageOperation = true;
  }

  #releasePageOperation(): void {
    this.#activePageOperation = false;
  }

  #getOrCreateLoadState(): LoadState {
    const existing = this.#loadingState;
    if (existing) return existing;

    this.#lastLoadFailed = false;
    const state = { destroyed: false } as LoadState;
    state.promise = (async () => {
      try {
        const source = this.#createSourceSnapshot();
        const policyResult = this.#enforceSourcePolicy(source.info);
        if (policyResult) await this.#awaitWithDestroy(policyResult);
        if (state.destroyed || this.#destroyed) {
          throw this.#createDestroyedError();
        }
        const task = getDocument(source.pdfJsSource);
        state.task = task;
        let documentProxy: PDFDocumentProxy;
        try {
          documentProxy = await this.#awaitWithDestroy(task.promise);
        } catch (error) {
          if (state.destroyed || this.#destroyed) {
            await state.destroyPromise?.catch(() => undefined);
            throw this.#createDestroyedError();
          }
          await this.#destroyLoadStateTask(state).catch(() => undefined);
          throw error;
        }
        if (state.destroyed) {
          await this.#destroyLoadStateTask(state).catch(() => undefined);
          throw this.#createDestroyedError();
        }
        if (documentProxy.numPages > this.#limits.maxDocumentPages) {
          const error = new PdfReaderError(
            'PAGE_LIMIT_EXCEEDED',
            `PDF has ${documentProxy.numPages} pages; limit is ${this.#limits.maxDocumentPages}.`,
          );
          await this.#destroyLoadStateTask(state).catch(() => undefined);
          throw error;
        }
        this.#throwIfDestroyed();
        state.task = undefined;
        this.#loadingTask = task;
        this.#document = documentProxy;
        this.#lastLoadFailed = false;
        return documentProxy;
      } catch (error) {
        if (state.destroyed || this.#destroyed) {
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

  #destroyLoadStateTask(state: LoadState): Promise<void> {
    if (state.destroyPromise) return state.destroyPromise;
    const task = state.task;
    state.task = undefined;
    state.destroyPromise = task ? Promise.resolve(task.destroy()) : Promise.resolve();
    return state.destroyPromise;
  }

  async #awaitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal, deadlineMs?: number): Promise<T> {
    this.#throwIfAborted(signal);
    this.#throwIfDestroyed();

    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const onAbort = () => settle(() => reject(this.#createAbortedError()));
      const onDestroy = () => settle(() => reject(this.#createDestroyedError()));
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        this.#destroyController.signal.removeEventListener('abort', onDestroy);
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
      this.#destroyController.signal.addEventListener('abort', onDestroy, { once: true });
      promise
        .then(
          (value) => settle(() => resolve(value)),
          (error) => settle(() => reject(error)),
        )
        .catch(() => undefined);
    });
  }

  async #awaitWithDestroy<T>(promise: PromiseLike<T>): Promise<T> {
    this.#throwIfDestroyed();
    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const onDestroy = () => settle(() => reject(this.#createDestroyedError()));
      const cleanup = () => this.#destroyController.signal.removeEventListener('abort', onDestroy);
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };

      this.#destroyController.signal.addEventListener('abort', onDestroy, { once: true });
      Promise.resolve(promise).then(
        (value) => settle(() => resolve(value)),
        (error) => settle(() => reject(error)),
      );
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

  #enforceSourcePolicy(source: PdfReaderSourceInfo): Promise<void> | void {
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
      if (result === undefined) return;
      return Promise.resolve(result).catch((error: unknown) => {
        if (error instanceof PdfReaderError) throw error;
        throw new PdfReaderError('SOURCE_POLICY_VIOLATION', 'PDF source rejected by sourcePolicy.');
      });
    } catch (error) {
      if (error instanceof PdfReaderError) throw error;
      throw new PdfReaderError('SOURCE_POLICY_VIOLATION', 'PDF source rejected by sourcePolicy.');
    }
  }

  #createSourceSnapshot(): SourceSnapshot {
    const kind = this.#sourceKind(this.#source);
    const pdfJsSource = this.#toPdfJsSource(this.#source);
    const info = this.#inspectSource(pdfJsSource, kind);
    return { pdfJsSource, info };
  }

  #inspectSource(source: Readonly<PdfDocumentInitParameters>, kind: SourceKind): PdfReaderSourceInfo {
    const headers = this.#readHttpHeaders(source.httpHeaders);
    const info = {
      rawSource: source,
      kind,
      url: this.#readUrl(source.url),
      byteLength: this.#knownByteLength(source.data),
      hasHttpHeaders: headers.hasHttpHeaders,
      httpHeaders: headers.httpHeaders,
      withCredentials: source.withCredentials === true,
    } satisfies PdfReaderSourceInfo;

    return Object.freeze(info);
  }

  #sourceKind(source: PdfSource): SourceKind {
    if (typeof source === 'string') return 'url';
    if (typeof URL !== 'undefined' && source instanceof URL) return 'url';
    if (source instanceof ArrayBuffer || this.#isPdfTypedArray(source) || Array.isArray(source)) return 'bytes';
    return 'document-init-parameters';
  }

  #toPdfJsSource(source: PdfSource): Readonly<PdfDocumentInitParameters> {
    if (typeof source === 'string') {
      return this.#freezeSource({ url: source });
    }
    if (typeof URL !== 'undefined' && source instanceof URL) {
      return this.#freezeSource({ url: source.toString() });
    }
    if (source instanceof ArrayBuffer || this.#isPdfTypedArray(source) || Array.isArray(source)) {
      return this.#freezeSource({ data: source });
    }

    const snapshot: Record<PropertyKey, unknown> = {};
    for (const key of Reflect.ownKeys(source)) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (!descriptor?.enumerable) continue;
      snapshot[key] = (source as Record<PropertyKey, unknown>)[key];
    }
    if (typeof URL !== 'undefined' && snapshot.url instanceof URL) snapshot.url = snapshot.url.toString();
    return this.#freezeSource(snapshot as PdfDocumentInitParameters);
  }

  #freezeSource(source: PdfDocumentInitParameters): Readonly<PdfDocumentInitParameters> {
    return Object.freeze(source);
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

  #readHttpHeaders(value: unknown): HeaderInspection {
    if (!value || typeof value !== 'object') return { hasHttpHeaders: false };

    const entries: [string, string][] = [];
    try {
      for (const [name, headerValue] of Object.entries(value)) {
        if (typeof headerValue === 'string') entries.push([name, headerValue]);
      }
      if ('forEach' in value && typeof value.forEach === 'function') {
        value.forEach((headerValue: unknown, name: unknown) => {
          if (typeof name === 'string' && typeof headerValue === 'string') entries.push([name, headerValue]);
        });
      }
    } catch {
      return { hasHttpHeaders: true };
    }

    return {
      hasHttpHeaders: true,
      httpHeaders: entries.length > 0 ? Object.freeze(Object.fromEntries(entries)) : undefined,
    };
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
