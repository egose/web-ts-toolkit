import { describe, expect, it } from 'vitest';

import * as pkg from '../dist/index.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import shortB64 from './generated/short.pdf.base64.txt?raw';
import longB64 from './generated/long.pdf.base64.txt?raw';
import textHeavyB64 from './generated/text-heavy.pdf.base64.txt?raw';
import imageHeavyB64 from './generated/image-heavy.pdf.base64.txt?raw';

import type { PageResult } from '../src';

const PDFReader = pkg.PDFReader as typeof import('../src').PDFReader;
const configurePdfWorker = pkg.configurePdfWorker as typeof import('../src').configurePdfWorker;

type StrategyName = 'serial-pages' | 'bounded-concurrency-2';

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
  wallTimeMs: number;
  peakActivePages: number;
  peakActiveCanvases: number;
  peakRetainedOutputBytes: number;
  outputOrder: number[];
  longTasks: LongTaskSummary;
}

interface StrategyResult extends RunMetrics {
  strategy: StrategyName;
}

interface AbortResult {
  strategy: StrategyName;
  abortLatencyMs: number;
  code: string | undefined;
}

interface CanvasTracker {
  factory: () => HTMLCanvasElement;
  getPeakActiveCanvases: () => number;
}

interface PageTracker {
  getPeakActivePages: () => number;
  restore: () => void;
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
  for (const image of page.images) {
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

  const factory = () => {
    const canvas = document.createElement('canvas');
    let trackedActive = false;

    const refresh = () => {
      const active = widthDescriptor.get.call(canvas) > 0 && heightDescriptor.get.call(canvas) > 0;
      if (active === trackedActive) return;
      trackedActive = active;
      activeCanvases += active ? 1 : -1;
      peakActiveCanvases = Math.max(peakActiveCanvases, activeCanvases);
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
  };
}

function instrumentDocumentPages(documentProxy: PDFDocumentProxy): PageTracker {
  const target = documentProxy as PDFDocumentProxy & {
    getPage(pageNumber: number): Promise<{ cleanup(): void }>;
  };
  const originalGetPage = target.getPage.bind(target);
  let activePages = 0;
  let peakActivePages = 0;

  target.getPage = async (pageNumber: number) => {
    const page = await originalGetPage(pageNumber);
    activePages += 1;
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
  };

  return {
    getPeakActivePages: () => peakActivePages,
    restore: () => {
      target.getPage = originalGetPage;
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
): Promise<Omit<RunMetrics, 'peakActivePages' | 'peakActiveCanvases' | 'longTasks'>> {
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
  return {
    wallTimeMs: Number((performance.now() - start).toFixed(2)),
    peakRetainedOutputBytes,
    outputOrder,
  };
}

async function runBoundedStrategy(
  reader: InstanceType<typeof PDFReader>,
  fixture: FixtureSpec,
  concurrency: number,
): Promise<Omit<RunMetrics, 'peakActivePages' | 'peakActiveCanvases' | 'longTasks'>> {
  const pageNumbers = Array.from({ length: reader.numPages ?? 0 }, (_, index) => index + 1);
  const completed = new Map<number, PageResult>();
  const outputOrder: number[] = [];
  let nextPageIndex = 0;
  let nextToEmit = 0;
  let retainedOutputBytes = 0;
  let peakRetainedOutputBytes = 0;
  let emitChain = Promise.resolve();

  const flushCompleted = () => {
    emitChain = emitChain.then(async () => {
      while (completed.has(nextToEmit)) {
        const page = completed.get(nextToEmit);
        if (!page) break;
        completed.delete(nextToEmit);
        retainedOutputBytes -= estimatePageResultBytes(page);
        outputOrder.push(page.pageNumber);
        nextToEmit += 1;
      }
    });
    return emitChain;
  };

  const worker = async () => {
    while (nextPageIndex < pageNumbers.length) {
      const pageIndex = nextPageIndex;
      nextPageIndex += 1;
      const pageNumber = pageNumbers[pageIndex];
      if (pageNumber === undefined) return;
      const [page] = await reader.convert({
        pageRange: pageNumber,
        includeText: true,
        includePageImage: true,
        includeEmbeddedImages: false,
        pageImageOutput: 'blob',
        viewportScale: fixture.viewportScale,
      });
      if (!page) throw new Error(`Expected page result for page ${pageNumber}.`);
      completed.set(pageIndex, page);
      retainedOutputBytes += estimatePageResultBytes(page);
      peakRetainedOutputBytes = Math.max(peakRetainedOutputBytes, retainedOutputBytes);
      await flushCompleted();
    }
  };

  const start = performance.now();
  const workers = Array.from({ length: Math.min(concurrency, pageNumbers.length) }, () => worker());
  const settled = await Promise.allSettled(workers);
  await emitChain;
  const rejected = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  return {
    wallTimeMs: Number((performance.now() - start).toFixed(2)),
    peakRetainedOutputBytes,
    outputOrder,
  };
}

async function measureStrategy(strategy: StrategyName, fixture: FixtureSpec): Promise<StrategyResult> {
  const canvasTracker = createCanvasTracker();
  const reader = new PDFReader(decodeFixture(fixture.base64), { canvasFactory: canvasTracker.factory });
  configurePdfWorker(workerUrl);

  try {
    const documentProxy = await reader.load();
    const pageTracker = instrumentDocumentPages(documentProxy);
    try {
      const measured = await withLongTaskObserver(async () => {
        if (strategy === 'serial-pages') return await runSerialPages(reader, fixture);
        return await runBoundedStrategy(reader, fixture, 2);
      });

      return {
        strategy,
        ...measured.value,
        peakActivePages: pageTracker.getPeakActivePages(),
        peakActiveCanvases: canvasTracker.getPeakActiveCanvases(),
        longTasks: measured.summary,
      };
    } finally {
      pageTracker.restore();
    }
  } finally {
    await reader.destroy();
  }
}

async function measureAbortLatency(strategy: StrategyName, fixture: FixtureSpec): Promise<AbortResult> {
  const canvasTracker = createCanvasTracker();
  const reader = new PDFReader(decodeFixture(fixture.base64), { canvasFactory: canvasTracker.factory });
  configurePdfWorker(workerUrl);

  try {
    await reader.load();
    const controller = new AbortController();
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
        : runAbortableBoundedStrategy(reader, controller.signal);

    await new Promise<void>((resolve) => setTimeout(resolve, 5));
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
        typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : undefined,
    };
  } finally {
    await reader.destroy();
  }
}

async function runAbortableBoundedStrategy(reader: InstanceType<typeof PDFReader>, signal: AbortSignal): Promise<void> {
  const pageNumbers = Array.from({ length: reader.numPages ?? 0 }, (_, index) => index + 1);
  let nextPageIndex = 0;

  const worker = async () => {
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

  const settled = await Promise.allSettled([worker(), worker()]);
  const rejected = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  if (signal.aborted) throw new pkg.PdfReaderError('ABORTED', 'PDF operation was aborted.');
}

describe('PDFR-07 benchmark matrix', () => {
  it('records serial versus bounded page-concurrency measurements without changing the public API', async () => {
    const summary = {
      browser: {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory:
          'deviceMemory' in navigator ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined,
      },
      fixtures: [] as Array<{
        name: string;
        serial: StrategyResult;
        bounded: StrategyResult;
      }>,
      abortLatency: [] as AbortResult[],
    };

    for (const fixture of fixtures) {
      const serial = await measureStrategy('serial-pages', fixture);
      const bounded = await measureStrategy('bounded-concurrency-2', fixture);
      summary.fixtures.push({ name: fixture.name, serial, bounded });
    }

    const abortFixture = fixtures[3];
    if (!abortFixture) throw new Error('Expected image-heavy abort fixture.');
    summary.abortLatency.push(await measureAbortLatency('serial-pages', abortFixture));
    summary.abortLatency.push(await measureAbortLatency('bounded-concurrency-2', abortFixture));

    for (const fixture of summary.fixtures) {
      expect(fixture.serial.outputOrder).toEqual(fixture.bounded.outputOrder);
      expect(fixture.serial.outputOrder).toEqual(
        Array.from({ length: fixture.serial.outputOrder.length }, (_, index) => index + 1),
      );
      expect(fixture.bounded.peakActivePages).toBeLessThanOrEqual(2);
      expect(fixture.bounded.peakActiveCanvases).toBeLessThanOrEqual(2);
    }

    expect(summary.abortLatency.map((entry) => entry.code)).toEqual(['ABORTED', 'ABORTED']);

    console.info(`PDFR-07 benchmark summary ${JSON.stringify(summary)}`);
  }, 180_000);
});
