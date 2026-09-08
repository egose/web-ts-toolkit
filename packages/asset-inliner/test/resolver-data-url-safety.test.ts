import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as parse5 from 'parse5';
import postcss from 'postcss';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { inlineCss } from '../src/css.ts';
import { inlineHtml } from '../src/html.ts';
import { resolveAssetReferenceSync } from '../src/resolve.ts';
import { formatCssUrl, formatFontSource, isSafeDataUrl } from '../src/format.ts';
import { InvalidOptionsError } from '../src/errors.ts';
import type { AssetCatalog, EncodedAsset } from '../src/types.ts';

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');

function mkCatalog(): AssetCatalog {
  return createAssetCatalogSync([path.join(IMAGES_DIR, 'sample.png')]);
}

function validAsset(): EncodedAsset {
  const catalog = mkCatalog();
  const asset = catalog.getByPath(path.resolve(path.join(IMAGES_DIR, 'sample.png')))!;
  expect(asset).toBeDefined();
  return asset;
}

function evilAsset(dataUrl: string): EncodedAsset {
  const v = validAsset();
  return Object.freeze({ ...v, dataUrl }) as EncodedAsset;
}

function resolverFor(dataUrl: string) {
  const asset = evilAsset(dataUrl);
  return () => asset as never;
}

/** Custom caller-supplied catalog that returns the malicious record for any path lookup. */
function customCatalogFor(dataUrl: string): AssetCatalog {
  const asset = evilAsset(dataUrl);
  return {
    assets: Object.freeze([asset]),
    definitions: Object.freeze([]),
    getByPath: () => asset,
    getByBasename: () => undefined,
    size: 1,
  } as unknown as AssetCatalog;
}

function findImages(content: string, isDoc = false): Array<{ tag: string; attrs: Record<string, string> }> {
  const tree = (isDoc ? parse5.parse(content) : parse5.parseFragment(content)) as unknown as {
    childNodes?: unknown[];
  };
  const out: Array<{ tag: string; attrs: Record<string, string> }> = [];
  const walk = (node: unknown): void => {
    const el = node as { tagName?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: unknown[] };
    if (el.tagName === 'img') {
      const attrs: Record<string, string> = {};
      for (const a of el.attrs ?? []) attrs[a.name.toLowerCase()] = a.value;
      out.push({ tag: 'img', attrs });
    }
    for (const c of el.childNodes ?? []) walk(c);
  };
  walk(tree);
  return out;
}

function cssDeclValues(content: string): string[] {
  const root = postcss.parse(content);
  const values: string[] = [];
  root.walkDecls((decl) => values.push(decl.value));
  return values;
}

function cssDeclCount(content: string): number {
  const root = postcss.parse(content);
  let n = 0;
  root.walkDecls(() => n++);
  return n;
}

const EVIL_HTML_ATTR = 'data:image/png;base64,QUJD" onerror="alert(1)';
const EVIL_HTML_SINGLE = "data:image/png;base64,QUJD' onerror='alert(1)";
const EVIL_CSS = 'data:image/png;base64,QUJD);color:red;/*';
const EVIL_SRCSET = 'data:image/png;base64,QUJD, https://evil.example/x.png 2x';
const EVIL_SPACE = 'data:image/png;base64,QUJD IE1Z';
const EVIL_ELEMENT = 'data:image/png;base64,QUJD><script>alert(1)</script>';
const EVIL_CHARSET = 'data:image/png;charset=utf-8;base64,QUJD';
const EVIL_FRAGMENT = 'data:image/png;base64,QUJD#frag';
const EVIL_UNQUOTED_EQ_BREAK = 'data:image/png;base64,QUJD"';

describe('AIH-06: resolver data URLs are safe to serialize', () => {
  it('shared validator rejects delimiter-bearing payloads and accepts generated shapes', () => {
    for (const evil of [
      EVIL_HTML_ATTR,
      EVIL_HTML_SINGLE,
      EVIL_CSS,
      EVIL_SRCSET,
      EVIL_SPACE,
      EVIL_ELEMENT,
      EVIL_CHARSET,
      EVIL_FRAGMENT,
      EVIL_UNQUOTED_EQ_BREAK,
      'data:image/png;base64,QUJD\n1x',
      'data:image/png;base64,QUJD)(',
      'not-a-data-url',
      'data:image/png,QUJD',
    ]) {
      expect(isSafeDataUrl(evil), evil).toBe(false);
    }
    // Valid generated shapes: real encode output, empty payload, custom media type, svg suffix.
    expect(isSafeDataUrl(validAsset().dataUrl)).toBe(true);
    expect(isSafeDataUrl('data:image/png;base64,')).toBe(true);
    expect(isSafeDataUrl('data:image/jxl;base64,QUJD')).toBe(true);
    expect(isSafeDataUrl('data:image/svg+xml;base64,QUJD')).toBe(true);
  });

  it('resolveAssetReferenceSync rejects delimiter payloads with INVALID_OPTIONS', () => {
    const catalog = mkCatalog();
    const docPath = path.join(os.tmpdir(), 'dummy.css');
    for (const evil of [EVIL_HTML_ATTR, EVIL_CSS, EVIL_SRCSET, EVIL_CHARSET]) {
      expect(() =>
        resolveAssetReferenceSync('a.png', catalog, {
          documentPath: docPath,
          resolver: resolverFor(evil) as never,
        }),
      ).toThrow(InvalidOptionsError);
      try {
        resolveAssetReferenceSync('a.png', catalog, {
          documentPath: docPath,
          resolver: resolverFor(evil) as never,
        });
        expect.unreachable(evil);
      } catch (e) {
        expect((e as InvalidOptionsError).code).toBe('INVALID_OPTIONS');
      }
    }
  });

  it('inlineCss rejects CSS-breaker resolver URLs without partial mutation', () => {
    const catalog = mkCatalog();
    const docPath = path.join(os.tmpdir(), 'dummy.css');
    const css = `.a { background: url('a.png'); color: blue }`;
    expect(() => inlineCss(css, { catalog, documentPath: docPath, resolver: resolverFor(EVIL_CSS) as never })).toThrow(
      InvalidOptionsError,
    );
    // Pure transform throws — no partial output object exists to mutate.
    expect(css).toBe(`.a { background: url('a.png'); color: blue }`);
  });

  it('inlineCss rejects delimiter payloads from custom catalogs', () => {
    const catalog = customCatalogFor(EVIL_CSS);
    const docPath = path.join(os.tmpdir(), 'dummy.css');
    expect(() => inlineCss(`.a { background: url('a.png') }`, { catalog, documentPath: docPath })).toThrow(
      InvalidOptionsError,
    );
  });

  it('inlineHtml double-quoted: breaker rejected; valid URL adds no attributes/elements', () => {
    const catalog = mkCatalog();
    const docPath = path.join(os.tmpdir(), 'dummy.html');
    const html = `<img src="a.png" alt="ok">`;
    expect(() =>
      inlineHtml(html, { catalog, documentPath: docPath, resolver: resolverFor(EVIL_HTML_ATTR) as never }),
    ).toThrow(InvalidOptionsError);

    const asset = validAsset();
    const result = inlineHtml(html, {
      catalog,
      documentPath: docPath,
      resolver: (() => asset) as never,
    });
    expect(result.modified).toBe(true);
    const imgs = findImages(result.content);
    expect(imgs).toHaveLength(1);
    expect(Object.keys(imgs[0]!.attrs).sort()).toEqual(['alt', 'src']);
    expect(imgs[0]!.attrs['src']).toBe(asset.dataUrl);
    expect(result.content).not.toContain('onerror');
  });

  it('inlineHtml single-quoted: breaker rejected; valid URL preserves quote style safely', () => {
    const catalog = mkCatalog();
    const docPath = path.join(os.tmpdir(), 'dummy.html');
    const html = `<img src='a.png' alt='ok'>`;
    expect(() =>
      inlineHtml(html, { catalog, documentPath: docPath, resolver: resolverFor(EVIL_HTML_SINGLE) as never }),
    ).toThrow(InvalidOptionsError);

    const asset = validAsset();
    const result = inlineHtml(html, {
      catalog,
      documentPath: docPath,
      resolver: (() => asset) as never,
    });
    const imgs = findImages(result.content);
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.attrs['src']).toBe(asset.dataUrl);
    expect(Object.keys(imgs[0]!.attrs).sort()).toEqual(['alt', 'src']);
  });

  it('inlineHtml unquoted: valid URL is quoted on serialize and reparses to one token', () => {
    const catalog = mkCatalog();
    const docPath = path.join(os.tmpdir(), 'dummy.html');
    const asset = validAsset();
    const result = inlineHtml(`<img src=a.png alt=x>`, {
      catalog,
      documentPath: docPath,
      resolver: (() => asset) as never,
    });
    expect(result.modified).toBe(true);
    // Unquoted source gains quotes so padding/comma stay in one token.
    expect(result.content).toContain(`src="${asset.dataUrl}"`);
    const imgs = findImages(result.content);
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.attrs['src']).toBe(asset.dataUrl);
    expect(Object.keys(imgs[0]!.attrs).sort()).toEqual(['alt', 'src']);
  });

  it('inlineHtml rejects custom-catalog delimiter payloads', () => {
    const catalog = customCatalogFor(EVIL_HTML_ATTR);
    const docPath = path.join(os.tmpdir(), 'dummy.html');
    expect(() => inlineHtml(`<img src="a.png">`, { catalog, documentPath: docPath })).toThrow(InvalidOptionsError);
  });

  it('srcset: valid data URLs keep candidate count; breaker rejected', () => {
    const catalog = mkCatalog();
    const docPath = path.join(os.tmpdir(), 'dummy.html');
    expect(() =>
      inlineHtml(`<img src="x.png" srcset="a.png 1x, b.png 2x">`, {
        catalog,
        documentPath: docPath,
        resolver: resolverFor(EVIL_SRCSET) as never,
      }),
    ).toThrow(InvalidOptionsError);

    const asset = validAsset();
    const result = inlineHtml(`<img src="x.png" srcset="a.png 1x, b.png 2x">`, {
      catalog,
      documentPath: docPath,
      resolver: (() => asset) as never,
    });
    expect(result.modified).toBe(true);
    const imgs = findImages(result.content);
    expect(imgs).toHaveLength(1);
    const srcset = imgs[0]!.attrs['srcset']!;
    // Each candidate carries exactly one data: URL — no extra candidates added.
    expect(srcset.split('data:')).toHaveLength(3);
    expect(srcset).toContain('1x');
    expect(srcset).toContain('2x');
    expect(srcset).not.toContain('evil');
  });

  it('ordinary CSS: valid URL cannot add declarations when reparsed', () => {
    const catalog = mkCatalog();
    const docPath = path.join(os.tmpdir(), 'dummy.css');
    const asset = validAsset();
    const result = inlineCss(`.a { background: url('a.png'); color: blue }`, {
      catalog,
      documentPath: docPath,
      resolver: (() => asset) as never,
    });
    expect(result.modified).toBe(true);
    expect(cssDeclCount(result.content)).toBe(2);
    expect(cssDeclValues(result.content)[0]).toContain(asset.dataUrl);
    expect(result.content).not.toContain('color:red');
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0]!.mediaType).toBe(asset.mediaType);
    expect(result.replacements[0]!.byteLength).toBe(asset.byteLength);
  });

  it('embedded CSS (style attribute and style element) shares the safe boundary', () => {
    const catalog = mkCatalog();
    const docPath = path.join(os.tmpdir(), 'dummy.html');
    // Breakers rejected in both embedded contexts.
    expect(() =>
      inlineHtml(`<div style="background: url('a.png')">x</div>`, {
        catalog,
        documentPath: docPath,
        resolver: resolverFor(EVIL_CSS) as never,
        inlineEmbeddedCss: true,
      }),
    ).toThrow(InvalidOptionsError);
    expect(() =>
      inlineHtml(`<style>.a { background: url('a.png') }</style>`, {
        catalog,
        documentPath: docPath,
        resolver: resolverFor(EVIL_CSS) as never,
        inlineEmbeddedCss: true,
      }),
    ).toThrow(InvalidOptionsError);

    const asset = validAsset();
    const attrResult = inlineHtml(`<div style="background: url('a.png')">x</div>`, {
      catalog,
      documentPath: docPath,
      resolver: (() => asset) as never,
      inlineEmbeddedCss: true,
    });
    expect(attrResult.modified).toBe(true);
    expect(cssDeclCount(`.x { ${attrResult.content.match(/style="([^"]*)"/)![1]} }`)).toBe(1);

    const elResult = inlineHtml(`<style>.a { background: url('a.png'); color: blue }</style>`, {
      catalog,
      documentPath: docPath,
      resolver: (() => asset) as never,
      inlineEmbeddedCss: true,
    });
    expect(elResult.modified).toBe(true);
    const cssText = elResult.content.replace(/<\/?style>/g, '');
    expect(cssDeclCount(cssText)).toBe(2);
    expect(elResult.content).not.toContain('color:red');
  });

  it('formatter entrypoints reject delimiter payloads', () => {
    expect(() => formatCssUrl(evilAsset(EVIL_CSS))).toThrow(InvalidOptionsError);
    expect(() => formatCssUrl(evilAsset(EVIL_HTML_ATTR))).toThrow(InvalidOptionsError);
    expect(() => formatFontSource({ ...evilAsset(EVIL_CSS), fontFormat: 'woff2' } as EncodedAsset)).toThrow(
      InvalidOptionsError,
    );
    const asset = validAsset();
    expect(formatCssUrl(asset)).toBe(`url(${asset.dataUrl})`);
  });

  it('valid generated URLs preserve bytes: empty payload and custom media type', () => {
    const catalog = mkCatalog();
    const docPath = path.join(os.tmpdir(), 'dummy.css');
    const fileBytes = fs.readFileSync(path.join(IMAGES_DIR, 'sample.png'));

    // Byte equality of a real generated URL.
    const asset = validAsset();
    const payload = asset.dataUrl.split(';base64,')[1]!;
    expect(Buffer.from(payload, 'base64').equals(fileBytes)).toBe(true);

    // Empty Base64 payload is accepted and inlines with normal metadata.
    const emptyAsset = Object.freeze({
      ...asset,
      byteLength: 0,
      dataUrl: 'data:image/png;base64,',
    }) as EncodedAsset;
    const emptyResult = inlineCss(`.a { background: url('a.png') }`, {
      catalog,
      documentPath: docPath,
      resolver: (() => emptyAsset) as never,
    });
    expect(emptyResult.modified).toBe(true);
    expect(emptyResult.content).toContain('url(data:image/png;base64,)');
    expect(emptyResult.replacements[0]!.byteLength).toBe(0);
    expect(emptyResult.replacements[0]!.mediaType).toBe('image/png');

    // Supported custom media type preserves byte equality and metadata.
    const customAsset = Object.freeze({
      ...asset,
      mediaType: 'image/jxl',
      dataUrl: `data:image/jxl;base64,${fileBytes.toString('base64')}`,
    }) as EncodedAsset;
    const customResult = inlineCss(`.a { background: url('a.png') }`, {
      catalog,
      documentPath: docPath,
      resolver: (() => customAsset) as never,
    });
    expect(customResult.content).toContain(customAsset.dataUrl);
    expect(customResult.replacements[0]!.mediaType).toBe('image/jxl');
    const customPayload = customAsset.dataUrl.split(';base64,')[1]!;
    expect(Buffer.from(customPayload, 'base64').equals(fileBytes)).toBe(true);
  });

  it('escaping expansion (+2 quote bytes) is subject to output limits', () => {
    const catalog = mkCatalog();
    const docPath = path.join(os.tmpdir(), 'dummy.html');
    const asset = validAsset();
    const html = `<img src=a.png>`;
    const full = inlineHtml(html, {
      catalog,
      documentPath: docPath,
      resolver: (() => asset) as never,
    });
    const needed = Buffer.byteLength(full.content, 'utf8');
    // maxOutputBytes below the quoted expansion fails; exact bound succeeds.
    expect(() =>
      inlineHtml(html, {
        catalog,
        documentPath: docPath,
        resolver: (() => asset) as never,
        maxOutputBytes: needed - 1,
      }),
    ).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT' }));
    const ok = inlineHtml(html, {
      catalog,
      documentPath: docPath,
      resolver: (() => asset) as never,
      maxOutputBytes: needed,
    });
    expect(ok.modified).toBe(true);
  });
});
