import { describe, it, expect } from 'vitest';
import { encodeAsset, encodeAssetSync, builtInDefinitions } from '../src/index.ts';
import { InvalidOptionsError } from '../src/errors.ts';

function decodePayload(dataUrl: string): Buffer {
  const idx = dataUrl.indexOf(';base64,');
  if (idx < 0) throw new Error('missing ;base64, delimiter');
  return Buffer.from(dataUrl.slice(idx + ';base64,'.length), 'base64');
}

/** Real data-URL consumer probe: no unintended fragment and exact bytes. */
async function expectUsableDataUrl(dataUrl: string, expected: Uint8Array): Promise<void> {
  const parsed = new URL(dataUrl);
  expect(parsed.hash).toBe('');
  expect(parsed.protocol).toBe('data:');
  const res = await fetch(dataUrl);
  expect(res.ok).toBe(true);
  const buf = Buffer.from(await res.arrayBuffer());
  expect(buf.equals(Buffer.from(expected))).toBe(true);
  expect(decodePayload(dataUrl).equals(Buffer.from(expected))).toBe(true);
}

describe('AIH-10b: MIME data-URL serialization boundary', () => {
  it('safe explicit MIME produces usable URL (async) with no fragment and exact bytes', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const res = await encodeAsset({ data, filename: 'a.bin', mediaType: 'image/custom' });
    expect(res.mediaType).toBe('image/custom');
    await expectUsableDataUrl(res.dataUrl, data);
  });

  it('safe explicit MIME produces usable URL (sync) with no fragment and exact bytes', async () => {
    const data = new Uint8Array([5, 6, 7]);
    const res = encodeAssetSync({ data, filename: 'a.bin', mediaType: 'image/custom' });
    expect(res.mediaType).toBe('image/custom');
    await expectUsableDataUrl(res.dataUrl, data);
  });

  it('punctuated explicit MIME (async) is rejected with controlled INVALID_OPTIONS', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const err = await encodeAsset({ data, filename: 'a.bin', mediaType: 'image/x#demo' }).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(InvalidOptionsError);
    expect((err as InvalidOptionsError).code).toBe('INVALID_OPTIONS');
  });

  it('punctuated explicit MIME (sync) is rejected with controlled INVALID_OPTIONS', () => {
    const data = new Uint8Array([1, 2, 3]);
    try {
      encodeAssetSync({ data, filename: 'a.bin', mediaType: 'image/x#demo' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidOptionsError);
      expect((e as InvalidOptionsError).code).toBe('INVALID_OPTIONS');
    }
  });

  it('punctuated custom definition is rejected with controlled INVALID_OPTIONS (async)', async () => {
    const data = new Uint8Array([9, 8, 7]);
    const custom = { kind: 'image', extensions: ['.punct'], mediaType: 'image/x#demo' } as const;
    await expect(
      encodeAsset({ data, filename: 'a.punct' }, { definitions: [...builtInDefinitions, custom as never] }),
    ).rejects.toBeInstanceOf(InvalidOptionsError);
  });

  it('punctuated custom definition is rejected with controlled INVALID_OPTIONS (sync)', () => {
    const data = new Uint8Array([9, 8, 7]);
    const custom = { kind: 'image', extensions: ['.punct'], mediaType: 'image/x#demo' } as const;
    expect(() =>
      encodeAssetSync({ data, filename: 'a.punct' }, { definitions: [...builtInDefinitions, custom as never] }),
    ).toThrow(InvalidOptionsError);
  });
});
