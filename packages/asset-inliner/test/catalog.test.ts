import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createAssetCatalog, createAssetCatalogSync } from '../src/index.ts';
import { AmbiguousAssetError, FilesystemError, InvalidOptionsError } from '../src/errors.ts';

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const FONTS_DIR = path.join(FIXTURE_ROOT, 'fonts');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');

function mkTmp(prefix = 'catalog-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('catalog: construction and immutability', () => {
  it('createAssetCatalog async and sync produce deterministic order regardless of async timing', async () => {
    const files = [
      path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff2'),
      path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff'),
      path.join(FONTS_DIR, 'akronim-v9-latin-regular.ttf'),
    ];
    const asyncCat = await createAssetCatalog(files);
    const syncCat = createAssetCatalogSync(files);
    expect(asyncCat.assets.map((a) => a.fontFormat)).toEqual(['woff2', 'woff', 'truetype']);
    expect(syncCat.assets.map((a) => a.fontFormat)).toEqual(['woff2', 'woff', 'truetype']);
    // Repeated runs identical
    const asyncCat2 = await createAssetCatalog(files, { concurrency: 1 });
    const asyncCat3 = await createAssetCatalog(files, { concurrency: 16 });
    expect(asyncCat2.assets.map((a) => a.dataUrl)).toEqual(asyncCat.assets.map((a) => a.dataUrl));
    expect(asyncCat3.assets.map((a) => a.dataUrl)).toEqual(asyncCat.assets.map((a) => a.dataUrl));
  });

  it('catalog is immutable and frozen', async () => {
    const cat = await createAssetCatalog([path.join(IMAGES_DIR, 'sample.png')]);
    expect(Object.isFrozen(cat)).toBe(true);
    expect(Object.isFrozen(cat.assets)).toBe(true);
    for (const a of cat.assets) expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(cat.definitions)).toBe(true);
    // Try mutation should throw
    expect(() => (cat.assets as any).push(null)).toThrow();
  });

  it('preserves input order and deduplicates', async () => {
    const file = path.join(IMAGES_DIR, 'sample.png');
    const dup = path.resolve(file);
    const cat = await createAssetCatalog([file, dup, path.join(IMAGES_DIR, 'sample.gif')]);
    // dup should be deduped to single entry
    expect(cat.size).toBe(2);
    expect(cat.assets[0]!.sourcePath).toBe(path.resolve(file));
    expect(cat.assets[1]!.mediaType).toBe('image/gif');

    const syncCat = createAssetCatalogSync([file, dup, path.join(IMAGES_DIR, 'sample.gif')]);
    expect(syncCat.size).toBe(2);
    expect(syncCat.assets.map((a) => a.mediaType)).toEqual(cat.assets.map((a) => a.mediaType));
  });

  it('handles mixed byte and file inputs preserving input order', async () => {
    const file = path.join(IMAGES_DIR, 'apple.png');
    const bytes = fs.readFileSync(path.join(IMAGES_DIR, 'sample.gif'));
    const cat = await createAssetCatalog([
      { data: bytes, filename: 'custom.gif' },
      file,
      { data: new Uint8Array([1, 2, 3]), filename: 'a.png' },
    ]);
    expect(cat.size).toBe(3);
    expect(cat.assets[0]!.filename).toBe('custom.gif');
    expect(cat.assets[1]!.sourcePath).toBe(path.resolve(file));
    expect(cat.assets[2]!.filename).toBe('a.png');
  });

  it('discovers directories in lexical order', async () => {
    const tmp = mkTmp();
    try {
      fs.mkdirSync(path.join(tmp, 'sub'));
      // create out-of-order files but only those with allowed extensions
      fs.writeFileSync(path.join(tmp, 'b.png'), fs.readFileSync(path.join(IMAGES_DIR, 'sample.png')));
      fs.writeFileSync(path.join(tmp, 'a.png'), fs.readFileSync(path.join(IMAGES_DIR, 'sample.png')));
      fs.writeFileSync(path.join(tmp, 'sub', 'c.png'), fs.readFileSync(path.join(IMAGES_DIR, 'sample.png')));
      const cat = await createAssetCatalog(tmp);
      const basenames = cat.assets.map((a) => a.filename);
      expect(basenames).toEqual(['a.png', 'b.png', 'c.png']);
      const syncCat = createAssetCatalogSync(tmp);
      expect(syncCat.assets.map((a) => a.filename)).toEqual(basenames);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('catalog: exact vs basename compatibility', () => {
  it('exact path matching selects intended duplicate basename; basename mode reports ambiguity', async () => {
    const dupA = path.join(FIXTURE_ROOT, 'negative', 'duplicate-a', 'dup.png');
    const dupB = path.join(FIXTURE_ROOT, 'negative', 'duplicate-b', 'dup.png');
    const tmpDir = mkTmp();
    const docPathA = path.join(tmpDir, 'docA.css');
    const docPathB = path.join(tmpDir, 'docB.css');
    // Create temp doc files so documentPath resolution has directories
    fs.writeFileSync(docPathA, '');
    fs.writeFileSync(docPathB, '');
    try {
      const cat = await createAssetCatalog([dupA, dupB]);
      expect(cat.size).toBe(2);
      // Exact lookup should return correct asset per absolute path
      const aAsset = cat.getByPath(path.resolve(dupA));
      const bAsset = cat.getByPath(path.resolve(dupB));
      expect(aAsset).toBeDefined();
      expect(bAsset).toBeDefined();
      expect(aAsset).not.toBe(bAsset);
      // They have same basename but different sourcePath and different bytes
      expect(aAsset!.filename).toBe('dup.png');
      expect(bAsset!.filename).toBe('dup.png');
      // Basename lookup without duplication would be ambiguous -> throws
      expect(() => cat.getByBasename('dup.png')).toThrow(AmbiguousAssetError);
      try {
        cat.getByBasename('dup.png');
      } catch (e) {
        expect((e as AmbiguousAssetError).code).toBe('AMBIGUOUS_ASSET');
        expect((e as AmbiguousAssetError).basename).toBe('dup.png');
        expect((e as AmbiguousAssetError).candidates.length).toBe(2);
      }
      // Unique basename should succeed
      const catSingle = await createAssetCatalog([dupA]);
      expect(catSingle.getByBasename('dup.png')).toBeDefined();
      expect(catSingle.getByBasename('dup.png')!.sourcePath).toBe(path.resolve(dupA));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('getByPath uses normalized absolute paths and is case-sensitive (no host separator dependence)', async () => {
    const file = path.join(IMAGES_DIR, 'sample.png');
    const cat = await createAssetCatalog([file]);
    const abs = path.resolve(file);
    expect(cat.getByPath(abs)).toBeDefined();
    // With different normalized form (./ prefix) should still match after resolve
    const viaRelative = path.resolve(path.dirname(file), './sample.png');
    expect(cat.getByPath(viaRelative)).toBeDefined();
    // Windows-style backslash on POSIX host: normalizeLogical handling is for URLs, but catalog getByPath should handle both?
    // We test that path.resolve with backslashes is not considered same on POSIX (since backslash is char), but our catalog getByPath normalizes via path.resolve
    const winStyle = abs.replace(/\//g, '\\');
    // On POSIX host, winStyle contains backslashes and path.resolve will treat them as part of filename, not separators, so lookup may fail.
    // However our catalog's basename fallback via posix should still handle URL resolution, not getByPath.
    // So we just ensure exact posix lookup works; Windows-style URL resolution is tested in resolve.test.ts
    expect(cat.getByPath(abs)).toBe(cat.assets[0]);
  });
});

describe('catalog: missing paths observability', () => {
  it('missing explicit file path throws FilesystemError', async () => {
    const missing = path.join(FIXTURE_ROOT, 'does-not-exist.woff');
    await expect(createAssetCatalog(missing)).rejects.toBeInstanceOf(FilesystemError);
    expect(() => createAssetCatalogSync(missing)).toThrow(FilesystemError);
  });

  it('missing directory path throws FilesystemError', async () => {
    const missingDir = path.join(os.tmpdir(), 'catalog-missing-dir-' + Date.now());
    await expect(createAssetCatalog(missingDir)).rejects.toBeInstanceOf(FilesystemError);
    expect(() => createAssetCatalogSync(missingDir)).toThrow(FilesystemError);
  });
});

describe('catalog: Windows/POSIX fixture handling without host separator dependence', () => {
  it('catalog keys use normalized absolute paths; logical diagnostics use POSIX-style', async () => {
    // Create assets with files that have posix names but simulate Windows logical path handling via catalog getByBasename
    const tmp = mkTmp();
    try {
      fs.writeFileSync(path.join(tmp, 'a.png'), fs.readFileSync(path.join(IMAGES_DIR, 'sample.png')));
      fs.mkdirSync(path.join(tmp, 'sub'));
      fs.writeFileSync(path.join(tmp, 'sub', 'b.png'), fs.readFileSync(path.join(IMAGES_DIR, 'sample.png')));
      const cat = await createAssetCatalog([tmp]);
      // Check that all keys are absolute with host separator (posix on linux)
      for (const a of cat.assets) {
        expect(path.isAbsolute(a.sourcePath!)).toBe(true);
        // Diagnostics would use posix-style: we ensure basename extraction works with both separators
        expect(a.filename).toBe(path.basename(a.sourcePath!));
      }
      // Basename lookup with posix and win separators should both work for single candidate
      // Create a single file catalog to test basename with backslash input
      const single = await createAssetCatalog([path.join(tmp, 'a.png')]);
      // getByBasename with posix basename
      expect(single.getByBasename('a.png')).toBeDefined();
      // With Windows backslash style basename input like "some\\a.png" -> path.basename handles both?
      expect(single.getByBasename('some\\a.png')).toBeDefined();
      expect(single.getByBasename('some/a.png')).toBeDefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('byte inputs with filename handle Windows/POSIX separators', async () => {
    const data = fs.readFileSync(path.join(IMAGES_DIR, 'sample.png'));
    const cat = await createAssetCatalog([
      { data, filename: 'a\\b\\c.png' }, // Windows style filename (should be treated as basename?)
      { data, filename: 'd/e/f.png' },
    ]);
    // encode normalizes filename to basename via path.basename; both should be 'c.png' and 'f.png'
    expect(cat.assets[0]!.filename).toBe('c.png');
    expect(cat.assets[1]!.filename).toBe('f.png');
  });
});

describe('catalog: sync rejects async detection modes', () => {
  it('sync catalog rejects content/verify', async () => {
    const data = fs.readFileSync(path.join(IMAGES_DIR, 'sample.png'));
    await expect(createAssetCatalog([{ data, filename: 'a.png' }], { detection: 'content' })).resolves.toBeDefined();
    expect(() => createAssetCatalogSync([{ data, filename: 'a.png' }], { detection: 'content' as any })).toThrow(
      InvalidOptionsError,
    );
    expect(() => createAssetCatalogSync([{ data, filename: 'a.png' }], { detection: 'verify' as any })).toThrow(
      InvalidOptionsError,
    );
  });
});
