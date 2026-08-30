import { describe, it, expect } from 'vitest';
import { encodeAsset, encodeAssets, createAssetCatalog } from '../src/index.ts';
import type { AssetDetector } from '../src/detect.ts';

/**
 * AINL2-09 regression: per-operation detector injection must isolate concurrent consumers.
 * Before fix this relied on process-global setDetector/resetDetector which raced.
 */

function makeStub(ext: string, mime: string, delayMs = 5): AssetDetector {
  return {
    async detect(_bytes: Uint8Array, signal?: AbortSignal) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      await new Promise((r) => setTimeout(r, delayMs));
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      return { ext, mime };
    },
  };
}

describe('AINL2-09: per-operation detector injection isolates concurrent ops', () => {
  it('two concurrent encodeAsset ops with different detectors do not interfere', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const detectorPng = makeStub('png', 'image/png', 12);
    const detectorGif = makeStub('gif', 'image/gif', 8);

    const [resPng, resGif] = await Promise.all([
      encodeAsset({ data }, { detection: 'content', detector: detectorPng }),
      encodeAsset({ data }, { detection: 'content', detector: detectorGif }),
    ]);

    expect(resPng.mediaType).toBe('image/png');
    expect(resPng.kind).toBe('image');
    expect(resGif.mediaType).toBe('image/gif');
    expect(resGif.kind).toBe('image');
  });

  it('two concurrent encodeAssets batches with different detectors isolate', async () => {
    const data = new Uint8Array([9, 9, 9]);
    const detectorPng = makeStub('png', 'image/png', 10);
    const detectorWebp = makeStub('webp', 'image/webp', 10);

    const batchPng = [{ data, filename: undefined } as const, { data, filename: undefined } as const];
    const batchWebp = [{ data } as const];

    const [resPng, resWebp] = await Promise.all([
      encodeAssets(
        batchPng.map((b) => ({ data: b.data })),
        { detection: 'content', detector: detectorPng },
      ),
      encodeAssets(
        batchWebp.map((b) => ({ data: b.data })),
        { detection: 'content', detector: detectorWebp },
      ),
    ]);

    for (const r of resPng) expect(r.mediaType).toBe('image/png');
    expect(resWebp[0]!.mediaType).toBe('image/webp');
  });

  it('concurrent createAssetCatalog with different detectors isolates (byte inputs, no FS)', async () => {
    const data = new Uint8Array([7, 7, 7]);
    const detectorPng = makeStub('png', 'image/png', 15);
    const detectorJpg = makeStub('jpg', 'image/jpeg', 5);

    const [catPng, catJpg] = await Promise.all([
      createAssetCatalog([{ data }], { detection: 'content', detector: detectorPng }),
      createAssetCatalog([{ data }], { detection: 'content', detector: detectorJpg }),
    ]);

    expect(catPng.assets[0]!.mediaType).toBe('image/png');
    expect(catJpg.assets[0]!.mediaType).toBe('image/jpeg');
  });

  it('per-op detector overrides default without global mutation; no shared cleanup needed', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const detectorA = makeStub('png', 'image/png');
    const detectorB = makeStub('gif', 'image/gif');

    // sequential use with different detectors should not leak
    const resA = await encodeAsset({ data }, { detection: 'content', detector: detectorA });
    const resB = await encodeAsset({ data }, { detection: 'content', detector: detectorB });
    const resC = await encodeAsset({ data }, { detection: 'content', detector: detectorA });

    expect(resA.mediaType).toBe('image/png');
    expect(resB.mediaType).toBe('image/gif');
    expect(resC.mediaType).toBe('image/png');
  });

  it('detector option validated: non-detector throws InvalidOptionsError', async () => {
    const data = new Uint8Array([1]);
    await expect(
      encodeAsset(
        { data },
        { detection: 'content', detector: { detect: 'not-a-function' } as unknown as AssetDetector },
      ),
    ).rejects.toThrow(/detector/i);
  });

  it('two concurrent verify detectors isolate mismatch vs success', async () => {
    // detector returning png, extension expects png vs jpg
    const pngBytes = new Uint8Array([1, 2, 3]);
    const detectorPng = makeStub('png', 'image/png', 8);
    const detectorJpg = makeStub('jpg', 'image/jpeg', 8);

    const [ok, mismatch] = await Promise.allSettled([
      encodeAsset({ data: pngBytes, filename: 'a.png' }, { detection: 'verify', detector: detectorPng }),
      encodeAsset({ data: pngBytes, filename: 'a.jpg' }, { detection: 'verify', detector: detectorPng }),
    ]);

    // parallel with different detectors on same filename: one png detector vs jpg detector on png expected
    const [rPng, rJpg] = await Promise.allSettled([
      encodeAsset({ data: pngBytes, filename: 'a.png' }, { detection: 'verify', detector: detectorPng }),
      encodeAsset({ data: pngBytes, filename: 'a.png' }, { detection: 'verify', detector: detectorJpg }),
    ]);

    expect(ok.status).toBe('fulfilled');
    expect(mismatch.status).toBe('rejected');
    expect(rPng.status).toBe('fulfilled');
    expect(rJpg.status).toBe('rejected');
    if (rJpg.status === 'rejected') {
      expect(String((rJpg.reason as Error).message)).toMatch(/mismatch/i);
    }
  });
});
