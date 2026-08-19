---
sidebar_label: PDF Reader
---

# `@web-ts-toolkit/pdf-reader`

`@web-ts-toolkit/pdf-reader` wraps PDF.js with explicit worker setup, bounded canvas allocation, cancellation, deterministic cleanup, and streaming page results.

## Install

```sh
pnpm add @web-ts-toolkit/pdf-reader pdfjs-dist
```

The package targets browsers and treats `pdfjs-dist` as a peer dependency.

## Example

```ts
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { configurePdfWorker, PDFReader } from '@web-ts-toolkit/pdf-reader';

configurePdfWorker(workerUrl);

const reader = new PDFReader(new Uint8Array(await file.arrayBuffer()));

try {
  await reader.load();
  for await (const page of reader.pages({ imageFormat: 'image/jpeg' })) {
    console.log(page.pageNumber, page.text, page.dataUrl);
  }
} finally {
  await reader.destroy();
}
```

Prefer `pages()` for large documents. Use `convert()` when retaining all page results is acceptable.

The installed package README documents resource limits, cancellation, worker alternatives, structured errors, security guidance, and embedded-image limitations in detail.
