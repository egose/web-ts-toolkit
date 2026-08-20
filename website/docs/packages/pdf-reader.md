---
sidebar_label: PDF Reader
---

# `@web-ts-toolkit/pdf-reader`

`@web-ts-toolkit/pdf-reader` wraps PDF.js with explicit worker setup, bounded canvas allocation, cancellation, deterministic cleanup, streaming page results, and best-effort embedded-image extraction.

## Install

```sh
pnpm add @web-ts-toolkit/pdf-reader pdfjs-dist
```

The package targets browsers, is published as ESM-only, and treats `pdfjs-dist` as a peer dependency.

## Migration

Upgrade from the older application-local reader by switching to named imports, explicit `configurePdfWorker(...)`, `page.pageImage` instead of legacy top-level image fields, and the current option names (`includeText`, `includePageImage`, `includeEmbeddedImages`). The package intentionally does not ship compatibility aliases for the old default export, deep imports, `getText`, `getDataURL`, `getImages`, `config`, `dataURL`, or `isPNG` names.

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

Concurrent `load()` callers share one PDF.js loading task, but aborting one caller only rejects that caller. Call `destroy()` to cancel active renders, tear down a shared in-flight load, and permanently close the reader.

`load()` accepts either an `AbortSignal` or `{ signal, deadlineMs }`. `deadlineMs` is caller-local, rejects with `DEADLINE_EXCEEDED`, and does not cancel unrelated concurrent `load()` callers sharing the same PDF.js task.

`configurePdfWorker(...)` mutates PDF.js worker globals only when you call it, not at module evaluation. Reconfiguring it replaces the previous URL-or-port setting. If you pass an existing `Worker`, the caller still owns terminating it.

`reader.state` reports the public lifecycle boundary: `new`, `loading`, `loaded`, `iterating`, `failed`, or `destroyed`. A `failed` reader is retryable: a later `load()` starts a fresh attempt. The package owns live page proxies, temporary canvases, and the loaded `PDFDocumentProxy` only while work is active; returned `Blob`s, data URLs, and any caller-created object URLs belong to the caller.

When `includePageImage` is enabled, the rendered page now appears on `page.pageImage`. Use `pageImageOutput: 'blob'` for binary bytes without base64 conversion, or keep the default `pageImageOutput: 'data-url'` convenience path. `jpegQuality` applies only to JPEG output.

Package-owned lifecycle failures use stable `PdfReaderError` codes, including `ABORTED`, `DEADLINE_EXCEEDED`, `DESTROYED`, and `UNSUPPORTED_ENVIRONMENT`. PDF.js parsing, password, malformed-document, response, and rendering errors still pass through unchanged, while best-effort embedded-image skips use `logger.warn(...)` diagnostics instead of exceptions.

`limits.maxSourceBytes` rejects synchronously knowable in-memory sources before `getDocument()`. `sourcePolicy(source)` runs before PDF.js network/loading work so applications can reject disallowed URLs, protocols, credentials, or headers while still passing approved PDF.js options through unchanged.

Embedded-image extraction remains opt-in on the package root. The current real-browser fixture suite characterizes inline images, repeated image XObjects, composed transforms, RGBA soft-mask images, and nested form XObjects against the supported `pdfjs-dist` peer minor `~5.7.284`. Standalone image-mask operators are skipped with diagnostics instead of aborting the page.

Page processing remains serial in the public runtime API. PDFR-07 adds a real-browser benchmark under `packages/pdf-reader/benchmark/` that compares the current `pages()` path against a bounded page-level scheduler candidate before any concurrency option is considered. The recorded local run in Headless Chromium `151.0.7922.34` improved the synthetic long/image-heavy fixtures but also doubled active page/canvas ownership from `1/1` to `2/2`, so the package keeps the serial API until a tighter browser memory/backpressure budget exists. The benchmark command is `pnpm --filter @web-ts-toolkit/pdf-reader benchmark`.

The installed package README documents resource limits, cancellation, worker alternatives, structured errors, security guidance, and embedded-image limitations in detail.
