import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { encodeAsset } from '../src/index.ts';
import { DetectionMismatchError } from '../src/errors.ts';

const IMAGES_DIR = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  'fixtures',
  'legacy',
  'images',
);

function readFixture(name: string): Uint8Array {
  return fs.readFileSync(path.join(IMAGES_DIR, name));
}

function decodePayload(dataUrl: string): Buffer {
  const idx = dataUrl.indexOf(';base64,');
  if (idx < 0) throw new Error('missing ;base64, delimiter');
  return Buffer.from(dataUrl.slice(idx + ';base64,'.length), 'base64');
}

describe('AIH-10a: detector MIME aliases (ICO/CUR file-type alias)', () => {
  it('content mode detects real ICO bytes with canonical MIME and exact bytes', async () => {
    const data = readFixture('sample.ico');
    const res = await encodeAsset({ data }, { detection: 'content' });
    expect(res.mediaType).toBe('image/vnd.microsoft.icon');
    expect(res.kind).toBe('image');
    expect(decodePayload(res.dataUrl).equals(Buffer.from(data))).toBe(true);
  });

  it('content mode detects real CUR bytes with canonical MIME and exact bytes', async () => {
    const data = readFixture('sample.cur');
    const res = await encodeAsset({ data }, { detection: 'content' });
    expect(res.mediaType).toBe('image/vnd.microsoft.icon');
    expect(res.kind).toBe('image');
    expect(decodePayload(res.dataUrl).equals(Buffer.from(data))).toBe(true);
  });

  it('verify mode accepts real ICO bytes against .ico extension', async () => {
    const data = readFixture('sample.ico');
    const res = await encodeAsset({ data, filename: 'icon.ico' }, { detection: 'verify' });
    expect(res.mediaType).toBe('image/vnd.microsoft.icon');
    expect(decodePayload(res.dataUrl).equals(Buffer.from(data))).toBe(true);
  });

  it('verify mode accepts real CUR bytes against .cur extension', async () => {
    const data = readFixture('sample.cur');
    const res = await encodeAsset({ data, filename: 'cursor.cur' }, { detection: 'verify' });
    expect(res.mediaType).toBe('image/vnd.microsoft.icon');
    expect(decodePayload(res.dataUrl).equals(Buffer.from(data))).toBe(true);
  });

  it('contradictory PNG bytes vs JPEG extension still reject in verify mode', async () => {
    const png = readFixture('sample.png');
    await expect(encodeAsset({ data: png, filename: 'a.jpg' }, { detection: 'verify' })).rejects.toBeInstanceOf(
      DetectionMismatchError,
    );
  });

  it('contradictory JPEG bytes vs PNG extension still reject in verify mode', async () => {
    const jpg = readFixture('sample.jpg');
    await expect(encodeAsset({ data: jpg, filename: 'a.png' }, { detection: 'verify' })).rejects.toBeInstanceOf(
      DetectionMismatchError,
    );
  });
});
