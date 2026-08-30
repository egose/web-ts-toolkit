import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createAssetCatalog,
  createAssetCatalogSync,
  classifyUrl,
  isSkippableUrl,
  stripQueryAndFragment,
  decodeUrlPath,
  normalizeLogicalUrlPath,
  resolveLogicalPathToAbsolute,
  resolveAssetReference,
  resolveAssetReferenceSync,
} from '../src/index.ts';
import { AmbiguousAssetError, InvalidOptionsError } from '../src/errors.ts';

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');

function mkTmp(prefix = 'resolve-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('resolve: classify and skip remote/data etc before filesystem', () => {
  const skippable = [
    'data:image/png;base64,abc',
    'DATA:image/png;base64,abc',
    'blob:https://example.com/abc',
    'BLOB:https://example.com/abc',
    'https://example.com/a.png',
    'http://example.com/a.png',
    'ftp://example.com/a.png',
    '//cdn.example.com/a.png',
    '#fragment',
    ' #fragment ',
    'mailto:test@example.com',
  ];
  for (const url of skippable) {
    it(`skips "${url}"`, () => {
      expect(classifyUrl(url).kind).toBe('skip');
      expect(isSkippableUrl(url)).toBe(true);
    });
  }

  const locals = [
    '../images/apple.png',
    './a.png',
    'a.png',
    '/assets/a.png',
    'images\\a.png', // Windows style should be considered local (contains backslash but no scheme)
    'a.png?foo=bar',
    'a.png#frag',
    'a.png?#iefix',
  ];
  for (const url of locals) {
    it(`treats "${url}" as local`, () => {
      expect(classifyUrl(url).kind).toBe('local');
      expect(isSkippableUrl(url)).toBe(false);
    });
  }
});

describe('resolve: decode only URL-syntax safe, reject malformed/NUL, never query/fragment as segment', () => {
  it('stripQueryAndFragment removes ? and # but preserves percent-encoded', () => {
    expect(stripQueryAndFragment('a.png?foo=1')).toBe('a.png');
    expect(stripQueryAndFragment('a.png#frag')).toBe('a.png');
    expect(stripQueryAndFragment('a.png?foo=1#frag')).toBe('a.png');
    expect(stripQueryAndFragment('a.png?#iefix')).toBe('a.png');
    expect(stripQueryAndFragment('a%3F.png')).toBe('a%3F.png'); // %3F is encoded ?, not delimiter
    expect(stripQueryAndFragment('a%23.png')).toBe('a%23.png');
    expect(stripQueryAndFragment('a.png')).toBe('a.png');
  });

  it('decodeUrlPath decodes percent safely', () => {
    expect(decodeUrlPath('a%20b.png')).toBe('a b.png');
    expect(decodeUrlPath('a%2F b.png')).toBe('a/ b.png');
    expect(decodeUrlPath('a.png')).toBe('a.png');
  });

  it('rejects malformed percent-encoding', () => {
    expect(() => decodeUrlPath('a%2.png')).toThrow(InvalidOptionsError);
    expect(() => decodeUrlPath('a%G0.png')).toThrow(InvalidOptionsError);
    expect(() => decodeUrlPath('a%')).toThrow(InvalidOptionsError);
    expect(() => decodeUrlPath('%')).toThrow(InvalidOptionsError);
  });

  it('rejects NUL-containing paths before and after decode', () => {
    expect(() => decodeUrlPath('a\0b.png')).toThrow(InvalidOptionsError);
    expect(() => decodeUrlPath('a%00b.png')).toThrow(InvalidOptionsError);
    expect(() => decodeUrlPath('a%00.png')).toThrow(InvalidOptionsError);
  });

  it('never interprets query/fragment as path segment', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'a.png');
      fs.writeFileSync(file, fs.readFileSync(path.join(IMAGES_DIR, 'sample.png')));
      const cat = await createAssetCatalog([file]);
      const docPath = path.join(tmp, 'doc.css');
      fs.writeFileSync(docPath, '');
      // URL with query and fragment should still resolve to file
      const res = await resolveAssetReference('a.png?v=1#frag', cat, { documentPath: docPath });
      expect(res.asset).toBeDefined();
      expect(res.asset!.sourcePath).toBe(path.resolve(file));
      // Encoded query variant should not produce different filesystem lookup (strip)
      const res2 = await resolveAssetReference('a.png?#iefix', cat, { documentPath: docPath });
      expect(res2.asset).toBeDefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('decode preserves Windows/POSIX handling without host separator dependence', () => {
    // normalizeLogicalUrlPath must handle both separators
    expect(normalizeLogicalUrlPath('a\\b\\c.png')).toBe('a/b/c.png');
    expect(normalizeLogicalUrlPath('a/b\\c.png')).toBe('a/b/c.png');
    expect(normalizeLogicalUrlPath('a/./b/../c.png')).toBe('a/c.png');
    // posix normalize for absolute
    expect(normalizeLogicalUrlPath('/a/b/../c.png')).toBe('/a/c.png');
  });
});

describe('resolve: path resolution relative to documentPath or rootDir', () => {
  it('resolves relative to documentPath directory', async () => {
    const tmp = mkTmp();
    try {
      const assetsDir = path.join(tmp, 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      const file = path.join(assetsDir, 'a.png');
      fs.writeFileSync(file, fs.readFileSync(path.join(IMAGES_DIR, 'sample.png')));
      const cat = await createAssetCatalog([file]);
      const docPath = path.join(tmp, 'css', 'doc.css');
      fs.mkdirSync(path.dirname(docPath), { recursive: true });
      fs.writeFileSync(docPath, '');

      // Relative URL from css/doc.css to ../assets/a.png
      const res = await resolveAssetReference('../assets/a.png', cat, { documentPath: docPath });
      expect(res.asset).toBeDefined();
      expect(res.asset!.sourcePath).toBe(path.resolve(file));

      // Using rootDir instead
      const res2 = await resolveAssetReference('assets/a.png', cat, { rootDir: tmp });
      expect(res2.asset).toBeDefined();

      // Absolute POSIX path with rootDir
      const res3 = await resolveAssetReference('/assets/a.png', cat, { rootDir: tmp });
      expect(res3.asset).toBeDefined();
      expect(res3.asset!.sourcePath).toBe(path.resolve(file));

      // Windows-style relative with backslashes
      const resWin = await resolveAssetReference('..\\assets\\a.png', cat, { documentPath: docPath });
      expect(resWin.asset).toBeDefined();
      expect(resWin.asset!.sourcePath).toBe(path.resolve(file));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('sync variant mirrors async', async () => {
    const tmp = mkTmp();
    try {
      const file = path.join(tmp, 'a.png');
      fs.writeFileSync(file, fs.readFileSync(path.join(IMAGES_DIR, 'sample.png')));
      const cat = createAssetCatalogSync([file]);
      const docPath = path.join(tmp, 'doc.css');
      fs.writeFileSync(docPath, '');
      const asyncRes = await resolveAssetReference('a.png', cat, { documentPath: docPath });
      const syncRes = resolveAssetReferenceSync('a.png', cat, { documentPath: docPath });
      expect(asyncRes.asset!.dataUrl).toBe(syncRes.asset!.dataUrl);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('resolveLogicalPathToAbsolute uses POSIX semantics without host separator dependence', () => {
    const doc = '/project/css/doc.css';
    const root = '/project';
    // Relative POSIX
    expect(resolveLogicalPathToAbsolute('../assets/a.png', { documentPath: doc })).toBe(
      path.resolve('/project/assets/a.png'),
    );
    // Windows style relative
    expect(resolveLogicalPathToAbsolute('..\\assets\\a.png', { documentPath: doc })).toBe(
      path.resolve('/project/assets/a.png'),
    );
    // Absolute with rootDir
    expect(resolveLogicalPathToAbsolute('/assets/a.png', { rootDir: root })).toBe(
      path.resolve('/project/assets/a.png'),
    );
    // Absolute with backslashes
    expect(resolveLogicalPathToAbsolute('\\assets\\a.png', { rootDir: root })).toBe(
      path.resolve('/project/assets/a.png'),
    );
  });
});

describe('resolve: exact vs basename and ambiguity', () => {
  it('exact relative paths select intended duplicate basename', async () => {
    const dupA = path.join(FIXTURE_ROOT, 'negative', 'duplicate-a', 'dup.png');
    const dupB = path.join(FIXTURE_ROOT, 'negative', 'duplicate-b', 'dup.png');
    const tmp = mkTmp();
    try {
      // Create a doc in a dir that can reference dupA and dupB via different relative paths
      // We'll copy both dup files into distinct subdirs under tmp to simulate project structure
      const dirA = path.join(tmp, 'a');
      const dirB = path.join(tmp, 'b');
      fs.mkdirSync(dirA, { recursive: true });
      fs.mkdirSync(dirB, { recursive: true });
      const fileA = path.join(dirA, 'dup.png');
      const fileB = path.join(dirB, 'dup.png');
      fs.copyFileSync(dupA, fileA);
      fs.copyFileSync(dupB, fileB);
      const cat = await createAssetCatalog([fileA, fileB]);
      const docPath = path.join(tmp, 'doc.css');
      fs.writeFileSync(docPath, '');
      // doc.css at tmp/doc.css, relative to a/dup.png is "a/dup.png", to b is "b/dup.png"
      const resA = await resolveAssetReference('a/dup.png', cat, { documentPath: docPath });
      const resB = await resolveAssetReference('b/dup.png', cat, { documentPath: docPath });
      expect(resA.asset).toBeDefined();
      expect(resB.asset).toBeDefined();
      expect(resA.asset!.sourcePath).toBe(path.resolve(fileA));
      expect(resB.asset!.sourcePath).toBe(path.resolve(fileB));
      expect(resA.asset).not.toBe(resB.asset);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('basename compatibility mode reports ambiguity instead of picking winner', async () => {
    const dupA = path.join(FIXTURE_ROOT, 'negative', 'duplicate-a', 'dup.png');
    const dupB = path.join(FIXTURE_ROOT, 'negative', 'duplicate-b', 'dup.png');
    const cat = await createAssetCatalog([dupA, dupB]);
    const tmp = mkTmp();
    try {
      const docPath = path.join(tmp, 'doc.css');
      fs.writeFileSync(docPath, '');
      await expect(
        resolveAssetReference('dup.png', cat, { documentPath: docPath, allowBasenameMatch: true }),
      ).rejects.toBeInstanceOf(AmbiguousAssetError);
      expect(() =>
        resolveAssetReferenceSync('dup.png', cat, { documentPath: docPath, allowBasenameMatch: true }),
      ).toThrow(AmbiguousAssetError);
      // Without allowBasenameMatch, should be unresolved (no throw) — returns undefined asset
      const noBase = await resolveAssetReference('dup.png', cat, { documentPath: docPath });
      expect(noBase.asset).toBeUndefined();
      expect(noBase.skipped).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('remote/data/blob/fragment are skipped and never reach filesystem', async () => {
    const file = path.join(IMAGES_DIR, 'sample.png');
    const cat = await createAssetCatalog([file]);
    const docPath = path.join(os.tmpdir(), 'doc.css');
    for (const url of [
      'https://example.com/a.png',
      '//cdn.example.com/a.png',
      'data:image/png;base64,abc',
      'blob:https://example.com/abc',
      '#frag',
    ]) {
      const res = await resolveAssetReference(url, cat, { documentPath: docPath });
      expect(res.skipped).toBe(true);
      expect(res.asset).toBeUndefined();
      const syncRes = resolveAssetReferenceSync(url, cat, { documentPath: docPath });
      expect(syncRes.skipped).toBe(true);
    }
  });

  it('unresolved local reference returns no asset but not skipped', async () => {
    const file = path.join(IMAGES_DIR, 'sample.png');
    const cat = await createAssetCatalog([file]);
    const docPath = path.join(os.tmpdir(), 'doc.css');
    const res = await resolveAssetReference('not-exist.png', cat, { documentPath: docPath });
    expect(res.skipped).toBe(false);
    expect(res.asset).toBeUndefined();
    expect(res.resolvedPath).toBeDefined();
  });
});

describe('resolve: custom matcher/resolver hook', () => {
  it('hook receives narrow typed inputs without parser AST and can return asset', async () => {
    const file = path.join(IMAGES_DIR, 'apple.png');
    const cat = await createAssetCatalog([file]);
    const tmp = mkTmp();
    const docPath = path.join(tmp, 'doc.css');
    fs.writeFileSync(docPath, '');
    try {
      let receivedInput: any = null;
      const resolver = (input: any, catalog: any) => {
        receivedInput = input;
        // Verify narrow shape: should have originalUrl, decodedPath, basename, documentPath/rootDir, catalog but not AST
        expect(input.originalUrl).toBe('custom.png');
        expect(input.decodedPath).toBe('custom.png');
        expect(input.basename).toBe('custom.png');
        expect(input).not.toHaveProperty('parser');
        expect(input).not.toHaveProperty('ast');
        // Return asset via catalog lookup (e.g., map custom name to apple.png)
        return catalog.getByPath(path.resolve(file));
      };
      const res = await resolveAssetReference('custom.png', cat, { documentPath: docPath, resolver });
      expect(res.asset).toBeDefined();
      expect(res.asset!.sourcePath).toBe(path.resolve(file));
      expect(receivedInput).not.toBeNull();
      // Also test sync hook
      const syncRes = resolveAssetReferenceSync('custom.png', cat, { documentPath: docPath, resolver });
      expect(syncRes.asset).toBeDefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('hook returning undefined falls back to default', async () => {
    const file = path.join(IMAGES_DIR, 'apple.png');
    const cat = await createAssetCatalog([file]);
    const tmp = mkTmp();
    const docPath = path.join(tmp, 'doc.css');
    fs.writeFileSync(docPath, '');
    try {
      const resolver = () => undefined;
      const res = await resolveAssetReference('apple.png', cat, { documentPath: docPath, resolver });
      // apple.png is not relative to docPath? doc at tmp/doc.css, apple at .../images/apple.png not under tmp, so unresolved
      // Let's create a local file under tmp instead
      const local = path.join(tmp, 'apple.png');
      fs.copyFileSync(file, local);
      const cat2 = await createAssetCatalog([local]);
      const res2 = await resolveAssetReference('apple.png', cat2, { documentPath: docPath, resolver });
      expect(res2.asset).toBeDefined();
      expect(res2.asset!.sourcePath).toBe(path.resolve(local));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('async hook is supported for async API but rejected for sync', async () => {
    const file = path.join(IMAGES_DIR, 'sample.png');
    const cat = await createAssetCatalog([file]);
    const docPath = path.join(os.tmpdir(), 'doc.css');
    const asyncResolver = async (input: any, catalog: any) => {
      await new Promise((r) => setTimeout(r, 1));
      return catalog.getByPath(path.resolve(file));
    };
    const res = await resolveAssetReference('any.png', cat, { documentPath: docPath, resolver: asyncResolver });
    expect(res.asset).toBeDefined();
    expect(() =>
      resolveAssetReferenceSync('any.png', cat, { documentPath: docPath, resolver: asyncResolver as any }),
    ).toThrow(InvalidOptionsError);
  });

  it('hook is not invoked for skippable URLs', async () => {
    const file = path.join(IMAGES_DIR, 'sample.png');
    const cat = await createAssetCatalog([file]);
    let called = false;
    const resolver = () => {
      called = true;
      return undefined;
    };
    const res = await resolveAssetReference('data:image/png;base64,abc', cat, { resolver });
    expect(res.skipped).toBe(true);
    expect(called).toBe(false);
    called = false;
    const res2 = await resolveAssetReference('https://example.com/a.png', cat, { resolver });
    expect(res2.skipped).toBe(true);
    expect(called).toBe(false);
  });
});
