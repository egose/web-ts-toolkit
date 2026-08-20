import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const benchmarkDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(benchmarkDir, 'generated');

function ascii(value) {
  return Buffer.from(value, 'ascii');
}

function escapePdfText(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function stream(dictionary, data) {
  return Buffer.concat([
    ascii(`<< ${dictionary} /Length ${data.length} >>\nstream\n`),
    data,
    ascii('\nendstream'),
  ]);
}

function buildPdf(objects) {
  const header = ascii('%PDF-1.4\n%\x80\x81\x82\x83\n');
  let offset = header.length;
  const offsets = [0];
  const parts = [header];

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

function textStream(lines, fontSize = 11, startX = 36, startY = 756, leading = 14) {
  const commands = [`BT`, `/F1 ${fontSize} Tf`, `${leading} TL`, `${startX} ${startY} Td`];
  for (const line of lines) {
    commands.push(`(${escapePdfText(line)}) Tj`, 'T*');
  }
  commands.push('ET');
  return ascii(`${commands.join('\n')}\n`);
}

function buildTextPdf({ pageLines, mediaBox = [0, 0, 612, 792] }) {
  const objects = [];
  const addObject = (body) => {
    objects.push(Buffer.isBuffer(body) ? body : ascii(body));
    return objects.length;
  };

  const catalogRef = addObject('');
  const pagesRef = addObject('');
  const fontRef = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageRefs = [];

  for (const lines of pageLines) {
    const contentRef = addObject(stream('', textStream(lines)));
    const pageRef = addObject(
      `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [${mediaBox.join(' ')}] /Resources << /Font << /F1 ${fontRef} 0 R >> >> /Contents ${contentRef} 0 R >>`,
    );
    pageRefs.push(pageRef);
  }

  objects[catalogRef - 1] = ascii(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
  objects[pagesRef - 1] = ascii(`<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
  return buildPdf(objects);
}

function createRgbImage(width, height) {
  const bytes = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      bytes[offset] = (x * 5) % 256;
      bytes[offset + 1] = (y * 3) % 256;
      bytes[offset + 2] = ((x + y) * 7) % 256;
    }
  }
  return bytes;
}

function imagePlacement(x, y, width, height) {
  return `q\n${width} 0 0 ${height} ${x} ${y} cm\n/Im1 Do\nQ\n`;
}

function buildImagePdf({ pages, imageWidth, imageHeight, placements, mediaBox = [0, 0, 612, 792] }) {
  const objects = [];
  const addObject = (body) => {
    objects.push(Buffer.isBuffer(body) ? body : ascii(body));
    return objects.length;
  };

  const catalogRef = addObject('');
  const pagesRef = addObject('');
  const imageRef = addObject(
    stream(
      `/Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8`,
      createRgbImage(imageWidth, imageHeight),
    ),
  );
  const pageRefs = [];
  const pageContent = ascii(placements.map((placement) => imagePlacement(...placement)).join(''));

  for (let index = 0; index < pages; index += 1) {
    const contentRef = addObject(stream('', pageContent));
    const pageRef = addObject(
      `<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [${mediaBox.join(' ')}] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im1 ${imageRef} 0 R >> >> /Contents ${contentRef} 0 R >>`,
    );
    pageRefs.push(pageRef);
  }

  objects[catalogRef - 1] = ascii(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`);
  objects[pagesRef - 1] = ascii(`<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
  return buildPdf(objects);
}

function longFixtureLines() {
  return Array.from({ length: 12 }, (_, pageIndex) =>
    Array.from({ length: 8 }, (_, lineIndex) =>
      `Long fixture page ${pageIndex + 1}, line ${lineIndex + 1}: bounded concurrency benchmark control text.`,
    ),
  );
}

function textHeavyFixtureLines() {
  return Array.from({ length: 3 }, (_, pageIndex) =>
    Array.from({ length: 48 }, (_, lineIndex) =>
      `Text heavy page ${pageIndex + 1}, line ${lineIndex + 1}: glyph density probe for throughput, ordering, and long-task measurement.`,
    ),
  );
}

async function writeFixture(name, bytes) {
  const pdfPath = resolve(outputDir, `${name}.pdf`);
  await writeFile(pdfPath, bytes);
  await writeFile(`${pdfPath}.base64.txt`, bytes.toString('base64'), 'ascii');
}

await mkdir(outputDir, { recursive: true });

await writeFixture(
  'short',
  buildTextPdf({
    pageLines: [[
      'Short benchmark fixture.',
      'One page only.',
      'Used as the fast serial control for PDFR-07.',
    ]],
  }),
);

await writeFixture('long', buildTextPdf({ pageLines: longFixtureLines() }));
await writeFixture('text-heavy', buildTextPdf({ pageLines: textHeavyFixtureLines() }));
await writeFixture(
  'image-heavy',
  buildImagePdf({
    pages: 3,
    imageWidth: 96,
    imageHeight: 96,
    placements: [
      [36, 560, 140, 140],
      [196, 560, 140, 140],
      [356, 560, 140, 140],
      [36, 380, 140, 140],
      [196, 380, 140, 140],
      [356, 380, 140, 140],
    ],
  }),
);

console.log(`Wrote benchmark fixtures to ${outputDir}`);
