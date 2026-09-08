import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { inlineCss } from '../src/css.ts';
import { inlineHtml } from '../src/html.ts';

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');
const CSS_DIR = path.join(FIXTURE_ROOT, 'css');
const HTML_DIR = path.join(FIXTURE_ROOT, 'html');

const APPLE = path.join(IMAGES_DIR, 'apple.png');
const PEAR = path.join(IMAGES_DIR, 'pear.png');

// documentPath inside css/ so ../images/apple.png resolves to the fixture
const CSS_DOC = path.join(CSS_DIR, 'dummy.css');
// documentPath inside images/ so bare apple.png resolves to the fixture
const IMG_DOC = path.join(IMAGES_DIR, 'dummy.css');

const CASINGS = ['url', 'URL', 'Url', 'uRl'];

describe('css mixed-case url() functions (AIH-09)', () => {
  it('url/URL/Url behave equivalently for relative unquoted paths', () => {
    const catalog = createAssetCatalogSync([APPLE, PEAR]);
    for (const fn of CASINGS) {
      const css = `.a { background: ${fn}(../images/apple.png); }`;
      const result = inlineCss(css, { catalog, documentPath: CSS_DOC });
      expect(result.modified, fn).toBe(true);
      expect(result.replacements, fn).toHaveLength(1);
      expect(result.replacements[0]!.originalUrl, fn).toBe('../images/apple.png');
      expect(result.content, fn).toMatch(/data:image\/png;base64,/);
      expect(result.content, fn).not.toContain('../images/apple.png');
    }
  });

  it('url/URL/Url behave equivalently for quoted values', () => {
    const catalog = createAssetCatalogSync([APPLE]);
    for (const fn of CASINGS) {
      for (const css of [
        `.a { background: ${fn}('../images/apple.png'); }`,
        `.a { background: ${fn}("../images/apple.png"); }`,
        `.a { background: ${fn}( '../images/apple.png' ); }`,
      ]) {
        const result = inlineCss(css, { catalog, documentPath: CSS_DOC });
        expect(result.modified, `${fn} ${css}`).toBe(true);
        expect(result.replacements, `${fn} ${css}`).toHaveLength(1);
        expect(result.replacements[0]!.originalUrl, `${fn} ${css}`).toBe('../images/apple.png');
      }
    }
  });

  it('url/URL/Url behave equivalently for root-relative paths', () => {
    const catalog = createAssetCatalogSync([APPLE]);
    for (const fn of CASINGS) {
      const css = `.a { background: ${fn}(/apple.png); }`;
      const result = inlineCss(css, { catalog, documentPath: IMG_DOC, rootDir: IMAGES_DIR });
      expect(result.modified, fn).toBe(true);
      expect(result.replacements, fn).toHaveLength(1);
      expect(result.replacements[0]!.originalUrl, fn).toBe('/apple.png');
      expect(result.replacements[0]!.resolvedPath, fn).toBe(path.resolve(APPLE));
    }
  });

  it('url/URL/Url behave equivalently for escapes', () => {
    const catalog = createAssetCatalogSync([APPLE]);
    for (const fn of CASINGS) {
      // quoted hex escape: \2e + space -> '.'
      const quoted = `.a { background: ${fn}('apple\\2e png'); }`;
      const r1 = inlineCss(quoted, { catalog, documentPath: IMG_DOC });
      expect(r1.modified, `${fn} quoted`).toBe(true);
      expect(r1.replacements, `${fn} quoted`).toHaveLength(1);
      expect(r1.replacements[0]!.originalUrl, `${fn} quoted`).toBe('apple\\2e png');
      // unquoted hex escape without delimiter space
      const unquoted = `.a { background: ${fn}(apple\\2epng); }`;
      const r2 = inlineCss(unquoted, { catalog, documentPath: IMG_DOC });
      expect(r2.modified, `${fn} unquoted`).toBe(true);
      expect(r2.replacements, `${fn} unquoted`).toHaveLength(1);
      expect(r2.replacements[0]!.originalUrl, `${fn} unquoted`).toBe('apple\\2epng');
    }
  });

  it('url/URL/Url behave equivalently for nested functions (image-set)', () => {
    const catalog = createAssetCatalogSync([APPLE, PEAR]);
    for (const fn of CASINGS) {
      const css = `.a { background: image-set( ${fn}('apple.png') 1x, ${fn}('pear.png') 2x ); }`;
      const result = inlineCss(css, { catalog, documentPath: IMG_DOC });
      expect(result.modified, fn).toBe(true);
      expect(result.replacements, fn).toHaveLength(2);
      expect(
        result.replacements.map((r) => r.originalUrl),
        fn,
      ).toEqual(['apple.png', 'pear.png']);
    }
  });

  it('a catalog matching only the first path segment cannot cause replacement', () => {
    const catalog = createAssetCatalogSync([APPLE]);
    // `URL(apple.png/other.png)` tokenizes as [word, div, word]; the old code
    // resolved only the `apple.png` prefix and replaced the whole function.
    const css = `.a { background: URL(apple.png/other.png); }`;
    const result = inlineCss(css, { catalog, documentPath: IMG_DOC });
    expect(result.modified).toBe(false);
    expect(result.content).toBe(css);
    expect(result.replacements).toHaveLength(0);
    // The diagnostic references the COMPLETE url, never the prefix alone.
    const full = result.diagnostics.find((d) => d.originalUrl === 'apple.png/other.png');
    expect(full).toBeDefined();
    expect(full!.code).toBe('UNRESOLVED_REFERENCE');
    expect(result.diagnostics.some((d) => d.originalUrl === 'apple.png')).toBe(false);
  });

  it('dotted relative paths resolve completely, not as the ".." prefix', () => {
    const catalog = createAssetCatalogSync([APPLE]);
    // Old code looked up only `..` for `URL(../images/apple.png)`.
    const css = `.a { background: URL(../images/apple.png); }`;
    const result = inlineCss(css, { catalog, documentPath: CSS_DOC });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0]!.originalUrl).toBe('../images/apple.png');
    expect(result.replacements[0]!.resolvedPath).toBe(path.resolve(APPLE));
    expect(result.content).toMatch(/data:image\/png;base64,/);
  });

  it('records contain the full original URL with accurate locations', () => {
    const catalog = createAssetCatalogSync([APPLE, PEAR]);
    const css = `.a { background: URL(../images/apple.png); }\n.b { background: Url('../images/pear.png'); }`;
    const result = inlineCss(css, { catalog, documentPath: CSS_DOC });
    expect(result.modified).toBe(true);
    expect(result.replacements.map((r) => r.originalUrl)).toEqual(['../images/apple.png', '../images/pear.png']);
    const [first, second] = result.replacements;
    expect(css.slice(first!.location!.offset, first!.location!.offset + '../images/apple.png'.length)).toBe(
      '../images/apple.png',
    );
    expect(second!.location!.offset).toBeGreaterThan(first!.location!.offset);
    expect(css.slice(second!.location!.offset, second!.location!.offset + '../images/pear.png'.length)).toBe(
      '../images/pear.png',
    );
  });

  it('malformed multi-value functions remain unchanged with a controlled diagnostic', () => {
    const catalog = createAssetCatalogSync([APPLE, PEAR]);
    for (const css of [
      `.a { background: URL('apple.png' 'pear.png'); }`,
      `.a { background: url('apple.png' 'pear.png'); }`,
    ]) {
      const result = inlineCss(css, { catalog, documentPath: IMG_DOC });
      expect(result.modified, css).toBe(false);
      expect(result.content, css).toBe(css);
      expect(result.replacements, css).toHaveLength(0);
      const diag = result.diagnostics.find((d) => d.code === 'PARSE_ERROR');
      expect(diag, css).toBeDefined();
      expect(diag!.originalUrl, css).toBe(`'apple.png' 'pear.png'`);
    }
  });
});

describe('embedded CSS mixed-case url() functions (AIH-09, opt-in)', () => {
  const OPTS = {
    documentPath: path.join(HTML_DIR, 'page.html'),
    rootDir: HTML_DIR,
    allowBasenameMatch: true,
  } as const;

  function htmlCatalog() {
    return createAssetCatalogSync([APPLE, PEAR], {});
  }

  it('URL/Url behave like url inside <style> elements when opted in', () => {
    const catalog = htmlCatalog();
    for (const fn of ['url', 'URL', 'Url']) {
      const html = `<style>.a { background: ${fn}("apple.png"); }</style>`;
      const result = inlineHtml(html, { catalog, ...OPTS, inlineEmbeddedCss: true } as any);
      expect(result.modified, fn).toBe(true);
      expect(result.replacements, fn).toHaveLength(1);
      expect(result.replacements[0]!.originalUrl, fn).toBe('apple.png');
      expect(result.content, fn).toMatch(/data:image\/png;base64,/);
    }
  });

  it('prefix-only catalog match cannot cause replacement inside <style> elements', () => {
    const catalog = htmlCatalog();
    const html = `<style>.a { background: URL(apple.png/other.png); }</style>`;
    const result = inlineHtml(html, { catalog, ...OPTS, inlineEmbeddedCss: true } as any);
    expect(result.modified).toBe(false);
    expect(result.content).toBe(html);
    expect(result.replacements).toHaveLength(0);
    expect(result.diagnostics.some((d) => d.originalUrl === 'apple.png/other.png')).toBe(true);
  });

  it('malformed multi-value functions remain unchanged inside style attributes', () => {
    const catalog = htmlCatalog();
    const html = `<div style="background: URL('apple.png' 'pear.png')"></div>`;
    const result = inlineHtml(html, { catalog, ...OPTS, inlineEmbeddedCss: true } as any);
    expect(result.modified).toBe(false);
    expect(result.content).toBe(html);
    expect(result.replacements).toHaveLength(0);
    expect(result.diagnostics.some((d) => d.code === 'PARSE_ERROR')).toBe(true);
  });
});
