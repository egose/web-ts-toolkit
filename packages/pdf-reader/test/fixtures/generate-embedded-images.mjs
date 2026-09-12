import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturesDir = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(fixturesDir, 'generated/embedded-images.pdf');
const outputBase64Path = `${outputPath}.base64.txt`;

function ascii(value) {
  return Buffer.from(value, 'ascii');
}

function stream(dictionary, data) {
  return Buffer.concat([
    ascii(`<< ${dictionary} /Length ${data.length} >>\nstream\n`),
    data,
    ascii('\nendstream'),
  ]);
}

function buildPdf() {
  const objects = [];
  const addObject = (body) => {
    objects.push(Buffer.isBuffer(body) ? body : ascii(body));
    return objects.length;
  };

  const inlineGray = Buffer.from([0x7f]);
  const rgbRed = Buffer.from([0xff, 0x00, 0x00]);
  const softMask = Buffer.from([0x80]);

  const pageOneContent = Buffer.concat([
    ascii('q\n10 0 0 10 10 10 cm\nBI\n/W 1\n/H 1\n/CS /G\n/BPC 8\nID\n'),
    inlineGray,
    ascii('\nEI\nQ\n'),
    ascii('q\n10 0 0 10 30 10 cm\n/Im1 Do\nQ\n'),
    ascii('q\n10 0 0 10 50 10 cm\n/Im1 Do\nQ\n'),
    ascii('q\n2 0 0 2 10 10 cm\nq\n3 0 0 4 5 6 cm\n/Im1 Do\nQ\nQ\n'),
    ascii('q\n-10 0 0 10 90 10 cm\n/Im1 Do\nQ\n'),
    ascii('q\n10 0 0 10 10 40 cm\n/Im2 Do\nQ\n'),
  ]);

  const formContent = ascii('q\n1 0 0 1 0 0 cm\n/Im1 Do\nQ\n');
  const pageTwoContent = ascii('q\n10 0 0 10 20 30 cm\n/Fm1 Do\nQ\n');

  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>');
  addObject(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /ProcSet [/PDF /ImageB /ImageC] /XObject << /Im1 7 0 R /Im2 8 0 R >> >> /Contents 5 0 R >>',
  );
  addObject(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Fm1 11 0 R >> >> /Contents 6 0 R >>',
  );
  addObject(stream('', pageOneContent));
  addObject(stream('', pageTwoContent));
  addObject(
    stream(
      '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8',
      rgbRed,
    ),
  );
  addObject(
    stream(
      '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask 9 0 R',
      rgbRed,
    ),
  );
  addObject(
    stream(
      '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8',
      softMask,
    ),
  );
  addObject(
    stream(
      '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8',
      rgbRed,
    ),
  );
  addObject(
    stream(
      '/Type /XObject /Subtype /Form /BBox [0 0 1 1] /Matrix [2 0 0 3 1 2] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im1 10 0 R >> >>',
      formContent,
    ),
  );

  const header = ascii('%PDF-1.4\n%\x80\x81\x82\x83\n');
  let offset = header.length;
  const parts = [header];
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    const objectBytes = Buffer.concat([ascii(`${index + 1} 0 obj\n`), objects[index], ascii('\nendobj\n')]);
    offsets.push(offset);
    parts.push(objectBytes);
    offset += objectBytes.length;
  }

  const xrefOffset = offset;
  const xrefLines = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f '];
  for (let index = 1; index < offsets.length; index += 1) {
    xrefLines.push(`${String(offsets[index]).padStart(10, '0')} 00000 n `);
  }

  parts.push(
    ascii(
      `${xrefLines.join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(parts);
}

const pdf = buildPdf();
await writeFile(outputPath, pdf);
await writeFile(outputBase64Path, pdf.toString('base64'), 'ascii');
console.log(`Wrote ${outputPath}`);

const sharedPath = resolve(fixturesDir, 'generated/embedded-shared.pdf');
const sharedPdf = buildSharedPdf();
await writeFile(sharedPath, sharedPdf);
await writeFile(`${sharedPath}.base64.txt`, sharedPdf.toString('base64'), 'ascii');
console.log(`Wrote ${sharedPath}`);

const oneBitPath = resolve(fixturesDir, 'generated/embedded-1bit.pdf');
const oneBitPdf = buildOneBitPdf();
await writeFile(oneBitPath, oneBitPdf);
await writeFile(`${oneBitPath}.base64.txt`, oneBitPdf.toString('base64'), 'ascii');
console.log(`Wrote ${oneBitPath}`);

/**
 * One-bit XObject fixture for PDFR3-06.
 *
 * Two DeviceGray/BPC-1 XObjects painted on one page:
 * - `Bw1`: 1x1 white pixel (`0x80`, MSB set). Reproduces the reported
 *   wrong-pixel case where length-inferred decoding returned gray
 *   `[128,128,128,255]` instead of white.
 * - `BwWide`: 9x2 packed rows (`ceil(9/8) = 2` bytes per row) covering
 *   row-padding boundaries and multiple rows. Row 0 is W,B,W,B,W,B,W,B,W
 *   (`AA 80`); row 1 is B,W,B,W,B,W,B,W,B (`55 00`).
 *
 * Both take PDF.js's `GRAYSCALE_1BPP` path when `isOffscreenCanvasSupported`
 * is false, and the `ImageBitmap` path otherwise.
 */
function buildOneBitPdf() {
  const objects = [];
  const addObject = (body) => {
    objects.push(Buffer.isBuffer(body) ? body : ascii(body));
    return objects.length;
  };

  const whitePixel = Buffer.from([0x80]);
  const wideRows = Buffer.from([0xaa, 0x80, 0x55, 0x00]);

  const content = Buffer.concat([
    ascii('q\n10 0 0 10 10 10 cm\n/Bw1 Do\nQ\n'),
    ascii('q\n9 0 0 2 20 30 cm\n/BwWide Do\nQ\n'),
  ]);

  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  addObject(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /ProcSet [/PDF /ImageB] /XObject << /Bw1 5 0 R /BwWide 6 0 R >> >> /Contents 4 0 R >>',
  );
  addObject(stream('', content));
  addObject(
    stream('/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 1', whitePixel),
  );
  addObject(
    stream('/Type /XObject /Subtype /Image /Width 9 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 1', wideRows),
  );

  const header = ascii('%PDF-1.4\n%\x80\x81\x82\x83\n');
  let offset = header.length;
  const parts = [header];
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    const objectBytes = Buffer.concat([ascii(`${index + 1} 0 obj\n`), objects[index], ascii('\nendobj\n')]);
    offsets.push(offset);
    parts.push(objectBytes);
    offset += objectBytes.length;
  }

  const xrefOffset = offset;
  const xrefLines = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f '];
  for (let index = 1; index < offsets.length; index += 1) {
    xrefLines.push(`${String(offsets[index]).padStart(10, '0')} 00000 n `);
  }

  parts.push(
    ascii(
      `${xrefLines.join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(parts);
}

/**
 * Shared-image XObject fixture for PDFR3-13 (PDFR3-07 follow-up).
 *
 * Three pages share one 8x8 DeviceRGB XObject *Ref* (object 9): two paints on
 * page 1, one paint each on pages 2-3. Repeating the same Ref on >= 2 pages
 * exceeds the worker `GlobalImageCache.NUM_PAGES_THRESHOLD = 2`, so the
 * worker globalizes the image as a `g_`-prefixed `commonObjs` entry and later
 * pages reference it through an `OPS.dependency` entry. Pre-fix extraction
 * routed every reference through `page.objs.get()` and omitted the page 2-3
 * paints; the fixed adapter routes `g_` IDs to `page.commonObjs` and awaits
 * readiness via callback-form `get`.
 *
 * Pixels are solid red (255,0,0) so browser assertions can verify exact
 * decoded output on every page, pre- and post-render.
 */
function buildSharedPdf() {
  const objects = [];
  const addObject = (body) => {
    objects.push(Buffer.isBuffer(body) ? body : ascii(body));
    return objects.length;
  };

  const redPixels = Buffer.alloc(8 * 8 * 3);
  for (let pixel = 0; pixel < 8 * 8; pixel += 1) {
    redPixels[pixel * 3] = 0xff;
    redPixels[pixel * 3 + 1] = 0x00;
    redPixels[pixel * 3 + 2] = 0x00;
  }

  const pageOneContent = Buffer.concat([
    ascii('q\n8 0 0 8 10 10 cm\n/ImShared Do\nQ\n'),
    ascii('q\n8 0 0 8 30 10 cm\n/ImShared Do\nQ\n'),
  ]);
  const pageTwoContent = ascii('q\n8 0 0 8 10 10 cm\n/ImShared Do\nQ\n');
  const pageThreeContent = ascii('q\n8 0 0 8 10 10 cm\n/ImShared Do\nQ\n');
  const sharedResources = '<< /ProcSet [/PDF /ImageC] /XObject << /ImShared 9 0 R >> >>';

  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>');
  addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources ${sharedResources} /Contents 6 0 R >>`);
  addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources ${sharedResources} /Contents 7 0 R >>`);
  addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources ${sharedResources} /Contents 8 0 R >>`);
  addObject(stream('', pageOneContent));
  addObject(stream('', pageTwoContent));
  addObject(stream('', pageThreeContent));
  addObject(
    stream(
      '/Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceRGB /BitsPerComponent 8',
      redPixels,
    ),
  );

  const sharedHeader = ascii('%PDF-1.4\n%\x80\x81\x82\x83\n');
  let sharedOffset = sharedHeader.length;
  const sharedParts = [sharedHeader];
  const sharedOffsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    const objectBytes = Buffer.concat([ascii(`${index + 1} 0 obj\n`), objects[index], ascii('\nendobj\n')]);
    sharedOffsets.push(sharedOffset);
    sharedParts.push(objectBytes);
    sharedOffset += objectBytes.length;
  }

  const sharedXrefOffset = sharedOffset;
  const sharedXrefLines = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f '];
  for (let index = 1; index < sharedOffsets.length; index += 1) {
    sharedXrefLines.push(`${String(sharedOffsets[index]).padStart(10, '0')} 00000 n `);
  }

  sharedParts.push(
    ascii(
      `${sharedXrefLines.join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${sharedXrefOffset}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(sharedParts);
}
