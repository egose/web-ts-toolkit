import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { inlineHtml } from '../src/html.ts';
import { InvalidOptionsError, ResourceLimitError } from '../src/errors.ts';

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');
const HTML_DIR = path.join(FIXTURE_ROOT, 'html');

function makeCatalog() {
  return createAssetCatalogSync([path.join(IMAGES_DIR, 'apple.png')], {});
}

const OPTS = { documentPath: path.join(HTML_DIR, 'page.html'), rootDir: HTML_DIR, allowBasenameMatch: true } as const;

describe('embedded CSS inlining (AINL2-13)', () => {
  it('is off by default — <style> and style attributes are untouched', () => {
    const catalog = makeCatalog();
    const html = `<style>.a { background: url("apple.png"); }</style><div style="background: url('apple.png')"></div>`;
    const result = inlineHtml(html, { catalog, ...OPTS } as any);
    expect(result.modified).toBe(false);
    expect(result.content).toBe(html);
    expect(result.replacements).toHaveLength(0);
  });

  it('inlines local URLs inside <style> elements when opted in', () => {
    const catalog = makeCatalog();
    const html = `<style>.a { background: url("apple.png"); }</style>`;
    const result = inlineHtml(html, { catalog, ...OPTS, inlineEmbeddedCss: true } as any);
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('apple.png');
    expect(result.content).toMatch(/<style>\.a \{ background: url\(data:image\/png;base64,[^)]*\); \}<\/style>/);
    // location mapped back into HTML source
    const loc = result.replacements[0].location!;
    expect(loc.offset).toBe(html.indexOf('apple.png'));
    expect(html.slice(loc.offset, loc.offset + 'apple.png'.length)).toBe('apple.png');
  });

  it('inlines local URLs inside style attributes when opted in', () => {
    const catalog = makeCatalog();
    const html = `<div style="background: url('apple.png')"></div>`;
    const result = inlineHtml(html, { catalog, ...OPTS, inlineEmbeddedCss: true } as any);
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.content).toMatch(/style="background: url\(data:image\/png;base64,[^)]*\)"/);
    const loc = result.replacements[0].location!;
    expect(html.slice(loc.offset, loc.offset + 'apple.png'.length)).toBe('apple.png');
  });

  it('leaves remote and data URLs untouched inside embedded CSS', () => {
    const catalog = makeCatalog();
    const html = `<style>.a{background:url("https://example.com/x.png");}.b{background:url("data:image/png;base64,AAAA");}.c{background:url("apple.png");}</style>`;
    const result = inlineHtml(html, { catalog, ...OPTS, inlineEmbeddedCss: true } as any);
    expect(result.replacements).toHaveLength(1);
    expect(result.content).toContain('https://example.com/x.png');
    expect(result.content).toContain('data:image/png;base64,AAAA');
  });

  it('does not corrupt surrounding HTML markup (source patch preserves bytes)', () => {
    const catalog = makeCatalog();
    const before = `<!-- c --><p class='x'>Text</p>`;
    const after = `<span data-a="1">tail</span>`;
    const html = `${before}<style>.a { bg: url(apple.png); }</style>${after}`;
    const result = inlineHtml(html, { catalog, ...OPTS, inlineEmbeddedCss: true } as any);
    expect(result.modified).toBe(true);
    expect(result.content.startsWith(before)).toBe(true);
    expect(result.content.endsWith(after)).toBe(true);
  });

  it('malformed embedded CSS produces a PARSE_ERROR diagnostic without corrupting HTML', () => {
    const catalog = makeCatalog();
    const bad = `.a { background: url(apple.png`;
    const html = `<p>keep</p><style>${bad}</style><em>also keep</em>`;
    const result = inlineHtml(html, { catalog, ...OPTS, inlineEmbeddedCss: true } as any);
    const diag = result.diagnostics.find((d) => d.code === 'PARSE_ERROR');
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe('error');
    // chunk left unchanged; surrounding HTML untouched
    expect(result.content).toContain(`<p>keep</p>`);
    expect(result.content).toContain(`<em>also keep</em>`);
    expect(result.content).toContain(bad);
    expect(result.replacements).toHaveLength(0);
  });

  it('honors maxReplacements across embedded CSS replacements (fail-closed)', () => {
    const catalog = makeCatalog();
    const html = `<style>.a{background:url("apple.png");}</style><div style="background:url('apple.png')"></div>`;
    expect(() => inlineHtml(html, { catalog, ...OPTS, inlineEmbeddedCss: true, maxReplacements: 1 } as any)).toThrow(
      ResourceLimitError,
    );
  });

  it('honors maxOutputBytes for embedded CSS expansion (fail-closed)', () => {
    const catalog = makeCatalog();
    const html = `<style>.a{background:url("apple.png");}</style>`;
    expect(() => inlineHtml(html, { catalog, ...OPTS, inlineEmbeddedCss: true, maxOutputBytes: 100 } as any)).toThrow(
      ResourceLimitError,
    );
  });

  it('honors selective maxInlineBytes inside embedded CSS', () => {
    const catalog = makeCatalog();
    const html = `<style>.a{background:url("apple.png");}</style>`;
    const result = inlineHtml(html, { catalog, ...OPTS, inlineEmbeddedCss: true, maxInlineBytes: 1 } as any);
    expect(result.modified).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'INLINE_SKIPPED' && d.originalUrl === 'apple.png')).toBe(true);
    expect(result.content).toBe(html);
  });

  it('rejects non-boolean inlineEmbeddedCss', () => {
    const catalog = makeCatalog();
    expect(() => inlineHtml('<p>x</p>', { catalog, inlineEmbeddedCss: 'yes' } as any)).toThrow(InvalidOptionsError);
  });
});
