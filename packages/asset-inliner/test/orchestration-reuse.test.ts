import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createAssetCatalog, createAssetCatalogSync } from '../src/catalog.ts';
import { createDefinitionRegistry, builtInDefinitions } from '../src/definitions.ts';
import * as discovery from '../src/discovery.ts';

function mkTmp(prefix = 'orchestr-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function writePng(filePath: string): void {
  // Minimal png signature + data
  const buf = Buffer.alloc(64);
  buf.writeUInt32BE(0x89504e47, 0); // png magic partial
  fs.writeFileSync(filePath, buf);
}

describe('orchestration reuse: per-root discovery groups once', () => {
  it('async mixed [byte, root, byte, root] preserves order and visits each path root once', async () => {
    const tmp1 = mkTmp('a-');
    const tmp2 = mkTmp('b-');
    try {
      writePng(path.join(tmp1, 'a1.png'));
      writePng(path.join(tmp1, 'a2.png'));
      writePng(path.join(tmp2, 'b1.png'));

      const byte1 = { data: new Uint8Array([1, 2, 3, 4]), filename: 'byte1.png' };
      const byte2 = { data: new Uint8Array([5, 6, 7, 8]), filename: 'byte2.png' };

      const spy = vi.spyOn(discovery, 'discoverAssets');
      spy.mockClear();

      const cat = await createAssetCatalog([byte1, tmp1, byte2, tmp2] as any);

      // Order must be [byte1, root1 expansion lexically, byte2, root2 expansion]
      expect(cat.assets.map((a) => a.filename)).toEqual(['byte1.png', 'a1.png', 'a2.png', 'byte2.png', 'b1.png']);

      // Should have called discoverAssets once per distinct path root (2), not 1+2=3
      // Before fix: 1 global + 2 per-root = 3
      expect(spy).toHaveBeenCalledTimes(2);

      // Verify per-root calls are with single root
      const callArgs = spy.mock.calls.map((c) => c[0]);
      expect(callArgs).toContain(tmp1);
      expect(callArgs).toContain(tmp2);

      spy.mockRestore();
    } finally {
      fs.rmSync(tmp1, { recursive: true, force: true });
      fs.rmSync(tmp2, { recursive: true, force: true });
    }
  });

  it('sync mixed [byte, root, byte, root] preserves order and visits each path root once', () => {
    const tmp1 = mkTmp('a-');
    const tmp2 = mkTmp('b-');
    try {
      writePng(path.join(tmp1, 'a1.png'));
      writePng(path.join(tmp1, 'a2.png'));
      writePng(path.join(tmp2, 'b1.png'));

      const byte1 = { data: new Uint8Array([1, 2, 3, 4]), filename: 'byte1.png' };
      const byte2 = { data: new Uint8Array([5, 6, 7, 8]), filename: 'byte2.png' };

      const spy = vi.spyOn(discovery, 'discoverAssetsSync');
      spy.mockClear();

      const cat = createAssetCatalogSync([byte1, tmp1, byte2, tmp2] as any);
      expect(cat.assets.map((a) => a.filename)).toEqual(['byte1.png', 'a1.png', 'a2.png', 'byte2.png', 'b1.png']);
      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    } finally {
      fs.rmSync(tmp1, { recursive: true, force: true });
      fs.rmSync(tmp2, { recursive: true, force: true });
    }
  });

  it('duplicate roots dedupe by first occurrence and reuse discovery', async () => {
    const tmp1 = mkTmp('dup-');
    try {
      writePng(path.join(tmp1, 'x.png'));
      const byte1 = { data: new Uint8Array([9, 9]), filename: 'byteX.png' };
      const spy = vi.spyOn(discovery, 'discoverAssets');
      spy.mockClear();
      // Input: dir, byte, dir (duplicate)
      const cat = await createAssetCatalog([tmp1, byte1, tmp1] as any);
      // Should be [x.png, byteX.png] in that order — second dir occurrence produces no new files
      expect(cat.assets.map((a) => a.filename)).toEqual(['x.png', 'byteX.png']);
      // Duplicate root should be discovered only once (cached) — not twice.
      // Before fix: global(1) + per-root(2) =3, after fix: 1
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    } finally {
      fs.rmSync(tmp1, { recursive: true, force: true });
    }
  });

  it('accepts already validated AssetDefinitionRegistry without re-normalizing definitions', async () => {
    const tmp = mkTmp('reg-');
    try {
      writePng(path.join(tmp, 'a.png'));
      const custom = { kind: 'image' as const, extensions: ['.jxl'], mediaType: 'image/jxl' };
      const registry = createDefinitionRegistry([...builtInDefinitions, custom]);
      // Pass registry directly instead of definitions array
      const cat = await createAssetCatalog([tmp], { registry } as any);
      expect(cat.definitions.some((d) => d.mediaType === 'image/jxl')).toBe(true);
      // Catalog definitions should be the same registry definitions instance (frozen)
      expect(cat.definitions).toEqual(registry.definitions);
      const catSync = createAssetCatalogSync([tmp], { registry } as any);
      expect(catSync.definitions).toEqual(registry.definitions);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('registry adapter clear: definitions still work via adapter', async () => {
    const tmp = mkTmp('reg2-');
    try {
      writePng(path.join(tmp, 'a.png'));
      const defs = [...builtInDefinitions];
      const cat = await createAssetCatalog([tmp], { definitions: defs } as any);
      expect(cat.definitions.length).toBe(builtInDefinitions.length);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
