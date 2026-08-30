import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { inlineCss } from '../src/css.ts';
import { inlineHtml } from '../src/html.ts';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { inlineFiles, inlineFilesSync } from '../src/files.ts';
import { ResourceLimitError, InvalidOptionsError } from '../src/errors.ts';

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');
const CSS_DIR = path.join(FIXTURE_ROOT, 'css');
const HTML_DIR = path.join(FIXTURE_ROOT, 'html');

function catalogForImage(): ReturnType<typeof createAssetCatalogSync> {
  return createAssetCatalogSync([path.join(IMAGES_DIR, 'apple.png')]);
}

function cssWithRepeats(count: number, url = '../images/apple.png'): string {
  const lines = [];
  for (let i = 0; i < count; i++) lines.push(`.a${i} { background: url('${url}'); }`);
  return lines.join('\n');
}

function htmlWithRepeats(count: number, url = '../images/apple.png'): string {
  const imgs = [];
  for (let i = 0; i < count; i++) imgs.push(`<img src="${url}" alt="x${i}">`);
  return imgs.join('');
}

describe('target input bytes bound (AINL2-04)', () => {
  it('inlineCss: one-over-limit target input is rejected before parsing', () => {
    const catalog = catalogForImage();
    const content = 'a'.repeat(50);
    // limit 49 -> actual 50 should throw
    expect(() =>
      inlineCss(content, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css'), maxTargetBytes: 49 } as any),
    ).toThrow(ResourceLimitError);
    try {
      inlineCss(content, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css'), maxTargetBytes: 49 } as any);
    } catch (e) {
      expect((e as ResourceLimitError).code).toBe('RESOURCE_LIMIT');
      expect((e as ResourceLimitError).limit).toBe(49);
      expect((e as ResourceLimitError).actual).toBe(50);
      expect(String((e as ResourceLimitError).message)).not.toContain(content);
    }
  });

  it('inlineHtml: one-over-limit target input is rejected before parsing', () => {
    const catalog = catalogForImage();
    const content = '<div>' + 'x'.repeat(100) + '</div>';
    const len = Buffer.byteLength(content, 'utf8');
    expect(() =>
      inlineHtml(content, { catalog, documentPath: path.join(HTML_DIR, 'dummy.html'), maxTargetBytes: len - 1 } as any),
    ).toThrow(ResourceLimitError);
  });

  it('exact boundary succeeds', () => {
    const catalog = catalogForImage();
    const content = '.a { color: red; }';
    const len = Buffer.byteLength(content, 'utf8');
    expect(() =>
      inlineCss(content, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css'), maxTargetBytes: len } as any),
    ).not.toThrow();
    const r = inlineCss(content, {
      catalog,
      documentPath: path.join(CSS_DIR, 'dummy.css'),
      maxTargetBytes: len,
    } as any);
    expect(r.modified).toBe(false);
  });
});

describe('replacement count bound', () => {
  it('inlineCss: repeated references cannot exceed maxReplacements (throw before full insertion)', () => {
    const catalog = catalogForImage();
    const css = cssWithRepeats(5);
    // allow only 2
    expect(() =>
      inlineCss(css, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css'), maxReplacements: 2 } as any),
    ).toThrow(ResourceLimitError);
    const err = (() => {
      try {
        inlineCss(css, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css'), maxReplacements: 2 } as any);
      } catch (e) {
        return e as any;
      }
    })();
    expect(err.code).toBe('RESOURCE_LIMIT');
    expect(err.limit).toBe(2);
    expect(err.actual).toBe(3);
  });

  it('inlineHtml: repeated references cannot exceed maxReplacements', () => {
    const catalog = catalogForImage();
    const html = htmlWithRepeats(5);
    expect(() =>
      inlineHtml(html, { catalog, documentPath: path.join(HTML_DIR, 'dummy.html'), maxReplacements: 2 } as any),
    ).toThrow(ResourceLimitError);
  });

  it('exact boundary for replacements succeeds', () => {
    const catalog = catalogForImage();
    const css = cssWithRepeats(3);
    const r = inlineCss(css, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css'), maxReplacements: 3 } as any);
    expect(r.replacements).toHaveLength(3);
    expect(r.modified).toBe(true);
  });
});

describe('projected output bytes bound', () => {
  it('inlineCss: output growth bounded before inserting each data URL', () => {
    const catalog = catalogForImage();
    // Get a dataUrl length to compute expected output size
    const asset = catalog.getByPath(path.join(IMAGES_DIR, 'apple.png'))!;
    const dataUrlLen = Buffer.byteLength(asset.dataUrl, 'utf8');
    const css = cssWithRepeats(4);
    const origLen = Buffer.byteLength(css, 'utf8');
    // originalUrl length approx '../images/apple.png' ~19, delta ~ dataUrlLen-19 per replacement
    const origUrlLen = Buffer.byteLength('../images/apple.png', 'utf8');
    const delta = dataUrlLen - origUrlLen;
    // Allow only orig + delta*2 + small, third replacement should exceed
    const maxOutput = origLen + delta * 2;
    expect(() =>
      inlineCss(css, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css'), maxOutputBytes: maxOutput } as any),
    ).toThrow(ResourceLimitError);
    try {
      inlineCss(css, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css'), maxOutputBytes: maxOutput } as any);
    } catch (e) {
      expect((e as ResourceLimitError).limit).toBe(maxOutput);
    }
  });

  it('inlineHtml: output growth bounded', () => {
    const catalog = catalogForImage();
    const asset = catalog.getByPath(path.join(IMAGES_DIR, 'apple.png'))!;
    const dataUrlLen = Buffer.byteLength(asset.dataUrl, 'utf8');
    const html = htmlWithRepeats(4);
    const origLen = Buffer.byteLength(html, 'utf8');
    const origUrlLen = Buffer.byteLength('../images/apple.png', 'utf8');
    const delta = dataUrlLen - origUrlLen;
    const maxOutput = origLen + delta * 2;
    expect(() =>
      inlineHtml(html, { catalog, documentPath: path.join(HTML_DIR, 'dummy.html'), maxOutputBytes: maxOutput } as any),
    ).toThrow(ResourceLimitError);
  });

  it('exact output boundary succeeds', () => {
    const catalog = catalogForImage();
    const asset = catalog.getByPath(path.join(IMAGES_DIR, 'apple.png'))!;
    const dataUrlLen = Buffer.byteLength(asset.dataUrl, 'utf8');
    const css = cssWithRepeats(2);
    const origLen = Buffer.byteLength(css, 'utf8');
    const origUrlLen = Buffer.byteLength('../images/apple.png', 'utf8');
    const delta = dataUrlLen - origUrlLen;
    // Projected output is origLen + delta*count, enforced before each insertion.
    // Exact projected boundary should succeed.
    const projected = origLen + delta * 2;
    expect(() =>
      inlineCss(css, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css'), maxOutputBytes: projected } as any),
    ).not.toThrow();
    expect(() =>
      inlineCss(css, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css'), maxOutputBytes: projected - 1 } as any),
    ).toThrow(ResourceLimitError);
    // Also verify that final content fits within projected bound (pessimistic may be slightly larger than real, but must be >= real)
    const probe = inlineCss(css, {
      catalog,
      documentPath: path.join(CSS_DIR, 'dummy.css'),
      maxOutputBytes: 50 * 1024 * 1024,
    } as any);
    const realLen = Buffer.byteLength(probe.content, 'utf8');
    expect(projected).toBeGreaterThanOrEqual(realLen);
  });
});

describe('safe-integer and no partial write', () => {
  it('unsafe integer arithmetic fails closed via options validation', () => {
    const catalog = catalogForImage();
    const content = '.a { color: red; }';
    const unsafe = Number.MAX_SAFE_INTEGER + 1;
    // Option validation rejects unsafe integer as InvalidOptionsError (fail closed)
    expect(() => inlineCss(content, { catalog, maxTargetBytes: unsafe } as any)).toThrow(InvalidOptionsError);
    expect(() => inlineHtml(content, { catalog, maxOutputBytes: unsafe } as any)).toThrow(InvalidOptionsError);
    // Also ensure safe-integer arithmetic inside transform fails closed (ResourceLimitError) — covered via per-replacement safe add checks
  });

  it('resource failure does not write partial transformed content (inlineFiles async)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-inliner-target-'));
    const assetsDir = path.join(tmp, 'assets');
    const targetsDir = path.join(tmp, 'targets');
    fs.mkdirSync(assetsDir);
    fs.mkdirSync(targetsDir);
    // copy apple.png as asset
    const srcPng = path.join(IMAGES_DIR, 'apple.png');
    const assetPath = path.join(assetsDir, 'apple.png');
    fs.copyFileSync(srcPng, assetPath);
    // create css target with many repeats that will exceed maxReplacements
    // URL must resolve relative to targetPath to the asset; from targets/app.css, ../assets/apple.png resolves to assetsDir/apple.png
    const css = cssWithRepeats(5, '../assets/apple.png');
    const targetPath = path.join(targetsDir, 'app.css');
    fs.writeFileSync(targetPath, css, 'utf8');
    const origContent = fs.readFileSync(targetPath, 'utf8');
    const results = await inlineFiles({
      assets: [assetPath],
      targets: [targetPath],
      write: true,
      maxReplacements: 2,
    } as any);
    // Should have one result with diagnostic and not written
    expect(results).toHaveLength(1);
    expect(results[0].modified).toBe(false);
    expect(results[0].written).toBe(false);
    expect(results[0].diagnostics.some((d) => d.code === 'RESOURCE_LIMIT')).toBe(true);
    const after = fs.readFileSync(targetPath, 'utf8');
    expect(after).toBe(origContent);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('resource failure does not write partial transformed content (inlineFilesSync)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-inliner-target-sync-'));
    const assetsDir = path.join(tmp, 'assets');
    const targetsDir = path.join(tmp, 'targets');
    fs.mkdirSync(assetsDir);
    fs.mkdirSync(targetsDir);
    const srcPng = path.join(IMAGES_DIR, 'apple.png');
    const assetPath = path.join(assetsDir, 'apple.png');
    fs.copyFileSync(srcPng, assetPath);
    const html = htmlWithRepeats(5, './apple.png');
    const targetPath = path.join(targetsDir, 'index.html');
    fs.writeFileSync(targetPath, html, 'utf8');
    const origContent = fs.readFileSync(targetPath, 'utf8');
    const results = inlineFilesSync({
      assets: [assetPath],
      targets: [targetPath],
      write: true,
      maxTargetBytes: 10,
    } as any);
    expect(results[0].written).toBe(false);
    expect(results[0].diagnostics.some((d) => d.code === 'RESOURCE_LIMIT')).toBe(true);
    const after = fs.readFileSync(targetPath, 'utf8');
    expect(after).toBe(origContent);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('inlineCss does not return silently truncated transform on failure', () => {
    const catalog = catalogForImage();
    const css = cssWithRepeats(10);
    let threw = false;
    try {
      inlineCss(css, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css'), maxReplacements: 3 } as any);
    } catch (e) {
      threw = true;
      expect((e as ResourceLimitError).code).toBe('RESOURCE_LIMIT');
    }
    expect(threw).toBe(true);
  });

  it('target bytes enforced before parser invocation: invalid CSS over limit still throws ResourceLimitError, not ParseError', () => {
    const catalog = catalogForImage();
    const malformed = '}'.repeat(200); // malformed css
    // With low target limit, should throw ResourceLimitError before ParseError
    expect(() => inlineCss(malformed, { catalog, maxTargetBytes: 10 } as any)).toThrow(ResourceLimitError);
    // With high limit, malformed should throw ParseError
    try {
      inlineCss(malformed, { catalog, maxTargetBytes: 500 } as any);
    } catch (e) {
      expect((e as any).code).toBe('PARSE_ERROR');
    }
  });
});
