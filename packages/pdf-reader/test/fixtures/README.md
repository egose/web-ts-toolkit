# `packages/pdf-reader/test/fixtures/`

The PDFs and `*.base64.txt` files in `generated/` are the **real-browser
compatibility reference** for `@web-ts-toolkit/pdf-reader`'s loading, worker
configuration, text extraction, page rendering, embedded-image extraction,
malformed-input rejection, encrypted-input rejection, and lifecycle cleanup
claims. The browser integration tests under `packages/pdf-reader/test/`
import the base64 sidecars (`?<import-suffix>=raw`), decode them inside real
chromium, feed the bytes to a built-but-packed `PDFReader`, and assert
behaviour against PDF.js running in a real Web Worker.

These fixtures belong to tasks PDFR-01 and PDFR-06 of
`docs/tasks/20260818-233158-pdf-reader-hardening-follow-up.md`.

## What lives here

```
generate.py      Deterministic Python generator. Re-running it in the
                 documented environment must produce byte-identical PDFs
                 and matching `*.base64.txt` sidecars.
generate-embedded-images.mjs
                 Deterministic Node.js generator for the PDFR-06 embedded-
                 image compatibility fixture. Uses no external dependencies.
generated/**      Committed binary fixtures plus base64 sidecars loaded by
                 the browser integration tests through Vite's `?raw` import.
README.md         This file.
```

The `?raw` import is reasonable for these small fixtures (each fixture is
under 3 KB). Real loading tests execute the built ESM bundle from
`packages/pdf-reader/dist/index.mjs` so they exercise what an installed
browser consumer connects to, not the TypeScript source.

## Fixture categories

| File                  | Coverage                                                                |
| --------------------- | ----------------------------------------------------------------------- |
| `sample.pdf`          | One-page portrait PDF with text. The simplest happy-path load used by   |
|                       | the bootstrapping renderers and text-extraction assertions across the   |
|                       | integration suite.                                                      |
| `multi.pdf`           | Three-page PDF with (1) portrait text, (2) a landscape page (non-       |
|                       | trivial viewport — width greater than height, different from portrait   |
|                       | pages), and (3) a portrait page embedding a 50×50 solid red raster      |
|                       | image. Exercises multi-page `numPages`, single and tuple `pageRange`,   |
|                       | per-page viewport differences, rendered-output MIME type, and           |
|                       | embedded-image extraction.                                              |
| `malformed.pdf`       | A truncation (`/2`) of `multi.pdf` so the worker rejects load with a    |
|                       | `PasswordException`-free malformed-document error. Proves a malformed   |
|                       | input fails without leaving a live loading task, document, or worker    |
|                       | owned by the test.                                                      |
| `encrypted.pdf`       | A single-page PDF requiring the documented user password. Proves that   |
|                       | the package surfaces PDF.js's password prompt as a rejected load        |
|                       | promise, and that supplying the password through the documented         |
|                       | `PdfSource` boundary loads the document and extracts text.              |
| `embedded-images.pdf` |
|                       | Two-page hand-authored PDF that characterizes embedded-image extraction |
|                       | through real PDF.js operator output: inline grayscale, repeated RGB     |
|                       | image XObjects, nested save/restore transforms, a mirrored transform,   |
|                       | one RGBA soft-mask image that surfaces through the browser              |
|                       | `ImageBitmap` path, and a nested form XObject with its own matrix.      |
|                       | Used by PDFR-06 to prove the private extractor boundary against real    |
|                       | fixtures rather than mocks only.                                        |

## Regenerating

The generator is maintainer tooling. It is **not** an npm runtime
dependency, a CI dependency, or part of any workspace install script.
Adding Python, `fpdf2`, or `Pillow` as a workspace prerequisite is out of
scope.

The supported regeneration environment is:
Python 3.13 with `fpdf2==2.8.8` and `Pillow>=10` (any 10.x or 11.x is
acceptable; `Image.new('RGB', (50, 50), color=(255, 0, 0))` is deterministic
since it writes no metadata). With those installed, run from this directory:

```
python3 generate.py
```

`embedded-images.pdf` is generated separately and does not require Python
dependencies:

```
node generate-embedded-images.mjs
```

`generate.py` pins `/CreationDate` to a fixed UTC value (`2026-01-01
00:00:00`) via `pdf.set_creation_date(...)`. Without that pin, `fpdf2`
writes the local wall clock into the trailer and the encrypted-output bytes
vary across runs. With the pin in place, the four fixtures are byte-stable
across regenerations on the documented `fpdf2`/`Pillow` versions. That
byte-stability is verified alongside the generate-test-commit loop; if a
re-run diff shows byte-mismatch, regenerate using the pinned environment
and commit the result.

## Updating the reference

Per the PDFR-01 working rules: when a PDF.js behaviour and a fixture
disagree during a test failure, first verify the fixture generator and the
pinned `fpdf2`/`Pillow` versions; do not silently relax a test assertion to
fit a fixture that may have been produced by a different environment. Bump
the recorded generator environment in this README only via re-running
`generate.py` in the new environment, and commit the regenerated files
together.

The committed binaries and sidecars in `generated/` are the reference. Do
not hand-edit them.
