import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_ASSET_BYTES,
  DEFAULT_MAX_TOTAL_BYTES,
  DEFAULT_MAX_FILES,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_TARGETS,
  DEFAULT_CONCURRENCY,
  MAX_REASONABLE_MAX_ASSET_BYTES,
  MAX_REASONABLE_MAX_TOTAL_BYTES,
  MAX_REASONABLE_MAX_FILES,
  MAX_REASONABLE_MAX_DEPTH,
  MAX_REASONABLE_MAX_TARGETS,
  MAX_REASONABLE_CONCURRENCY,
  DEFAULT_POLICY,
  validatePolicyValue,
  validatePolicyOptions,
  normalizePolicy,
  createDefinitionRegistry,
  builtInDefinitions,
  encodeAsset,
  encodeAssetSync,
  encodeAssets,
  createAssetCatalogSync,
  createAssetCatalog,
  discoverAssets,
  discoverAssetsSync,
  resolveAssetReferenceSync,
  InvalidOptionsError,
  ResourceLimitError,
} from '../src/index.ts';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Defaults and frozen aggregate
// ---------------------------------------------------------------------------

describe('policy defaults', () => {
  it('exports finite defaults within expected ranges', () => {
    // 2–5 MiB for per-asset, 10–20 MiB total per task suggestion
    expect(DEFAULT_MAX_ASSET_BYTES).toBe(3 * 1024 * 1024);
    expect(DEFAULT_MAX_TOTAL_BYTES).toBe(15 * 1024 * 1024);
    expect(DEFAULT_MAX_FILES).toBe(10_000);
    expect(DEFAULT_MAX_DEPTH).toBe(32);
    expect(DEFAULT_MAX_TARGETS).toBe(500);
    expect(DEFAULT_CONCURRENCY).toBe(16);
    // all finite positive ints
    for (const v of [
      DEFAULT_MAX_ASSET_BYTES,
      DEFAULT_MAX_TOTAL_BYTES,
      DEFAULT_MAX_FILES,
      DEFAULT_MAX_DEPTH,
      DEFAULT_MAX_TARGETS,
      DEFAULT_CONCURRENCY,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Number.isInteger(v)).toBe(true);
      expect(v > 0).toBe(true);
    }
  });

  it('DEFAULT_POLICY is frozen and matches constants', () => {
    expect(Object.isFrozen(DEFAULT_POLICY)).toBe(true);
    expect(DEFAULT_POLICY.maxAssetBytes).toBe(DEFAULT_MAX_ASSET_BYTES);
    expect(DEFAULT_POLICY.maxTotalBytes).toBe(DEFAULT_MAX_TOTAL_BYTES);
    expect(DEFAULT_POLICY.maxFiles).toBe(DEFAULT_MAX_FILES);
    expect(DEFAULT_POLICY.maxDepth).toBe(DEFAULT_MAX_DEPTH);
    expect(DEFAULT_POLICY.maxTargets).toBe(DEFAULT_MAX_TARGETS);
    expect(DEFAULT_POLICY.concurrency).toBe(DEFAULT_CONCURRENCY);
  });

  it('caps are larger than defaults (unreasonable threshold)', () => {
    expect(MAX_REASONABLE_MAX_ASSET_BYTES).toBeGreaterThan(DEFAULT_MAX_ASSET_BYTES);
    expect(MAX_REASONABLE_MAX_TOTAL_BYTES).toBeGreaterThan(DEFAULT_MAX_TOTAL_BYTES);
    expect(MAX_REASONABLE_MAX_FILES).toBeGreaterThan(DEFAULT_MAX_FILES);
    expect(MAX_REASONABLE_MAX_DEPTH).toBeGreaterThan(DEFAULT_MAX_DEPTH);
    expect(MAX_REASONABLE_MAX_TARGETS).toBeGreaterThan(DEFAULT_MAX_TARGETS);
    expect(MAX_REASONABLE_CONCURRENCY).toBeGreaterThan(DEFAULT_CONCURRENCY);
  });

  it('built-ins do not include audio/video by default', () => {
    const exts = builtInDefinitions.flatMap((d) => d.extensions);
    expect(exts).not.toContain('.mp3');
    expect(exts).not.toContain('.wav');
    expect(exts).not.toContain('.ogg');
    expect(exts).not.toContain('.mp4');
    expect(exts).not.toContain('.webm');
    const kinds = new Set(builtInDefinitions.map((d) => d.kind));
    expect(kinds.has('audio')).toBe(false);
    expect(kinds.has('video')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Validation: negative, non-finite, fractional, zero, type, unreasonable
// ---------------------------------------------------------------------------

describe('validatePolicyValue', () => {
  const cases: Array<[unknown, string]> = [
    [-1, 'negative'],
    [0, 'zero'],
    [NaN, 'non-finite NaN'],
    [Infinity, 'non-finite Infinity'],
    [-Infinity, 'non-finite -Infinity'],
    [3.5, 'fractional'],
    ['16' as unknown as number, 'wrong type string'],
    [null as unknown as number, 'wrong type null'],
  ];

  for (const [val, label] of cases) {
    it(`rejects ${label} for maxAssetBytes`, () => {
      expect(() => validatePolicyValue('maxAssetBytes', val, MAX_REASONABLE_MAX_ASSET_BYTES)).toThrow(
        InvalidOptionsError,
      );
      try {
        validatePolicyValue('maxAssetBytes', val, MAX_REASONABLE_MAX_ASSET_BYTES);
      } catch (e) {
        expect((e as InvalidOptionsError).code).toBe('INVALID_OPTIONS');
      }
    });
  }

  it('rejects unreasonable values above cap', () => {
    expect(() =>
      validatePolicyValue('maxAssetBytes', MAX_REASONABLE_MAX_ASSET_BYTES + 1, MAX_REASONABLE_MAX_ASSET_BYTES),
    ).toThrow(InvalidOptionsError);
    expect(() =>
      validatePolicyValue('maxTotalBytes', MAX_REASONABLE_MAX_TOTAL_BYTES + 1, MAX_REASONABLE_MAX_TOTAL_BYTES),
    ).toThrow(InvalidOptionsError);
    expect(() => validatePolicyValue('maxFiles', MAX_REASONABLE_MAX_FILES + 1, MAX_REASONABLE_MAX_FILES)).toThrow(
      InvalidOptionsError,
    );
    expect(() => validatePolicyValue('maxDepth', MAX_REASONABLE_MAX_DEPTH + 1, MAX_REASONABLE_MAX_DEPTH)).toThrow(
      InvalidOptionsError,
    );
    expect(() => validatePolicyValue('maxTargets', MAX_REASONABLE_MAX_TARGETS + 1, MAX_REASONABLE_MAX_TARGETS)).toThrow(
      InvalidOptionsError,
    );
    expect(() =>
      validatePolicyValue('concurrency', MAX_REASONABLE_CONCURRENCY + 1, MAX_REASONABLE_CONCURRENCY),
    ).toThrow(InvalidOptionsError);
  });

  it('accepts boundary reasonable max', () => {
    expect(() =>
      validatePolicyValue('maxAssetBytes', MAX_REASONABLE_MAX_ASSET_BYTES, MAX_REASONABLE_MAX_ASSET_BYTES),
    ).not.toThrow();
    expect(() => validatePolicyValue('concurrency', 16, MAX_REASONABLE_CONCURRENCY)).not.toThrow();
  });

  it('validatePolicyOptions validates all keys at once', () => {
    expect(() => validatePolicyOptions({ maxAssetBytes: -5 })).toThrow(InvalidOptionsError);
    expect(() => validatePolicyOptions({ maxTotalBytes: Infinity as unknown as number })).toThrow(InvalidOptionsError);
    expect(() => validatePolicyOptions({ maxFiles: 10.2 })).toThrow(InvalidOptionsError);
    expect(() => validatePolicyOptions({ maxDepth: 0 })).toThrow(InvalidOptionsError);
    expect(() => validatePolicyOptions({ maxTargets: MAX_REASONABLE_MAX_TARGETS + 1 })).toThrow(InvalidOptionsError);
    expect(() => validatePolicyOptions({ concurrency: NaN as unknown as number })).toThrow(InvalidOptionsError);
  });
});

// ---------------------------------------------------------------------------
// Integration: encode/discovery/catalog reject invalid policy options
// ---------------------------------------------------------------------------

describe('policy integration — validation via public APIs', () => {
  it('encodeAsset rejects fractional maxAssetBytes', async () => {
    await expect(
      encodeAsset({ data: new Uint8Array([1]), filename: 'a.png' }, { maxAssetBytes: 10.5 as never }),
    ).rejects.toBeInstanceOf(InvalidOptionsError);
    expect(() =>
      encodeAssetSync({ data: new Uint8Array([1]), filename: 'a.png' }, { maxAssetBytes: 10.5 as never }),
    ).toThrow(InvalidOptionsError);
  });

  it('encodeAsset rejects unreasonable maxAssetBytes', async () => {
    await expect(
      encodeAsset(
        { data: new Uint8Array([1]), filename: 'a.png' },
        { maxAssetBytes: MAX_REASONABLE_MAX_ASSET_BYTES + 1 },
      ),
    ).rejects.toBeInstanceOf(InvalidOptionsError);
  });

  it('discoverAssets rejects fractional and unreasonable concurrency/maxFiles/maxDepth', async () => {
    await expect(discoverAssets('.', { concurrency: 2.5 as never })).rejects.toBeInstanceOf(InvalidOptionsError);
    await expect(discoverAssets('.', { maxFiles: -1 as never })).rejects.toBeInstanceOf(InvalidOptionsError);
    await expect(discoverAssets('.', { maxDepth: Infinity as never })).rejects.toBeInstanceOf(InvalidOptionsError);
    await expect(discoverAssets('.', { concurrency: MAX_REASONABLE_CONCURRENCY + 1 })).rejects.toBeInstanceOf(
      InvalidOptionsError,
    );
    expect(() => discoverAssetsSync('.', { concurrency: 0 as never })).toThrow(InvalidOptionsError);
    expect(() => discoverAssetsSync('.', { maxFiles: NaN as never })).toThrow(InvalidOptionsError);
  });

  it('catalog rejects unreasonable maxTotalBytes', async () => {
    await expect(
      createAssetCatalog([{ data: new Uint8Array([1]), filename: 'a.png' }], {
        maxTotalBytes: MAX_REASONABLE_MAX_TOTAL_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(InvalidOptionsError);
    expect(() =>
      createAssetCatalogSync([{ data: new Uint8Array([1]), filename: 'a.png' }], {
        maxTotalBytes: MAX_REASONABLE_MAX_TOTAL_BYTES + 1,
      }),
    ).toThrow(InvalidOptionsError);
  });
});

// ---------------------------------------------------------------------------
// Overrides and normalizePolicy
// ---------------------------------------------------------------------------

describe('normalizePolicy overrides', () => {
  it('applies defaults when missing', () => {
    const p = normalizePolicy({});
    expect(p.maxAssetBytes).toBe(DEFAULT_MAX_ASSET_BYTES);
    expect(p.maxTotalBytes).toBe(DEFAULT_MAX_TOTAL_BYTES);
    expect(p.maxFiles).toBe(DEFAULT_MAX_FILES);
    expect(p.maxDepth).toBe(DEFAULT_MAX_DEPTH);
    expect(p.maxTargets).toBe(DEFAULT_MAX_TARGETS);
    expect(p.concurrency).toBe(DEFAULT_CONCURRENCY);
    expect(Object.isFrozen(p)).toBe(true);
  });

  it('respects explicit overrides', () => {
    const p = normalizePolicy({
      maxAssetBytes: 1024,
      maxTotalBytes: 2048,
      maxFiles: 5,
      maxDepth: 5,
      maxTargets: 10,
      concurrency: 4,
    });
    expect(p.maxAssetBytes).toBe(1024);
    expect(p.maxTotalBytes).toBe(2048);
    expect(p.maxFiles).toBe(5);
    expect(p.maxDepth).toBe(5);
    expect(p.maxTargets).toBe(10);
    expect(p.concurrency).toBe(4);
  });

  it('partial overrides keep defaults for rest', () => {
    const p = normalizePolicy({ maxAssetBytes: 12345 });
    expect(p.maxAssetBytes).toBe(12345);
    expect(p.maxTotalBytes).toBe(DEFAULT_MAX_TOTAL_BYTES);
  });

  it('through encode: custom limit is enforced and allows raising', async () => {
    const data = new Uint8Array(100);
    // default 3 MiB would allow; custom 50 should reject
    await expect(encodeAsset({ data, filename: 'a.png' }, { maxAssetBytes: 50 })).rejects.toBeInstanceOf(
      ResourceLimitError,
    );
    // raising above default should succeed for larger assets
    const larger = new Uint8Array(DEFAULT_MAX_ASSET_BYTES + 1024);
    await expect(
      encodeAsset({ data: larger, filename: 'a.png' }, { maxAssetBytes: DEFAULT_MAX_ASSET_BYTES + 2048 }),
    ).resolves.toBeDefined();
  });

  it('trusted pipeline can raise maxAssetBytes up to cap', async () => {
    const data = new Uint8Array(50 * 1024 * 1024); // 50 MiB — within 100 MiB cap
    // Should succeed when limit raised, proving override works without code change
    // Need to raise both per-asset and total since encode checks both
    const res = await encodeAsset(
      { data, filename: 'a.png', mediaType: 'image/png' },
      { maxAssetBytes: 60 * 1024 * 1024, maxTotalBytes: 60 * 1024 * 1024 },
    );
    expect(res.byteLength).toBe(data.length);
  });
});

// ---------------------------------------------------------------------------
// Custom asset definition end-to-end without source change (audio fixture)
// ---------------------------------------------------------------------------

describe('custom audio definition end-to-end', () => {
  const audioDef = { kind: 'audio' as const, extensions: ['.mp3'], mediaType: 'audio/mpeg' };

  it('encodeAsset with custom audio definition succeeds', async () => {
    const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02]);
    const res = await encodeAsset(
      { data: audioBytes, filename: 'tiny.mp3' },
      { definitions: [audioDef, ...builtInDefinitions] },
    );
    expect(res.kind).toBe('audio');
    expect(res.mediaType).toBe('audio/mpeg');
    expect(res.dataUrl.startsWith('data:audio/mpeg;base64,')).toBe(true);
    // Round-trip bytes
    const b64 = res.dataUrl.split(',')[1]!;
    expect(Buffer.from(b64, 'base64').equals(Buffer.from(audioBytes))).toBe(true);
  });

  it('encodeAssetSync with custom audio and explicit mediaType', () => {
    const data = new Uint8Array([1, 2, 3]);
    const res = encodeAssetSync(
      { data, filename: 'tone.mp3', mediaType: 'audio/mpeg', kind: 'audio' },
      { definitions: [audioDef, ...builtInDefinitions] },
    );
    expect(res.kind).toBe('audio');
    expect(res.mediaType).toBe('audio/mpeg');
  });

  it('catalog + resolver can resolve custom audio file', async () => {
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'asset-inliner-policy-audio-'));
    try {
      const audioPath = path.join(tmp, 'tiny.mp3');
      const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x00, 0x01, 0x02, 0x03]);
      await fs.promises.writeFile(audioPath, audioBytes);
      const catalog = await createAssetCatalog([audioPath], { definitions: [audioDef, ...builtInDefinitions] });
      expect(catalog.assets).toHaveLength(1);
      const asset = catalog.assets[0]!;
      expect(asset.kind).toBe('audio');

      // Simulate HTML document referencing audio via relative path
      const htmlDocPath = path.join(tmp, 'index.html');
      await fs.promises.writeFile(htmlDocPath, '<audio src="tiny.mp3"></audio>');
      const resolved = resolveAssetReferenceSync('tiny.mp3', catalog, { documentPath: htmlDocPath });
      expect(resolved.skipped).toBe(false);
      expect(resolved.asset).toBeDefined();
      expect(resolved.asset?.kind).toBe('audio');

      // Registry is immutable — original builtInDefinitions unaffected
      expect(builtInDefinitions.some((d) => d.extensions.includes('.mp3'))).toBe(false);
      // Custom registry isolated
      const customReg = createDefinitionRegistry([audioDef, ...builtInDefinitions]);
      expect(customReg.get('.mp3')?.mediaType).toBe('audio/mpeg');
      const freshDefault = createDefinitionRegistry();
      expect(freshDefault.get('.mp3')).toBeUndefined();
    } finally {
      await fs.promises.rm(tmp, { recursive: true, force: true });
    }
  });

  it('custom video definition (mp4) works similarly', async () => {
    const videoDef = { kind: 'video' as const, extensions: ['.mp4'], mediaType: 'video/mp4' };
    const data = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]); // minimal ftyp
    const res = await encodeAsset({ data, filename: 'clip.mp4' }, { definitions: [videoDef, ...builtInDefinitions] });
    expect(res.kind).toBe('video');
    expect(res.mediaType).toBe('video/mp4');
  });
});
