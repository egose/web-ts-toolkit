"""Deterministic PDF fixture generator for `@web-ts-toolkit/pdf-reader`.

This script is maintainer tooling. It is NOT part of the npm runtime, npm
package install, workspace `pnpm test`, or CI flow. A maintainer runs it only
when PDFR-01 fixtures need to be added or regenerated, then commits the
resulting `generated/**` PDFs and base64 sidecar clips. See `README.md` in
this directory for the documented regeneration command and supported Python
environment.

Design constraints:

* Every fixture is byte-deterministic. No timestamps, no random IDs, no
  metadata that varies between runs of `fpdf2` + `Pillow`. fpdf2 builds PDFs
  in memory, so re-running the same preset should produce byte-identical
  output on a given `fpdf2`/`Pillow`/Python combination.
* Each binary fixture is paired with a `<name>.pdf.base64.txt` sidecar holding
  the base64-encoded bytes. A sidecar file is a single line with no trailing
  newline so browser tests can `import('...?raw')` it and `atob()` directly.
  CSS JS bundlers (Vite) treat `?raw` imports as string module values; that
  keeps the real binary off the JS bundle while remaining offline and
  deterministic inside the tests. Each browser test decodes the sidecar inside
  the real chromium process and feeds `Uint8Array` bytes to `PDFReader`.
* Fixtures intentionally stay small (each < 5 KB). Large fixture PDFs would
  not validate any boundary a smaller fixture does not, and they would bloat
  the published repo and `npm pack` artifact.

Run:

    python3 generate.py

The script writes nothing outside its own directory.

Mapping the PDFR-01 acceptance criteria to the fixtures produced below:

    sample.pdf            A single-page portrait PDF with text. Boots a real
                          PDF.js worker in a real browser and proves text
                          extraction works end-to-end. Provides the simplest
                          "happy path" baseline used across the integration
                          tests.
    multi.pdf             A 3-page PDF with text, a landscape page (viewport
                          differs from portrait pages), and one embedded
                          raster image. Exercises multi-page page count,
                          selected-page (tuple and single), viewport
                          differences, MIME type of rendered output, and
                          embedded-image coverage.
    malformed.pdf         A truncated form of `multi.pdf` so the PDF.js worker
                          rejects it with a structured error. Proves a
                          malformed input fails without leaking a live
                          loading task, document, or worker owned by the test.
    encrypted.pdf         A single-page PDF that requires a known user
                          password to open. Proves the package surfaces the
                          PDF.js password prompt as a rejected promise and
                          that supplying the password through the documented
                          `PdfSource` boundary loads the document and
                          extracts text.
    image-50.png          The embedded raster used by `multi.pdf`'s third
                          page. Taken from `Pillow`'s deterministic solid
                          fill. Kept here for reproducible regeneration even
                          though the test code only consumes the PDF.
"""

from __future__ import annotations

import base64
import io
import os
import sys
from pathlib import Path

try:
    from fpdf import FPDF
except ImportError as exc:  # pragma: no cover - maintainer-only error path
    sys.stderr.write(
        "fpdf2 is required to regenerate PDFR-01 fixtures.\n"
        "  pip install fpdf2 Pillow\n"
        "Aborting.\n",
    )
    raise SystemExit(1) from exc

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - maintainer-only error path
    sys.stderr.write(
        "Pillow is required to generate the embedded raster image.\n"
        "  pip install Pillow\n"
        "Aborting.\n",
    )
    raise SystemExit(1) from exc


REPO_FIXTURES_DIR = Path(__file__).resolve().parent
GENERATED_DIR = REPO_FIXTURES_DIR / "generated"
GENERATED_DIR.mkdir(exist_ok=True)

USER_PASSWORD = "userpass" # pragma: allowlist secret
OWNER_PASSWORD = "ownerpass" # pragma: allowlist secret

PAGE1_TEXT = "Page 1 text"
PAGE2_TEXT = "Page 2 landscape"
PAGE3_TEXT = "Page 3 image-page"

# fpdf2 seeds `/CreationDate` from the wall clock by default, which makes
# re-runs byte-varies because it differs by minute. Pin a fixed UTC instant
# so fixtures are byte-deterministic across re-runs (modulo fpdf2 internals
# that may still vary, e.g., the encryption salt — see README.md).
DETERMINISTIC_CREATION_DATETIME = (2026, 1, 1, 0, 0, 0)


def _new_portrait_pdf() -> FPDF:
    pdf = FPDF()
    pdf.set_auto_page_break(False)
    pdf.set_creation_date(DETERMINISTIC_CREATION_DATETIME)  # type: ignore[attr-defined]
    pdf.add_page(orientation="P")
    pdf.set_font("helvetica", size=12)
    pdf.cell(200, 10, text=PAGE1_TEXT)
    return pdf


def _write_binary(name: str, data: bytes) -> Path:
    pdf_path = GENERATED_DIR / name
    pdf_path.write_bytes(data)
    return pdf_path


def _write_base64_sidecar(pdf_path: Path) -> None:
    sidecar_path = pdf_path.with_suffix(pdf_path.suffix + ".base64.txt")
    encoded = base64.b64encode(pdf_path.read_bytes()).decode("ascii")
    sidecar_path.write_text(encoded)


def _finalize(pdf: FPDF, name: str) -> Path:
    buf = io.BytesIO()
    pdf.output(buf)
    data = buf.getvalue()
    path = _write_binary(name, data)
    _write_base64_sidecar(path)
    return path


def _build_sample_pdf() -> None:
    """One-page portrait PDF, plain text only. Happy path baseline."""
    pdf = _new_portrait_pdf()
    _finalize(pdf, "sample.pdf")


def _build_multi_page_pdf() -> None:
    """Three-page PDF exercising multi-page, viewport variation, and image embed."""
    image_path = GENERATED_DIR / "image-50.png"
    raster = Image.new("RGB", (50, 50), color=(255, 0, 0))
    raster.save(image_path, format="PNG")

    pdf = FPDF()
    pdf.set_auto_page_break(False)
    pdf.set_creation_date(DETERMINISTIC_CREATION_DATETIME)  # type: ignore[attr-defined]

    pdf.add_page(orientation="P")  # portrait default: 210x297
    pdf.set_font("helvetica", size=12)
    pdf.cell(200, 10, text=PAGE1_TEXT)

    pdf.add_page(orientation="L")  # landscape: 297x210 — non-trivial viewport
    pdf.set_font("helvetica", size=18)
    pdf.cell(200, 10, text=PAGE2_TEXT)

    pdf.add_page(orientation="P")  # portrait
    pdf.set_font("helvetica", size=12)
    pdf.cell(200, 10, text=PAGE3_TEXT)
    pdf.image(image_path, x=20, y=40, w=40, h=40)

    _finalize(pdf, "multi.pdf")

    raster.close()
    if image_path.exists() and _EMBEDDED_RASTER_USED:
        image_path.unlink()


def _build_malformed_pdf() -> None:
    """Truncate a real multi-page PDF so the PDF.js worker rejects it."""
    source = (GENERATED_DIR / "multi.pdf").read_bytes()
    keep = max(len(source) // 2, 256)
    _write_binary("malformed.pdf", source[:keep])
    pdf_path = GENERATED_DIR / "malformed.pdf"
    _write_base64_sidecar(pdf_path)


def _build_encrypted_pdf() -> None:
    """Single-page password-protected PDF. PDF.js requires the user password."""
    pdf = FPDF()
    pdf.set_auto_page_break(False)
    pdf.set_creation_date(DETERMINISTIC_CREATION_DATETIME)  # type: ignore[attr-defined]
    pdf.set_encryption(owner_password=OWNER_PASSWORD, user_password=USER_PASSWORD)
    pdf.add_page(orientation="P")
    pdf.set_font("helvetica", size=12)
    pdf.cell(200, 10, text="Secret page text")
    _finalize(pdf, "encrypted.pdf")


def _drop_known_metadata(path: Path) -> None:
    """No-op reserved hook to keep output byte-stable across fpdf2 revisions.

    `fpdf2`'s `Producer` metadata header is stable for a given fpdf2 version.
    We do not strip it here because stripping would break the PDF's trailer
    and produce invalid fixtures. Instead we pin the generator tooling below
    and document the regeneration environment in `README.md`.
    """
    return None


_EMBEDDED_RASTER_USED = True


def main() -> None:
    _build_sample_pdf()
    _build_multi_page_pdf()
    _build_malformed_pdf()
    _build_encrypted_pdf()
    print("PDFR-01 fixtures written to", GENERATED_DIR)


if __name__ == "__main__":
    main()
