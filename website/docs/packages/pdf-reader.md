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

New named root export `pdfTextToString(content)` assembles raw `PageResult.text` for local search/indexing. It preserves supplied item order, whitespace, and Unicode, skips marked-content entries, and appends one `\n` for every text item's `hasEOL: true` (including empty and final items). It guesses no spaces and trims nothing. Use `includePageImage: false` for text-only ingestion; page rendering still defaults to enabled. See the local ingestion recipe below.

Signal inputs are now validated before load/page work, including an already-loaded `load()` call. Replace `null` or malformed signal placeholders with an omitted property or `undefined`; invalid values produce `INVALID_OPTION`. Native signals from other realms (such as same-origin iframes) remain supported.

Upgrade from the older application-local reader by switching to named imports, explicit `configurePdfWorker(...)`, `page.pageImage` instead of legacy top-level image fields, and the current option names (`includeText`, `includePageImage`, `includeEmbeddedImages`). The package intentionally does not ship compatibility aliases for the old default export, deep imports, `getText`, `getDataURL`, `getImages`, `config`, `dataURL`, or `isPNG` names. Follow-up hardening keeps that API but snapshots effective headers before `sourcePolicy(...)`, rechecks borrowed byte sizes after approval, retries failed loads with a fresh attempt, settles page-stage waits promptly via one shared cancellation contract (active renders are cancelled; other started PDF.js work remains observed), decodes one-bit images by declared kind, resolves shared images via `commonObjs`, and rejects invalid options/encodes with `INVALID_OPTION`/`UNSUPPORTED_ENVIRONMENT`. Page work stays serial and text/operator limits still apply after PDF.js returns complete structures — no concurrency or streaming-text API change ships in this release.

Synchronous abort/destroy in canvas factories or viewport callbacks now stops subsequent allocation/rendering. Already-created renders are cancelled even when cancellation precedes wait registration. Already-started promises remain observed, including late `getPage()` cleanup and a source policy that synchronously destroys the reader then rejects. Caller settlement releases the page-operation lock but does not imply uncancelled upstream work or cached-page cleanup has finished. A suspended `pages()` consumer observes cancellation when resumed or closed.

**Render cancellation/failure now permanently closes the reader.** Once a render task has been created, cancellation or failure starts public PDF.js teardown automatically. The initiating call retains prompt `ABORTED` or its exact native error; explicit destruction produces `DESTROYED`. Later `load()`, `pages()` execution, and `convert()` fail with `DESTROYED` before page/image access. This intentionally replaces the earlier same-reader render-retry promise: PDF.js can clear shared images after the render promise rejects. Retry requires an explicitly created fresh reader and fresh bytes, since PDF.js may have transferred the original input. No replacement document is silently loaded. Default `includePageImage: true` conversions may enter this terminal path.

Pre-render/non-render cancellation and encoding cancellation/failure after successful rendering still permit same-reader reuse, as do malformed-option rejection and callback failures before rendering. These safe retries retain shared ownership across pending acquisitions, active processing, and original stage promises. The package's `page.cleanup()` request waits until that cached-page cycle is idle. A successful retry or `state === 'loaded'` does not prove older work is finished. Idle bookkeeping is removed; never-settling work retains ownership until `destroy()`, and repeated non-render cancellation does not bound upstream work. This coordination covers package-started work, not external proxy operations or manual cleanup.

`destroy()` clears retained page ownership and waits for PDF.js loading/document destruction, without waiting for orphaned acquisition/stage promises; late acquisitions receive best-effort cleanup and never start processing. Await active operation promises to observe their temporary canvas release. Awaiting cancellation alone does not guarantee deferred page cleanup or upstream completion.

Automatic teardown does not wait or replace the initiating render error, and its rejection is observed internally. Explicit `destroy()` returns the same memoized promise, reporting success/failure even on repeated/reentrant calls. Handle teardown errors separately if an awaited `finally` would otherwise replace an earlier conversion error. `state === 'destroyed'` means closure started, not successful/completed teardown. Caller-created PDF workers remain caller-owned.

### Fresh-reader recovery after an interrupted render

After handling the original error, explicitly recover from the original `File`, not its potentially detached previous typed array. Each call obtains fresh bytes:

```ts
import { PDFReader } from '@web-ts-toolkit/pdf-reader';

async function extractFresh(file: File) {
  const maxSourceBytes = 25_000_000;
  if (file.size > maxSourceBytes) throw new Error('PDF exceeds the local file-size limit.');
  const recovery = new PDFReader(new Uint8Array(await file.arrayBuffer()), { limits: { maxSourceBytes } });
  try {
    await recovery.load();
    return await recovery.convert({
      pageRange: 1,
      includeText: false,
      includePageImage: false,
      includeEmbeddedImages: true,
    });
  } finally {
    await recovery.destroy();
  }
}
```

## Example

```ts
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { configurePdfWorker, PDFReader } from '@web-ts-toolkit/pdf-reader';

configurePdfWorker(workerUrl);

const maxSourceBytes = 25_000_000;
if (file.size > maxSourceBytes) throw new Error('PDF exceeds the local file-size limit.');
const reader = new PDFReader(new Uint8Array(await file.arrayBuffer()), { limits: { maxSourceBytes } });

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

Both load forms and `pages({ signal })` / `convert({ signal })` validate signals structurally: boolean `aborted` and callable `addEventListener` / `removeEventListener`. Omitted or explicit `undefined` means no signal; `null`, primitives, and partial/non-callable shapes produce `INVALID_OPTION`. `load()` throws synchronously before source policy/PDF.js work, even when already loaded; conversion rejects before `getPage()` and releases its operation lock for valid reuse. `load({})` is a valid empty options bag; objects containing any of the three signal members are treated as direct signals and must satisfy the full shape. Nested signal references and load deadlines are read once per operation, while the signal's abort state remains live. Custom signal implementations must preserve working event methods and live boolean abort state while in use.

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

## Plain Text And Local Ingestion

`pdfTextToString(content: PdfTextContent): string` is a pure named root utility for already-extracted text. It preserves PDF.js item order and each string verbatim, including supplied spaces and Unicode. It appends exactly one `\n` after every text item with `hasEOL: true`, even an empty or final item. Existing newlines are not deduplicated; trailing whitespace/newlines are retained. Empty or marker-only content returns `''`; marked-content entries are skipped. XFA-style string items without `hasEOL` contribute only their string. Fragmented words are concatenated without guessed spaces.

Configure the worker once as shown above. This browser recipe checks a local `File` before allocating its bytes, processes pages serially with 1-based page attribution, and displays only the current page via safe `textContent`:

```ts
import { PDFReader, pdfTextToString } from '@web-ts-toolkit/pdf-reader';

async function ingestLocalPdf(
  file: File,
  output: HTMLPreElement,
  indexPage: (record: { pageNumber: number; text: string }) => void | Promise<void>,
): Promise<void> {
  const maxSourceBytes = 25_000_000;
  if (file.size > maxSourceBytes) throw new Error('PDF exceeds the local file-size limit.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const reader = new PDFReader(bytes, { limits: { maxSourceBytes, maxDocumentPages: 250 } });

  try {
    await reader.load({ deadlineMs: 15_000 });
    for await (const page of reader.pages({
      includeText: true,
      includePageImage: false,
      includeEmbeddedImages: false,
    })) {
      if (!page.text) throw new Error(`Missing text content for page ${page.pageNumber}.`);
      const text = pdfTextToString(page.text);
      output.textContent = `Page ${page.pageNumber}\n${text}`;
      await indexPage({ pageNumber: page.pageNumber, text });
    }
  } finally {
    await reader.destroy();
  }
}
```

Supply an application-local `indexPage` callback (and a document ID when indexing multiple files). Neither the helper nor this recipe uploads document data; storage/retention belongs to that callback. With both image options disabled, the package allocates no page/embedded-image canvases. The helper itself does no parsing, canvas work, or I/O and does not mutate the content.

This is not OCR or layout/reading-order reconstruction: scanned pages may yield empty text, and columns or positioned fragments remain in PDF.js-supplied order. PDF.js may already have normalized the strings before returning them. `pages()` yields complete pages, not streaming text chunks; text-item/code-unit limits still run **after PDF.js materializes each page's text**. The helper allocates a new string and imposes no additional limits. Keep extracted content out of `innerHTML`; `textContent` displays it literally.

The installed package README documents resource limits, cancellation, worker alternatives, structured errors, security guidance, and embedded-image limitations in detail.
