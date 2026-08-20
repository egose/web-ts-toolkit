# `packages/pdf-reader/benchmark/`

Real-browser benchmark tooling for task PDFR-07 in `docs/tasks/20260818-233158-pdf-reader-hardening-follow-up.md`.

## Purpose

This directory measures whether page-level concurrency is worth adding to `@web-ts-toolkit/pdf-reader`.

The benchmark intentionally compares:

- the current package behavior: serial streaming through `reader.pages()`
- one candidate bounded strategy: an external scheduler that runs per-page `reader.convert({ pageRange })` work with a hard concurrency limit of `2` while preserving output order

The candidate lives only in benchmark code. PDFR-07 must not add a speculative public API unless the measurements justify it.

## Fixtures

`generate-fixtures.mjs` writes deterministic PDFs and matching `*.base64.txt` sidecars under `generated/`.

- `short.pdf`: one-page control fixture
- `long.pdf`: twelve-page low-density text document for page-count scaling
- `text-heavy.pdf`: three-page dense text document for glyph/text extraction pressure
- `image-heavy.pdf`: three-page repeated-raster document for render/encode pressure

The generator uses no external dependencies.

Regenerate with:

```sh
node benchmark/generate-fixtures.mjs
```

## Running

```sh
pnpm --filter @web-ts-toolkit/pdf-reader benchmark
```

The benchmark runs in real Headless Chromium through Vitest's browser mode, imports the built ESM bundle from `dist/index.mjs`, configures the PDF.js worker through the documented application boundary, and logs a structured `PDFR-07 benchmark summary ...` JSON payload.

## Recorded Local Run

Observed on 2026-08-19 with:

- command: `pnpm --filter @web-ts-toolkit/pdf-reader benchmark`
- browser: `HeadlessChrome/151.0.7922.34`
- browser hardware context: `navigator.hardwareConcurrency === 32`, `navigator.deviceMemory === 32`
- host kernel: `Linux 6.18.33.2-microsoft-standard-WSL2 x86_64`

Measured results from the structured benchmark summary:

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

Current PDFR-07 decision: keep the shipped runtime API serial-only. The benchmark proves that bounded overlap can help some fixtures, but the current evidence still lacks a browser memory budget and representative slow-consumer measurements, so the package does not expose a speculative concurrency option yet.
