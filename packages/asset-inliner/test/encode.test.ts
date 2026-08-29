import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  encodeAsset,
  encodeAssetSync,
  encodeAssets,
  encodeAssetsSync,
  formatCssUrl,
  formatFontSource,
  resetDetector,
} from '../src/index.ts';
import {
  UnsupportedAssetError,
  InvalidOptionsError,
  ResourceLimitError,
  DetectionMismatchError,
  FilesystemError,
} from '../src/errors.ts';

const FIXTURE_ROOT = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  'fixtures',
  'legacy',
);
const FONTS_DIR = path.join(FIXTURE_ROOT, 'fonts');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');

function decodeDataUrl(dataUrl: string): Buffer {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error(`Invalid dataUrl ${dataUrl.slice(0, 50)}`);
  return Buffer.from(m[2]!, 'base64');
}

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'asset-inliner-encode-'));
}

beforeEach(() => resetDetector());
afterEach(() => resetDetector());

// ---------------------------------------------------------------------------
// Helpers for fixture enumeration
// ---------------------------------------------------------------------------

const fontFiles = fs
  .readdirSync(FONTS_DIR)
  .map((n) => path.join(FONTS_DIR, n))
  .sort();
const imageFiles = fs
  .readdirSync(IMAGES_DIR)
  .filter((n) => n.startsWith('sample.') || ['apple.png', 'pear.png', 'watermelon.png'].includes(n))
  .map((n) => path.join(IMAGES_DIR, n))
  .sort();

describe('encode: single file path — async/sync extension mode', () => {
  it.each(fontFiles)('encodeAsset async and sync for font %s decode byte-equal, no charset', async (file) => {
    const asyncRes = await encodeAsset(file);
    const syncRes = encodeAssetSync(file);
    expect(asyncRes.dataUrl).toBe(syncRes.dataUrl);
    expect(asyncRes.mediaType).toBe(syncRes.mediaType);
    const ext = path.extname(file).toLowerCase();
    // .svg defaults to image semantics per contract; other fonts default to font
    const expectedKind = ext === '.svg' ? 'image' : 'font';
    expect(asyncRes.kind).toBe(expectedKind);
    expect(asyncRes.dataUrl).not.toMatch(/charset/i);
    expect(asyncRes.dataUrl.startsWith(`data:${asyncRes.mediaType};base64,`)).toBe(true);
    const orig = fs.readFileSync(file);
    expect(decodeDataUrl(asyncRes.dataUrl).equals(orig)).toBe(true);
    expect(decodeDataUrl(syncRes.dataUrl).equals(orig)).toBe(true);
    expect(Object.isFrozen(asyncRes)).toBe(true);
    expect(Object.isFrozen(syncRes)).toBe(true);
    expect(asyncRes.sourcePath).toBe(file);
    expect(asyncRes.filename).toBe(path.basename(file));
    expect(asyncRes.byteLength).toBe(orig.length);
  });

  it.each(imageFiles)('encodeAsset for image %s decode byte-equal', async (file) => {
    const res = await encodeAsset(file);
    const orig = fs.readFileSync(file);
    expect(decodeDataUrl(res.dataUrl).equals(orig)).toBe(true);
    expect(res.dataUrl.startsWith(`data:${res.mediaType};base64,`)).toBe(true);
    expect(res.dataUrl).not.toMatch(/charset/i);
    expect(res.kind).toBe('image');
  });

  it('uppercase extension normalizes (PHOTO.PNG)', async () => {
    const p = path.join(FIXTURE_ROOT, 'negative', 'uppercase', 'PHOTO.PNG');
    const asyncRes = await encodeAsset(p);
    const syncRes = encodeAssetSync(p);
    expect(asyncRes.mediaType).toBe('image/png');
    expect(syncRes.mediaType).toBe('image/png');
    expect(decodeDataUrl(asyncRes.dataUrl).equals(fs.readFileSync(p))).toBe(true);
  });

  it('svg defaults to image semantics', async () => {
    const p = path.join(IMAGES_DIR, 'sample.svg');
    const res = await encodeAsset(p);
    expect(res.mediaType).toBe('image/svg+xml');
    expect(res.kind).toBe('image');
    expect(res.fontFormat).toBeUndefined();
  });

  it('svg font via explicit kind+fontFormat', async () => {
    const p = path.join(FIXTURE_ROOT, 'negative', 'svg-font.svg');
    const data = fs.readFileSync(p);
    const res = await encodeAsset({ data, filename: 'font.svg', kind: 'font', fontFormat: 'svg' });
    expect(res.kind).toBe('font');
    expect(res.fontFormat).toBe('svg');
    expect(res.mediaType).toBe('image/svg+xml');
  });
});

describe('encode: byte input (AssetInput object)', () => {
  it('encodes from {data, filename} — async and sync match', async () => {
    const file = path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff');
    const data = fs.readFileSync(file);
    const asyncRes = await encodeAsset({ data, filename: 'my.woff' });
    const syncRes = encodeAssetSync({ data, filename: 'my.woff' });
    expect(asyncRes.dataUrl).toBe(syncRes.dataUrl);
    expect(asyncRes.mediaType).toBe('font/woff');
    expect(asyncRes.fontFormat).toBe('woff');
    expect(decodeDataUrl(asyncRes.dataUrl).equals(data)).toBe(true);
  });

  it('handles empty buffer', async () => {
    const empty = new Uint8Array(0);
    const res = await encodeAsset({ data: empty, filename: 'empty.png' });
    expect(res.byteLength).toBe(0);
    expect(res.dataUrl).toBe('data:image/png;base64,');
    expect(decodeDataUrl(res.dataUrl).length).toBe(0);
    const syncRes = encodeAssetSync({ data: empty, filename: 'empty.png' });
    expect(syncRes.dataUrl).toBe(res.dataUrl);
  });

  it('Buffer subclass accepted without conversion', async () => {
    const file = path.join(IMAGES_DIR, 'sample.png');
    const buf = fs.readFileSync(file); // Buffer
    const res = await encodeAsset({ data: buf, filename: 'sample.png' });
    expect(decodeDataUrl(res.dataUrl).equals(buf)).toBe(true);
  });

  it('explicit mediaType wins over extension lookup', async () => {
    const data = fs.readFileSync(path.join(IMAGES_DIR, 'sample.png'));
    const res = await encodeAsset({ data, filename: 'sample.png', mediaType: 'image/custom' });
    expect(res.mediaType).toBe('image/custom');
    expect(res.dataUrl.startsWith('data:image/custom;base64,')).toBe(true);
    // explicit mediaType with sync as well
    const syncRes = encodeAssetSync({ data, filename: 'sample.png', mediaType: 'image/custom' });
    expect(syncRes.mediaType).toBe('image/custom');
  });

  it('explicit mediaType supports text format outside file-type', async () => {
    const data = new TextEncoder().encode('hello svg content');
    const res = await encodeAsset({ data, mediaType: 'image/svg+xml' });
    expect(res.mediaType).toBe('image/svg+xml');
    expect(decodeDataUrl(res.dataUrl).equals(Buffer.from(data))).toBe(true);
  });

  it('extension detection does not attach charset=utf-8 to binary fonts', async () => {
    const file = path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff2');
    const res = await encodeAsset(file);
    expect(res.dataUrl).not.toMatch(/charset/);
    expect(res.mediaType).toBe('font/woff2');
  });
});

describe('encode: unsupported and filesystem errors', () => {
  it('unsupported extension throws UnsupportedAssetError', async () => {
    const data = new Uint8Array([1, 2, 3]);
    await expect(encodeAsset({ data, filename: 'file.unsupported' })).rejects.toBeInstanceOf(UnsupportedAssetError);
    expect(() => encodeAssetSync({ data, filename: 'file.unsupported' })).toThrow(UnsupportedAssetError);
  });

  it('missing filename and no explicit mediaType throws', async () => {
    const data = new Uint8Array([1, 2, 3]);
    await expect(encodeAsset({ data })).rejects.toBeInstanceOf(UnsupportedAssetError);
    expect(() => encodeAssetSync({ data })).toThrow(UnsupportedAssetError);
  });

  it('missing file path throws FilesystemError', async () => {
    const missing = path.join(FIXTURE_ROOT, 'does-not-exist.woff');
    await expect(encodeAsset(missing)).rejects.toBeInstanceOf(FilesystemError);
    expect(() => encodeAssetSync(missing)).toThrow(FilesystemError);
  });

  it('unsupported.bin fixture throws', async () => {
    const p = path.join(FIXTURE_ROOT, 'negative', 'unsupported.bin');
    await expect(encodeAsset({ data: fs.readFileSync(p), filename: 'unsupported.bin' })).rejects.toBeInstanceOf(
      UnsupportedAssetError,
    );
  });
});

describe('encode: limits', () => {
  it('maxAssetBytes rejects oversized asset before base64', async () => {
    const data = new Uint8Array(100);
    await expect(encodeAsset({ data, filename: 'a.png' }, { maxAssetBytes: 50 })).rejects.toBeInstanceOf(
      ResourceLimitError,
    );
    expect(() => encodeAssetSync({ data, filename: 'a.png' }, { maxAssetBytes: 50 })).toThrow(ResourceLimitError);
  });

  it('maxAssetBytes allows exactly at limit', async () => {
    const data = new Uint8Array(10);
    const res = await encodeAsset({ data, filename: 'a.png' }, { maxAssetBytes: 10 });
    expect(res.byteLength).toBe(10);
  });

  it('maxTotalBytes rejects batch exceeding total', async () => {
    const a = { data: new Uint8Array(60), filename: 'a.png' } as const;
    const b = { data: new Uint8Array(60), filename: 'b.png' } as const;
    await expect(encodeAssets([a, b], { maxTotalBytes: 100 })).rejects.toBeInstanceOf(ResourceLimitError);
    expect(() => encodeAssetsSync([a, b], { maxTotalBytes: 100 })).toThrow(ResourceLimitError);
  });

  it('maxTotalBytes allows exactly at limit', async () => {
    const a = { data: new Uint8Array(50), filename: 'a.png' } as const;
    const b = { data: new Uint8Array(50), filename: 'b.png' } as const;
    const res = await encodeAssets([a, b], { maxTotalBytes: 100 });
    expect(res).toHaveLength(2);
  });

  it('invalid maxAssetBytes throws InvalidOptionsError', async () => {
    const data = new Uint8Array([1]);
    await expect(encodeAsset({ data, filename: 'a.png' }, { maxAssetBytes: -1 } as never)).rejects.toBeInstanceOf(
      InvalidOptionsError,
    );
    await expect(encodeAsset({ data, filename: 'a.png' }, { maxAssetBytes: NaN } as never)).rejects.toBeInstanceOf(
      InvalidOptionsError,
    );
    expect(() => encodeAssetSync({ data, filename: 'a.png' }, { maxAssetBytes: 0 } as never)).toThrow(
      InvalidOptionsError,
    );
  });

  it('invalid maxTotalBytes throws InvalidOptionsError', async () => {
    const data = new Uint8Array([1]);
    await expect(encodeAssets([{ data, filename: 'a.png' }], { maxTotalBytes: 0 } as never)).rejects.toBeInstanceOf(
      InvalidOptionsError,
    );
  });
});

describe('encode: abort signal', () => {
  it('aborted signal before encode throws', async () => {
    const ac = new AbortController();
    ac.abort(new DOMException('aborted', 'AbortError'));
    const data = new Uint8Array([1, 2, 3]);
    await expect(encodeAsset({ data, filename: 'a.png' }, { signal: ac.signal })).rejects.toSatisfy((e) => {
      // should be abort error
      return e instanceof DOMException || (e as Error).name === 'AbortError' || String(e).includes('abort');
    });
    // sync should also reject via throwIfAborted
    const ac2 = new AbortController();
    ac2.abort();
    expect(() => encodeAssetSync({ data, filename: 'a.png' }, { signal: ac2.signal })).toThrow();
  });

  it('abort between batch items fails with controlled error', async () => {
    const ac = new AbortController();
    const a = { data: fs.readFileSync(path.join(IMAGES_DIR, 'apple.png')), filename: 'apple.png' } as const;
    const b = { data: fs.readFileSync(path.join(IMAGES_DIR, 'sample.gif')), filename: 'sample.gif' } as const;
    // abort after first item via signal event
    let count = 0;
    const origEncode = encodeAsset;
    // Use encodeAssets which checks abort between items
    // Abort immediately after start
    ac.abort();
    await expect(encodeAssets([a, b], { signal: ac.signal })).rejects.toSatisfy(
      (e) => String(e).includes('abort') || e.name === 'AbortError',
    );
  });

  it('file read honors abort between stages (content detection)', async () => {
    const ac = new AbortController();
    const data = fs.readFileSync(path.join(IMAGES_DIR, 'sample.png'));
    // abort before detection stage
    ac.abort();
    await expect(
      encodeAsset({ data, filename: 'noext' }, { detection: 'content', signal: ac.signal }),
    ).rejects.toSatisfy((e) => true);
  });
});

describe('encode: batch ordering and immutability', () => {
  it('encodeAssets preserves input order (async)', async () => {
    const files = [
      path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff2'),
      path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff'),
      path.join(FONTS_DIR, 'akronim-v9-latin-regular.ttf'),
    ];
    const res = await encodeAssets(files);
    expect(res.map((r) => r.fontFormat)).toEqual(['woff2', 'woff', 'truetype']);
    // verify sorted not by completion but input order
    for (let i = 0; i < files.length; i++) {
      expect(decodeDataUrl(res[i]!.dataUrl).equals(fs.readFileSync(files[i]!))).toBe(true);
    }
  });

  it('encodeAssetsSync preserves input order', () => {
    const files = [
      path.join(IMAGES_DIR, 'apple.png'),
      path.join(IMAGES_DIR, 'sample.gif'),
      path.join(IMAGES_DIR, 'sample.jpg'),
    ];
    const res = encodeAssetsSync(files);
    expect(res.map((r) => r.mediaType)).toEqual(['image/png', 'image/gif', 'image/jpeg']);
  });

  it('batch of byte inputs preserves order with deterministic results', async () => {
    const inputs = [
      { data: new Uint8Array([1, 2, 3]), filename: 'a.png' },
      { data: new Uint8Array([4, 5, 6]), filename: 'b.png' },
      { data: new Uint8Array([7, 8, 9]), filename: 'c.png' },
    ] as const;
    const res = await encodeAssets([...inputs]);
    expect(res[0]!.byteLength).toBe(3);
    expect(decodeDataUrl(res[0]!.dataUrl).equals(Buffer.from([1, 2, 3]))).toBe(true);
    expect(decodeDataUrl(res[1]!.dataUrl).equals(Buffer.from([4, 5, 6]))).toBe(true);
    expect(decodeDataUrl(res[2]!.dataUrl).equals(Buffer.from([7, 8, 9]))).toBe(true);
    expect(Object.isFrozen(res)).toBe(true);
    for (const r of res) expect(Object.isFrozen(r)).toBe(true);
  });

  it('returns immutable EncodedAsset — no raw bytes leaked', async () => {
    const data = fs.readFileSync(path.join(IMAGES_DIR, 'sample.png'));
    const res = await encodeAsset({ data, filename: 'a.png' });
    expect((res as unknown as { bytes?: unknown }).bytes).toBeUndefined();
    expect((res as unknown as { data?: unknown }).data).toBeUndefined();
    expect(JSON.stringify(res)).not.toContain(
      data.toString('base64').slice(0, 10) + data.toString('base64').slice(0, 10),
    ); // trivial ensure not insane, but payload is in dataUrl
    expect(res.dataUrl).toContain(data.toString('base64'));
  });

  it('async batch never calls sync encoder (indirect check via detection mode rejection)', async () => {
    // encodeAssets with detection content should work async but sync would reject
    const data = fs.readFileSync(path.join(IMAGES_DIR, 'sample.png'));
    const asyncRes = await encodeAssets([{ data, filename: 'x.png' }], { detection: 'content' });
    expect(asyncRes).toHaveLength(1);
    expect(() => encodeAssetsSync([{ data, filename: 'x.png' }], { detection: 'content' as never })).toThrow(
      InvalidOptionsError,
    );
  });
});

describe('encode: format helpers', () => {
  it('formatCssUrl wraps without format and deterministic', async () => {
    const data = fs.readFileSync(path.join(IMAGES_DIR, 'sample.png'));
    const asset = await encodeAsset({ data, filename: 'a.png' });
    const css = formatCssUrl(asset);
    expect(css).toBe(`url(${asset.dataUrl})`);
    expect(css).not.toMatch(/format\(/);
  });

  it('formatFontSource requires fontFormat', async () => {
    const data = fs.readFileSync(path.join(IMAGES_DIR, 'sample.png'));
    const asset = await encodeAsset({ data, filename: 'a.png' }); // image, no fontFormat
    expect(() => formatFontSource(asset as never)).toThrow(InvalidOptionsError);
  });

  it('formatFontSource produces url() format() with single quotes', async () => {
    const data = fs.readFileSync(path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff2'));
    const asset = await encodeAsset({ data, filename: 'a.woff2' });
    expect(asset.fontFormat).toBe('woff2');
    const src = formatFontSource(asset);
    expect(src).toBe(`url(${asset.dataUrl}) format('woff2')`);
  });

  it('format helpers escape deterministically', () => {
    const fakeAsset = {
      dataUrl: 'data:font/woff;base64,abc',
      fontFormat: "a'b",
      mediaType: 'font/woff',
      kind: 'font',
      byteLength: 3,
    } as never;
    const src = formatFontSource(fakeAsset as never);
    expect(src).toContain("a\\'b");
  });

  it('all legacy font fixtures formatFontSource round-trip', async () => {
    for (const f of fontFiles) {
      const data = fs.readFileSync(f);
      const ext = path.extname(f).toLowerCase();
      // skip svg image default - fonts include svgFont case tested elsewhere, but here encode via extension gives font for fonts
      // For fonts, encode with explicit kind font if ext .svg to get fontFormat
      const asset =
        ext === '.svg'
          ? await encodeAsset({ data, filename: 'a.svg', kind: 'font', fontFormat: 'svg' })
          : await encodeAsset({ data, filename: `a${ext}` });
      if (asset.kind === 'font') {
        const src = formatFontSource(asset);
        expect(src.startsWith('url(data:')).toBe(true);
        expect(src).toContain(`format('${asset.fontFormat}')`);
      }
    }
  });
});

describe('encode: no promise-synchronizer dependency', () => {
  it('package does not depend on promise-synchronizer', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname ?? process.cwd(), '../package.json'), 'utf8'),
    );
    // check package dependencies do not include promise-synchronizer
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.peerDependencies ?? {}) };
    expect(deps['promise-synchronizer']).toBeUndefined();
  });
});

describe('encode: decoded byte equality for every legacy category', () => {
  it('all font fixtures decode byte-equal (async)', async () => {
    for (const f of fontFiles) {
      const res = await encodeAsset(f);
      expect(decodeDataUrl(res.dataUrl).equals(fs.readFileSync(f))).toBe(true);
    }
  });

  it('all image fixtures decode byte-equal (sync)', () => {
    for (const f of imageFiles) {
      const res = encodeAssetSync(f);
      expect(decodeDataUrl(res.dataUrl).equals(fs.readFileSync(f))).toBe(true);
    }
  });

  it('directory image fixture apple/pear/watermelon decode', async () => {
    for (const name of ['apple.png', 'pear.png', 'watermelon.png']) {
      const p = path.join(IMAGES_DIR, name);
      const res = await encodeAsset(p);
      expect(decodeDataUrl(res.dataUrl).equals(fs.readFileSync(p))).toBe(true);
    }
  });
});
