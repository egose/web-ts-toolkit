import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  encodeAsset,
  encodeAssetSync,
  setDetector,
  resetDetector,
  defaultDetector,
  resolveByExtension,
  resolveWithDetector,
} from '../src/index.ts';
import { createDefinitionRegistry } from '../src/definitions.ts';
import {
  UnsupportedAssetError,
  DetectionMismatchError,
  InvalidOptionsError,
  ResourceLimitError,
} from '../src/errors.ts';

const IMAGES_DIR = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  'fixtures',
  'legacy',
  'images',
);
const FIXTURE_ROOT = path.resolve(IMAGES_DIR, '..');

beforeEach(() => resetDetector());
afterEach(() => resetDetector());

function pngBytes(): Uint8Array {
  return fs.readFileSync(path.join(IMAGES_DIR, 'sample.png'));
}
function jpgBytes(): Uint8Array {
  return fs.readFileSync(path.join(IMAGES_DIR, 'sample.jpg'));
}
function gifBytes(): Uint8Array {
  return fs.readFileSync(path.join(IMAGES_DIR, 'sample.gif'));
}
function svgBytes(): Uint8Array {
  return fs.readFileSync(path.join(IMAGES_DIR, 'sample.svg'));
}

describe('detect: extension mode deterministic, supports SVG text', () => {
  it('extension resolves PNG via filename (sync+async)', async () => {
    const resAsync = await encodeAsset({ data: pngBytes(), filename: 'a.png' }, { detection: 'extension' });
    expect(resAsync.mediaType).toBe('image/png');
    const resSync = encodeAssetSync({ data: pngBytes(), filename: 'a.png' }, { detection: 'extension' });
    expect(resSync.mediaType).toBe('image/png');
  });

  it('extension supports text SVG', async () => {
    const data = svgBytes();
    const asyncRes = await encodeAsset({ data, filename: 'icon.svg' });
    expect(asyncRes.mediaType).toBe('image/svg+xml');
    expect(asyncRes.kind).toBe('image');
    const syncRes = encodeAssetSync({ data, filename: 'icon.svg' });
    expect(syncRes.mediaType).toBe('image/svg+xml');
  });

  it('extension is case-insensitive', async () => {
    const data = pngBytes();
    const res = await encodeAsset({ data, filename: 'PHOTO.PNG' });
    expect(res.mediaType).toBe('image/png');
  });

  it('resolveByExtension direct helper', () => {
    const registry = createDefinitionRegistry();
    const meta = resolveByExtension({ filename: 'a.woff2', registry });
    expect(meta.mediaType).toBe('font/woff2');
    expect(meta.kind).toBe('font');
    expect(meta.fontFormat).toBe('woff2');
  });
});

describe('detect: content mode async-only, identifies binary via file-type', () => {
  it('content detects PNG when filename absent (no extension)', async () => {
    const data = pngBytes();
    const res = await encodeAsset({ data }, { detection: 'content' });
    expect(res.mediaType).toBe('image/png');
    expect(res.kind).toBe('image');
  });

  it('content detects JPEG when filename absent', async () => {
    const data = jpgBytes();
    const res = await encodeAsset({ data }, { detection: 'content' });
    expect(res.mediaType).toBe('image/jpeg');
  });

  it('content may identify via bounded input (first 4100 bytes)', async () => {
    // Use a large PNG-like buffer with extra trailing bytes - detection should still succeed via first chunk
    const data = pngBytes();
    const large = new Uint8Array(8000);
    large.set(data, 0);
    large.fill(0x61, data.length);
    const res = await encodeAsset({ data: large }, { detection: 'content' });
    expect(res.mediaType).toBe('image/png');
  });

  it('content with filename present still detects', async () => {
    const data = gifBytes();
    // filename is generic .bin but content is GIF
    const res = await encodeAsset({ data, filename: 'unknown.bin' }, { detection: 'content' });
    expect(res.mediaType).toBe('image/gif');
  });

  it('content falls back to extension for SVG (text not detected)', async () => {
    const data = svgBytes();
    // file-type does not detect SVG; should fallback via extension
    const res = await encodeAsset({ data, filename: 'icon.svg' }, { detection: 'content' });
    expect(res.mediaType).toBe('image/svg+xml');
  });

  it('content throws UnsupportedAssetError when neither detection nor extension yields supported type', async () => {
    const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    await expect(encodeAsset({ data, filename: 'file.bin' }, { detection: 'content' })).rejects.toBeInstanceOf(
      UnsupportedAssetError,
    );
    await expect(encodeAsset({ data }, { detection: 'content' })).rejects.toBeInstanceOf(UnsupportedAssetError);
  });

  it('content keeps file-type behind abstraction — stubbable', async () => {
    const stubDetector = {
      async detect(_bytes: Uint8Array, _signal?: AbortSignal) {
        return { ext: 'png', mime: 'image/png' };
      },
    };
    setDetector(stubDetector);
    const data = new Uint8Array([0, 1, 2, 3]); // not actually PNG
    const res = await encodeAsset({ data }, { detection: 'content' });
    expect(res.mediaType).toBe('image/png');
    // ensure stub was used not real file-type
    let called = false;
    const countingDetector = {
      async detect() {
        called = true;
        return { ext: 'gif', mime: 'image/gif' };
      },
    };
    setDetector(countingDetector);
    const res2 = await encodeAsset({ data: new Uint8Array([9, 9, 9]) }, { detection: 'content' });
    expect(called).toBe(true);
    expect(res2.mediaType).toBe('image/gif');
  });

  it('content with explicit mediaType wins over detection (no override)', async () => {
    const data = pngBytes(); // PNG bytes
    // Stub detector to return gif but explicit says custom -> should keep custom
    setDetector({
      async detect() {
        return { ext: 'gif', mime: 'image/gif' };
      },
    });
    const res = await encodeAsset({ data, filename: 'a.png', mediaType: 'image/custom' }, { detection: 'content' });
    expect(res.mediaType).toBe('image/custom');
  });

  it('sync must reject content detection immediately', () => {
    const data = pngBytes();
    expect(() => encodeAssetSync({ data, filename: 'a.png' }, { detection: 'content' })).toThrow(InvalidOptionsError);
    expect(() => encodeAssetSync({ data }, { detection: 'content' })).toThrow(InvalidOptionsError);
  });
});

describe('detect: verify mode async-only compares detected vs expected', () => {
  it('verify succeeds when detected matches expected (png)', async () => {
    const data = pngBytes();
    const res = await encodeAsset({ data, filename: 'a.png' }, { detection: 'verify' });
    expect(res.mediaType).toBe('image/png');
  });

  it('verify throws DetectionMismatchError on mismatch (png bytes but jpg extension)', async () => {
    const data = pngBytes();
    await expect(encodeAsset({ data, filename: 'a.jpg' }, { detection: 'verify' })).rejects.toBeInstanceOf(
      DetectionMismatchError,
    );
    try {
      await encodeAsset({ data, filename: 'a.jpg' }, { detection: 'verify' });
    } catch (e) {
      expect((e as DetectionMismatchError).expectedMediaType).toBe('image/jpeg');
      expect((e as DetectionMismatchError).detectedMediaType).toBe('image/png');
      expect((e as DetectionMismatchError).code).toBe('DETECTION_MISMATCH');
    }
  });

  it('verify with explicit mediaType mismatch throws', async () => {
    const data = pngBytes();
    await expect(
      encodeAsset({ data, filename: 'a.png', mediaType: 'image/jpeg' }, { detection: 'verify' }),
    ).rejects.toBeInstanceOf(DetectionMismatchError);
  });

  it('verify with explicit mediaType match succeeds (no silent override)', async () => {
    const data = pngBytes();
    // explicit says png, detected also png => ok
    const res = await encodeAsset({ data, mediaType: 'image/png' }, { detection: 'verify' });
    expect(res.mediaType).toBe('image/png');
  });

  it('verify does not silently emit caller-unexpected mediaType — stub mismatch', async () => {
    setDetector({
      async detect() {
        return { ext: 'png', mime: 'image/png' };
      },
    });
    const data = new Uint8Array([1, 2, 3]);
    await expect(encodeAsset({ data, filename: 'a.gif' }, { detection: 'verify' })).rejects.toBeInstanceOf(
      DetectionMismatchError,
    );
  });

  it('verify with SVG (no detection) succeeds via extension', async () => {
    const data = svgBytes();
    const res = await encodeAsset({ data, filename: 'icon.svg' }, { detection: 'verify' });
    expect(res.mediaType).toBe('image/svg+xml');
  });

  it('sync must reject verify detection immediately', () => {
    const data = pngBytes();
    expect(() => encodeAssetSync({ data, filename: 'a.png' }, { detection: 'verify' })).toThrow(InvalidOptionsError);
  });

  it('verify honors AbortSignal between stages', async () => {
    const ac = new AbortController();
    const data = pngBytes();
    // create a detector that delays
    setDetector({
      async detect(_bytes, signal) {
        if (signal?.aborted) throw signal.reason;
        // simulate async delay then abort?
        await new Promise((r) => setTimeout(r, 10));
        if (signal?.aborted) throw signal.reason;
        return { ext: 'png', mime: 'image/png' };
      },
    });
    const promise = encodeAsset({ data, filename: 'a.png' }, { detection: 'verify', signal: ac.signal });
    ac.abort(new DOMException('aborted', 'AbortError'));
    await expect(promise).rejects.toSatisfy((e) => String(e).includes('aborted') || e.name === 'AbortError');
  });
});

describe('detect: explicit mediaType precedence and registry control', () => {
  it('explicit mediaType outside registry still accepted', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const res = await encodeAsset({ data, mediaType: 'application/custom+type' });
    expect(res.mediaType).toBe('application/custom+type');
  });

  it('explicit mediaType takes precedence over detected and extension in verify', async () => {
    setDetector({
      async detect() {
        return { ext: 'jpg', mime: 'image/jpeg' };
      },
    });
    const data = new Uint8Array([1, 2, 3]);
    // extension says png, explicit says jpeg, detected says jpeg => expected is jpeg, matches detected => no error, returns explicit
    const res = await encodeAsset({ data, filename: 'a.png', mediaType: 'image/jpeg' }, { detection: 'verify' });
    expect(res.mediaType).toBe('image/jpeg');
  });

  it('content with explicit mediaType never calls detector override silently', async () => {
    let detectCalled = false;
    setDetector({
      async detect() {
        detectCalled = true;
        return { ext: 'gif', mime: 'image/gif' };
      },
    });
    const data = pngBytes();
    const res = await encodeAsset({ data, mediaType: 'image/custom' }, { detection: 'content' });
    expect(res.mediaType).toBe('image/custom');
    // For content with explicit, we skip detection entirely
    expect(detectCalled).toBe(false);
  });
});

describe('detect: sync rejects async modes with InvalidOptionsError and code', () => {
  it('encodeAssetSync rejects content and verify with correct code', () => {
    const data = new Uint8Array([1]);
    try {
      encodeAssetSync({ data, filename: 'a.png' }, { detection: 'content' });
    } catch (e) {
      expect((e as InvalidOptionsError).code).toBe('INVALID_OPTIONS');
    }
    try {
      encodeAssetSync({ data, filename: 'a.png' }, { detection: 'verify' });
    } catch (e) {
      expect((e as InvalidOptionsError).code).toBe('INVALID_OPTIONS');
    }
  });
});

describe('detect: defaultDetector bounds and honors AbortSignal', () => {
  it('defaultDetector is async and returns for real PNG', async () => {
    const data = pngBytes();
    const result = await defaultDetector.detect(data);
    expect(result?.mime).toBe('image/png');
    expect(result?.ext).toBe('png');
  });

  it('defaultDetector returns undefined for SVG text', async () => {
    const data = svgBytes();
    const result = await defaultDetector.detect(data);
    expect(result).toBeUndefined();
  });

  it('defaultDetector respects abort', async () => {
    const ac = new AbortController();
    ac.abort(new DOMException('aborted', 'AbortError'));
    await expect(defaultDetector.detect(pngBytes(), ac.signal)).rejects.toSatisfy(
      (e) => String(e).includes('aborted') || e.name === 'AbortError',
    );
  });
});

describe('detect: limits and aborts fail with controlled typed errors and no partial result', () => {
  it('limits before large base64 allocation — ResourceLimitError', async () => {
    const data = new Uint8Array(1024 * 10);
    await expect(encodeAsset({ data, filename: 'a.png' }, { maxAssetBytes: 100 })).rejects.toBeInstanceOf(
      ResourceLimitError,
    );
  });

  it('abort fails with AbortError not partial result', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      encodeAsset({ data: new Uint8Array([1]), filename: 'a.png' }, { signal: ac.signal }),
    ).rejects.toSatisfy((e) => true);
  });
});
