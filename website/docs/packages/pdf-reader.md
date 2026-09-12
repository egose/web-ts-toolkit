---
sidebar_label: PDF Reader
sidebar_position: 18
---

# `@web-ts-toolkit/pdf-reader`

`@web-ts-toolkit/pdf-reader` wraps PDF.js with explicit worker setup, bounded canvas allocation, cancellation, deterministic cleanup, streaming page results, and best-effort embedded-image extraction.

## Install

```sh
pnpm add @web-ts-toolkit/pdf-reader pdfjs-dist@~6.2.108
```

The package targets browsers, is published as ESM-only, and treats `pdfjs-dist` as a peer dependency. The supported PDF.js compatibility contract is the `pdfjs-dist` `~6.2.108` peer minor, with package and real-browser fixture coverage run against `6.2.108`; future `6.x` minors require a reproducible browser compatibility matrix before they are admitted.

## Migration

Upgrade from the older application-local reader by switching to named imports, explicit `configurePdfWorker(...)`, `page.pageImage` instead of legacy top-level image fields, and the current option names (`includeText`, `includePageImage`, `includeEmbeddedImages`). The package intentionally does not ship compatibility aliases for the old default export, deep imports, `getText`, `getDataURL`, `getImages`, `config`, `dataURL`, or `isPNG` names. Follow-up hardening keeps that API but snapshots effective headers before `sourcePolicy(...)`, rechecks borrowed byte sizes after approval, retries failed loads with a fresh attempt, settles page-stage waits promptly via one shared cancellation contract (underlying PDF.js work stays uncancellable), decodes one-bit images by declared kind, resolves shared images via `commonObjs`, and rejects invalid options/encodes with `INVALID_OPTION`/`UNSUPPORTED_ENVIRONMENT`. Page work stays serial and text/operator limits still apply after PDF.js returns complete structures — no concurrency or streaming-text API change ships in this release.

## Example

```ts
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { configurePdfWorker, PDFReader } from '@web-ts-toolkit/pdf-reader';

configurePdfWorker(workerUrl);

const reader = new PDFReader(new Uint8Array(await file.arrayBuffer()));

try {
  await reader.load({ deadlineMs: 15_000 });
  for await (const page of reader.pages({ imageFormat: 'image/jpeg', pageImageOutput: 'blob' })) {
    console.log(page.pageNumber, page.text, page.pageImage);
  }
} finally {
  await reader.destroy();
}
```

Prefer `pages()` for large documents. Use `convert()` when retaining all page results is acceptable.

Concurrent `load()` callers share one PDF.js loading task, but aborting one caller only rejects that caller. The fulfilled `load()` value is a borrowed PDF.js `PDFDocumentProxy`: inspect it or use supported PDF.js read methods if needed, but do not call `document.destroy()` while the reader owns lifecycle teardown. Call `reader.destroy()` to cancel active renders, tear down a shared in-flight load, and permanently close the reader. External proxy destruction is unsupported and can leave `reader.state` stale until a later PDF.js method fails.

`load()` accepts either an `AbortSignal` or `{ signal, deadlineMs }`. `deadlineMs` is caller-local, rejects with `DEADLINE_EXCEEDED`, and does not cancel unrelated concurrent `load()` callers sharing the same PDF.js task.

`configurePdfWorker(...)` mutates PDF.js application-global worker state only when you call it, not at module evaluation. Reconfiguring it replaces the previous URL-or-port setting and can collide with other PDF.js consumers in the same JavaScript realm. If you pass an existing `Worker`, the caller still owns terminating it. For per-document isolation, pass a caller-created PDF.js `PDFWorker` on the `PDFReader` source object and retain the handle so you can destroy it explicitly:

```ts
import { PDFWorker } from 'pdfjs-dist';
import { PDFReader } from '@web-ts-toolkit/pdf-reader';

const worker = new PDFWorker({ name: 'tenant-a' });
const reader = new PDFReader({ data: bytes, worker });

try {
  await reader.load();
  // ... pages()/convert() ...
} finally {
  try {
    await reader.destroy();
  } finally {
    await worker.destroy();
  }
}
```

A caller-created `PDFWorker` is never destroyed by the reader or by PDF.js task teardown (PDF.js destroys only the worker it creates internally), so the nested `finally` runs even when `reader.destroy()` rejects, including after a load failure. Destroy the reader first so in-flight document work settles before the worker goes away. The worker script URL itself must be emitted by the application bundler (for example, Vite's `pdfjs-dist/build/pdf.worker.min.mjs?url` import); the package emits no worker asset.

`reader.state` reports the public lifecycle boundary: `new`, `loading`, `loaded`, `iterating`, `failed`, or `destroyed`. A `failed` reader is retryable: a later `load()` starts a fresh attempt. `iterating` means one executing `pages()` iterator or `convert()` call owns the reader-level page operation. The package owns live page proxies, temporary DOM canvases, and the loaded `PDFDocumentProxy` while work is active; returned `Blob`s, data URLs, and any caller-created object URLs belong to the caller. `LoadedPdfDocument` and `LoadedPdfPage` are intentional PDF.js interoperability aliases; `load()` returns the document alias, while `pages()` and `convert()` return package `PageResult` objects instead of raw page proxies.

When `includePageImage` is enabled, the rendered page now appears on `page.pageImage`. Use `pageImageOutput: 'blob'` for binary bytes without base64 conversion, or keep the default `pageImageOutput: 'data-url'` convenience path. `jpegQuality` applies only to JPEG output. Conversion defaults are `viewportScale: 1.5`, `imageFormat: 'image/png'`, `jpegQuality: 0.92`, `includePageImage: true`, `pageImageOutput: 'data-url'`, `includeText: true`, and `includeEmbeddedImages: false`; `pageRange` is 1-based (one page number or an inclusive tuple, with reversed tuples normalized). The package returns `Blob`s directly, never object URLs: keep any `URL.createObjectURL(blob)` alive through `img.decode()`/display and revoke it on replacement, disposal, or error — never immediately after assigning `src`, which invalidates the preview before it loads.

Constructor `canvasFactory`, when supplied, must create a fresh DOM `HTMLCanvasElement` for each package-owned render or embedded-image copy. Non-DOM canvas objects are not part of the documented runtime contract unless they satisfy the browser `HTMLCanvasElement` behavior used by PDF.js and this package.

Package-owned lifecycle failures use stable `PdfReaderError` codes, including `ABORTED`, `DEADLINE_EXCEEDED`, `DESTROYED`, and `UNSUPPORTED_ENVIRONMENT`. PDF.js parsing, password, malformed-document, response, and rendering errors still pass through unchanged, while best-effort embedded-image skips use `logger.warn(...)` diagnostics instead of exceptions.

`limits.maxSourceBytes` rejects synchronously knowable in-memory sources before `getDocument()`: binary strings (one byte per code unit), number arrays (one byte per entry, rejected by length without entry traversal), and buffer/view `byteLength`. The size is rechecked after source-policy approval, so growth during approval still fails before loading; borrowed `data` is never copied, and remote response-byte limits stay application-owned. Finite defaults also cap loaded document pages, retained per-page text item/code-unit counts, per-page operator traversal for embedded-image extraction, rendered page pixels, one embedded image's decoded pixels, extracted embedded-image count, and aggregate decoded embedded-image pixels per page. Text and operator checks run after PDF.js returns those complete structures and before package traversal or result retention; they bound package-owned work, not PDF.js' initial parsing allocation. Embedded-image count and aggregate decoded-pixel checks run before the next extracted-image canvas allocation or PNG data-url encode. Repeated image XObject references reuse one encoded data URL per page after those aggregate placement limits pass; inline images are not cached by synthetic keys. Exact aggregate encoded data-url bytes are not precomputable before browser canvas encoding, so decoded-pixel limits are the documented output boundary.

`sourcePolicy(source)` runs before PDF.js network/loading work so applications can reject disallowed URLs, protocols, credentials, or headers while still passing approved PDF.js options through unchanged.

Embedded-image extraction remains opt-in on the package root. The current real-browser fixture suite characterizes inline images, repeated image XObjects, composed transforms, RGBA soft-mask images, one-bit (`GRAYSCALE_1BPP`) image XObjects with pixel assertions under both `ImageBitmap` and packed-bit paths, and nested form XObjects against the supported `pdfjs-dist` peer minor `~6.2.108`. Repeated XObject placements share one per-page encoded payload while retaining distinct returned transforms and coordinates. Shared `g_`-prefixed references resolve through the document-wide `commonObjs` store with readiness awaited under the same cancellation contract; page-local references keep using `page.objs`. Image `x`/`y`/`width`/`height` are PDF user-space coordinates before viewport scaling (`y` is the upper bound); `size` reports decoded source bytes, not the encoded PNG length. Standalone image-mask operators and unsupported individual image layouts are skipped with diagnostics instead of aborting the page; resource-limit, abort, and destroy errors still propagate.

PDFR2-05 release-note evidence is captured in this page, the package README, and the task completion record. `CHANGELOG.md` was intentionally not edited for that compatibility-policy alignment per maintainer instruction.

Page processing remains serial per reader in the public runtime API. A second overlapping `pages()` or `convert()` operation on the same loaded reader fails fast with `OPERATION_IN_PROGRESS` before acquiring another page proxy or canvas; create a separate reader for independent concurrent conversions. Calling `pages()` only creates an iterator object and does not reserve the reader until the iterator starts executing. PDFR-07 adds a real-browser benchmark under `packages/pdf-reader/benchmark/` that compares the current `pages()` path against a bounded page-level scheduler candidate (concurrency `2`, reorder window `2` retained pages) before any concurrency option is considered. The current baseline (2026-09-12, Headless Chromium `151.0.7922.34`, 1 warmup + 3 repeats) reports conversion-only, load, and load-inclusive times with global simultaneous peaks: bounded overlap reduces conversion-only time on some fixtures but loads a second document and doubles simultaneous page/canvas ownership, so the package keeps the serial API until a tighter browser memory/backpressure budget exists. The 2026-08-19 single-sample numbers remain historical only. The benchmark command is `pnpm --filter @web-ts-toolkit/pdf-reader benchmark`.

The installed package README documents resource limits, cancellation, worker alternatives, structured errors, security guidance, and embedded-image limitations in detail.
