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
  "value": "Example",
  "id": "example",
  "level": 2
}];
function _createMdxContent(props) {
  const _components = {
    code: "code",
    h1: "h1",
    h2: "h2",
    header: "header",
    p: "p",
    pre: "pre",
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
      }), ", rechecks borrowed byte sizes after approval, retries failed loads with a fresh attempt, settles page-stage waits promptly via one shared cancellation contract (underlying PDF.js work stays uncancellable), decodes one-bit images by declared kind, resolves shared images via ", (0,jsx_runtime.jsx)(_components.code, {
        children: "commonObjs"
      }), ", and rejects invalid options/encodes with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "INVALID_OPTION"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "UNSUPPORTED_ENVIRONMENT"
      }), ". Page work stays serial and text/operator limits still apply after PDF.js returns complete structures — no concurrency or streaming-text API change ships in this release."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "example",
      children: "Example"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';\nimport { configurePdfWorker, PDFReader } from '@web-ts-toolkit/pdf-reader';\n\nconfigurePdfWorker(workerUrl);\n\nconst reader = new PDFReader(new Uint8Array(await file.arrayBuffer()));\n\ntry {\n  await reader.load({ deadlineMs: 15_000 });\n  for await (const page of reader.pages({ imageFormat: 'image/jpeg', pageImageOutput: 'blob' })) {\n    console.log(page.pageNumber, page.text, page.pageImage);\n  }\n} finally {\n  await reader.destroy();\n}\n"
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