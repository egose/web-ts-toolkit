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

function mkTmp(prefix = 'files-write-'): string {
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

describe('AINL2-03: atomic write failures fail closed', () => {
  it('async: injected stat failure produces written:false and FILESYSTEM_ERROR', async () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const target = path.join(tmp, 'a.css');
      const original = `.a{background:url('./apple.png')}`;
      writeFile(target, original);
      const origStat = fs.promises.stat.bind(fs.promises);
      const statSpy = vi.spyOn(fs.promises, 'stat').mockImplementation(async (p: any, ...rest: any[]) => {
        if (String(p) === path.resolve(target))
          throw Object.assign(new Error('injected stat failure'), { code: 'EPERM' });
        return origStat(p, ...rest);
      });
      const result = await inlineFiles({ targets: target, assets: asset, write: true });
      expect(result).toHaveLength(1);
      expect(result[0].written).toBe(false);
      expect(result[0].modified).toBe(true);
      expect(result[0].diagnostics.some((d: any) => d.code === 'FILESYSTEM_ERROR')).toBe(true);
      expect(fs.readFileSync(target, 'utf8')).toBe(original);
      expect(listTmpFiles(tmp)).toHaveLength(0);
      statSpy.mockRestore();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('async: injected chmod failure produces written:false', async () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const target = path.join(tmp, 'a.css');
      const original = `.a{background:url('./apple.png')}`;
      writeFile(target, original);
      const origOpen = fs.promises.open.bind(fs.promises);
      const openSpy = vi.spyOn(fs.promises, 'open').mockImplementation(async (p: any, flags: any, mode: any) => {
        const handle: any = await origOpen(p, flags, mode);
        if (String(p).includes('.tmp.')) {
          const origChmod = handle.chmod.bind(handle);
          handle.chmod = async () => {
            throw Object.assign(new Error('injected chmod failure'), { code: 'EPERM' });
          };
        }
        return handle;
      });
      const result = await inlineFiles({ targets: target, assets: asset, write: true });
      expect(result[0].written).toBe(false);
      expect(result[0].diagnostics.some((d: any) => d.code === 'FILESYSTEM_ERROR')).toBe(true);
      expect(fs.readFileSync(target, 'utf8')).toBe(original);
      expect(listTmpFiles(tmp)).toHaveLength(0);
      openSpy.mockRestore();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('async: injected file sync failure produces written:false', async () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const target = path.join(tmp, 'a.css');
      writeFile(target, `.a{background:url('./apple.png')}`);
      const original = fs.readFileSync(target, 'utf8');
      const origOpen = fs.promises.open.bind(fs.promises);
      const openSpy = vi.spyOn(fs.promises, 'open').mockImplementation(async (p: any, flags: any, mode: any) => {
        const handle: any = await origOpen(p, flags, mode);
        if (String(p).includes('.tmp.')) {
          const origSync = handle.sync.bind(handle);
          handle.sync = async () => {
            throw Object.assign(new Error('injected sync failure'), { code: 'EIO' });
          };
        }
        return handle;
      });
      const result = await inlineFiles({ targets: target, assets: asset, write: true });
      expect(result[0].written).toBe(false);
      expect(result[0].diagnostics.some((d: any) => d.code === 'FILESYSTEM_ERROR')).toBe(true);
      expect(fs.readFileSync(target, 'utf8')).toBe(original);
      expect(listTmpFiles(tmp)).toHaveLength(0);
      openSpy.mockRestore();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('sync: injected chmod failure produces written:false', () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const target = path.join(tmp, 'a.css');
      const original = `.a{background:url('./apple.png')}`;
      writeFile(target, original);
      // Build catalog beforehand to avoid mock interfering with asset reading
      const catalog = createAssetCatalogSync(asset);
      const origChmod = fs.chmodSync.bind(fs);
      const chmodSpy = vi.spyOn(fs, 'chmodSync').mockImplementation(((p: any, ...rest: any[]) => {
        if (String(p).includes('.tmp.'))
          throw Object.assign(new Error('injected chmodSync failure'), { code: 'EPERM' });
        return origChmod(p, ...rest);
      }) as any);
      const origFchmod = (fs as any).fchmodSync?.bind(fs);
      const fchmodSpy = vi.spyOn(fs as any, 'fchmodSync').mockImplementation(((fd: any, mode: any) => {
        throw Object.assign(new Error('injected fchmodSync failure'), { code: 'EPERM' });
      }) as any);
      const result = inlineFilesSync({ targets: target, catalog, write: true } as any);
      expect(result[0].written).toBe(false);
      expect(result[0].diagnostics.some((d: any) => d.code === 'FILESYSTEM_ERROR')).toBe(true);
      expect(fs.readFileSync(target, 'utf8')).toBe(original);
      expect(listTmpFiles(tmp)).toHaveLength(0);
      fchmodSpy.mockRestore();
      chmodSpy.mockRestore();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('sync: injected close failure produces written:false', () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const target = path.join(tmp, 'a.css');
      writeFile(target, `.a{background:url('./apple.png')}`);
      const original = fs.readFileSync(target, 'utf8');
      const catalog = createAssetCatalogSync(asset);
      const origClose = fs.closeSync.bind(fs);
      let closeCalls = 0;
      const closeSpy = vi.spyOn(fs, 'closeSync').mockImplementation(((fd: any) => {
        closeCalls++;
        // First close after catalog is done; our temp close will be after catalog, so throw on first call after we set spy
        // Since catalog already built, next close is temp file close
        if (closeCalls === 1) throw Object.assign(new Error('injected closeSync failure'), { code: 'EIO' });
        return origClose(fd);
      }) as any);
      const result = inlineFilesSync({ targets: target, catalog, write: true } as any);
      expect(result[0].written).toBe(false);
      expect(result[0].diagnostics.some((d: any) => d.code === 'FILESYSTEM_ERROR')).toBe(true);
      expect(fs.readFileSync(target, 'utf8')).toBe(original);
      closeSpy.mockRestore();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('async: injected close failure produces written:false', async () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const target = path.join(tmp, 'a.css');
      writeFile(target, `.a{background:url('./apple.png')}`);
      const original = fs.readFileSync(target, 'utf8');
      const origOpen = fs.promises.open.bind(fs.promises);
      const openSpy = vi.spyOn(fs.promises, 'open').mockImplementation(async (p: any, flags: any, mode: any) => {
        const handle: any = await origOpen(p, flags, mode);
        if (String(p).includes('.tmp.')) {
          const origClose = handle.close.bind(handle);
          handle.close = async () => {
            throw Object.assign(new Error('injected close failure'), { code: 'EIO' });
          };
        }
        return handle;
      });
      const result = await inlineFiles({ targets: target, assets: asset, write: true });
      expect(result[0].written).toBe(false);
      expect(result[0].diagnostics.some((d: any) => d.code === 'FILESYSTEM_ERROR')).toBe(true);
      expect(fs.readFileSync(target, 'utf8')).toBe(original);
      expect(listTmpFiles(tmp)).toHaveLength(0);
      openSpy.mockRestore();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('async: cleanup failure does not mask primary rename failure', async () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const target = path.join(tmp, 'a.css');
      writeFile(target, `.a{background:url('./apple.png')}`);
      const original = fs.readFileSync(target, 'utf8');
      const origRename = fs.promises.rename.bind(fs.promises);
      const renameSpy = vi.spyOn(fs.promises, 'rename').mockImplementation(async (src: any, dest: any) => {
        if (String(dest) === path.resolve(target))
          throw Object.assign(new Error('injected rename failure'), { code: 'EXDEV' });
        return origRename(src, dest);
      });
      const origUnlink = fs.promises.unlink.bind(fs.promises);
      const unlinkSpy = vi.spyOn(fs.promises, 'unlink').mockImplementation(async () => {
        throw Object.assign(new Error('injected unlink failure'), { code: 'EPERM' });
      });
      const result = await inlineFiles({ targets: target, assets: asset, write: true });
      expect(result[0].written).toBe(false);
      expect(result[0].diagnostics.some((d: any) => d.code === 'FILESYSTEM_ERROR')).toBe(true);
      const diag = result[0].diagnostics.find((d: any) => d.code === 'FILESYSTEM_ERROR') as any;
      expect(diag.message).toMatch(/apple|rename|Failed to write/i);
      expect(fs.readFileSync(target, 'utf8')).toBe(original);
      renameSpy.mockRestore();
      unlinkSpy.mockRestore();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });
});

describe('AINL2-03: cancellation fail-closed', () => {
  it('aborting from resolver between read and write does not modify target and leaves no temp', async () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const target = path.join(tmp, 'a.css');
      const original = `.a{background:url('./apple.png')}`;
      writeFile(target, original);
      const ac = new AbortController();
      const resolver = (input: any, catalog: any) => {
        ac.abort(new DOMException('resolver abort', 'AbortError'));
        return undefined;
      };
      await expect(
        inlineFiles({ targets: target, assets: asset, write: true, signal: ac.signal, resolver } as any),
      ).rejects.toSatisfy((e: any) => e.name === 'AbortError' || String(e).includes('abort'));
      expect(fs.readFileSync(target, 'utf8')).toBe(original);
      expect(listTmpFiles(tmp)).toHaveLength(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('committed rename is not followed by misleading cancellation rejection', async () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const t1 = path.join(tmp, 'a.css');
      const t2 = path.join(tmp, 'b.css');
      writeFile(t1, `.a{background:url('./apple.png')}`);
      writeFile(t2, `.b{background:url('./apple.png')}`);
      const ac = new AbortController();
      let first = true;
      const resolver = (input: any, catalog: any) => {
        if (first) {
          first = false;
          return undefined;
        }
        ac.abort(new DOMException('late abort', 'AbortError'));
        return undefined;
      };
      const result = await inlineFiles({
        targets: [t1, t2],
        assets: asset,
        write: true,
        concurrency: 1,
        signal: ac.signal,
        resolver,
      } as any);
      expect(result).toHaveLength(2);
      const r1 = result.find((r) => r.filePath === path.resolve(t1))!;
      const r2 = result.find((r) => r.filePath === path.resolve(t2))!;
      expect(r1.written).toBe(true);
      expect(fs.readFileSync(t1, 'utf8')).toMatch(/data:image/);
      expect(r2.written).toBe(false);
      expect(listTmpFiles(tmp)).toHaveLength(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('temp file is created exclusively with intended mode (restrictive 0o600 not widened)', async () => {
    if (process.platform === 'win32') return;
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const target = path.join(tmp, 'a.css');
      writeFile(target, `.a{background:url('./apple.png')}`);
      fs.chmodSync(target, 0o600);
      const modeBefore = fs.statSync(target).mode & 0o777;
      expect(modeBefore).toBe(0o600);
      const origOpen = fs.promises.open.bind(fs.promises);
      let capturedMode: number | undefined;
      let capturedFlag: string | undefined;
      const openSpy = vi.spyOn(fs.promises, 'open').mockImplementation(async (p: any, flags: any, mode: any) => {
        if (String(p).includes('.tmp.')) {
          capturedMode = mode;
          capturedFlag = flags;
        }
        return origOpen(p, flags, mode);
      });
      // Also spy writeFile fallback
      const origWriteFile: any = fs.promises.writeFile;
      let capturedWriteFileMode: number | undefined;
      let capturedWriteFileFlag: string | undefined;
      const wfSpy = vi.spyOn(fs.promises, 'writeFile').mockImplementation(async (p: any, data: any, opts: any) => {
        if (String(p).includes('.tmp.')) {
          if (opts && typeof opts === 'object') {
            capturedWriteFileMode = opts.mode;
            capturedWriteFileFlag = opts.flag;
          }
        }
        return origWriteFile(p, data, opts);
      });
      const result = await inlineFiles({ targets: target, assets: asset, write: true });
      expect(result[0].written).toBe(true);
      // Must have been created with restrictive mode 0o600 and exclusive flag 'wx'
      const modeToCheck = capturedMode ?? capturedWriteFileMode;
      const flagToCheck = capturedFlag ?? capturedWriteFileFlag;
      if (modeToCheck !== undefined) {
        expect(modeToCheck & 0o777).toBe(0o600);
      } else {
        // fallback: if implementation uses open with handle.writeFile, capturedMode will be set
        // If neither captured, fail
        expect(modeToCheck).toBeDefined();
      }
      if (flagToCheck !== undefined) {
        expect(flagToCheck).toContain('x');
      }
      expect(fs.statSync(target).mode & 0o777).toBe(0o600);
      expect(listTmpFiles(tmp)).toHaveLength(0);
      openSpy.mockRestore();
      wfSpy.mockRestore();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('target read failures normalize to FILESYSTEM_ERROR not ENOENT', async () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const target = path.join(tmp, 'a.css');
      writeFile(target, `.a{background:url('./apple.png')}`);
      const origReadFile = fs.promises.readFile.bind(fs.promises);
      const readSpy = vi.spyOn(fs.promises, 'readFile').mockImplementation(async (p: any, ...rest: any[]) => {
        if (String(p) === path.resolve(target))
          throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
        return origReadFile(p, ...rest);
      });
      const result = await inlineFiles({ targets: target, assets: asset });
      expect(result[0].diagnostics.some((d: any) => d.code === 'FILESYSTEM_ERROR')).toBe(true);
      expect(result[0].diagnostics.some((d: any) => d.code === 'ENOENT')).toBe(false);
      readSpy.mockRestore();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  it('sync target read failures normalize to FILESYSTEM_ERROR', () => {
    const tmp = mkTmp();
    try {
      const asset = path.join(tmp, 'apple.png');
      fs.copyFileSync(FIXTURE_IMAGE, asset);
      const target = path.join(tmp, 'a.css');
      writeFile(target, `.a{background:url('./apple.png')}`);
      const orig = fs.readFileSync.bind(fs);
      const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementation(((p: any, ...rest: any[]) => {
        if (String(p) === path.resolve(target))
          throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
        return orig(p, ...rest);
      }) as any);
      const result = inlineFilesSync({ targets: target, assets: asset });
      expect(result[0].diagnostics.some((d: any) => d.code === 'FILESYSTEM_ERROR')).toBe(true);
      expect(result[0].diagnostics.some((d: any) => d.code === 'ENOENT')).toBe(false);
      readSpy.mockRestore();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });
});
