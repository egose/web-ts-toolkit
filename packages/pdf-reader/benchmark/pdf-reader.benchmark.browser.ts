import { describe, expect, it } from 'vitest';

import * as pkg from '../dist/index.mjs';
import { OPS } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import shortB64 from './generated/short.pdf.base64.txt?raw';
import longB64 from './generated/long.pdf.base64.txt?raw';
import textHeavyB64 from './generated/text-heavy.pdf.base64.txt?raw';
import imageHeavyB64 from './generated/image-heavy.pdf.base64.txt?raw';
import embeddedImagesB64 from '../test/fixtures/generated/embedded-images.pdf.base64.txt?raw';

import type { PageResult } from '../src';

const PDFReader = pkg.PDFReader as typeof import('../src').PDFReader;
const configurePdfWorker = pkg.configurePdfWorker as typeof import('../src').configurePdfWorker;

type StrategyName = 'serial-pages' | 'bounded-concurrency-2';

/**
 * PDFR3-10 bounds. CONCURRENCY is the number of benchmark readers (loaded
 * documents) driving per-page convert() work. REORDER_WINDOW_PAGES bounds
 * package-retained completed-but-unemittable page results after each emission
 * drain, regardless of document length. In-flight conversions (<= CONCURRENCY)
 * are separate from retained results.
 */
const CONCURRENCY = 2;
const REORDER_WINDOW_PAGES = 2;
const WARMUP_RUNS = 1;
const MEASURED_REPEATS = 3;
const ABORT_STAGE_TIMEOUT_MS = 5_000;
const ABORT_STAGE_POLL_MS = 10;

interface FixtureSpec {
  name: string;
  base64: string;
  viewportScale: number;
}

interface LongTaskSummary {
  supported: boolean;
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

interface RunMetrics {
  /** Conversion-only wall time (page work, excluding document load). */
  wallTimeMs: number;
  /** Document-load wall time (all readers, via Promise.all). */
  loadWallTimeMs: number;
  /** Conversion-only wall time (duplicate of wallTimeMs, explicit name). */
  convertWallTimeMs: number;
  /** Load-inclusive wall time (load + conversion). */
  totalWallTimeMs: number;
  /**
   * Global simultaneous peak of live PDF.js page proxies across ALL loaded
   * documents (PDF.js-internal resources, released via page.cleanup()).
   * This is a measured simultaneous peak, not a sum of per-document peaks.
   */
  peakActivePages: number;
  /**
   * Global simultaneous peak of package-owned canvases with nonzero
   * dimensions (package resources via canvasFactory).
   */
  peakActiveCanvases: number;
  /** Peak package-retained completed-but-unemittable pages after each drain. */
  peakRetainedPages: number;
  /** Declared reorder window (REORDER_WINDOW_PAGES). */
  reorderWindowPages: number;
  /** Peak package-retained PageResult output bytes (unemitted + emitted estimate). */
  peakRetainedOutputBytes: number;
  outputOrder: number[];
  longTasks: LongTaskSummary;
  /** Number of loaded PDFReader documents contributing to this run. */
  loadedReaderCount: number;
  /** Worker setup description (shared app-global PDF.js worker URL). */
  workerSetup: string;
}

interface StrategyResult extends RunMetrics {
  strategy: StrategyName;
  repeatIndex: number;
}

interface AbortResult {
  strategy: StrategyName;
  abortLatencyMs: number;
  code: string | undefined;
  /** True when an active page/canvas stage was observed before aborting. */
  stageReached: boolean;
  /** Which stage was observed, or why no stage was reachable. */
  stageDetail: string;
}

interface CanvasTracker {
  factory: () => HTMLCanvasElement;
  getPeakActiveCanvases: () => number;
  sawActiveCanvas: () => boolean;
}

interface ImageAccounting {
  factory: () => HTMLCanvasElement;
  getAllocCount: () => number;
  getEncodeCount: () => number;
  getPeakActive: () => number;
}

const fixtures: readonly FixtureSpec[] = [
  { name: 'short.pdf', base64: shortB64, viewportScale: 1.5 },
  { name: 'long.pdf', base64: longB64, viewportScale: 1.5 },
  { name: 'text-heavy.pdf', base64: textHeavyB64, viewportScale: 1.5 },
  { name: 'image-heavy.pdf', base64: imageHeavyB64, viewportScale: 2 },
] as const;

function decodeFixture(b64: string): Uint8Array {
  const trimmed = b64.trim();
  const binary = globalThis.atob(trimmed);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function estimatePageResultBytes(page: PageResult): number {
  let size = 0;
  if (page.pageImage?.kind === 'blob') size += page.pageImage.blob.size;
  if (page.pageImage?.kind === 'data-url') size += new TextEncoder().encode(page.pageImage.dataUrl).length;
  if (page.text) size += new TextEncoder().encode(JSON.stringify(page.text)).length;
  for (const image of page.images ?? []) {
    size += image.size;
    size += new TextEncoder().encode(image.dataUrl).length;
  }
  return size;
}

function createCanvasTracker(): CanvasTracker {
  const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
  if (!widthDescriptor?.get || !widthDescriptor.set || !heightDescriptor?.get || !heightDescriptor.set) {
    throw new Error('Failed to instrument HTMLCanvasElement width/height accessors.');
  }

  let activeCanvases = 0;
  let peakActiveCanvases = 0;
  let sawActive = false;

  const factory = () => {
    const canvas = document.createElement('canvas');
    let trackedActive = false;

    const refresh = () => {
      const active = widthDescriptor.get.call(canvas) > 0 && heightDescriptor.get.call(canvas) > 0;
      if (active === trackedActive) return;
      trackedActive = active;
      activeCanvases += active ? 1 : -1;
      peakActiveCanvases = Math.max(peakActiveCanvases, activeCanvases);
      if (active) sawActive = true;
    };

    Object.defineProperty(canvas, 'width', {
      configurable: true,
      enumerable: true,
      get() {
        return widthDescriptor.get.call(canvas);
      },
      set(value) {
        widthDescriptor.set.call(canvas, value);
        refresh();
      },
    });

    Object.defineProperty(canvas, 'height', {
      configurable: true,
      enumerable: true,
      get() {
        return heightDescriptor.get.call(canvas);
      },
      set(value) {
        heightDescriptor.set.call(canvas, value);
        refresh();
      },
    });

    return canvas;
  };

  return {
    factory,
    getPeakActiveCanvases: () => peakActiveCanvases,
    sawActiveCanvas: () => sawActive,
  };
}

function createImageAccounting(): ImageAccounting {
  let allocCount = 0;
  let encodeCount = 0;
  let active = 0;
  let peak = 0;
  const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height');
  return {
    factory: () => {
      allocCount += 1;
      const canvas = document.createElement('canvas');
      if (!widthDescriptor?.get || !widthDescriptor.set || !heightDescriptor?.get || !heightDescriptor.set) {
        const toDataURL = canvas.toDataURL.bind(canvas);
        canvas.toDataURL = (...args) => {
          encodeCount += 1;
          return toDataURL(...args);
        };
        return canvas;
      }
      let trackedActive = false;
      const refresh = () => {
        const isActive = widthDescriptor.get.call(canvas) > 0 && heightDescriptor.get.call(canvas) > 0;
        if (isActive === trackedActive) return;
        trackedActive = isActive;
        active += isActive ? 1 : -1;
        peak = Math.max(peak, active);
      };
      Object.defineProperty(canvas, 'width', {
        configurable: true,
        enumerable: true,
        get() {
          return widthDescriptor.get.call(canvas);
        },
        set(value) {
          widthDescriptor.set.call(canvas, value);
          refresh();
        },
      });
      Object.defineProperty(canvas, 'height', {
        configurable: true,
        enumerable: true,
        get() {
          return heightDescriptor.get.call(canvas);
        },
        set(value) {
          heightDescriptor.set.call(canvas, value);
          refresh();
        },
      });
      const toDataURL = canvas.toDataURL.bind(canvas);
      canvas.toDataURL = (...args) => {
        encodeCount += 1;
        return toDataURL(...args);
      };
      return canvas;
    },
    getAllocCount: () => allocCount,
    getEncodeCount: () => encodeCount,
    getPeakActive: () => peak,
  };
}

async function countPageImageOperators(documentProxy: PDFDocumentProxy, pageNumber: number) {
  const page = await documentProxy.getPage(pageNumber);
  try {
    const operators = await page.getOperatorList();
    const xobjectRefs = operators.argsArray
      .filter((_, index) => {
        const operation = operators.fnArray[index];
        return operation === OPS.paintImageXObject || operation === OPS.paintXObject;
      })
      .map((args) => (Array.isArray(args) ? args[0] : undefined))
      .filter((value): value is string => typeof value === 'string');
    const inlineCount = operators.fnArray.filter((operation) => operation === OPS.paintInlineImageXObject).length;
    return {
      inlineCount,
      xobjectPaintCount: xobjectRefs.length,
      uniqueXobjectCount: new Set(xobjectRefs).size,
    };
  } finally {
    page.cleanup();
  }
}

/**
 * Global simultaneous page tracker shared across all loaded documents in one
 * measurement. Patching every document proxy into one shared active/peak
 * counter measures true overlap; summing per-document peaks would overstate
 * simultaneity when peaks occur at different times.
 */
function createGlobalPageTracker() {
  let activePages = 0;
  let peakActivePages = 0;
  let sawActivePage = false;
  const restores: Array<() => void> = [];

  const instrument = (documentProxy: PDFDocumentProxy): void => {
    const target = documentProxy as PDFDocumentProxy & {
      getPage(pageNumber: number): Promise<{ cleanup(): void }>;
    };
    const originalGetPage = target.getPage.bind(target);
    target.getPage = (async (pageNumber: number) => {
      const page = await originalGetPage(pageNumber);
      activePages += 1;
      sawActivePage = true;
      peakActivePages = Math.max(peakActivePages, activePages);
      const originalCleanup = page.cleanup.bind(page);
      let cleaned = false;
      page.cleanup = () => {
        if (!cleaned) {
          cleaned = true;
          activePages -= 1;
        }
        return originalCleanup();
      };
      return page;
    }) as typeof target.getPage;
    restores.push(() => {
      target.getPage = originalGetPage;
    });
  };

  return {
    instrument,
    getPeakActivePages: () => peakActivePages,
    sawActivePage: () => sawActivePage,
    restore: () => {
      for (const restore of restores.splice(0)) restore();
    },
  };
}

async function withLongTaskObserver<T>(run: () => Promise<T>): Promise<{ value: T; summary: LongTaskSummary }> {
  const supported =
    typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask');
  if (!supported) {
    return {
      value: await run(),
      summary: { supported: false, count: 0, totalDurationMs: 0, maxDurationMs: 0 },
    };
  }

  const entries: PerformanceEntry[] = [];
  const observer = new PerformanceObserver((list) => {
    entries.push(...list.getEntries());
  });
  observer.observe({ entryTypes: ['longtask'] });
  try {
    const value = await run();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return {
      value,
      summary: {
        supported: true,
        count: entries.length,
        totalDurationMs: Number(entries.reduce((total, entry) => total + entry.duration, 0).toFixed(2)),
        maxDurationMs: Number(entries.reduce((max, entry) => Math.max(max, entry.duration), 0).toFixed(2)),
      },
    };
  } finally {
    observer.disconnect();
  }
}

async function runSerialPages(
  reader: InstanceType<typeof PDFReader>,
  fixture: FixtureSpec,
): Promise<
  Pick<RunMetrics, 'peakRetainedOutputBytes' | 'outputOrder' | 'peakRetainedPages' | 'wallTimeMs' | 'convertWallTimeMs'>
> {
  const outputOrder: number[] = [];
  let peakRetainedOutputBytes = 0;
  const start = performance.now();
  for await (const page of reader.pages({
    includeText: true,
    includePageImage: true,
    includeEmbeddedImages: false,
    pageImageOutput: 'blob',
    viewportScale: fixture.viewportScale,
  })) {
    outputOrder.push(page.pageNumber);
    peakRetainedOutputBytes = Math.max(peakRetainedOutputBytes, estimatePageResultBytes(page));
  }
  const wallTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    wallTimeMs,
    convertWallTimeMs: wallTimeMs,
    peakRetainedOutputBytes,
    peakRetainedPages: 1,
    outputOrder,
  };
}

interface BoundedRunOptions {
  /** Test-only consumer backpressure: delay each emission drain. Real runs use 0. */
  emitDelayMs?: number;
  /** Test-only per-page convert override (slow-first-page simulation). */
  convertPage?: (pageNumber: number) => Promise<PageResult>;
}

/**
 * Bounded external scheduler. Retention rule: after every completion the
 * emittable prefix is drained synchronously and the post-drain retained set
 * (completed-but-unemittable pages) is measured. Workers block in
 * waitForSlot() while post-drain retention is at the window, so a stalled
 * first page cannot retain more than REORDER_WINDOW_PAGES pages no matter how
 * long the document is. Output order is deterministic (page-number order).
 */
async function runBoundedStrategy(
  readers: readonly InstanceType<typeof PDFReader>[],
  fixture: FixtureSpec,
  options: BoundedRunOptions = {},
): Promise<
  Pick<RunMetrics, 'peakRetainedOutputBytes' | 'outputOrder' | 'peakRetainedPages' | 'wallTimeMs' | 'convertWallTimeMs'>
> {
  const pageNumbers = Array.from({ length: readers[0]?.numPages ?? 0 }, (_, index) => index + 1);
  const completed = new Map<number, PageResult>();
  const outputOrder: number[] = [];
  let nextPageIndex = 0;
  let nextToEmit = 0;
  let retainedOutputBytes = 0;
  let peakRetainedOutputBytes = 0;
  let peakRetainedPages = 0;
  let slotWaiters: Array<() => void> = [];
  const emitDelayMs = options.emitDelayMs ?? 0;

  const notifySlotFreed = () => {
    const waiters = slotWaiters;
    slotWaiters = [];
    for (const resolve of waiters) resolve();
  };

  const drainEmittable = () => {
    while (completed.has(nextToEmit)) {
      const page = completed.get(nextToEmit);
      if (!page) break;
      completed.delete(nextToEmit);
      retainedOutputBytes -= estimatePageResultBytes(page);
      outputOrder.push(page.pageNumber);
      nextToEmit += 1;
    }
    peakRetainedPages = Math.max(peakRetainedPages, completed.size);
    if (completed.size < REORDER_WINDOW_PAGES) notifySlotFreed();
  };

  const waitForSlot = async (): Promise<void> => {
    while (completed.size >= REORDER_WINDOW_PAGES) {
      await new Promise<void>((resolve) => {
        slotWaiters.push(resolve);
      });
    }
  };

  const defaultConvert = async (reader: InstanceType<typeof PDFReader>, pageNumber: number): Promise<PageResult> => {
    const [page] = await reader.convert({
      pageRange: pageNumber,
      includeText: true,
      includePageImage: true,
      includeEmbeddedImages: false,
      pageImageOutput: 'blob',
      viewportScale: fixture.viewportScale,
    });
    if (!page) throw new Error(`Expected page result for page ${pageNumber}.`);
    return page;
  };

  const worker = async (reader: InstanceType<typeof PDFReader>) => {
    for (;;) {
      await waitForSlot();
      if (nextPageIndex >= pageNumbers.length) return;
      const pageIndex = nextPageIndex;
      nextPageIndex += 1;
      const pageNumber = pageNumbers[pageIndex];
      if (pageNumber === undefined) return;
      const page = options.convertPage
        ? await options.convertPage(pageNumber)
        : await defaultConvert(reader, pageNumber);
      completed.set(pageIndex, page);
      retainedOutputBytes += estimatePageResultBytes(page);
      peakRetainedOutputBytes = Math.max(peakRetainedOutputBytes, retainedOutputBytes);
      if (emitDelayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, emitDelayMs));
      }
      drainEmittable();
    }
  };

  const start = performance.now();
  const workers = readers.slice(0, pageNumbers.length).map((reader) => worker(reader));
  const settled = await Promise.allSettled(workers);
  notifySlotFreed();
  const rejected = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  // A stalled head page must not leave unemitted tail pages behind.
  if (completed.size > 0 || nextToEmit !== pageNumbers.length) {
    throw new Error(
      `Bounded scheduler left ${completed.size} retained pages unemitted (window ${REORDER_WINDOW_PAGES}).`,
    );
  }
  const wallTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    wallTimeMs,
    convertWallTimeMs: wallTimeMs,
    peakRetainedOutputBytes,
    peakRetainedPages,
    outputOrder,
  };
}

async function measureStrategy(
  strategy: StrategyName,
  fixture: FixtureSpec,
  repeatIndex: number,
): Promise<StrategyResult> {
  const canvasTracker = createCanvasTracker();
  const pageTracker = createGlobalPageTracker();
  const readerCount = strategy === 'serial-pages' ? 1 : CONCURRENCY;
  const workerSetup = `app-global pdf.worker URL configured once; ${readerCount} loaded PDFReader document(s) sharing that setup`;
  const loadStart = performance.now();
  const readers = Array.from(
    { length: readerCount },
    () => new PDFReader(decodeFixture(fixture.base64), { canvasFactory: canvasTracker.factory }),
  );
  configurePdfWorker(workerUrl);

  try {
    const documentProxies = await Promise.all(readers.map((reader) => reader.load()));
    const loadWallTimeMs = Number((performance.now() - loadStart).toFixed(2));
    for (const documentProxy of documentProxies) pageTracker.instrument(documentProxy);
    try {
      const measured = await withLongTaskObserver(async () => {
        const reader = readers[0];
        if (!reader) throw new Error('Expected at least one benchmark reader.');
        if (strategy === 'serial-pages') return await runSerialPages(reader, fixture);
        return await runBoundedStrategy(readers, fixture);
      });

      const convertWallTimeMs = measured.value.wallTimeMs;
      return {
        strategy,
        repeatIndex,
        wallTimeMs: convertWallTimeMs,
        loadWallTimeMs,
        convertWallTimeMs,
        totalWallTimeMs: Number((loadWallTimeMs + convertWallTimeMs).toFixed(2)),
        peakRetainedOutputBytes: measured.value.peakRetainedOutputBytes,
        peakRetainedPages: measured.value.peakRetainedPages,
        reorderWindowPages: strategy === 'serial-pages' ? 1 : REORDER_WINDOW_PAGES,
        outputOrder: measured.value.outputOrder,
        peakActivePages: pageTracker.getPeakActivePages(),
        peakActiveCanvases: canvasTracker.getPeakActiveCanvases(),
        longTasks: measured.summary,
        loadedReaderCount: readerCount,
        workerSetup,
      };
    } finally {
      pageTracker.restore();
    }
  } finally {
    await Promise.all(readers.map((reader) => reader.destroy()));
  }
}

async function waitForActiveStage(
  sawStage: () => boolean,
  timeoutMs: number,
): Promise<{ reached: boolean; detail: string }> {
  const start = performance.now();
  for (;;) {
    if (sawStage()) {
      return {
        reached: true,
        detail: `active page/canvas stage observed after ${Number((performance.now() - start).toFixed(1))} ms`,
      };
    }
    if (performance.now() - start >= timeoutMs) {
      return {
        reached: false,
        detail: `no active page/canvas stage observed within ${timeoutMs} ms (work may have finished before observation or never started)`,
      };
    }
    await new Promise<void>((resolve) => setTimeout(resolve, ABORT_STAGE_POLL_MS));
  }
}

async function measureAbortLatency(strategy: StrategyName, fixture: FixtureSpec): Promise<AbortResult> {
  const canvasTracker = createCanvasTracker();
  const pageTracker = createGlobalPageTracker();
  const readerCount = strategy === 'serial-pages' ? 1 : CONCURRENCY;
  const readers = Array.from(
    { length: readerCount },
    () => new PDFReader(decodeFixture(fixture.base64), { canvasFactory: canvasTracker.factory }),
  );
  configurePdfWorker(workerUrl);

  try {
    const documentProxies = await Promise.all(readers.map((reader) => reader.load()));
    for (const documentProxy of documentProxies) pageTracker.instrument(documentProxy);
    try {
      const reader = readers[0];
      if (!reader) throw new Error('Expected at least one benchmark reader.');
      const controller = new AbortController();
      const sawStage = () => pageTracker.sawActivePage() || canvasTracker.sawActiveCanvas();
      const iterate =
        strategy === 'serial-pages'
          ? (async () => {
              for await (const page of reader.pages({
                includeText: true,
                includePageImage: true,
                pageImageOutput: 'blob',
                viewportScale: 4,
                signal: controller.signal,
              })) {
                void page;
              }
            })()
          : runAbortableBoundedStrategy(readers, controller.signal);

      const stage = await waitForActiveStage(sawStage, ABORT_STAGE_TIMEOUT_MS);
      const abortStart = performance.now();
      controller.abort();
      const error = await iterate.then(
        () => undefined,
        (reason) => reason,
      );
      return {
        strategy,
        abortLatencyMs: Number((performance.now() - abortStart).toFixed(2)),
        code:
          typeof error === 'object' && error && 'code' in error
            ? String((error as { code?: unknown }).code)
            : undefined,
        stageReached: stage.reached,
        stageDetail: stage.detail,
      };
    } finally {
      pageTracker.restore();
    }
  } finally {
    await Promise.all(readers.map((reader) => reader.destroy()));
  }
}

async function runAbortableBoundedStrategy(
  readers: readonly InstanceType<typeof PDFReader>[],
  signal: AbortSignal,
): Promise<void> {
  const pageNumbers = Array.from({ length: readers[0]?.numPages ?? 0 }, (_, index) => index + 1);
  let nextPageIndex = 0;

  const worker = async (reader: InstanceType<typeof PDFReader>) => {
    while (nextPageIndex < pageNumbers.length) {
      if (signal.aborted) return;
      const pageNumber = pageNumbers[nextPageIndex];
      nextPageIndex += 1;
      if (pageNumber === undefined) return;
      await reader.convert({
        pageRange: pageNumber,
        includeText: true,
        includePageImage: true,
        includeEmbeddedImages: false,
        pageImageOutput: 'blob',
        viewportScale: 4,
        signal,
      });
    }
  };

  const settled = await Promise.allSettled(readers.map((reader) => worker(reader)));
  const rejected = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  if (signal.aborted) throw new pkg.PdfReaderError('ABORTED', 'PDF operation was aborted.');
}

function summarizeRepeats(repeats: StrategyResult[]) {
  const walls = repeats.map((repeat) => repeat.convertWallTimeMs).sort((a, b) => a - b);
  const min = walls[0] ?? 0;
  const max = walls[walls.length - 1] ?? 0;
  const median = walls[Math.floor(walls.length / 2)] ?? 0;
  return { min, median, max, samples: walls };
}

describe('PDFR3-10 scheduler and tracker checks', () => {
  it('bounds retained pages when the first page stalls, regardless of document length', async () => {
    const pageCount = 12;
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const fakeReaders = [{ numPages: pageCount }, { numPages: pageCount }] as unknown as readonly InstanceType<
      typeof PDFReader
    >[];
    const convertPage = async (pageNumber: number): Promise<PageResult> => {
      if (pageNumber === 1) await gate;
      return { pageNumber, pageIndex: pageNumber - 1, numPages: pageCount, images: [] } as unknown as PageResult;
    };
    const run = runBoundedStrategy(fakeReaders, { name: 'synthetic', base64: '', viewportScale: 1 }, { convertPage });
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    releaseFirst();
    const result = await run;
    expect(result.outputOrder).toEqual(Array.from({ length: pageCount }, (_, index) => index + 1));
    expect(result.peakRetainedPages).toBeLessThanOrEqual(REORDER_WINDOW_PAGES);
  });

  it('bounds retained pages under slow-consumer backpressure with deterministic order', async () => {
    const pageCount = 8;
    const fakeReaders = [{ numPages: pageCount }, { numPages: pageCount }] as unknown as readonly InstanceType<
      typeof PDFReader
    >[];
    const convertPage = async (pageNumber: number): Promise<PageResult> =>
      ({ pageNumber, pageIndex: pageNumber - 1, numPages: pageCount, images: [] }) as unknown as PageResult;
    const result = await runBoundedStrategy(
      fakeReaders,
      { name: 'synthetic', base64: '', viewportScale: 1 },
      { convertPage, emitDelayMs: 20 },
    );
    expect(result.outputOrder).toEqual(Array.from({ length: pageCount }, (_, index) => index + 1));
    expect(result.peakRetainedPages).toBeLessThanOrEqual(REORDER_WINDOW_PAGES);
  });

  it('measures simultaneous overlap globally instead of summing per-document peaks', async () => {
    const tracker = createGlobalPageTracker();
    const makeProxy = () => {
      let live = 0;
      const proxy = {
        live: 0,
        async getPage() {
          live += 1;
          proxy.live = live;
          return {
            cleanup() {
              live -= 1;
              proxy.live = live;
            },
          };
        },
      } as unknown as PDFDocumentProxy & { live: number };
      return proxy;
    };
    // Deliberate overlap: hold two pages open at once across documents.
    const first = makeProxy();
    const second = makeProxy();
    tracker.instrument(first);
    tracker.instrument(second);
    const firstPage = await first.getPage(1);
    const secondPage = await second.getPage(1);
    expect(tracker.getPeakActivePages()).toBe(2);
    firstPage.cleanup();
    secondPage.cleanup();
    tracker.restore();

    // Deliberate non-overlap: sequential acquire/release peaks at 1.
    const sequential = createGlobalPageTracker();
    const third = makeProxy();
    sequential.instrument(third);
    const one = await third.getPage(1);
    one.cleanup();
    const two = await third.getPage(2);
    two.cleanup();
    expect(sequential.getPeakActivePages()).toBe(1);
    sequential.restore();
  });
});

describe('PDFR-07 benchmark matrix', () => {
  it('records serial versus bounded page-concurrency measurements without changing the public API', async () => {
    const measurementOrder: string[] = [];
    const summary = {
      benchmark: 'PDFR3-10',
      pdfjsPeerRange: '~6.2.108',
      concurrency: CONCURRENCY,
      reorderWindowPages: REORDER_WINDOW_PAGES,
      warmupRuns: WARMUP_RUNS,
      measuredRepeats: MEASURED_REPEATS,
      // Resource ownership: peakActivePages counts PDF.js-internal page proxies
      // (released via page.cleanup()); peakActiveCanvases counts
      // package-owned canvases (canvasFactory); peakRetained* counts
      // package-retained PageResult output. Exclusions: PDF.js worker heap,
      // decoded PDF structures, and browser compositor memory are not
      // instrumented by this benchmark.
      resourceOwnership: {
        peakActivePages: 'PDF.js-internal page proxies shared across all loaded documents (global simultaneous peak)',
        peakActiveCanvases: 'package-owned canvases with nonzero dimensions',
        peakRetainedPages: 'package-retained completed-but-unemittable PageResults (bounded by reorderWindowPages)',
        peakRetainedOutputBytes: 'package-retained PageResult bytes estimate (blob size + data-url/text JSON bytes)',
        excluded: 'PDF.js worker heap, parsed-document structures, compositor/GPU memory',
      },
      browser: {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory:
          'deviceMemory' in navigator ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined,
      },
      fixtures: [] as Array<{
        name: string;
        viewportScale: number;
        serialRepeats: StrategyResult[];
        boundedRepeats: StrategyResult[];
        serialStats: { min: number; median: number; max: number; samples: number[] };
        boundedStats: { min: number; median: number; max: number; samples: number[] };
      }>,
      abortLatency: [] as AbortResult[],
      measurementOrder,
    };

    for (const fixture of fixtures) {
      // Warmup (unrecorded) to stabilize JIT/worker state before repeats.
      for (let warmup = 0; warmup < WARMUP_RUNS; warmup += 1) {
        await measureStrategy('serial-pages', fixture, -1);
        await measureStrategy('bounded-concurrency-2', fixture, -1);
      }
      const serialRepeats: StrategyResult[] = [];
      const boundedRepeats: StrategyResult[] = [];
      for (let repeat = 0; repeat < MEASURED_REPEATS; repeat += 1) {
        measurementOrder.push(`${fixture.name}/serial-pages/repeat-${repeat}`);
        serialRepeats.push(await measureStrategy('serial-pages', fixture, repeat));
        measurementOrder.push(`${fixture.name}/bounded-concurrency-2/repeat-${repeat}`);
        boundedRepeats.push(await measureStrategy('bounded-concurrency-2', fixture, repeat));
      }
      summary.fixtures.push({
        name: fixture.name,
        viewportScale: fixture.viewportScale,
        serialRepeats,
        boundedRepeats,
        serialStats: summarizeRepeats(serialRepeats),
        boundedStats: summarizeRepeats(boundedRepeats),
      });
    }

    const abortFixture = fixtures[3];
    if (!abortFixture) throw new Error('Expected image-heavy abort fixture.');
    summary.abortLatency.push(await measureAbortLatency('serial-pages', abortFixture));
    summary.abortLatency.push(await measureAbortLatency('bounded-concurrency-2', abortFixture));

    for (const fixture of summary.fixtures) {
      for (const repeat of [...fixture.serialRepeats, ...fixture.boundedRepeats]) {
        expect(repeat.outputOrder).toEqual(Array.from({ length: repeat.outputOrder.length }, (_, index) => index + 1));
      }
      // Cross-strategy determinism per repeat index.
      for (let repeat = 0; repeat < MEASURED_REPEATS; repeat += 1) {
        expect(fixture.boundedRepeats[repeat]?.outputOrder).toEqual(fixture.serialRepeats[repeat]?.outputOrder);
      }
      for (const repeat of fixture.boundedRepeats) {
        expect(repeat.peakActivePages).toBeLessThanOrEqual(CONCURRENCY);
        expect(repeat.peakActiveCanvases).toBeLessThanOrEqual(CONCURRENCY);
        expect(repeat.peakRetainedPages).toBeLessThanOrEqual(REORDER_WINDOW_PAGES);
        expect(repeat.reorderWindowPages).toBe(REORDER_WINDOW_PAGES);
        expect(repeat.loadedReaderCount).toBe(CONCURRENCY);
      }
      for (const repeat of fixture.serialRepeats) {
        expect(repeat.peakActivePages).toBeLessThanOrEqual(1);
        expect(repeat.loadedReaderCount).toBe(1);
      }
    }

    expect(summary.abortLatency.map((entry) => entry.code)).toEqual(['ABORTED', 'ABORTED']);

    console.info(`PDFR-07 benchmark summary ${JSON.stringify(summary)}`);
  }, 300_000);
});

describe('PDFR2-06 embedded-image extraction benchmark', () => {
  it('records unique and repeated image workloads with encode/scratch/output accounting', async () => {
    const browser = {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory:
        'deviceMemory' in navigator ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined,
    };
    const workloads = [
      {
        name: 'embedded-images.pdf page 1 (mixed unique: 1 inline + 5 XObject paints, 2 unique XObjects)',
        base64: embeddedImagesB64,
        pageRange: 1 as const,
        viewportScale: undefined as number | undefined,
      },
      {
        name: 'image-heavy.pdf page 1 (repeated raster: one 96x96 DeviceRGB XObject, 6 placements)',
        base64: imageHeavyB64,
        pageRange: 1 as const,
        viewportScale: 2 as const,
      },
    ];

    const results: Array<{
      workload: string;
      operatorCounts: { inlineCount: number; xobjectPaintCount: number; uniqueXobjectCount: number };
      repeats: Array<{
        wallTimeMs: number;
        imageCount: number;
        encodeCount: number;
        scratchAllocCount: number;
        scratchPeakActive: number;
        retainedOutputBytes: number;
      }>;
      longTasks: LongTaskSummary;
    }> = [];

    for (const workload of workloads) {
      const probe = new PDFReader(decodeFixture(workload.base64), {});
      configurePdfWorker(workerUrl);
      let operatorCounts = { inlineCount: 0, xobjectPaintCount: 0, uniqueXobjectCount: 0 };
      try {
        const documentProxy = await probe.load();
        try {
          operatorCounts = await countPageImageOperators(documentProxy, workload.pageRange);
        } finally {
          await probe.destroy();
        }
      } catch {
        await probe.destroy();
      }

      const repeats: Array<{
        wallTimeMs: number;
        imageCount: number;
        encodeCount: number;
        scratchAllocCount: number;
        scratchPeakActive: number;
        retainedOutputBytes: number;
      }> = [];
      let lastLongTasks: LongTaskSummary = { supported: false, count: 0, totalDurationMs: 0, maxDurationMs: 0 };
      for (let repeat = 0; repeat < MEASURED_REPEATS; repeat += 1) {
        const accounting = createImageAccounting();
        const reader = new PDFReader(decodeFixture(workload.base64), { canvasFactory: accounting.factory });
        configurePdfWorker(workerUrl);
        try {
          await reader.load();
          const measured = await withLongTaskObserver(async () => {
            const start = performance.now();
            const [page] = await reader.convert({
              pageRange: workload.pageRange,
              includeText: false,
              includePageImage: false,
              includeEmbeddedImages: true,
            });
            if (!page) throw new Error(`Expected page ${workload.pageRange} result.`);
            return {
              wallTimeMs: Number((performance.now() - start).toFixed(2)),
              imageCount: page.images.length,
              encodeCount: accounting.getEncodeCount(),
              scratchAllocCount: accounting.getAllocCount(),
              scratchPeakActive: accounting.getPeakActive(),
              retainedOutputBytes: estimatePageResultBytes(page),
            };
          });
          repeats.push(measured.value);
          lastLongTasks = measured.summary;
        } finally {
          await reader.destroy();
        }
      }
      results.push({ workload: workload.name, operatorCounts, repeats, longTasks: lastLongTasks });
    }

    const summary = {
      benchmark: 'PDFR3-10 image workloads',
      pdfjsPeerRange: '~6.2.108',
      browser,
      // Budgets: each workload stays within small-fixture limits (<= 12
      // scratch canvases, <= 25 MB retained output estimate, wall clock
      // reported per repeat with long-task observation).
      budgets: { maxScratchCanvases: 12, maxRetainedOutputBytes: 25_000_000 },
      workloads: results,
    };

    const mixed = results[0];
    if (!mixed) throw new Error('Expected mixed-unique workload result.');
    expect(mixed.operatorCounts).toEqual({ inlineCount: 1, xobjectPaintCount: 5, uniqueXobjectCount: 2 });
    for (const repeat of mixed.repeats) {
      expect(repeat.imageCount).toBe(6);
      expect(repeat.encodeCount).toBe(3);
      expect(repeat.scratchAllocCount).toBeLessThanOrEqual(summary.budgets.maxScratchCanvases);
      expect(repeat.retainedOutputBytes).toBeLessThanOrEqual(summary.budgets.maxRetainedOutputBytes);
    }
    const repeated = results[1];
    if (!repeated) throw new Error('Expected repeated-raster workload result.');
    expect(repeated.operatorCounts).toEqual({ inlineCount: 0, xobjectPaintCount: 6, uniqueXobjectCount: 1 });
    for (const repeat of repeated.repeats) {
      expect(repeat.imageCount).toBe(6);
      expect(repeat.encodeCount).toBeGreaterThanOrEqual(1);
      expect(repeat.encodeCount).toBeLessThanOrEqual(6);
      expect(repeat.scratchAllocCount).toBeLessThanOrEqual(summary.budgets.maxScratchCanvases);
      expect(repeat.retainedOutputBytes).toBeLessThanOrEqual(summary.budgets.maxRetainedOutputBytes);
    }
    console.info(`PDFR2-06 embedded-image benchmark summary ${JSON.stringify(summary)}`);
  }, 180_000);
});
