import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isWithinRoot, discoverAssets, discoverAssetsSync } from '../src/discovery.ts';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { inlineFiles, inlineFilesSync } from '../src/index.ts';
import { FilesystemError } from '../src/errors.ts';

const win32 = path.win32;

describe('AIH-01 cross-volume containment predicate (production logic)', () => {
  it('rejects different-drive absolute relative results', () => {
    expect(isWithinRoot('D:\\evil\\x.png', 'C:\\root', win32)).toBe(false);
    expect(isWithinRoot('C:\\root\\sub\\a.png', 'C:\\root', win32)).toBe(true);
    expect(isWithinRoot('C:\\root', 'C:\\root', win32)).toBe(true);
  });

  it('rejects different UNC servers, accepts UNC descendants', () => {
    expect(isWithinRoot('\\\\other\\share\\f.png', '\\\\server\\share\\root', win32)).toBe(false);
    expect(isWithinRoot('\\\\server\\share\\root\\sub\\a.png', '\\\\server\\share\\root', win32)).toBe(true);
    expect(isWithinRoot('\\\\server\\share\\root', '\\\\server\\share\\root', win32)).toBe(true);
  });

  it('rejects sibling prefixes and parent-relative escapes, keeps descendants', () => {
    expect(isWithinRoot('C:\\root-sibling\\a.png', 'C:\\root', win32)).toBe(false);
    expect(isWithinRoot('C:\\other\\a.png', 'C:\\root', win32)).toBe(false);
    expect(isWithinRoot('C:\\root\\..\\other\\a.png', 'C:\\root', win32)).toBe(false);
    expect(isWithinRoot('C:\\root\\a.png', 'C:\\root', win32)).toBe(true);
  });

  it('posix sanity: root/descendants pass, escapes reject', () => {
    expect(isWithinRoot('/root', '/root')).toBe(true);
    expect(isWithinRoot('/root/sub/a.png', '/root')).toBe(true);
    expect(isWithinRoot('/other/a.png', '/root')).toBe(false);
    expect(isWithinRoot('/root-sibling/a.png', '/root')).toBe(false);
  });
});

describe('AIH-01 portable discovery containment (POSIX analogue)', () => {
  function mkTmp(prefix: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }

  it('async and sync discovery reject an existing outside asset with escape disabled', async () => {
    const root = mkTmp('aih01-root-');
    const outside = mkTmp('aih01-outside-');
    try {
      const outsideAsset = path.join(outside, 'outside.png');
      fs.writeFileSync(outsideAsset, 'x');
      await expect(discoverAssets(outsideAsset, { traversalRoot: root })).rejects.toBeInstanceOf(FilesystemError);
      expect(() => discoverAssetsSync(outsideAsset, { traversalRoot: root })).toThrow(FilesystemError);
      const allowed = await discoverAssets(outsideAsset, {
        traversalRoot: root,
        allowTraversalEscape: true,
      });
      expect(allowed).toHaveLength(1);
      const allowedSync = discoverAssetsSync(outsideAsset, {
        traversalRoot: root,
        allowTraversalEscape: true,
      });
      expect(allowedSync).toHaveLength(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('target discovery/write with a prebuilt catalog leaves the outside target unchanged', async () => {
    const root = mkTmp('aih01-troot-');
    const outside = mkTmp('aih01-toutside-');
    try {
      const cssPath = path.join(outside, 'style.css');
      const original = `.a{background:url('./missing.png')}`;
      fs.writeFileSync(cssPath, original);
      const catalog = createAssetCatalogSync([{ data: new Uint8Array([1, 2, 3]), filename: 'a.png' }]);

      await expect(inlineFiles({ targets: cssPath, catalog, traversalRoot: root, write: true })).rejects.toBeInstanceOf(
        FilesystemError,
      );
      expect(fs.readFileSync(cssPath, 'utf8')).toBe(original);

      expect(() => inlineFilesSync({ targets: cssPath, catalog, traversalRoot: root, write: true })).toThrow(
        FilesystemError,
      );
      expect(fs.readFileSync(cssPath, 'utf8')).toBe(original);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
