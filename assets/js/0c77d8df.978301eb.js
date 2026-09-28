"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[176],{

/***/ 8338
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_pdf_reader_md_0c7_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-pdf-reader-md-0c7.json
const site_docs_packages_pdf_reader_md_0c7_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/pdf-reader","title":"@web-ts-toolkit/pdf-reader","description":"@web-ts-toolkit/pdf-reader wraps PDF.js with explicit worker setup, bounded canvas allocation, cancellation, deterministic cleanup, streaming page results, and best-effort embedded-image extraction.","source":"@site/docs/packages/pdf-reader.md","sourceDirName":"packages","slug":"/packages/pdf-reader","permalink":"/docs/packages/pdf-reader","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":18,"frontMatter":{"sidebar_label":"PDF Reader","sidebar_position":18},"sidebar":"packagesSidebar","previous":{"title":"Mongoose-RxDB","permalink":"/docs/packages/mongoose-rxdb"},"next":{"title":"Create Access Router Starter","permalink":"/docs/packages/create-access-router-mongo-starter"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.18_react@19.2.8/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(7008);
;// ./docs/packages/pdf-reader.md


const frontMatter = {
	sidebar_label: 'PDF Reader',
	sidebar_position: 18
};
const contentTitle = '@web-ts-toolkit/pdf-reader';

const assets = {

};



const toc = [{
  "value": "Install",
  "id": "install",
  "level": 2
}, {
  "value": "Migration",
  "id": "migration",
  "level": 2
}, {
  "value": "Fresh-reader recovery after an interrupted render",
  "id": "fresh-reader-recovery-after-an-interrupted-render",
  "level": 3
}, {
  "value": "Example",
  "id": "example",
  "level": 2
}, {
  "value": "Plain Text And Local Ingestion",
  "id": "plain-text-and-local-ingestion",
  "level": 2
}];
function _createMdxContent(props) {
  const _components = {
    code: "code",
    h1: "h1",
    h2: "h2",
    h3: "h3",
    header: "header",
    p: "p",
    pre: "pre",
    strong: "strong",
    ...(0,lib/* useMDXComponents */.R)(),
    ...props.components
  };
  return (0,jsx_runtime.jsxs)(jsx_runtime.Fragment, {
    children: [(0,jsx_runtime.jsx)(_components.header, {
      children: (0,jsx_runtime.jsx)(_components.h1, {
        id: "web-ts-toolkitpdf-reader",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/pdf-reader"
        })
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/pdf-reader"
      }), " wraps PDF.js with explicit worker setup, bounded canvas allocation, cancellation, deterministic cleanup, streaming page results, and best-effort embedded-image extraction."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "install",
      children: "Install"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-sh",
        children: "pnpm add @web-ts-toolkit/pdf-reader pdfjs-dist@~6.2.108\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The package targets browsers, is published as ESM-only, and treats ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pdfjs-dist"
      }), " as a peer dependency. The supported PDF.js compatibility contract is the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pdfjs-dist"
      }), " ", (0,jsx_runtime.jsx)(_components.code, {
        children: "~6.2.108"
      }), " peer minor, with package and real-browser fixture coverage run against ", (0,jsx_runtime.jsx)(_components.code, {
        children: "6.2.108"
      }), "; future ", (0,jsx_runtime.jsx)(_components.code, {
        children: "6.x"
      }), " minors require a reproducible browser compatibility matrix before they are admitted."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "migration",
      children: "Migration"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["New named root export ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pdfTextToString(content)"
      }), " assembles raw ", (0,jsx_runtime.jsx)(_components.code, {
        children: "PageResult.text"
      }), " for local search/indexing. It preserves supplied item order, whitespace, and Unicode, skips marked-content entries, and appends one ", (0,jsx_runtime.jsx)(_components.code, {
        children: "\\n"
      }), " for every text item's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "hasEOL: true"
      }), " (including empty and final items). It guesses no spaces and trims nothing. Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "includePageImage: false"
      }), " for text-only ingestion; page rendering still defaults to enabled. See the local ingestion recipe below."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Signal inputs are now validated before load/page work, including an already-loaded ", (0,jsx_runtime.jsx)(_components.code, {
        children: "load()"
      }), " call. Replace ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " or malformed signal placeholders with an omitted property or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), "; invalid values produce ", (0,jsx_runtime.jsx)(_components.code, {
        children: "INVALID_OPTION"
      }), ". Native signals from other realms (such as same-origin iframes) remain supported."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Upgrade from the older application-local reader by switching to named imports, explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "configurePdfWorker(...)"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "page.pageImage"
      }), " instead of legacy top-level image fields, and the current option names (", (0,jsx_runtime.jsx)(_components.code, {
        children: "includeText"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "includePageImage"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "includeEmbeddedImages"
      }), "). The package intentionally does not ship compatibility aliases for the old default export, deep imports, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getText"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getDataURL"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getImages"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "config"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dataURL"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "isPNG"
      }), " names. Follow-up hardening keeps that API but snapshots effective headers before ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sourcePolicy(...)"
      }), ", rechecks borrowed byte sizes after approval, retries failed loads with a fresh attempt, settles page-stage waits promptly via one shared cancellation contract (active renders are cancelled; other started PDF.js work remains observed), decodes one-bit images by declared kind, resolves shared images via ", (0,jsx_runtime.jsx)(_components.code, {
        children: "commonObjs"
      }), ", and rejects invalid options/encodes with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "INVALID_OPTION"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "UNSUPPORTED_ENVIRONMENT"
      }), ". Page work stays serial and text/operator limits still apply after PDF.js returns complete structures — no concurrency or streaming-text API change ships in this release."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Synchronous abort/destroy in canvas factories or viewport callbacks now stops subsequent allocation/rendering. Already-created renders are cancelled even when cancellation precedes wait registration. Already-started promises remain observed, including late ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getPage()"
      }), " cleanup and a source policy that synchronously destroys the reader then rejects. Caller settlement releases the page-operation lock but does not imply uncancelled upstream work or cached-page cleanup has finished. A suspended ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pages()"
      }), " consumer observes cancellation when resumed or closed."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Render cancellation/failure now permanently closes the reader."
      }), " Once a render task has been created, cancellation or failure starts public PDF.js teardown automatically. The initiating call retains prompt ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ABORTED"
      }), " or its exact native error; explicit destruction produces ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DESTROYED"
      }), ". Later ", (0,jsx_runtime.jsx)(_components.code, {
        children: "load()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pages()"
      }), " execution, and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "convert()"
      }), " fail with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DESTROYED"
      }), " before page/image access. This intentionally replaces the earlier same-reader render-retry promise: PDF.js can clear shared images after the render promise rejects. Retry requires an explicitly created fresh reader and fresh bytes, since PDF.js may have transferred the original input. No replacement document is silently loaded. Default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "includePageImage: true"
      }), " conversions may enter this terminal path."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Pre-render/non-render cancellation and encoding cancellation/failure after successful rendering still permit same-reader reuse, as do malformed-option rejection and callback failures before rendering. These safe retries retain shared ownership across pending acquisitions, active processing, and original stage promises. The package's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "page.cleanup()"
      }), " request waits until that cached-page cycle is idle. A successful retry or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "state === 'loaded'"
      }), " does not prove older work is finished. Idle bookkeeping is removed; never-settling work retains ownership until ", (0,jsx_runtime.jsx)(_components.code, {
        children: "destroy()"
      }), ", and repeated non-render cancellation does not bound upstream work. This coordination covers package-started work, not external proxy operations or manual cleanup."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "destroy()"
      }), " clears retained page ownership and waits for PDF.js loading/document destruction, without waiting for orphaned acquisition/stage promises; late acquisitions receive best-effort cleanup and never start processing. Await active operation promises to observe their temporary canvas release. Awaiting cancellation alone does not guarantee deferred page cleanup or upstream completion."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Automatic teardown does not wait or replace the initiating render error, and its rejection is observed internally. Explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "destroy()"
      }), " returns the same memoized promise, reporting success/failure even on repeated/reentrant calls. Handle teardown errors separately if an awaited ", (0,jsx_runtime.jsx)(_components.code, {
        children: "finally"
      }), " would otherwise replace an earlier conversion error. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "state === 'destroyed'"
      }), " means closure started, not successful/completed teardown. Caller-created PDF workers remain caller-owned."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "fresh-reader-recovery-after-an-interrupted-render",
      children: "Fresh-reader recovery after an interrupted render"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["After handling the original error, explicitly recover from the original ", (0,jsx_runtime.jsx)(_components.code, {
        children: "File"
      }), ", not its potentially detached previous typed array. Each call obtains fresh bytes:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { PDFReader } from '@web-ts-toolkit/pdf-reader';\n\nasync function extractFresh(file: File) {\n  const maxSourceBytes = 25_000_000;\n  if (file.size > maxSourceBytes) throw new Error('PDF exceeds the local file-size limit.');\n  const recovery = new PDFReader(new Uint8Array(await file.arrayBuffer()), { limits: { maxSourceBytes } });\n  try {\n    await recovery.load();\n    return await recovery.convert({\n      pageRange: 1,\n      includeText: false,\n      includePageImage: false,\n      includeEmbeddedImages: true,\n    });\n  } finally {\n    await recovery.destroy();\n  }\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "example",
      children: "Example"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';\nimport { configurePdfWorker, PDFReader } from '@web-ts-toolkit/pdf-reader';\n\nconfigurePdfWorker(workerUrl);\n\nconst maxSourceBytes = 25_000_000;\nif (file.size > maxSourceBytes) throw new Error('PDF exceeds the local file-size limit.');\nconst reader = new PDFReader(new Uint8Array(await file.arrayBuffer()), { limits: { maxSourceBytes } });\n\ntry {\n  await reader.load({ deadlineMs: 15_000 });\n  for await (const page of reader.pages({ imageFormat: 'image/jpeg', pageImageOutput: 'blob' })) {\n    console.log(page.pageNumber, page.text, page.pageImage);\n  }\n} finally {\n  await reader.destroy();\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Prefer ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pages()"
      }), " for large documents. Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "convert()"
      }), " when retaining all page results is acceptable."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Concurrent ", (0,jsx_runtime.jsx)(_components.code, {
        children: "load()"
      }), " callers share one PDF.js loading task, but aborting one caller only rejects that caller. The fulfilled ", (0,jsx_runtime.jsx)(_components.code, {
        children: "load()"
      }), " value is a borrowed PDF.js ", (0,jsx_runtime.jsx)(_components.code, {
        children: "PDFDocumentProxy"
      }), ": inspect it or use supported PDF.js read methods if needed, but do not call ", (0,jsx_runtime.jsx)(_components.code, {
        children: "document.destroy()"
      }), " while the reader owns lifecycle teardown. Call ", (0,jsx_runtime.jsx)(_components.code, {
        children: "reader.destroy()"
      }), " to cancel active renders, tear down a shared in-flight load, and permanently close the reader. External proxy destruction is unsupported and can leave ", (0,jsx_runtime.jsx)(_components.code, {
        children: "reader.state"
      }), " stale until a later PDF.js method fails."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "load()"
      }), " accepts either an ", (0,jsx_runtime.jsx)(_components.code, {
        children: "AbortSignal"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ signal, deadlineMs }"
      }), ". ", (0,jsx_runtime.jsx)(_components.code, {
        children: "deadlineMs"
      }), " is caller-local, rejects with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DEADLINE_EXCEEDED"
      }), ", and does not cancel unrelated concurrent ", (0,jsx_runtime.jsx)(_components.code, {
        children: "load()"
      }), " callers sharing the same PDF.js task."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Both load forms and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pages({ signal })"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "convert({ signal })"
      }), " validate signals structurally: boolean ", (0,jsx_runtime.jsx)(_components.code, {
        children: "aborted"
      }), " and callable ", (0,jsx_runtime.jsx)(_components.code, {
        children: "addEventListener"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "removeEventListener"
      }), ". Omitted or explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), " means no signal; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), ", primitives, and partial/non-callable shapes produce ", (0,jsx_runtime.jsx)(_components.code, {
        children: "INVALID_OPTION"
      }), ". ", (0,jsx_runtime.jsx)(_components.code, {
        children: "load()"
      }), " throws synchronously before source policy/PDF.js work, even when already loaded; conversion rejects before ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getPage()"
      }), " and releases its operation lock for valid reuse. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "load({})"
      }), " is a valid empty options bag; objects containing any of the three signal members are treated as direct signals and must satisfy the full shape. Nested signal references and load deadlines are read once per operation, while the signal's abort state remains live. Custom signal implementations must preserve working event methods and live boolean abort state while in use."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "configurePdfWorker(...)"
      }), " mutates PDF.js application-global worker state only when you call it, not at module evaluation. Reconfiguring it replaces the previous URL-or-port setting and can collide with other PDF.js consumers in the same JavaScript realm. If you pass an existing ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Worker"
      }), ", the caller still owns terminating it. For per-document isolation, pass a caller-created PDF.js ", (0,jsx_runtime.jsx)(_components.code, {
        children: "PDFWorker"
      }), " on the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "PDFReader"
      }), " source object and retain the handle so you can destroy it explicitly:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { PDFWorker } from 'pdfjs-dist';\nimport { PDFReader } from '@web-ts-toolkit/pdf-reader';\n\nconst worker = new PDFWorker({ name: 'tenant-a' });\nconst reader = new PDFReader({ data: bytes, worker });\n\ntry {\n  await reader.load();\n  // ... pages()/convert() ...\n} finally {\n  try {\n    await reader.destroy();\n  } finally {\n    await worker.destroy();\n  }\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["A caller-created ", (0,jsx_runtime.jsx)(_components.code, {
        children: "PDFWorker"
      }), " is never destroyed by the reader or by PDF.js task teardown (PDF.js destroys only the worker it creates internally), so the nested ", (0,jsx_runtime.jsx)(_components.code, {
        children: "finally"
      }), " runs even when ", (0,jsx_runtime.jsx)(_components.code, {
        children: "reader.destroy()"
      }), " rejects, including after a load failure. Destroy the reader first so in-flight document work settles before the worker goes away. The worker script URL itself must be emitted by the application bundler (for example, Vite's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pdfjs-dist/build/pdf.worker.min.mjs?url"
      }), " import); the package emits no worker asset."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "reader.state"
      }), " reports the public lifecycle boundary: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "new"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "loading"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "loaded"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "iterating"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "failed"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "destroyed"
      }), ". A ", (0,jsx_runtime.jsx)(_components.code, {
        children: "failed"
      }), " reader is retryable: a later ", (0,jsx_runtime.jsx)(_components.code, {
        children: "load()"
      }), " starts a fresh attempt. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "iterating"
      }), " means one executing ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pages()"
      }), " iterator or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "convert()"
      }), " call owns the reader-level page operation. The package owns live page proxies, temporary DOM canvases, and the loaded ", (0,jsx_runtime.jsx)(_components.code, {
        children: "PDFDocumentProxy"
      }), " while work is active; returned ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Blob"
      }), "s, data URLs, and any caller-created object URLs belong to the caller. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "LoadedPdfDocument"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "LoadedPdfPage"
      }), " are intentional PDF.js interoperability aliases; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "load()"
      }), " returns the document alias, while ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pages()"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "convert()"
      }), " return package ", (0,jsx_runtime.jsx)(_components.code, {
        children: "PageResult"
      }), " objects instead of raw page proxies."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["When ", (0,jsx_runtime.jsx)(_components.code, {
        children: "includePageImage"
      }), " is enabled, the rendered page now appears on ", (0,jsx_runtime.jsx)(_components.code, {
        children: "page.pageImage"
      }), ". Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pageImageOutput: 'blob'"
      }), " for binary bytes without base64 conversion, or keep the default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pageImageOutput: 'data-url'"
      }), " convenience path. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "jpegQuality"
      }), " applies only to JPEG output. Conversion defaults are ", (0,jsx_runtime.jsx)(_components.code, {
        children: "viewportScale: 1.5"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "imageFormat: 'image/png'"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "jpegQuality: 0.92"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "includePageImage: true"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pageImageOutput: 'data-url'"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "includeText: true"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "includeEmbeddedImages: false"
      }), "; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pageRange"
      }), " is 1-based (one page number or an inclusive tuple, with reversed tuples normalized). The package returns ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Blob"
      }), "s directly, never object URLs: keep any ", (0,jsx_runtime.jsx)(_components.code, {
        children: "URL.createObjectURL(blob)"
      }), " alive through ", (0,jsx_runtime.jsx)(_components.code, {
        children: "img.decode()"
      }), "/display and revoke it on replacement, disposal, or error — never immediately after assigning ", (0,jsx_runtime.jsx)(_components.code, {
        children: "src"
      }), ", which invalidates the preview before it loads."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Constructor ", (0,jsx_runtime.jsx)(_components.code, {
        children: "canvasFactory"
      }), ", when supplied, must create a fresh DOM ", (0,jsx_runtime.jsx)(_components.code, {
        children: "HTMLCanvasElement"
      }), " for each package-owned render or embedded-image copy. Non-DOM canvas objects are not part of the documented runtime contract unless they satisfy the browser ", (0,jsx_runtime.jsx)(_components.code, {
        children: "HTMLCanvasElement"
      }), " behavior used by PDF.js and this package."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Package-owned lifecycle failures use stable ", (0,jsx_runtime.jsx)(_components.code, {
        children: "PdfReaderError"
      }), " codes, including ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ABORTED"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DEADLINE_EXCEEDED"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DESTROYED"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "UNSUPPORTED_ENVIRONMENT"
      }), ". PDF.js parsing, password, malformed-document, response, and rendering errors still pass through unchanged, while best-effort embedded-image skips use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "logger.warn(...)"
      }), " diagnostics instead of exceptions."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "limits.maxSourceBytes"
      }), " rejects synchronously knowable in-memory sources before ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getDocument()"
      }), ": binary strings (one byte per code unit), number arrays (one byte per entry, rejected by length without entry traversal), and buffer/view ", (0,jsx_runtime.jsx)(_components.code, {
        children: "byteLength"
      }), ". The size is rechecked after source-policy approval, so growth during approval still fails before loading; borrowed ", (0,jsx_runtime.jsx)(_components.code, {
        children: "data"
      }), " is never copied, and remote response-byte limits stay application-owned. Finite defaults also cap loaded document pages, retained per-page text item/code-unit counts, per-page operator traversal for embedded-image extraction, rendered page pixels, one embedded image's decoded pixels, extracted embedded-image count, and aggregate decoded embedded-image pixels per page. Text and operator checks run after PDF.js returns those complete structures and before package traversal or result retention; they bound package-owned work, not PDF.js' initial parsing allocation. Embedded-image count and aggregate decoded-pixel checks run before the next extracted-image canvas allocation or PNG data-url encode. Repeated image XObject references reuse one encoded data URL per page after those aggregate placement limits pass; inline images are not cached by synthetic keys. Exact aggregate encoded data-url bytes are not precomputable before browser canvas encoding, so decoded-pixel limits are the documented output boundary."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "sourcePolicy(source)"
      }), " runs before PDF.js network/loading work so applications can reject disallowed URLs, protocols, credentials, or headers while still passing approved PDF.js options through unchanged."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Embedded-image extraction remains opt-in on the package root. The current real-browser fixture suite characterizes inline images, repeated image XObjects, composed transforms, RGBA soft-mask images, one-bit (", (0,jsx_runtime.jsx)(_components.code, {
        children: "GRAYSCALE_1BPP"
      }), ") image XObjects with pixel assertions under both ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ImageBitmap"
      }), " and packed-bit paths, and nested form XObjects against the supported ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pdfjs-dist"
      }), " peer minor ", (0,jsx_runtime.jsx)(_components.code, {
        children: "~6.2.108"
      }), ". Repeated XObject placements share one per-page encoded payload while retaining distinct returned transforms and coordinates. Shared ", (0,jsx_runtime.jsx)(_components.code, {
        children: "g_"
      }), "-prefixed references resolve through the document-wide ", (0,jsx_runtime.jsx)(_components.code, {
        children: "commonObjs"
      }), " store with readiness awaited under the same cancellation contract; page-local references keep using ", (0,jsx_runtime.jsx)(_components.code, {
        children: "page.objs"
      }), ". Image ", (0,jsx_runtime.jsx)(_components.code, {
        children: "x"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "y"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "width"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "height"
      }), " are PDF user-space coordinates before viewport scaling (", (0,jsx_runtime.jsx)(_components.code, {
        children: "y"
      }), " is the upper bound); ", (0,jsx_runtime.jsx)(_components.code, {
        children: "size"
      }), " reports decoded source bytes, not the encoded PNG length. Standalone image-mask operators and unsupported individual image layouts are skipped with diagnostics instead of aborting the page; resource-limit, abort, and destroy errors still propagate."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["PDFR2-05 release-note evidence is captured in this page, the package README, and the task completion record. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "CHANGELOG.md"
      }), " was intentionally not edited for that compatibility-policy alignment per maintainer instruction."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Page processing remains serial per reader in the public runtime API. A second overlapping ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pages()"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "convert()"
      }), " operation on the same loaded reader fails fast with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OPERATION_IN_PROGRESS"
      }), " before acquiring another page proxy or canvas; create a separate reader for independent concurrent conversions. Calling ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pages()"
      }), " only creates an iterator object and does not reserve the reader until the iterator starts executing. PDFR-07 adds a real-browser benchmark under ", (0,jsx_runtime.jsx)(_components.code, {
        children: "packages/pdf-reader/benchmark/"
      }), " that compares the current ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pages()"
      }), " path against a bounded page-level scheduler candidate (concurrency ", (0,jsx_runtime.jsx)(_components.code, {
        children: "2"
      }), ", reorder window ", (0,jsx_runtime.jsx)(_components.code, {
        children: "2"
      }), " retained pages) before any concurrency option is considered. The current baseline (2026-09-12, Headless Chromium ", (0,jsx_runtime.jsx)(_components.code, {
        children: "151.0.7922.34"
      }), ", 1 warmup + 3 repeats) reports conversion-only, load, and load-inclusive times with global simultaneous peaks: bounded overlap reduces conversion-only time on some fixtures but loads a second document and doubles simultaneous page/canvas ownership, so the package keeps the serial API until a tighter browser memory/backpressure budget exists. The 2026-08-19 single-sample numbers remain historical only. The benchmark command is ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pnpm --filter @web-ts-toolkit/pdf-reader benchmark"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "plain-text-and-local-ingestion",
      children: "Plain Text And Local Ingestion"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "pdfTextToString(content: PdfTextContent): string"
      }), " is a pure named root utility for already-extracted text. It preserves PDF.js item order and each string verbatim, including supplied spaces and Unicode. It appends exactly one ", (0,jsx_runtime.jsx)(_components.code, {
        children: "\\n"
      }), " after every text item with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "hasEOL: true"
      }), ", even an empty or final item. Existing newlines are not deduplicated; trailing whitespace/newlines are retained. Empty or marker-only content returns ", (0,jsx_runtime.jsx)(_components.code, {
        children: "''"
      }), "; marked-content entries are skipped. XFA-style string items without ", (0,jsx_runtime.jsx)(_components.code, {
        children: "hasEOL"
      }), " contribute only their string. Fragmented words are concatenated without guessed spaces."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Configure the worker once as shown above. This browser recipe checks a local ", (0,jsx_runtime.jsx)(_components.code, {
        children: "File"
      }), " before allocating its bytes, processes pages serially with 1-based page attribution, and displays only the current page via safe ", (0,jsx_runtime.jsx)(_components.code, {
        children: "textContent"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { PDFReader, pdfTextToString } from '@web-ts-toolkit/pdf-reader';\n\nasync function ingestLocalPdf(\n  file: File,\n  output: HTMLPreElement,\n  indexPage: (record: { pageNumber: number; text: string }) => void | Promise<void>,\n): Promise<void> {\n  const maxSourceBytes = 25_000_000;\n  if (file.size > maxSourceBytes) throw new Error('PDF exceeds the local file-size limit.');\n  const bytes = new Uint8Array(await file.arrayBuffer());\n  const reader = new PDFReader(bytes, { limits: { maxSourceBytes, maxDocumentPages: 250 } });\n\n  try {\n    await reader.load({ deadlineMs: 15_000 });\n    for await (const page of reader.pages({\n      includeText: true,\n      includePageImage: false,\n      includeEmbeddedImages: false,\n    })) {\n      if (!page.text) throw new Error(`Missing text content for page ${page.pageNumber}.`);\n      const text = pdfTextToString(page.text);\n      output.textContent = `Page ${page.pageNumber}\\n${text}`;\n      await indexPage({ pageNumber: page.pageNumber, text });\n    }\n  } finally {\n    await reader.destroy();\n  }\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Supply an application-local ", (0,jsx_runtime.jsx)(_components.code, {
        children: "indexPage"
      }), " callback (and a document ID when indexing multiple files). Neither the helper nor this recipe uploads document data; storage/retention belongs to that callback. With both image options disabled, the package allocates no page/embedded-image canvases. The helper itself does no parsing, canvas work, or I/O and does not mutate the content."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["This is not OCR or layout/reading-order reconstruction: scanned pages may yield empty text, and columns or positioned fragments remain in PDF.js-supplied order. PDF.js may already have normalized the strings before returning them. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pages()"
      }), " yields complete pages, not streaming text chunks; text-item/code-unit limits still run ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "after PDF.js materializes each page's text"
      }), ". The helper allocates a new string and imposes no additional limits. Keep extracted content out of ", (0,jsx_runtime.jsx)(_components.code, {
        children: "innerHTML"
      }), "; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "textContent"
      }), " displays it literally."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The installed package README documents resource limits, cancellation, worker alternatives, structured errors, security guidance, and embedded-image limitations in detail."
    })]
  });
}
function MDXContent(props = {}) {
  const {wrapper: MDXLayout} = {
    ...(0,lib/* useMDXComponents */.R)(),
    ...props.components
  };
  return MDXLayout ? (0,jsx_runtime.jsx)(MDXLayout, {
    ...props,
    children: (0,jsx_runtime.jsx)(_createMdxContent, {
      ...props
    })
  }) : _createMdxContent(props);
}



/***/ },

/***/ 7008
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   R: () => (/* binding */ useMDXComponents),
/* harmony export */   x: () => (/* binding */ MDXProvider)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1763);
/**
 * @import {MDXComponents} from 'mdx/types.js'
 * @import {Component, ReactElement, ReactNode} from 'react'
 */

/**
 * @callback MergeComponents
 *   Custom merge function.
 * @param {Readonly<MDXComponents>} currentComponents
 *   Current components from the context.
 * @returns {MDXComponents}
 *   Additional components.
 *
 * @typedef Props
 *   Configuration for `MDXProvider`.
 * @property {ReactNode | null | undefined} [children]
 *   Children (optional).
 * @property {Readonly<MDXComponents> | MergeComponents | null | undefined} [components]
 *   Additional components to use or a function that creates them (optional).
 * @property {boolean | null | undefined} [disableParentContext=false]
 *   Turn off outer component context (default: `false`).
 */



/** @type {Readonly<MDXComponents>} */
const emptyComponents = {}

const MDXContext = react__WEBPACK_IMPORTED_MODULE_0__.createContext(emptyComponents)

/**
 * Get current components from the MDX Context.
 *
 * @param {Readonly<MDXComponents> | MergeComponents | null | undefined} [components]
 *   Additional components to use or a function that creates them (optional).
 * @returns {MDXComponents}
 *   Current components.
 */
function useMDXComponents(components) {
  const contextComponents = react__WEBPACK_IMPORTED_MODULE_0__.useContext(MDXContext)

  // Memoize to avoid unnecessary top-level context changes
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(
    function () {
      // Custom merge via a function prop
      if (typeof components === 'function') {
        return components(contextComponents)
      }

      return {...contextComponents, ...components}
    },
    [contextComponents, components]
  )
}

/**
 * Provider for MDX context.
 *
 * @param {Readonly<Props>} properties
 *   Properties.
 * @returns {ReactElement}
 *   Element.
 * @satisfies {Component}
 */
function MDXProvider(properties) {
  /** @type {Readonly<MDXComponents>} */
  let allComponents

  if (properties.disableParentContext) {
    allComponents =
      typeof properties.components === 'function'
        ? properties.components(emptyComponents)
        : properties.components || emptyComponents
  } else {
    allComponents = useMDXComponents(properties.components)
  }

  return react__WEBPACK_IMPORTED_MODULE_0__.createElement(
    MDXContext.Provider,
    {value: allComponents},
    properties.children
  )
}


/***/ }

}]);