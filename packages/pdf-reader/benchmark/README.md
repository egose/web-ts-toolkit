# `packages/pdf-reader/benchmark/`

Real-browser benchmark tooling for pdf-reader remediation tasks, including page-level concurrency task PDFR-07 and embedded-image encoding task PDFR2-06. PDFR3-10 reworked the methodology so retention is bounded and measurements are comparable.

## Purpose

This directory measures whether page-level concurrency or embedded-image output-mode changes are worth adding to `@web-ts-toolkit/pdf-reader`.

The benchmark intentionally compares:

- the current package behavior: serial streaming through `reader.pages()`
- one candidate bounded strategy: an external scheduler that runs per-page `convert({ pageRange })` work across two separate `PDFReader` instances while preserving output order

The candidate lives only in benchmark code. It uses separate readers because one `PDFReader` intentionally rejects overlapping `pages()` or `convert()` operations with `OPERATION_IN_PROGRESS`. PDFR-07 must not add a speculative public API unless the measurements justify it.

The PDFR2-06 embedded-image case measures two workloads: a mixed-unique fixture page (`embedded-images.pdf` page 1: one inline image, five image XObject paints, two unique XObject references, 6 extracted images, 3 PNG encodes) and a repeated-raster page (`image-heavy.pdf` page 1: one 96x96 DeviceRGB XObject painted 6 times, 6 extracted images, 1 PNG encode). The shipped API still returns embedded-image data URLs; repeated XObject paints are expected to encode once per unique XObject per page.

## What PDFR3-10 changed

- **Bounded reorder window.** `runBoundedStrategy` declares `REORDER_WINDOW_PAGES = 2` and enforces it: after every completion the emittable prefix drains synchronously and workers block while post-drain retention is at the window. A stalled first page therefore cannot retain more than 2 pages no matter how long the document is. Output order stays deterministic (page-number order). Focused checks prove the slow-first-page (12 pages, first gated) and slow-consumer (8 pages, 20 ms emission delay) cases stay within the window with exact `1..N` order.
- **Simultaneous peaks, not summed peaks.** `createGlobalPageTracker` shares one active/peak counter across all loaded documents, so `peakActivePages` is a measured simultaneous peak of PDF.js-internal page proxies. A deliberate overlap/non-overlap check validates the tracker (2 held pages read 2; sequential acquire/release reads 1). Per-document peaks are never summed.
- **Resource ownership.** `peakActivePages` counts PDF.js-internal page proxies (released via `page.cleanup()`); `peakActiveCanvases` counts package-owned canvases with nonzero dimensions (via `canvasFactory`); `peakRetainedPages`/`peakRetainedOutputBytes` count package-retained `PageResult` output. Excluded and unstated: PDF.js worker heap, parsed-document structures, and compositor/GPU memory.
- **Reader/worker counts.** Every run reports `loadedReaderCount` (1 serial, 2 bounded) and `workerSetup` (one app-global `pdf.worker` URL shared by all loaded documents). Two-reader gains therefore cannot be attributed solely to page concurrency: the bounded path pays for a second loaded document and its load cost.
- **Load-inclusive vs conversion-only.** Every run reports `loadWallTimeMs` (all `reader.load()` calls), `convertWallTimeMs`/`wallTimeMs` (page work only), and `totalWallTimeMs` (load + conversion).
- **Warmup, repeats, order.** Each fixture runs 1 unrecorded warmup per strategy plus 3 recorded repeats, interleaved serial/bounded per repeat. The summary records `measurementOrder`, per-repeat samples, and min/median/max stats.
- **Stage-synchronized abort.** `measureAbortLatency` polls (10 ms) for an observed active page/canvas stage up to 5 s, then aborts and reports `abortLatencyMs`, `code`, `stageReached`, and `stageDetail`. When no stage is reachable it reports `stageReached: false` with the reason instead of relying on a fixed sleep.
- **Image accounting.** Each image workload reports per-repeat wall time, extracted image count, PNG encode count (`toDataURL` calls), scratch canvas allocations, scratch peak active canvases, retained output bytes, operator counts, and long-task observation, all within stated budgets (<= 12 scratch canvases, <= 25 MB retained-output estimate).

## Fixtures

`generate-fixtures.mjs` writes deterministic PDFs and matching `*.base64.txt` sidecars under `generated/`.

- `short.pdf`: one-page control fixture
- `long.pdf`: twelve-page low-density text document for page-count scaling (12 pages x 8 lines)
- `text-heavy.pdf`: three-page dense text document for glyph/text extraction pressure (3 pages x 48 lines)
- `image-heavy.pdf`: three-page repeated-raster document for render/encode pressure (one shared 96x96 DeviceRGB XObject, 6 placements per page, `viewportScale: 2` in the matrix)

The generator uses no external dependencies.

Regenerate with:

```sh
node benchmark/generate-fixtures.mjs
```

## Running

```sh
pnpm --filter @web-ts-toolkit/pdf-reader benchmark
```

The benchmark runs in real Headless Chromium through Vitest's browser mode, imports the built ESM bundle from `dist/index.mjs`, configures the PDF.js worker through the documented application boundary, and logs a structured `PDFR-07 benchmark summary ...` JSON payload plus a `PDFR2-06 embedded-image benchmark summary ...` payload.

## Historical Run (2026-08-19, pre-PDFR3-10 methodology)

Observed on 2026-08-19 with:

- command: `pnpm --filter @web-ts-toolkit/pdf-reader benchmark`
- browser: `HeadlessChrome/151.0.7922.34`
- browser hardware context: `navigator.hardwareConcurrency === 32`, `navigator.deviceMemory === 32`
- host kernel: `Linux 6.18.33.2-microsoft-standard-WSL2 x86_64`

Measured results from the old single-sample methodology (conversion-only wall time; per-document page peaks summed, not simultaneous; abort via fixed 5 ms sleep; embedded-image timing on the tiny fixture only):

| Fixture           | Serial `pages()` wall time | Bounded `2` wall time | Peak pages/canvases | Decision note                                                          |
| ----------------- | -------------------------- | --------------------- | ------------------- | ---------------------------------------------------------------------- |
| `short.pdf`       | `32.1 ms`                  | `22.5 ms`             | `1/1` vs `1/1`      | One-page control is too small to justify API work.                     |
| `long.pdf`        | `207.1 ms`                 | `107.3 ms`            | `1/1` vs `2/2`      | Material throughput gain, but it doubles active page/canvas ownership. |
| `text-heavy.pdf`  | `69.7 ms`                  | `72.5 ms`             | `1/1` vs `2/2`      | No win on dense text extraction.                                       |
| `image-heavy.pdf` | `62.3 ms`                  | `39.3 ms`             | `1/1` vs `2/2`      | Render-heavy pages improve, but memory ownership still doubles.        |

Other recorded metrics:

- approximate retained output bytes matched fixture payload size for both strategies because the benchmark preserves deterministic order and does not buffer unbounded completed pages
- long tasks: `0` observed for both strategies across this Headless Chromium run
- abort latency on `image-heavy.pdf` at `viewportScale: 4`: serial `1.4 ms`, bounded `0.8 ms`, both rejecting with `ABORTED`

These numbers are preserved as historical. They predate bounded retention, global simultaneous peaks, load-inclusive timing, warmup/repeats, and stage-synchronized abort, and must not be compared sample-for-sample with the current baseline.

## Current Baseline (2026-09-12, PDFR3-10 methodology)

Observed on 2026-09-12 with:

- command: `pnpm --filter @web-ts-toolkit/pdf-reader benchmark`
- browser: `HeadlessChrome/151.0.7922.34`
- browser hardware context: `navigator.hardwareConcurrency === 32`, `navigator.deviceMemory === 32`
- peer: `pdfjs-dist ~6.2.108` (installed `6.2.108`)
- methodology: `CONCURRENCY = 2`, `REORDER_WINDOW_PAGES = 2`, 1 warmup + 3 measured repeats per strategy/fixture, interleaved serial/bounded order; conversion-only, load, and load-inclusive times reported; peaks are global simultaneous; abort synchronized with observed stage

Conversion-only wall time, median of 3 repeats (min–max range in parentheses):

| Fixture (`viewportScale`) | Serial median            | Bounded-2 median         | Simultaneous pages/canvases (bounded) | Retained pages <= window |
| ------------------------- | ------------------------ | ------------------------ | ------------------------------------- | ------------------------ |
| `short.pdf` (1.5)         | `36.8 ms` (35.2–43.8)    | `37.9 ms` (32.1–38.0)    | `1/1`                                 | yes (`0 <= 2`)           |
| `long.pdf` (1.5)          | `220.4 ms` (220.1–222.3) | `176.6 ms` (172.5–211.6) | `2/2`                                 | yes (`0 <= 2`)           |
| `text-heavy.pdf` (1.5)    | `131.2 ms` (107.2–144.7) | `109.9 ms` (106.6–124.2) | `2/2`                                 | yes (`<= 1 <= 2`)        |
| `image-heavy.pdf` (2)     | `115.3 ms` (102.2–146.0) | `101.0 ms` (97.0–115.4)  | `2/2`                                 | yes (`<= 1 <= 2`)        |

Load-inclusive context (same run): loading the second document costs roughly an extra ~110–150 ms per fixture (bounded `loadWallTimeMs` ~340–530 ms vs serial ~230–480 ms), so load-inclusive totals favor serial on these small fixtures even when conversion-only favors bounded overlap. That is why the decision below does not attribute two-reader conversion gains to page concurrency alone.

Other current metrics:

- output order deterministic `1..N` for every repeat and strategy; cross-strategy order matches per repeat index
- long tasks: `0` observed for all page-matrix repeats and both image workloads in this run
- abort on `image-heavy.pdf` at `viewportScale: 4`, stage-synchronized: serial `2.8 ms`, bounded `3.7 ms`, both rejecting with `ABORTED`, both with `stageReached: true` (active page/canvas observed after 26.5 ms serial / 48 ms bounded)
- image workloads (3 repeats each): mixed-unique page `13.6/19.9/16.0 ms`, 6 images, 3 encodes, 3 scratch allocations, peak scratch 1, ~876 output bytes; repeated-raster page `12.9/12.3/8.7 ms`, 6 images, 1 encode, 1 scratch allocation, peak scratch 1, ~227,940 output bytes; operator counts `{inline 1, xobject 5, unique 2}` vs `{inline 0, xobject 6, unique 1}`; all within budget

Variability note: `text-heavy.pdf` serial spans 107–145 ms and bounded `image-heavy.pdf` retained bytes alternate 200,284/400,568 across repeats (Blob byte sizing), so single-sample comparisons are not meaningful; use the reported min/median/max.

Current PDFR3-10 decision: keep the shipped runtime API serial-only. Bounded overlap can reduce conversion-only time on some fixtures, but it doubles loaded documents, doubles simultaneous page/canvas ownership, and loses load-inclusive on these fixtures; the evidence still lacks a browser memory budget and representative slow-consumer measurements, so the package does not expose a speculative concurrency option yet. No runtime concurrency or Blob-output change is proposed on the basis of these numbers.
