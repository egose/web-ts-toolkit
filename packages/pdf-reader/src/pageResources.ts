import type { PDFPageProxy } from 'pdfjs-dist';

/** Private ownership of one PDF.js page-cache slot, including unresolved getPage calls. */
class PageLifetime {
  #owners = 0;
  #closed = false;
  readonly #pages = new Set<PDFPageProxy>();
  readonly #cleanedAfterClose = new WeakSet<PDFPageProxy>();

  constructor(private readonly onIdle: () => void) {}

  retain(): () => void {
    this.#owners += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#owners -= 1;
      if (this.#owners === 0 && !this.#closed) {
        this.onIdle();
        this.close();
      }
    };
  }

  /** Observe the original promise, not the caller's cancellation race. */
  track<T>(pending: Promise<T>, accept?: (value: T) => void): Promise<T> {
    const release = this.retain();
    pending
      .then((value) => {
        try {
          accept?.(value);
        } finally {
          release();
        }
      }, release)
      .catch(() => undefined);
    return pending;
  }

  acquire(start: () => Promise<PDFPageProxy>): Promise<PDFPageProxy> {
    // The processing owner is already retained before invoking getPage, so
    // synchronous abort/destroy cannot leave a gap in acquisition ownership.
    return this.track(start(), (page) => {
      if (this.#closed) this.#cleanup(page);
      else this.#pages.add(page);
    });
  }

  close(): void {
    this.#closed = true;
    for (const page of this.#pages) this.#cleanup(page);
    this.#pages.clear();
  }

  #cleanup(page: PDFPageProxy): void {
    if (this.#cleanedAfterClose.has(page)) return;
    this.#cleanedAfterClose.add(page);
    try {
      page.cleanup();
    } catch {
      // Cleanup is best-effort, including late fulfillment after teardown.
      // Never replace a native PDF.js stage failure or a lifecycle outcome.
    }
  }
}

/**
 * PDF.js caches getPage promises/proxies by page number. Reserve that cache
 * slot BEFORE acquisition: proxy-only refcounts miss a retry still in getPage.
 * Each lease holds processing plus each uncancelled acquisition/stage promise.
 * Calling cleanup even when it returns false is unsafe while these are live:
 * PDF.js records pending cleanup and may clear objs at the last operator chunk.
 * Render-promise rejection is not a stream-idle boundary: PDFReader closes the
 * reader through public teardown on interrupted renders instead of reusing it.
 */
export class PageResources {
  readonly #pages = new Map<number, PageLifetime>();

  acquire(pageNumber: number) {
    let lifetime = this.#pages.get(pageNumber);
    if (!lifetime) {
      lifetime = new PageLifetime(() => this.#pages.delete(pageNumber));
      this.#pages.set(pageNumber, lifetime);
    }
    const release = lifetime.retain();
    return {
      acquire: (start: () => Promise<PDFPageProxy>) => lifetime.acquire(start),
      track: <T>(pending: Promise<T>) => lifetime.track(pending),
      release,
    };
  }

  /** Document destruction is authoritative; do not await orphaned promises. */
  destroy(): void {
    for (const lifetime of this.#pages.values()) lifetime.close();
    this.#pages.clear();
  }
}

export type PageLease = ReturnType<PageResources['acquire']>;
