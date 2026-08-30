import { describe, it, expect } from 'vitest';
import {
  encodeAsset,
  resolveByExtension,
  createDefinitionRegistry,
  builtInDefinitions,
  inlineHtml,
} from '../src/index.ts';
import { UnsupportedAssetError, InvalidOptionsError } from '../src/errors.ts';
import { normalizeDefinition } from '../src/definitions.ts';

describe('AINL2-05: explicit eligibility for unregistered media types', () => {
  it('application/pdf without explicit kind throws UnsupportedAssetError via resolveByExtension', () => {
    const registry = createDefinitionRegistry();
    expect(() =>
      resolveByExtension({
        filename: 'doc.pdf',
        explicitMediaType: 'application/pdf',
        registry,
      }),
    ).toThrow(UnsupportedAssetError);
  });

  it('application/pdf without explicit kind throws via encodeAsset (not image fallback)', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    await expect(encodeAsset({ data, filename: 'doc.pdf', mediaType: 'application/pdf' })).rejects.toBeInstanceOf(
      UnsupportedAssetError,
    );
  });

  it('application/pdf with explicit custom kind succeeds and preserves kind', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const res = await encodeAsset({ data, filename: 'doc.pdf', mediaType: 'application/pdf', kind: 'custom' });
    expect(res.mediaType).toBe('application/pdf');
    expect(res.kind).toBe('custom');
  });

  it('registered custom pdf definition allows encode without explicit kind', async () => {
    const customPdf = { kind: 'document' as const, extensions: ['.pdf'], mediaType: 'application/pdf' };
    const registry = createDefinitionRegistry([...builtInDefinitions, customPdf as any]);
    const data = new Uint8Array([5, 6, 7]);
    const res = await encodeAsset(
      { data, filename: 'file.pdf' },
      { definitions: [...builtInDefinitions, customPdf as any] },
    );
    expect(res.mediaType).toBe('application/pdf');
    expect(res.kind).toBe('document');
    // also via explicit mediaType that matches registry should succeed
    const res2 = await encodeAsset(
      { data, filename: 'file.pdf', mediaType: 'application/pdf' },
      { definitions: [...builtInDefinitions, customPdf as any] },
    );
    expect(res2.kind).toBe('document');
  });

  it('image/* without registry but with supported prefix still allows image kind without explicit kind', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const res = await encodeAsset({ data, filename: 'x.bin', mediaType: 'image/custom' });
    expect(res.mediaType).toBe('image/custom');
    expect(res.kind).toBe('image');
  });

  it('audio/* without registry but with supported prefix still allows audio kind without explicit kind', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const res = await encodeAsset({ data, filename: 'x.bin', mediaType: 'audio/ogg' });
    expect(res.kind).toBe('audio');
  });

  it('font/* without registry but with supported prefix still allows font kind', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const res = await encodeAsset({ data, filename: 'x.bin', mediaType: 'font/woff2' });
    expect(res.kind).toBe('font');
  });

  it('application/custom without explicit kind throws (generic fallback removed)', async () => {
    const data = new Uint8Array([1, 2, 3]);
    await expect(encodeAsset({ data, mediaType: 'application/custom+type' })).rejects.toBeInstanceOf(
      UnsupportedAssetError,
    );
  });

  it('application/custom with explicit custom kind succeeds (keeps custom usable without source change)', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const res = await encodeAsset({ data, mediaType: 'application/custom+type', kind: 'my-custom' });
    expect(res.kind).toBe('my-custom');
    expect(res.mediaType).toBe('application/custom+type');
  });

  it('inconsistent custom detector ext/mime fails with controlled error', async () => {
    const data = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const inconsistentDetector = {
      async detect() {
        return { ext: 'png', mime: 'image/jpeg' } as any;
      },
    };
    await expect(encodeAsset({ data }, { detection: 'content', detector: inconsistentDetector })).rejects.toThrow();
    try {
      await encodeAsset({ data }, { detection: 'content', detector: inconsistentDetector });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e instanceof InvalidOptionsError || e instanceof UnsupportedAssetError).toBe(true);
    }
  });

  it('consistent detector ext/mime still succeeds', async () => {
    const data = new Uint8Array([0, 1, 2, 3]);
    const detector = {
      async detect() {
        return { ext: 'png', mime: 'image/png' };
      },
    };
    const res = await encodeAsset({ data }, { detection: 'content', detector });
    expect(res.mediaType).toBe('image/png');
  });

  it('non-font definition with fontFormat is rejected', () => {
    expect(() =>
      normalizeDefinition({ kind: 'image', extensions: ['.png'], mediaType: 'image/png', fontFormat: 'woff2' } as any),
    ).toThrow(InvalidOptionsError);
  });

  it('non-font explicit fontFormat via resolveByExtension is rejected', () => {
    const registry = createDefinitionRegistry();
    expect(() =>
      resolveByExtension({
        filename: 'a.png',
        explicitMediaType: 'image/png',
        explicitFontFormat: 'woff2',
        registry,
      }),
    ).toThrow(InvalidOptionsError);
  });

  it('non-font explicit fontFormat via encodeAsset is rejected', async () => {
    const data = new Uint8Array([1, 2, 3]);
    await expect(
      encodeAsset({ data, filename: 'a.png', mediaType: 'image/png', kind: 'image', fontFormat: 'woff2' } as any),
    ).rejects.toBeInstanceOf(InvalidOptionsError);
  });

  it('font definition with fontFormat succeeds', () => {
    const def = normalizeDefinition({
      kind: 'font',
      extensions: ['.woff2'],
      mediaType: 'font/woff2',
      fontFormat: 'woff2',
    } as any);
    expect(def.fontFormat).toBe('woff2');
  });

  it('application/pdf encoded with explicit custom kind does not inline into image-only HTML target', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const pdfAsset = await encodeAsset({ data, filename: 'doc.pdf', mediaType: 'application/pdf', kind: 'document' });
    // Build catalog manually with pdf asset plus an image asset
    const pngData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    // Use a real png fixture via encode to get catalog? Simpler: create catalog with pdf asset via custom resolver? Use createAssetCatalog with image
    // For this test, construct catalog via createAssetCatalog using custom definitions is easier, but we already have pdfAsset encoded; we can build catalog via literal
    const catalog = {
      assets: [pdfAsset] as any,
      definitions: builtInDefinitions,
      getByPath: (p: string) => (p.endsWith('doc.pdf') ? pdfAsset : undefined),
      getByBasename: (b: string) => (b === 'doc.pdf' ? pdfAsset : undefined),
      size: 1,
    } as any;
    const html = `<img src="doc.pdf" alt="pdf"><img src="missing.png">`;
    const result = inlineHtml(html, { catalog, documentPath: '/proj/index.html' });
    // pdf asset kind document should not be inlined into img[src] which only accepts image
    expect(result.modified).toBe(false);
    expect(result.replacements.length).toBe(0);
    // should have diagnostic for unsupported kind or unresolved? For pdf it should be UNSUPPORTED_KIND
    const diag = result.diagnostics.find((d) => d.originalUrl === 'doc.pdf');
    expect(diag).toBeDefined();
    expect(diag!.code).toBe('UNSUPPORTED_KIND');
  });
});
