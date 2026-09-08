import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { inlineFiles, inlineFilesSync, createAssetCatalogSync } from '../src/index.ts';

const FIXTURE_IMAGE = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  'fixtures',
  'legacy',
  'images',
  'apple.png',
);

function mkTmp(prefix = 'files-cancel-commit-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function writeFile(p: string, content: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}
function listTmpFiles(dir: string): string[] {
  const all: string[] = [];
  function walk(d: string) {
    for (const e of fs.readdirSync(d)) {
      const full = path.join(d, e);
      try {
        const st = fs.lstatSync(full);
        if (st.isDirectory()) walk(full);
        else if (e.startsWith('.tmp.')) all.push(full);
      } catch {}
    }
  }
  try {
    walk(dir);
  } catch {}
  return all;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AIH-02: preserve every committed result on cancellation', () => {
  it('async concurrency 2: later index commits before earlier index aborts; both reported, order kept', async () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const t0 = path.join(tmp, 'a.css');
      const t1 = path.join(tmp, 'b.css');
      const t2 = path.join(tmp, 'c.css');
      const orig0 = `.a{background:url('./apple.png')}`;
      const orig1 = `.b{background:url('./apple.png')}`;
      const orig2 = `.c{background:url('./apple.png')}`;
      writeFile(t0, orig0);
      writeFile(t1, orig1);
      writeFile(t2, orig2);
      const catalog = createAssetCatalogSync(asset);

      const ac = new AbortController();
      const abortReason = new DOMException('AIH-02 late abort', 'AbortError');
      let releaseT0!: () => void;
      const t0Gate = new Promise<void>((r) => {
        releaseT0 = r;
      });
      let gateReleased = false;
      const origReadFile = fs.promises.readFile.bind(fs.promises);
      const readSpy = vi.spyOn(fs.promises, 'readFile').mockImplementation(async (p: any, ...rest: any[]) => {
        if (String(p) === path.resolve(t0)) {
          await t0Gate;
        }
        return origReadFile(p, ...rest);
      });
      const origRename = fs.promises.rename.bind(fs.promises);
      const renameSpy = vi.spyOn(fs.promises, 'rename').mockImplementation(async (src: any, dest: any) => {
        const r = await origRename(src, dest);
        if (String(dest) === path.resolve(t1) && !gateReleased) {
          gateReleased = true;
          ac.abort(abortReason);
          releaseT0();
        }
        return r;
      });

      const result = await inlineFiles({
        targets: [t0, t1, t2],
        catalog,
        write: true,
        concurrency: 2,
        signal: ac.signal,
      } as any);

      expect(gateReleased).toBe(true);
      expect(result).toHaveLength(3);
      // Deterministic input order, not completion order
      expect(result.map((r) => r.filePath)).toEqual([path.resolve(t0), path.resolve(t1), path.resolve(t2)]);
      const r0 = result[0]!;
      const r1 = result[1]!;
      const r2 = result[2]!;
      // Later index committed before earlier index aborted
      expect(r1.written).toBe(true);
      expect(r1.modified).toBe(true);
      expect(fs.readFileSync(t1, 'utf8')).toMatch(/data:image/);
      // Earlier index aborted after commit existed elsewhere
      expect(r0.written).toBe(false);
      expect(r0.diagnostics.some((d: any) => d.code === 'FILESYSTEM_ERROR')).toBe(true);
      expect(fs.readFileSync(t0, 'utf8')).toBe(orig0);
      // Remaining target never written after cancellation
      expect(r2.written).toBe(false);
      expect(fs.readFileSync(t2, 'utf8')).toBe(orig2);
      expect(listTmpFiles(tmp)).toHaveLength(0);
      readSpy.mockRestore();
      renameSpy.mockRestore();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('sync: abort from second resolver after first commits keeps first result observable', () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const t1 = path.join(tmp, 'a.css');
      const t2 = path.join(tmp, 'b.css');
      const t3 = path.join(tmp, 'c.css');
      const orig1 = `.a{background:url('./apple.png')}`;
      const orig2 = `.b{background:url('./apple.png')}`;
      const orig3 = `.c{background:url('./apple.png')}`;
      writeFile(t1, orig1);
      writeFile(t2, orig2);
      writeFile(t3, orig3);
      const catalog = createAssetCatalogSync(asset);
      const ac = new AbortController();
      let calls = 0;
      const resolver = () => {
        calls++;
        if (calls === 2) ac.abort(new DOMException('AIH-02 sync late abort', 'AbortError'));
        return undefined;
      };
      const result = inlineFilesSync({
        targets: [t1, t2, t3],
        catalog,
        write: true,
        signal: ac.signal,
        resolver,
      } as any);
      expect(calls).toBeGreaterThanOrEqual(2);
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.filePath)).toEqual([path.resolve(t1), path.resolve(t2), path.resolve(t3)]);
      expect(result[0]!.written).toBe(true);
      expect(fs.readFileSync(t1, 'utf8')).toMatch(/data:image/);
      expect(result[1]!.written).toBe(false);
      expect(result[1]!.diagnostics.some((d: any) => d.code === 'FILESYSTEM_ERROR')).toBe(true);
      expect(fs.readFileSync(t2, 'utf8')).toBe(orig2);
      expect(result[2]!.written).toBe(false);
      expect(fs.readFileSync(t3, 'utf8')).toBe(orig3);
      expect(listTmpFiles(tmp)).toHaveLength(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('async: abort before any commit rejects with signal reason and writes nothing', async () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const t0 = path.join(tmp, 'a.css');
      const t1 = path.join(tmp, 'b.css');
      const orig0 = `.a{background:url('./apple.png')}`;
      const orig1 = `.b{background:url('./apple.png')}`;
      writeFile(t0, orig0);
      writeFile(t1, orig1);
      const catalog = createAssetCatalogSync(asset);
      const ac = new AbortController();
      const reason = new DOMException('AIH-02 early abort', 'AbortError');
      const resolver = () => {
        ac.abort(reason);
        return undefined;
      };
      await expect(
        inlineFiles({ targets: [t0, t1], catalog, write: true, concurrency: 2, signal: ac.signal, resolver } as any),
      ).rejects.toBe(reason);
      expect(fs.readFileSync(t0, 'utf8')).toBe(orig0);
      expect(fs.readFileSync(t1, 'utf8')).toBe(orig1);
      expect(listTmpFiles(tmp)).toHaveLength(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('sync: abort before any commit rejects with signal reason and writes nothing', () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const t0 = path.join(tmp, 'a.css');
      const t1 = path.join(tmp, 'b.css');
      const orig0 = `.a{background:url('./apple.png')}`;
      const orig1 = `.b{background:url('./apple.png')}`;
      writeFile(t0, orig0);
      writeFile(t1, orig1);
      const catalog = createAssetCatalogSync(asset);
      const ac = new AbortController();
      const reason = new DOMException('AIH-02 sync early abort', 'AbortError');
      const resolver = () => {
        ac.abort(reason);
        return undefined;
      };
      expect(() =>
        inlineFilesSync({ targets: [t0, t1], catalog, write: true, signal: ac.signal, resolver } as any),
      ).toThrow(reason);
      expect(fs.readFileSync(t0, 'utf8')).toBe(orig0);
      expect(fs.readFileSync(t1, 'utf8')).toBe(orig1);
      expect(listTmpFiles(tmp)).toHaveLength(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });
});
