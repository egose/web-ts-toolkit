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
