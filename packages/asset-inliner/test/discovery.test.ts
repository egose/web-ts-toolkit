import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discoverAssets, discoverAssetsSync } from '../src/index.ts';
import { FilesystemError, UnsupportedAssetError, ResourceLimitError } from '../src/errors.ts';
import { createDefinitionRegistry } from '../src/definitions.ts';

function mkTmp(prefix = 'discovery-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('discovery: deterministic lexical order', () => {
  it('discovers directory files in lexical order regardless of creation order', async () => {
    const tmp = mkTmp();
    try {
      fs.mkdirSync(path.join(tmp, 'sub'));
      // create out-of-order
      fs.writeFileSync(path.join(tmp, 'c.png'), 'c');
      fs.writeFileSync(path.join(tmp, 'a.png'), 'a');
      fs.writeFileSync(path.join(tmp, 'b.png'), 'b');
      fs.writeFileSync(path.join(tmp, 'sub', 'z.png'), 'z');
      fs.writeFileSync(path.join(tmp, 'sub', 'm.png'), 'm');

      const asyncFiles = await discoverAssets(tmp);
      const syncFiles = discoverAssetsSync(tmp);

      // Both should be sorted lexically within each dir: a.png, b.png, c.png, sub/m.png, sub/z.png
      const expected = [
        path.resolve(tmp, 'a.png'),
        path.resolve(tmp, 'b.png'),
        path.resolve(tmp, 'c.png'),
        path.resolve(tmp, 'sub', 'm.png'),
        path.resolve(tmp, 'sub', 'z.png'),
      ];
      expect(asyncFiles).toEqual(expected);
      expect(syncFiles).toEqual(expected);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('repeated runs return identical order', async () => {
    const tmp = mkTmp();
    try {
      fs.writeFileSync(path.join(tmp, 'b.png'), 'b');
      fs.writeFileSync(path.join(tmp, 'a.png'), 'a');
      const first = await discoverAssets(tmp);
      const second = await discoverAssets(tmp);
      const third = discoverAssetsSync(tmp);
      expect(first).toEqual(second);
      expect(first).toEqual(third);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('retain caller order between separate roots', async () => {
    const tmp1 = mkTmp('root1-');
    const tmp2 = mkTmp('root2-');
    try {
      fs.writeFileSync(path.join(tmp1, 'a.png'), 'a');
      fs.writeFileSync(path.join(tmp2, 'b.png'), 'b');
      // Caller order [tmp2, tmp1] should put tmp2's file first
      const files1 = await discoverAssets([tmp2, tmp1]);
      expect(files1[0]).toBe(path.resolve(tmp2, 'b.png'));
      expect(files1[1]).toBe(path.resolve(tmp1, 'a.png'));

      const files2 = await discoverAssets([tmp1, tmp2]);
      expect(files2[0]).toBe(path.resolve(tmp1, 'a.png'));
      expect(files2[1]).toBe(path.resolve(tmp2, 'b.png'));

      // Sync same
      const syncFiles = discoverAssetsSync([tmp2, tmp1]);
      expect(syncFiles).toEqual(files1);
    } finally {
      fs.rmSync(tmp1, { recursive: true, force: true });
      fs.rmSync(tmp2, { recursive: true, force: true });
    }
  });

  it('deduplicate normalized identities across roots', async () => {
    const tmp = mkTmp();
    try {
      fs.writeFileSync(path.join(tmp, 'dup.png'), 'x');
      const abs = path.resolve(tmp, 'dup.png');
      const viaDot = path.resolve(tmp, './dup.png');
      const viaParent = path.resolve(tmp, 'sub', '..', 'dup.png');
      fs.mkdirSync(path.join(tmp, 'sub'));
      // deduplicate via different normalized paths pointing to same absolute
      const files = await discoverAssets([abs, viaDot, viaParent]);
      expect(files).toEqual([abs]);

      const syncFiles = discoverAssetsSync([abs, viaDot, viaParent]);
      expect(syncFiles).toEqual([abs]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('discovery: extension/kind filters before expensive reads', () => {
  it('explicit unsupported file throws UnsupportedAssetError distinctly', async () => {
    const tmp = mkTmp();
    try {
      const unsupported = path.join(tmp, 'file.unsupported');
      fs.writeFileSync(unsupported, 'hello');
      await expect(discoverAssets(unsupported)).rejects.toBeInstanceOf(UnsupportedAssetError);
      expect(() => discoverAssetsSync(unsupported)).toThrow(UnsupportedAssetError);
      // Check error context
      try {
        await discoverAssets(unsupported);
      } catch (e) {
        expect((e as UnsupportedAssetError).extension).toBe('.unsupported');
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('directory entries with unsupported extensions are silently ignored', async () => {
    const tmp = mkTmp();
    try {
      fs.writeFileSync(path.join(tmp, 'good.png'), 'good');
      fs.writeFileSync(path.join(tmp, 'bad.bin'), 'bad');
      fs.writeFileSync(path.join(tmp, 'also.txt'), 'txt');
      const files = await discoverAssets(tmp);
      expect(files).toEqual([path.resolve(tmp, 'good.png')]);
      const syncFiles = discoverAssetsSync(tmp);
      expect(syncFiles).toEqual([path.resolve(tmp, 'good.png')]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('allowedExtensions filter applies before reads: explicit unsupported vs ignored', async () => {
    const tmp = mkTmp();
    try {
      fs.writeFileSync(path.join(tmp, 'a.png'), 'a');
      fs.writeFileSync(path.join(tmp, 'b.jpg'), 'b');
      const files = await discoverAssets(tmp, { allowedExtensions: ['.png'] });
      expect(files).toEqual([path.resolve(tmp, 'a.png')]);
      // explicit file with not allowed extension throws
      await expect(discoverAssets(path.join(tmp, 'b.jpg'), { allowedExtensions: ['.png'] })).rejects.toBeInstanceOf(
        UnsupportedAssetError,
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('allowedKinds filter applies correctly', async () => {
    const tmp = mkTmp();
    try {
      fs.writeFileSync(path.join(tmp, 'font.woff'), 'font');
      fs.writeFileSync(path.join(tmp, 'image.png'), 'img');
      const files = await discoverAssets(tmp, { allowedKinds: ['image'] });
      expect(files).toEqual([path.resolve(tmp, 'image.png')]);
      const syncFiles = discoverAssetsSync(tmp, { allowedKinds: ['font'] });
      expect(syncFiles).toEqual([path.resolve(tmp, 'font.woff')]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('discovery: traversal policy', () => {
  it('missing explicit path throws FilesystemError (observable)', async () => {
    const tmp = mkTmp();
    try {
      const missing = path.join(tmp, 'does-not-exist.png');
      await expect(discoverAssets(missing)).rejects.toBeInstanceOf(FilesystemError);
      expect(() => discoverAssetsSync(missing)).toThrow(FilesystemError);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('depth limit enforced', async () => {
    const tmp = mkTmp();
    try {
      fs.mkdirSync(path.join(tmp, 'a', 'b', 'c'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'a', 'b', 'c', 'deep.png'), 'x');
      await expect(discoverAssets(tmp, { maxDepth: 2 })).rejects.toBeInstanceOf(ResourceLimitError);
      expect(() => discoverAssetsSync(tmp, { maxDepth: 2 })).toThrow(ResourceLimitError);
      // depth 3 or higher should succeed
      const ok = await discoverAssets(tmp, { maxDepth: 5 });
      expect(ok.length).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('maxFiles count enforced', async () => {
    const tmp = mkTmp();
    try {
      fs.writeFileSync(path.join(tmp, 'a.png'), 'a');
      fs.writeFileSync(path.join(tmp, 'b.png'), 'b');
      fs.writeFileSync(path.join(tmp, 'c.png'), 'c');
      await expect(discoverAssets(tmp, { maxFiles: 2 })).rejects.toBeInstanceOf(ResourceLimitError);
      expect(() => discoverAssetsSync(tmp, { maxFiles: 2 })).toThrow(ResourceLimitError);
      const ok = await discoverAssets(tmp, { maxFiles: 10 });
      expect(ok.length).toBe(3);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('symlink false by default skips symlink entries', async () => {
    const tmp = mkTmp();
    try {
      const target = path.join(tmp, 'real.png');
      fs.writeFileSync(target, 'real');
      const link = path.join(tmp, 'link.png');
      try {
        fs.symlinkSync(target, link);
      } catch {
        // Skip if symlink not supported (e.g., Windows without privilege)
        return;
      }
      const files = await discoverAssets(tmp);
      // Should only contain real.png, not link.png
      expect(files).toEqual([path.resolve(target)]);
      const syncFiles = discoverAssetsSync(tmp);
      expect(syncFiles).toEqual([path.resolve(target)]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('symlink follow true detects cycles and terminates', async () => {
    const tmp = mkTmp();
    try {
      const dirA = path.join(tmp, 'a');
      const dirB = path.join(tmp, 'a', 'b');
      fs.mkdirSync(dirB, { recursive: true });
      fs.writeFileSync(path.join(dirA, 'file.png'), 'x');
      // Create symlink cycle: b/link -> ../a  (b contains link to parent a)
      const link = path.join(dirB, 'link');
      try {
        fs.symlinkSync(dirA, link, 'dir');
      } catch {
        return;
      }
      // With follow false, should not loop and only find file.png
      const noFollow = await discoverAssets(tmp, { followSymlinks: false });
      expect(noFollow.length).toBe(1);
      // With follow true, should detect cycle and still terminate within bounds, not infinite loop
      const withFollow = await discoverAssets(tmp, { followSymlinks: true, maxDepth: 32 });
      // Should still only have 1 file (deduped) and not crash or exceed depth
      expect(withFollow.length).toBe(1);
      const syncFollow = discoverAssetsSync(tmp, { followSymlinks: true });
      expect(syncFollow.length).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('traversal root escape denied by default', async () => {
    const tmp = mkTmp();
    const outside = mkTmp('outside-');
    try {
      fs.writeFileSync(path.join(tmp, 'a.png'), 'a');
      fs.writeFileSync(path.join(outside, 'outside.png'), 'x');
      // Create symlink inside tmp pointing outside
      const link = path.join(tmp, 'escape');
      try {
        fs.symlinkSync(outside, link, 'dir');
      } catch {
        return;
      }
      // With follow true and traversalRoot = tmp, escape should be denied
      await expect(discoverAssets(tmp, { followSymlinks: true, traversalRoot: tmp })).rejects.toBeInstanceOf(
        FilesystemError,
      );

      expect(() => discoverAssetsSync(tmp, { followSymlinks: true, traversalRoot: tmp })).toThrow(FilesystemError);

      // With allowTraversalEscape true, should succeed and include outside file
      const allowed = await discoverAssets(tmp, {
        followSymlinks: true,
        traversalRoot: tmp,
        allowTraversalEscape: true,
      });
      // Should include both a.png and outside.png (via symlink)
      expect(allowed.length).toBeGreaterThanOrEqual(2);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('concurrency bounded and deterministic regardless of completion timing', async () => {
    const tmp = mkTmp();
    try {
      for (let i = 0; i < 10; i++) {
        fs.writeFileSync(path.join(tmp, `file${String(i).padStart(2, '0')}.png`), `c${i}`);
      }
      const opts = { concurrency: 1 };
      const files1 = await discoverAssets(tmp, opts);
      const files2 = await discoverAssets(tmp, { concurrency: 16 });
      expect(files1).toEqual(files2);
      const syncFiles = discoverAssetsSync(tmp, { concurrency: 2 } as any);
      expect(syncFiles).toEqual(files1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('AbortSignal honored', async () => {
    const tmp = mkTmp();
    try {
      fs.writeFileSync(path.join(tmp, 'a.png'), 'a');
      const ac = new AbortController();
      ac.abort(new DOMException('aborted', 'AbortError'));
      await expect(discoverAssets(tmp, { signal: ac.signal })).rejects.toSatisfy(
        (e: any) => String(e).includes('abort') || e.name === 'AbortError',
      );
      expect(() => discoverAssetsSync(tmp, { signal: ac.signal })).toThrow();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
