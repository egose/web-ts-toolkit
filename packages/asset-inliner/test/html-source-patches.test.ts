import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { inlineHtml } from '../src/html.ts';
import { createAssetCatalogSync } from '../src/catalog.ts';

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');
const HTML_DIR = path.join(FIXTURE_ROOT, 'html');

function catalogFor() {
  return createAssetCatalogSync([path.join(IMAGES_DIR, 'apple.png'), path.join(IMAGES_DIR, 'pear.png')]);
}

// 1: multi-comma data URL remains unchanged while later local candidate replaced with descriptor
describe('html source-patches: srcset data URL handling', () => {
  it('multi-comma data URL candidate unchanged, later local candidate replaced with descriptor preserved', () => {
    const catalog = catalogFor();
    const docPath = path.join(HTML_DIR, 'dummy.html');
    const dataUrl = 'data:text/plain,hello,world,again 1x';
    const html = `<img srcset="${dataUrl}, ../images/apple.png 2x" alt="x">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    // data URL must remain exactly
    expect(result.content).toContain(dataUrl);
    // descriptor preserved
    expect(result.content).toMatch(/data:image\/png;base64,[^ ]+ 2x/);
    // should have exactly 1 replacement (the local candidate)
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('../images/apple.png');
    // ensure local candidate's descriptor is preserved in output
    const srcset = result.content.match(/srcset="([^"]+)"/)?.[1] ?? '';
    expect(srcset).toMatch(/ 1x/);
    expect(srcset).toMatch(/ 2x/);
  });

  it('srcset with base64 data URL containing extra literal commas not corrupted', () => {
    const catalog = catalogFor();
    const docPath = path.join(HTML_DIR, 'dummy.html');
    const dataUrl = 'data:image/png;base64,abc,def,ghi 1x';
    const html = `<img srcset="${dataUrl}, ../images/pear.png 2x">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.content).toContain(dataUrl);
    expect(result.replacements).toHaveLength(1);
  });
});

describe('html source-patches: document vs fragment detection', () => {
  it('comment containing <html> does not add document wrappers to a modified fragment', () => {
    const catalog = catalogFor();
    const docPath = path.join(HTML_DIR, 'dummy.html');
    const html = `<!-- <html> inside comment --><div><img src="../images/apple.png" alt="x"></div>`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    // Must not inject <html><head><body> wrappers (ignore the comment's own <html> text)
    expect(result.content.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/<html>/i);
    expect(result.content).not.toMatch(/<head>/i);
    // comment preserved
    expect(result.content).toContain('<!-- <html> inside comment -->');
    // original div preserved byte-identical aside from src replacement?
    expect(result.content).toMatch(/<div>/);
  });
});

describe('html source-patches: source preservation', () => {
  it('replacing one attribute does not normalize unrelated quotes, casing, comments, malformed markup', () => {
    const catalog = catalogFor();
    const docPath = path.join(HTML_DIR, 'dummy.html');
    const html = `<DIV class='keep' data-val="1"><!-- keep comment --><img SRC="../images/apple.png" ALT='x'><p>hello`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    // unrelated markup should remain byte-identical (except replaced src value)
    expect(result.content).toContain(`<DIV class='keep'`);
    expect(result.content).toContain(`<!-- keep comment -->`);
    expect(result.content).toContain(`data-val="1"`);
    // casing of unrelated DIV should be preserved (source patching keeps original)
    expect(result.content).toMatch(/<DIV/);
    // p tag without closing should remain as in original (no auto-closing added beyond replacement)
    expect(result.content).toContain(`<p>hello`);
    // src should be replaced with data url, but attribute quoting for src may change but original ALT quote style for that img?
    expect(result.content).toMatch(/data:image\/png;base64,/);
  });

  it('preserves single vs double quotes in unrelated attributes', () => {
    const catalog = catalogFor();
    const docPath = path.join(HTML_DIR, 'dummy.html');
    const html = `<div title='single' data-a="double"><img src="../images/apple.png"></div>`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.content).toContain(`title='single'`);
    expect(result.content).toContain(`data-a="double"`);
  });
});

describe('html source-patches: icon relation allowlist', () => {
  it('rel=iconic and rel=nonicon are untouched', () => {
    const catalog = catalogFor();
    const docPath = path.join(HTML_DIR, 'dummy.html');
    const htmlIconic = `<link rel="iconic" href="../images/apple.png">`;
    const htmlNonIcon = `<link rel="nonicon" href="../images/apple.png">`;
    const r1 = inlineHtml(htmlIconic, { catalog, documentPath: docPath });
    const r2 = inlineHtml(htmlNonIcon, { catalog, documentPath: docPath });
    expect(r1.modified).toBe(false);
    expect(r1.content).toBe(htmlIconic);
    expect(r1.replacements).toHaveLength(0);
    expect(r2.modified).toBe(false);
    expect(r2.content).toBe(htmlNonIcon);
    expect(r2.replacements).toHaveLength(0);
  });

  it('documented icon relations still work', () => {
    const catalog = catalogFor();
    const docPath = path.join(HTML_DIR, 'dummy.html');
    const cases = [
      `<link rel="icon" href="../images/apple.png">`,
      `<link rel="shortcut icon" href="../images/apple.png">`,
      `<link rel="apple-touch-icon" href="../images/apple.png">`,
      `<link rel="apple-touch-icon-precomposed" href="../images/apple.png">`,
      `<link rel="mask-icon" href="../images/apple.png">`,
      `<link rel="fluid-icon" href="../images/apple.png">`,
    ];
    for (const html of cases) {
      const r = inlineHtml(html, { catalog, documentPath: docPath });
      expect(r.modified, `failed for ${html}`).toBe(true);
      expect(r.replacements).toHaveLength(1);
      expect(r.content).toMatch(/data:image\/png;base64,/);
    }
    // case-insensitive check
    const rUpper = inlineHtml(`<link rel="ICON" href="../images/apple.png">`, { catalog, documentPath: docPath });
    expect(rUpper.modified).toBe(true);
  });
});

describe('html source-patches: replacement locations are URL token offsets', () => {
  it('duplicate src locations are distinct and point to value offsets', () => {
    const catalog = catalogFor();
    const docPath = path.join(HTML_DIR, 'dummy.html');
    const html = `<img src="../images/apple.png"><img src="../images/apple.png">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.replacements).toHaveLength(2);
    const loc0 = result.replacements[0].location!;
    const loc1 = result.replacements[1].location!;
    expect(loc0.offset).not.toBe(loc1.offset);
    expect(loc0.offset).toBeGreaterThanOrEqual(0);
    expect(loc1.offset).toBeGreaterThanOrEqual(0);
    // each location should point to start of the URL value inside the attribute, not the attribute name
    const off0 = html.indexOf('../images/apple.png');
    const off1 = html.indexOf('../images/apple.png', off0 + 1);
    expect(loc0.offset).toBe(off0);
    expect(loc1.offset).toBe(off1);
    // line/column defined, bases: offset 0-based, line 1-based, column 1-based? Check at least existence
    expect(loc0.line).toBe(1);
    expect(loc0.column).toBeDefined();
  });

  it('srcset candidate locations distinct and point to URL tokens', () => {
    const catalog = catalogFor();
    const docPath = path.join(HTML_DIR, 'dummy.html');
    const html = `<img srcset="../images/apple.png 1x, ../images/pear.png 2x" alt="x">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.replacements).toHaveLength(2);
    const [a, b] = result.replacements as [(typeof result.replacements)[0], (typeof result.replacements)[0]];
    expect(a.location!.offset).not.toBe(b.location!.offset);
    // Offsets should correspond to positions of each URL inside the original html
    const rawSrcset = `../images/apple.png 1x, ../images/pear.png 2x`;
    const srcsetStart = html.indexOf(rawSrcset);
    const applePos = html.indexOf('../images/apple.png');
    const pearPos = html.indexOf('../images/pear.png');
    expect(a.location!.offset).toBe(applePos);
    expect(b.location!.offset).toBe(pearPos);
    expect(a.location!.offset).toBe(srcsetStart);
    expect(b.location!.offset).toBeGreaterThan(srcsetStart);
  });
});
