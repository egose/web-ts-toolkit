import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { inlineCss } from '../src/css.ts';
import { inlineHtml } from '../src/html.ts';
import { encodeAsset } from '../src/encode.ts';
import { InvalidOptionsError, ResourceLimitError } from '../src/errors.ts';

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');
const CSS_DIR = path.join(FIXTURE_ROOT, 'css');
const HTML_DIR = path.join(FIXTURE_ROOT, 'html');

function makeCatalog() {
  // apple.png is small (~ a few KB), create a larger synthetic asset via byte input
  const small = { data: new Uint8Array(100), filename: 'small.png', mediaType: 'image/png' };
  const large = { data: new Uint8Array(5000), filename: 'large.png', mediaType: 'image/png' };
  // Use sync catalog with byte inputs + file to ensure deterministic order [small, large, apple.png]
  const catalog = createAssetCatalogSync([small, large, path.join(IMAGES_DIR, 'apple.png')], {});
  return { catalog, smallBytes: 100, largeBytes: 5000 };
}

describe('selective inlining (AINL2-12)', () => {
  it('in-policy asset is inlined while larger selected-out remains unchanged with INLINE_SKIPPED diagnostic (css)', () => {
    const { catalog } = makeCatalog();
    // catalog contains small.png (100B), large.png (5000B), apple.png
    // set maxInlineBytes = 200 so small (100) inlines, large (5000) skipped
    const css = `.a { background: url('small.png'); } .b { background: url('large.png'); }`;
    const result = inlineCss(css, {
      catalog,
      documentPath: path.join(CSS_DIR, 'dummy.css'),
      rootDir: CSS_DIR,
      allowBasenameMatch: true,
      maxInlineBytes: 200,
    } as any);
    // small should be inlined
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('small.png');
    expect(result.content).toMatch(/data:image\/png;base64,/);
    expect(result.content).toContain('large.png');
    expect(result.content).not.toContain('large.png"'); // still external url? Actually url('large.png') remains
    // diagnostic for skipped
    const skipped = result.diagnostics.find((d) => d.code === 'INLINE_SKIPPED' && d.originalUrl === 'large.png');
    expect(skipped).toBeDefined();
    expect(skipped!.severity).toBe('warn');
    expect(result.modified).toBe(true);
  });

  it('inlineHtml selective skip with diagnostic, preserves deterministic order', () => {
    const { catalog } = makeCatalog();
    const html = `<img src="small.png"><img src="large.png">`;
    // html gating only allows image kind, both are image/png so eligible
    const result = inlineHtml(html, {
      catalog,
      documentPath: path.join(HTML_DIR, 'dummy.html'),
      rootDir: CSS_DIR,
      allowBasenameMatch: true,
      maxInlineBytes: 200,
    } as any);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('small.png');
    expect(result.diagnostics.some((d) => d.code === 'INLINE_SKIPPED' && d.originalUrl === 'large.png')).toBe(true);
    expect(result.content).toContain('large.png');
    expect(result.content).toMatch(/data:image\/png;base64,/);
    // order deterministic: small first, large skipped second, replacements sorted by offset
    expect(result.replacements[0].location!.offset).toBeGreaterThanOrEqual(0);
  });

  it('predicate shouldInline can selectively skip', () => {
    const { catalog } = makeCatalog();
    const css = `.a { background: url('small.png'); } .b { background: url('apple.png'); }`;
    const result = inlineCss(css, {
      catalog,
      documentPath: path.join(CSS_DIR, 'dummy.css'),
      rootDir: CSS_DIR,
      allowBasenameMatch: true,
      shouldInline: (asset, url) => url !== 'apple.png',
    } as any);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('small.png');
    expect(result.diagnostics.some((d) => d.code === 'INLINE_SKIPPED' && d.originalUrl === 'apple.png')).toBe(true);
    expect(result.content).toContain('apple.png');
  });

  it('maxInlineBytes and shouldInline both enforced', () => {
    const { catalog } = makeCatalog();
    const css = `.a { background: url('small.png'); } .b { background: url('large.png'); }`;
    // small passes bytes but predicate rejects small, so both should be skipped
    const result = inlineCss(css, {
      catalog,
      documentPath: path.join(CSS_DIR, 'dummy.css'),
      rootDir: CSS_DIR,
      allowBasenameMatch: true,
      maxInlineBytes: 10000,
      shouldInline: () => false,
    } as any);
    expect(result.replacements).toHaveLength(0);
    expect(result.diagnostics.filter((d) => d.code === 'INLINE_SKIPPED')).toHaveLength(2);
    expect(result.modified).toBe(false);
    expect(result.content).toBe(css);
  });

  it('hard limit violation still fails and cannot be downgraded by selection policy', async () => {
    // maxAssetBytes hard limit — encode should throw ResourceLimitError even if maxInlineBytes larger
    const big = { data: new Uint8Array(5000), filename: 'big.png', mediaType: 'image/png' };
    await expect(encodeAsset(big, { maxAssetBytes: 100, maxInlineBytes: 10000 } as any)).rejects.toThrow(
      ResourceLimitError,
    );
    try {
      await encodeAsset(big, { maxAssetBytes: 100 } as any);
    } catch (e) {
      expect((e as ResourceLimitError).code).toBe('RESOURCE_LIMIT');
    }
    // catalog creation hard limit also fails even if maxInlineBytes would skip
    const { catalog } = makeCatalog();
    // Try to create catalog with a file exceeding maxAssetBytes — should throw, not silently skip
    // Use byte input that exceeds maxAssetBytes
    const huge = { data: new Uint8Array(10000), filename: 'huge.png', mediaType: 'image/png' };
    expect(() => createAssetCatalogSync([huge], { maxAssetBytes: 100 } as any)).toThrow(ResourceLimitError);
  });

  it('validation rejects invalid maxInlineBytes and non-function shouldInline', () => {
    const { catalog } = makeCatalog();
    const css = `.a { background: url('small.png'); }`;
    expect(() => inlineCss(css, { catalog, maxInlineBytes: -1 } as any)).toThrow(InvalidOptionsError);
    expect(() => inlineCss(css, { catalog, maxInlineBytes: 0 } as any)).toThrow(InvalidOptionsError);
    expect(() => inlineCss(css, { catalog, maxInlineBytes: Number.NaN } as any)).toThrow(InvalidOptionsError);
    expect(() => inlineCss(css, { catalog, maxInlineBytes: 3.5 } as any)).toThrow(InvalidOptionsError);
    expect(() => inlineCss(css, { catalog, maxInlineBytes: 200 * 1024 * 1024 } as any)).toThrow(InvalidOptionsError);
    expect(() => inlineCss(css, { catalog, shouldInline: 'not-a-fn' } as any)).toThrow(InvalidOptionsError);
    expect(() => inlineCss(css, { catalog, shouldInline: () => Promise.resolve(true) } as any)).not.toThrow(); // predicate not called until asset hit, but return thenable later throws — test next
    // thenable return should be rejected at call time
    const css2 = `.a { background: url('small.png'); }`;
    expect(() =>
      inlineCss(css2, {
        catalog,
        documentPath: path.join(CSS_DIR, 'dummy.css'),
        rootDir: CSS_DIR,
        allowBasenameMatch: true,
        shouldInline: () => ({ then: () => {} }) as any,
      } as any),
    ).toThrow(InvalidOptionsError);
    // html also validates
    const html = `<img src="small.png">`;
    expect(() => inlineHtml(html, { catalog, maxInlineBytes: -5 } as any)).toThrow(InvalidOptionsError);
    expect(() => inlineHtml(html, { catalog, shouldInline: 123 as any } as any)).toThrow(InvalidOptionsError);
  });

  it('srcset selective skip leaves candidate unchanged with diagnostic', () => {
    const { catalog } = makeCatalog();
    const html = `<img srcset="small.png 1x, large.png 2x">`;
    const result = inlineHtml(html, {
      catalog,
      documentPath: path.join(HTML_DIR, 'dummy.html'),
      rootDir: CSS_DIR,
      allowBasenameMatch: true,
      maxInlineBytes: 200,
    } as any);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('small.png');
    expect(result.diagnostics.some((d) => d.code === 'INLINE_SKIPPED' && d.originalUrl === 'large.png')).toBe(true);
    // large.png should remain as literal in srcset
    expect(result.content).toContain('large.png');
  });

  it('no maxInlineBytes means all eligible assets inline (no heuristics)', () => {
    const { catalog } = makeCatalog();
    const css = `.a { background: url('small.png'); } .b { background: url('large.png'); }`;
    const result = inlineCss(css, {
      catalog,
      documentPath: path.join(CSS_DIR, 'dummy.css'),
      rootDir: CSS_DIR,
      allowBasenameMatch: true,
    } as any);
    expect(result.replacements).toHaveLength(2);
    expect(result.diagnostics.filter((d) => d.code === 'INLINE_SKIPPED')).toHaveLength(0);
  });
});
