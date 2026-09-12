import { getDocument } from 'pdfjs-dist';
import type { PageViewport, PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

import { extractEmbeddedImages } from './embeddedImages';
import { PdfReaderError } from './errors';
import { isValidBlobForMime, isValidDataUrlForMime, MAX_TIMER_MS, resolveSafeCanvasDimensions } from './canvasGuards';
import { assertPositiveFinite, resolveConvertOptions, resolvePageNumbers } from './options';
import type {
  ConvertOptions,
  LoadOptions,
  PageImageMimeType,
  PageImageOutputMode,
  PageImageResult,
  PageResult,
  PdfDocumentInitParameters,
  PdfReaderLimits,
  PdfReaderOptions,
  PdfReaderState,
  PdfReaderSourceInfo,
  PdfSource,
  PdfTextContent,
  PdfTypedArray,
  ViewportScale,
} from './types';

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

const defaultLimits: Omit<ResolvedLimits, 'maxSourceBytes'> = {
  maxDocumentPages: 1_000,
  maxTextItems: 50_000,
  maxTextCodeUnits: 5_000_000,
  maxOperatorCount: 100_000,
  maxCanvasPixels: 40_000_000,
  maxEmbeddedImagePixels: 25_000_000,
  maxEmbeddedImages: 1_000,
  maxEmbeddedImagePixelsTotal: 100_000_000,
};

type DefaultLimitName = keyof typeof defaultLimits;

/**
 * Resolves caller-supplied limits against finite defaults.
 *
 * Explicit `undefined` is treated as omitted so optional-property spreads
 * cannot erase a default. Supplied values must be positive safe integers;
 * `maxSourceBytes` stays unset when omitted. Invalid supplied values throw
 * `INVALID_OPTION`.
 */
export function resolveLimits(limits?: PdfReaderLimits): ResolvedLimits {
  const resolved: ResolvedLimits = { ...defaultLimits };
  if (limits === undefined || limits === null) return resolved;
  for (const name of Object.keys(defaultLimits) as DefaultLimitName[]) {
    const supplied = limits[name];
    if (supplied === undefined) continue;
    if (!Number.isSafeInteger(supplied) || (supplied as number) <= 0) {
      throw new PdfReaderError('INVALID_OPTION', `${name} must be a positive safe integer.`);
    }
    resolved[name] = supplied as number;
  }
  const maxSourceBytes = limits.maxSourceBytes;
  if (maxSourceBytes === undefined) return resolved;
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes <= 0) {
    throw new PdfReaderError('INVALID_OPTION', 'maxSourceBytes must be a positive safe integer.');
  }
  resolved.maxSourceBytes = maxSourceBytes;
  return resolved;
}

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

export type { ResolvedLimits };

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
    this.#limits = resolveLimits(options.limits);
    this.#sourcePolicy = options.sourcePolicy;
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

  /**
   * Streams page results so callers do not need to retain the entire document conversion in memory.
   *
   * Page-stage waits (`getPage`, text, operator list, render, encoding) settle
   * promptly with `ABORTED`/`DESTROYED` via the shared cancellation/wait
   * contract, but racing never cancels the underlying PDF.js work: it keeps
   * running in the background, owned only for cleanup observation. A late
   * `getPage()` fulfillment is cleaned exactly once and never processed;
   * late text/operator values are dropped and late rejections observed, so a
   * subsequent conversion may safely acquire the same reader/page immediately
   * after the prior operation settles. A suspended generator only observes
   * abort/destroy on the next `next()`/`return()`; destruction cannot force
   * suspended consumer code to run.
   */
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
          // Shared cancellation/wait contract: settles promptly on abort/destroy
          // without cancelling upstream PDF.js work. A late fulfillment is owned
          // only for cleanup observation (exactly one cleanup, no later
          // processing), so sequential reuse after settle cannot overlap it.
          page = await this.#awaitWithSignal(
            documentProxy.getPage(pageNumber),
            resolved.signal,
            undefined,
            (latePage) => {
              try {
                (latePage as PDFPageProxy | undefined)?.cleanup();
              } catch {
                // Background cleanup is best-effort; the caller already settled.
              }
            },
          );
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

  /**
   * Terminates the loading task and document resources. The reader cannot be reused afterwards.
   *
   * A caller-created PDF.js `PDFWorker` passed on the source stays
   * caller-owned: neither `destroy()` nor PDF.js task teardown destroys it.
   * Destroy it explicitly in your own `finally` block, even if this method
   * rejects.
   *
   * In-flight page-stage waiters settle promptly with `DESTROYED`, but their
   * upstream PDF.js work is uncancellable and continues in the background for
   * cleanup observation only. This method waits for PDF.js loading/document
   * destruction, not for orphaned `getPage`/text/operator continuations, which
   * never start later processing. It cannot force a suspended `pages()`
   * consumer to resume; that consumer observes destruction on next resume.
   */
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
        // Same shared contract as getPage/render: prompt ABORTED/DESTROYED,
        // late text dropped, late rejection observed, page still cleaned by
        // the pages() owner. Upstream PDF.js text work is not cancelled.
        const text = await this.#awaitWithSignal(page.getTextContent(), options.signal);
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
          // Reuses the reader's single cancellation/wait contract so operator
          // retrieval settles promptly without cancelling upstream PDF.js work.
          awaitWithCancellation: <T>(pending: Promise<T>) => this.#awaitWithSignal(pending, options.signal),
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
      if (!isValidDataUrlForMime(dataUrl, mimeType)) {
        throw this.#createUnsupportedEnvironmentError(
          `Canvas encoding produced an empty or mismatched result for ${mimeType}.`,
        );
      }
      return { kind: 'data-url', mimeType, dataUrl };
    }

    const blob = await this.#encodeCanvasToBlob(canvas, mimeType, quality, signal);
    this.#throwIfDestroyed();
    this.#throwIfAborted(signal);
    if (!isValidBlobForMime(blob, mimeType)) {
      throw this.#createUnsupportedEnvironmentError(
        `Canvas Blob encoding produced an empty or mismatched result for ${mimeType}.`,
      );
    }
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
    const { pixelWidth, pixelHeight } = resolveSafeCanvasDimensions(
      width,
      height,
      limit,
      'CANVAS_LIMIT_EXCEEDED',
      subject,
    );
    const canvas = this.#createCanvas();
    try {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    } catch (error) {
      try {
        this.#releaseCanvas(canvas);
      } catch {
        // Release is best-effort; preserve the original allocation failure.
      }
      throw error;
    }
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
    // Publish ownership before running synchronously fallible source/policy/
    // PDF.js code so a sync throw still clears this attempt via the finally
    // below. The shared promise is assigned before the work starts so a
    // reentrant policy that synchronously calls load()/state shares this task
    // instead of creating a duplicate. The work itself still runs
    // synchronously through policy approval and getDocument() init, preserving
    // existing destroy-race ownership of an already-created PDF.js task.
    let resolveLoad!: (value: PDFDocumentProxy) => void;
    let rejectLoad!: (reason?: unknown) => void;
    state.promise = new Promise<PDFDocumentProxy>((resolve, reject) => {
      resolveLoad = resolve;
      rejectLoad = reject;
    });
    state.promise.catch(() => undefined);
    this.#loadingState = state;
    const taskPromise = (async () => {
      try {
        const source = this.#createSourceSnapshot();
        const policyResult = this.#enforceSourcePolicy(source.info);
        if (policyResult) await this.#awaitWithDestroy(policyResult);
        // Re-measure the borrowed byte reference after approval: a number
        // array can be extended or a resizable buffer grown while policy is
        // pending. This recheck runs in the same synchronous block as the
        // `getDocument()` call below, and PDF.js converts `data`
        // synchronously inside `getDocument()`, so no interleaving growth
        // can slip between this recheck and conversion. Deliberately no
        // defensive copy: typed arrays stay borrowed (PDF.js may transfer
        // them to its worker), so only the size is re-validated, not the
        // byte content.
        this.#throwIfOverSourceLimit(source.pdfJsSource.data);
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
    taskPromise.then(resolveLoad, rejectLoad);
    return state;
  }

  #destroyLoadStateTask(state: LoadState): Promise<void> {
    if (state.destroyPromise) return state.destroyPromise;
    const task = state.task;
    state.task = undefined;
    state.destroyPromise = task ? Promise.resolve(task.destroy()) : Promise.resolve();
    return state.destroyPromise;
  }

  /**
   * Single cancellation/wait contract for load, page retrieval, text,
   * operator-list, render, and deadline waits.
   *
   * Caller-local `signal`/`deadlineMs` settle only that waiter; reader
   * destruction settles every waiter. Racing never cancels the underlying
   * PDF.js work: the upstream promise keeps running, owned only for cleanup
   * observation. When abort/destroy wins first, a late fulfillment is handed
   * to `onLateValue` (used to clean a late page exactly once, never to start
   * later processing) and a late rejection is observed so it cannot become an
   * unhandled rejection or a late published result. The callback-based Blob
   * encoder follows the same settle-once/late-ignore contract.
   */
  async #awaitWithSignal<T>(
    promise: Promise<T>,
    signal?: AbortSignal,
    deadlineMs?: number,
    onLateValue?: (value: T) => void,
  ): Promise<T> {
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
          (value) => {
            if (settled) {
              if (onLateValue) {
                try {
                  onLateValue(value);
                } catch {
                  // Background cleanup must not surface after the caller settled.
                }
              }
              return;
            }
            settle(() => resolve(value));
          },
          (error) => {
            // When settled, the late rejection is already observed here, so it
            // cannot become unhandled or overwrite the caller-facing result.
            if (settled) return;
            settle(() => reject(error));
          },
        )
        .catch(() => undefined);
    });
  }

  /**
   * Destroy-only wait sharing the single cancellation contract above.
   * Caller-local load abort/deadline semantics stay in `#awaitWithSignal`;
   * this wrapper passes no caller signal so only destruction can win early.
   */
  async #awaitWithDestroy<T>(promise: PromiseLike<T>): Promise<T> {
    return this.#awaitWithSignal(Promise.resolve(promise));
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
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new PdfReaderError('INVALID_OPTION', 'Load options must be an object or an AbortSignal.');
    }
    if (this.#isAbortSignal(options)) return { signal: options };
    const candidate = options as LoadOptions;
    if (candidate.deadlineMs !== undefined) {
      if (
        !Number.isFinite(candidate.deadlineMs) ||
        (candidate.deadlineMs as number) <= 0 ||
        (candidate.deadlineMs as number) > MAX_TIMER_MS
      ) {
        throw new PdfReaderError(
          'INVALID_OPTION',
          `deadlineMs must be a positive finite number not exceeding ${MAX_TIMER_MS}.`,
        );
      }
    }
    return { signal: candidate.signal, deadlineMs: candidate.deadlineMs };
  }

  #isAbortSignal(value: AbortSignal | LoadOptions): value is AbortSignal {
    return 'aborted' in value && 'addEventListener' in value && 'removeEventListener' in value;
  }

  #enforceSourcePolicy(source: PdfReaderSourceInfo): Promise<void> | void {
    this.#throwIfOverSourceLimit(source.rawSource.data);
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

  /**
   * Rejects a synchronously measurable over-limit byte source.
   *
   * Length is read without scanning or copying element content, so an
   * oversized array fails on its `length` before any entry is visited.
   */
  #throwIfOverSourceLimit(data: unknown): void {
    if (this.#limits.maxSourceBytes === undefined) return;
    const byteLength = this.#knownByteLength(data);
    if (byteLength !== undefined && byteLength > this.#limits.maxSourceBytes) {
      throw new PdfReaderError(
        'SOURCE_LIMIT_EXCEEDED',
        `PDF source is ${byteLength} bytes; limit is ${this.#limits.maxSourceBytes}.`,
      );
    }
  }

  #createSourceSnapshot(): SourceSnapshot {
    const kind = this.#sourceKind(this.#source);
    // Read the caller's header container once and stabilize it into a single
    // owned record. The same frozen reference backs both the policy metadata
    // and the PDF.js loading params below, so approval and network behavior
    // cannot diverge through later mutation or repeated getter evaluation.
    const headers = this.#snapshotHttpHeaders(this.#readRawHttpHeaders(this.#source));
    const pdfJsSource = this.#toPdfJsSource(this.#source, headers);
    const info = this.#inspectSource(pdfJsSource, kind, headers);
    return { pdfJsSource, info };
  }

  #inspectSource(
    source: Readonly<PdfDocumentInitParameters>,
    kind: SourceKind,
    headers: HeaderInspection,
  ): PdfReaderSourceInfo {
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

  #toPdfJsSource(source: PdfSource, headers: HeaderInspection): Readonly<PdfDocumentInitParameters> {
    if (typeof source === 'string') {
      return this.#freezeSource({ url: source });
    }
    if (typeof URL !== 'undefined' && source instanceof URL) {
      return this.#freezeSource({ url: source.toString() });
    }
    if (source instanceof ArrayBuffer || this.#isPdfTypedArray(source) || Array.isArray(source)) {
      return this.#freezeSource({ data: source });
    }

    // Prototype-safe own-enumerable copy: define (never assign) so a
    // `__proto__` key becomes an own data property instead of mutating the
    // snapshot prototype. `httpHeaders` is skipped here and replaced below
    // with the stabilized record so no live caller reference survives.
    const snapshot: Record<PropertyKey, unknown> = {};
    for (const key of Reflect.ownKeys(source)) {
      if (key === 'httpHeaders') continue;
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (!descriptor?.enumerable) continue;
      const value = (source as Record<PropertyKey, unknown>)[key];
      Object.defineProperty(snapshot, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    if (typeof URL !== 'undefined' && snapshot.url instanceof URL) snapshot.url = snapshot.url.toString();
    if (headers.httpHeaders !== undefined) {
      Object.defineProperty(snapshot, 'httpHeaders', {
        value: headers.httpHeaders,
        writable: false,
        enumerable: true,
        configurable: false,
      });
    }
    return this.#freezeSource(snapshot as PdfDocumentInitParameters);
  }

  #freezeSource(source: PdfDocumentInitParameters): Readonly<PdfDocumentInitParameters> {
    return Object.freeze(source);
  }

  #isFetchHeaders(value: object | Function): boolean {
    if (typeof Headers !== 'undefined' && value instanceof Headers) return true;
    try {
      if (Object.prototype.toString.call(value) === '[object Headers]') return true;
    } catch {
      // Ignore branding probes and fall through to structural enumeration.
    }
    return false;
  }

  #isPdfTypedArray(source: PdfSource): source is PdfTypedArray {
    return ArrayBuffer.isView(source) && !(source instanceof DataView);
  }

  #knownByteLength(value: unknown): number | undefined {
    // Mirrors the installed PDF.js `getDataProp` conversion: binary strings
    // become one byte per code unit (`stringToBytes`), number arrays become
    // one byte per entry (`new Uint8Array(array)`, entries coerced), and
    // buffers/views contribute their `byteLength` (sliced views only their
    // slice). Array length is returned without visiting entries, so a
    // length-based rejection never traverses element content and non-finite
    // entries still count instead of reporting an unknown size.
    if (typeof value === 'string') return value.length;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (Array.isArray(value)) return value.length;
    return undefined;
  }

  #readUrl(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (typeof URL !== 'undefined' && value instanceof URL) return value.toString();
    return undefined;
  }

  #readRawHttpHeaders(source: PdfSource): unknown {
    if (typeof source !== 'object' || source === null) return undefined;
    if (source instanceof ArrayBuffer || ArrayBuffer.isView(source) || Array.isArray(source)) return undefined;
    // Single property read (own or inherited) so a changing getter is
    // observed once; nested header values are stabilized separately below.
    // `data` and other byte forms stay borrowed references here: PDFR3-03
    // owns byte-limit/copy semantics, so this boundary must not clone them.
    return (source as { httpHeaders?: unknown }).httpHeaders;
  }

  /**
   * Stabilizes effective HTTP headers into one owned, frozen record.
   *
   * Enumeration mirrors the installed PDF.js `createHeaders` transport
   * (`for...in`, inherited enumerable string keys, `undefined` skipped) so
   * the approved diagnostic and the value handed to `getDocument()` agree.
   * Remaining values are coerced with `String()` as `Headers.append` would.
   * Non-plain containers (`Headers`, `Map`, class instances) intentionally
   * yield no value entries — matching what PDF.js `for...in` consumption
   * observes — while `hasHttpHeaders` stays `true` so policies gating only
   * on header presence keep blocking. A throwing getter propagates so the
   * load fails closed before policy approval. The caller's container is
   * never frozen or mutated.
   */
  #snapshotHttpHeaders(value: unknown): HeaderInspection {
    if (value === null || value === undefined) return { hasHttpHeaders: false };
    if (typeof value !== 'object' && typeof value !== 'function') return { hasHttpHeaders: false };
    if (this.#isFetchHeaders(value)) {
      // A fetch `Headers` container stores entries internally: PDF.js
      // `for...in` consumption observes none of them (or, on some runtimes,
      // enumerates container methods instead). Report presence without
      // claiming value equivalence and load with no header entries so the
      // approved diagnostic and the effective request stay identical.
      return { hasHttpHeaders: true };
    }

    const entries: [string, string][] = [];
    for (const name in value as Record<string, unknown>) {
      const headerValue = (value as Record<string, unknown>)[name];
      if (headerValue === undefined) continue;
      entries.push([name, String(headerValue)]);
    }

    return {
      hasHttpHeaders: true,
      // Object.fromEntries installs `__proto__` as an own data property
      // (no prototype mutation); the frozen record is shared by policy info
      // and PDF.js loading params. Opaque worker/factory fields elsewhere in
      // the snapshot stay borrowed by reference — only headers stabilize.
      httpHeaders: entries.length > 0 ? Object.freeze(Object.fromEntries(entries)) : undefined,
    };
  }
}
