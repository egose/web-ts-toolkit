import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const h = vi.hoisted(() => {
  const state = {
    realReadFile: undefined as unknown,
    realReadFileSync: undefined as unknown,
    readFileSpy: undefined as unknown as import('vitest').Mock,
    readFileSyncSpy: undefined as unknown as import('vitest').Mock,
  };
  return state;
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:fs/promises')>();
  h.realReadFile = mod.readFile;
  h.readFileSpy = vi.fn(mod.readFile as (...args: never[]) => Promise<Buffer>);
  return { ...mod, readFile: h.readFileSpy };
});

vi.mock('node:fs', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:fs')>();
  h.realReadFileSync = mod.readFileSync;
  h.readFileSyncSpy = vi.fn(mod.readFileSync as (...args: never[]) => Buffer);
  const wrapped = { ...mod, readFileSync: h.readFileSyncSpy };
  return { ...wrapped, default: wrapped };
});

import { encodeAsset, encodeAssetSync, encodeAssets, encodeAssetsSync } from '../src/encode.ts';
import { createAssetCatalog, createAssetCatalogSync } from '../src/catalog.ts';
import { ResourceLimitError } from '../src/errors.ts';
import { DEFAULT_MAX_ASSET_BYTES, DEFAULT_MAX_TOTAL_BYTES } from '../src/policy.ts';

function byteInput(size: number, filename: string): { data: Uint8Array; filename: string } {
  return { data: new Uint8Array(size), filename };
}

function inputsOfTotal(total: number): Array<{ data: Uint8Array; filename: string }> {
  const inputs: Array<{ data: Uint8Array; filename: string }> = [];
  let remaining = total;
  let i = 0;
  while (remaining > 0) {
    const size = Math.min(DEFAULT_MAX_ASSET_BYTES, remaining);
    inputs.push(byteInput(size, `asset-${i++}.png`));
    remaining -= size;
  }
  return inputs;
}

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'asset-inliner-limits-'));
}

function writeSizedPng(size: number): string {
  const dir = mkTmp();
  tmpDirs.push(dir);
  const p = path.join(dir, 'file.png');
  const fd = fs.openSync(p, 'w');
  fs.ftruncateSync(fd, size);
  fs.closeSync(fd);
  return p;
}

let tmpDirs: string[] = [];

beforeEach(() => {
  h.readFileSpy.mockReset().mockImplementation(h.realReadFile as (...args: never[]) => Promise<Buffer>);
  h.readFileSyncSpy.mockReset().mockImplementation(h.realReadFileSync as (...args: never[]) => Buffer);
});

afterEach(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

describe('effective default total-byte limit (AINL2-01)', () => {
  it('async batch: exact DEFAULT_MAX_TOTAL_BYTES succeeds', async () => {
    const inputs = inputsOfTotal(DEFAULT_MAX_TOTAL_BYTES);
    const results = await encodeAssets(inputs);
    expect(results).toHaveLength(inputs.length);
  });

  it('async batch: DEFAULT_MAX_TOTAL_BYTES + 1 fails with RESOURCE_LIMIT when maxTotalBytes is omitted', async () => {
    const inputs = inputsOfTotal(DEFAULT_MAX_TOTAL_BYTES + 1);
    const err = await encodeAssets(inputs).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ResourceLimitError);
    expect((err as ResourceLimitError).code).toBe('RESOURCE_LIMIT');
  });

  it('async batch: explicit maxTotalBytes at exact boundary still succeeds; +1 still fails', async () => {
    const exact = await encodeAssets(inputsOfTotal(100), { maxTotalBytes: 100 });
    expect(exact.length).toBeGreaterThan(0);
    await expect(encodeAssets(inputsOfTotal(101), { maxTotalBytes: 100 })).rejects.toBeInstanceOf(ResourceLimitError);
  });

  it('sync batch: exact default succeeds; +1 with omitted maxTotalBytes fails', () => {
    expect(() => encodeAssetsSync(inputsOfTotal(DEFAULT_MAX_TOTAL_BYTES))).not.toThrow();
    const err = (() => {
      try {
        encodeAssetsSync(inputsOfTotal(DEFAULT_MAX_TOTAL_BYTES + 1));
        return undefined;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ResourceLimitError);
    expect((err as ResourceLimitError).code).toBe('RESOURCE_LIMIT');
  });

  it('async catalog: exact default succeeds; +1 with omitted maxTotalBytes fails', async () => {
    const ok = await createAssetCatalog(inputsOfTotal(DEFAULT_MAX_TOTAL_BYTES));
    expect(ok.size).toBeGreaterThan(0);
    const err = await createAssetCatalog(inputsOfTotal(DEFAULT_MAX_TOTAL_BYTES + 1)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ResourceLimitError);
    expect((err as ResourceLimitError).code).toBe('RESOURCE_LIMIT');
  });

  it('sync catalog: exact default succeeds; +1 with omitted maxTotalBytes fails', () => {
    expect(createAssetCatalogSync(inputsOfTotal(DEFAULT_MAX_TOTAL_BYTES)).size).toBeGreaterThan(0);
    const err = (() => {
      try {
        createAssetCatalogSync(inputsOfTotal(DEFAULT_MAX_TOTAL_BYTES + 1));
        return undefined;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ResourceLimitError);
    expect((err as ResourceLimitError).code).toBe('RESOURCE_LIMIT');
  });

  it('async catalog with concurrency > 1 still enforces the omitted default total before unbounded chunk allocation', async () => {
    const err = await createAssetCatalog(inputsOfTotal(DEFAULT_MAX_TOTAL_BYTES + 1), { concurrency: 8 }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ResourceLimitError);
  });
});

describe('per-asset pre-read file size inspection (AINL2-01)', () => {
  it('async: oversized regular file rejects BEFORE readFile consumes its body', async () => {
    const p = writeSizedPng(DEFAULT_MAX_ASSET_BYTES + 1);
    await expect(encodeAsset(p)).rejects.toBeInstanceOf(ResourceLimitError);
    const readThisFile = h.readFileSpy.mock.calls.some((c) => String(c[0]) === p);
    expect(readThisFile).toBe(false);
  });

  it('sync: oversized regular file rejects BEFORE readFileSync consumes its body', () => {
    const p = writeSizedPng(DEFAULT_MAX_ASSET_BYTES + 1);
    expect(() => encodeAssetSync(p)).toThrow(ResourceLimitError);
    const readThisFile = h.readFileSyncSpy.mock.calls.some((c) => String(c[0]) === p);
    expect(readThisFile).toBe(false);
  });

  it('file exactly at the asset limit succeeds (boundary)', async () => {
    const p = writeSizedPng(DEFAULT_MAX_ASSET_BYTES);
    const res = await encodeAsset(p);
    expect(res.byteLength).toBe(DEFAULT_MAX_ASSET_BYTES);
  });
});

describe('cancellation during read (AINL2-01)', () => {
  it('mid-read abort settles with the signal reason', async () => {
    const p = writeSizedPng(1024);

    const controller = new AbortController();
    const reason = new Error('caller-cancelled');
    h.readFileSpy.mockImplementationOnce((...args: unknown[]) => {
      controller.abort(reason);
      type R = (path: never, options?: never) => Promise<Buffer>;
      return Reflect.apply(h.realReadFile as R, null, args as []) as Promise<Buffer>;
    });

    await expect(encodeAsset(p, { signal: controller.signal })).rejects.toBe(reason);
  });
});
