import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createAssetCatalog, createAssetCatalogSync } from '../src/catalog.ts';
import { inlineFiles, inlineFilesSync } from '../src/files.ts';
import { ResourceLimitError } from '../src/errors.ts';

const IMAGES_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy', 'images');
const SAMPLE_PNG = path.join(IMAGES_DIR, 'sample.png');

function mkTmp(prefix = 'filebudget-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function copyPng(dest: string): void {
  fs.copyFileSync(SAMPLE_PNG, dest);
}

function writeTargetCss(filePath: string): void {
  fs.writeFileSync(filePath, 'body { color: red; }\n');
}

describe('AIH-05: one catalog-wide file budget', () => {
  it('async: two separate files obey same budget as single combined root', async () => {
    const tmp = mkTmp();
    try {
      const f1 = path.join(tmp, 'a.png');
      const f2 = path.join(tmp, 'b.png');
      copyPng(f1);
      copyPng(f2);
      // Combined root (directory) with maxFiles:1 overflows
      await expect(createAssetCatalog(tmp, { maxFiles: 1 })).rejects.toBeInstanceOf(ResourceLimitError);
      // Separate explicit files with maxFiles:1 also overflow (was size-2 success before fix)
      const err = await createAssetCatalog([f1, f2], { maxFiles: 1 }).catch((e) => e);
      expect(err).toBeInstanceOf(ResourceLimitError);
      expect((err as ResourceLimitError).code).toBe('RESOURCE_LIMIT');
      expect((err as ResourceLimitError).limit).toBe(1);
      expect((err as ResourceLimitError).actual).toBe(2);
      // Single file within budget succeeds
      const one = await createAssetCatalog([f1], { maxFiles: 1 });
      expect(one.size).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('sync: two separate files obey same budget as single combined root', () => {
    const tmp = mkTmp();
    try {
      const f1 = path.join(tmp, 'a.png');
      const f2 = path.join(tmp, 'b.png');
      copyPng(f1);
      copyPng(f2);
      expect(() => createAssetCatalogSync(tmp, { maxFiles: 1 })).toThrow(ResourceLimitError);
      let err: unknown;
      try {
        createAssetCatalogSync([f1, f2], { maxFiles: 1 });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ResourceLimitError);
      expect((err as ResourceLimitError).limit).toBe(1);
      expect((err as ResourceLimitError).actual).toBe(2);
      expect(createAssetCatalogSync([f1], { maxFiles: 1 }).size).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('separate directories obey same budget as single combined root (async + sync)', async () => {
    const parent = mkTmp('parent-');
    try {
      const dirA = path.join(parent, 'dirA');
      const dirB = path.join(parent, 'dirB');
      fs.mkdirSync(dirA);
      fs.mkdirSync(dirB);
      copyPng(path.join(dirA, 'a.png'));
      copyPng(path.join(dirB, 'b.png'));
      // Combined parent holds 2 files -> maxFiles:1 overflows
      await expect(createAssetCatalog(parent, { maxFiles: 1 })).rejects.toBeInstanceOf(ResourceLimitError);
      expect(() => createAssetCatalogSync(parent, { maxFiles: 1 })).toThrow(ResourceLimitError);
      // Separate directories -> same overflow
      await expect(createAssetCatalog([dirA, dirB], { maxFiles: 1 })).rejects.toBeInstanceOf(ResourceLimitError);
      expect(() => createAssetCatalogSync([dirA, dirB], { maxFiles: 1 })).toThrow(ResourceLimitError);
      // Exact boundary succeeds in both variants
      expect((await createAssetCatalog([dirA, dirB], { maxFiles: 2 })).size).toBe(2);
      expect(createAssetCatalogSync([dirA, dirB], { maxFiles: 2 }).size).toBe(2);
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  it('overlapping roots, duplicates, and canonical aliases do not double-count', async () => {
    const tmp = mkTmp();
    try {
      const f1 = path.join(tmp, 'a.png');
      copyPng(f1);
      // Duplicate explicit inputs share one budget slot
      expect((await createAssetCatalog([f1, f1], { maxFiles: 1 })).size).toBe(1);
      expect(createAssetCatalogSync([f1, f1], { maxFiles: 1 }).size).toBe(1);
      // Overlapping roots: directory + contained file share the slot
      expect((await createAssetCatalog([tmp, f1], { maxFiles: 1 })).size).toBe(1);
      expect(createAssetCatalogSync([tmp, f1], { maxFiles: 1 }).size).toBe(1);
      // Duplicate directory roots share the slot
      expect((await createAssetCatalog([tmp, tmp], { maxFiles: 1 })).size).toBe(1);
      expect(createAssetCatalogSync([tmp, tmp], { maxFiles: 1 }).size).toBe(1);
      // Canonical alias via symlink does not double-count (followSymlinks so both resolve)
      const link = path.join(tmp, 'alias.png');
      try {
        fs.symlinkSync(f1, link);
      } catch {
        // Symlinks unavailable: skip alias half, duplicates above already cover dedupe
        return;
      }
      const asyncCat = await createAssetCatalog([f1, link], { maxFiles: 1, followSymlinks: true });
      expect(asyncCat.size).toBe(1);
      const syncCat = createAssetCatalogSync([f1, link], { maxFiles: 1, followSymlinks: true });
      expect(syncCat.size).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('byte inputs remain outside the file-only maxFiles policy', async () => {
    const tmp = mkTmp();
    try {
      const f1 = path.join(tmp, 'a.png');
      copyPng(f1);
      const bytes = fs.readFileSync(SAMPLE_PNG);
      // 2 byte inputs + 1 file: only the file counts toward maxFiles:1
      const asyncCat = await createAssetCatalog(
        [{ data: bytes, filename: 'b1.png' }, f1, { data: bytes, filename: 'b2.png' }] as any,
        { maxFiles: 1 },
      );
      expect(asyncCat.size).toBe(3);
      const syncCat = createAssetCatalogSync(
        [{ data: bytes, filename: 'b1.png' }, f1, { data: bytes, filename: 'b2.png' }] as any,
        { maxFiles: 1 },
      );
      expect(syncCat.size).toBe(3);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('async overflow fails before asset-body encoding (detector never runs for overflow)', async () => {
    const tmp = mkTmp();
    try {
      const f1 = path.join(tmp, 'a.png');
      const f2 = path.join(tmp, 'b.png');
      copyPng(f1);
      copyPng(f2);
      let detectCalls = 0;
      const detector = {
        async detect(_bytes: Uint8Array) {
          detectCalls++;
          return undefined;
        },
      };
      const err = await createAssetCatalog([f1, f2], {
        maxFiles: 1,
        detection: 'content',
        detector: detector as any,
      }).catch((e) => e);
      expect(err).toBeInstanceOf(ResourceLimitError);
      // Queue construction threw before any encode/detect of either asset
      expect(detectCalls).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('sync overflow fails before asset-body reads (overflowing file never read)', () => {
    const tmp = mkTmp();
    try {
      const f1 = path.join(tmp, 'a.png');
      const f2 = path.join(tmp, 'b.png');
      copyPng(f1);
      copyPng(f2);
      const spy = vi.spyOn(fs, 'readFileSync');
      spy.mockClear();
      let err: unknown;
      try {
        createAssetCatalogSync([f1, f2], { maxFiles: 1 });
      } catch (e) {
        err = e;
      } finally {
        spy.mockRestore();
      }
      expect(err).toBeInstanceOf(ResourceLimitError);
      // No body read happened at all: budget is enforced during queue construction
      const readCalls = (spy.mock.calls as unknown[][]).filter(([p]) => p === f1 || p === f2);
      expect(readCalls.length).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('inlineFiles catalog construction enforces the same file budget (async + sync)', async () => {
    const tmp = mkTmp();
    try {
      const f1 = path.join(tmp, 'a.png');
      const f2 = path.join(tmp, 'b.png');
      copyPng(f1);
      copyPng(f2);
      const target = path.join(tmp, 't.css');
      writeTargetCss(target);
      await expect(inlineFiles({ targets: target, assets: [f1, f2], maxFiles: 1 })).rejects.toBeInstanceOf(
        ResourceLimitError,
      );
      expect(() => inlineFilesSync({ targets: target, assets: [f1, f2], maxFiles: 1 })).toThrow(ResourceLimitError);
      // Exact boundary through inlineFiles succeeds
      const ok = await inlineFiles({ targets: target, assets: [f1, f2], maxFiles: 2 });
      expect(ok.length).toBe(1);
      const okSync = inlineFilesSync({ targets: target, assets: [f1, f2], maxFiles: 2 });
      expect(okSync.length).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
