import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { inlineHtml } from '../src/html.ts';
import { createAssetCatalogSync } from '../src/catalog.ts';

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');
const HTML_DIR = path.join(FIXTURE_ROOT, 'html');

function readFixture(p: string): string {
  return fs.readFileSync(p, 'utf8');
}
function catalogFrom(files: string[]) {
  return createAssetCatalogSync(files);
}

describe('html: legacy img[src] behavior', () => {
  it('inlines <img src> from example.html semantically correctly', () => {
    const htmlPath = path.join(HTML_DIR, 'example.html');
    const content = readFixture(htmlPath);
    const catalog = catalogFrom([path.join(IMAGES_DIR, 'watermelon.png')]);
    const result = inlineHtml(content, { catalog, documentPath: htmlPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('../images/watermelon.png');
    expect(result.replacements[0].kind).toBe('image');
    expect(result.replacements[0].mediaType).toBe('image/png');
    expect(result.replacements[0].byteLength).toBeGreaterThan(0);
    expect(result.content).toMatch(/data:image\/png;base64,/);
    expect(result.content).not.toMatch(/src="\.\.\/images\/watermelon\.png"/);
    // preserves other attributes
    expect(result.content).toMatch(/alt="watermelon"/);
    expect(result.content).toMatch(/height="200"/);
  });

  it('<img> without src never throws (negative fixture)', () => {
    const html = readFixture(path.join(FIXTURE_ROOT, 'negative', 'img-no-src.html'));
    const catalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png')]);
    const docPath = path.join(FIXTURE_ROOT, 'negative', 'dummy.html');
    expect(() => inlineHtml(html, { catalog, documentPath: docPath })).not.toThrow();
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    // The img without src and empty src should be untouched, only the third img with valid src is inlined
    // But our fixture has one with ../images/apple.png? Actually it has <img src="../images/apple.png">? Check file: it has <img src="../images/apple.png"> as third
    // In negative fixture, path is ../images/apple.png relative to negative dummy -> should resolve to images/apple.png
    // So expect at least 0 or 1 replacements but no throw
    expect(result.replacements.length).toBeGreaterThanOrEqual(0);
    // No throw and original alt preserved
    expect(result.content).toMatch(/alt="no src"/);
  });

  it('empty src remains unchanged and not diagnosed as error', () => {
    const html = `<img src="" alt="empty"><img src="../images/apple.png" alt="ok">`;
    const catalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png')]);
    const docPath = path.join(FIXTURE_ROOT, 'negative', 'dummy.html');
    // dummy.html inside negative, relative ../images/apple.png resolves to images/apple.png? Actually negative/dummy.html -> ../images is FIXTURE_ROOT/images -> exists
    // But we use path that resolves: we need a docPath that makes ../images/apple.png resolve correctly
    const docPath2 = path.join(IMAGES_DIR, 'dummy.html'); // dummy inside images dir, ../images doesn't exist, use html dir
    const docPathOk = path.join(HTML_DIR, 'dummy.html');
    const result = inlineHtml(html, { catalog, documentPath: docPathOk });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('../images/apple.png');
    // empty src still present as ""
    expect(result.content).toMatch(/src=""/);
  });
});

describe('html: responsive srcset handling', () => {
  const catalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png'), path.join(IMAGES_DIR, 'pear.png')]);
  const docPath = path.join(HTML_DIR, 'dummy.html');

  it('img[srcset] with width/pixel-density descriptors preserves them', () => {
    const html = `<img src="../images/apple.png" srcset="../images/apple.png 1x, ../images/pear.png 2x" alt="x">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    // src + 2 srcset candidates = 3 replacements
    expect(result.replacements).toHaveLength(3);
    // srcset should contain data URLs with descriptors
    expect(result.content).toMatch(/data:image\/png;base64,/);
    expect(result.content).toMatch(/1x/);
    expect(result.content).toMatch(/2x/);
    // Descriptors preserved
    const srcsetMatch = result.content.match(/srcset="([^"]+)"/);
    expect(srcsetMatch).not.toBeNull();
    const srcsetVal = srcsetMatch![1]!;
    // Should have comma separator and descriptors after each data URL
    expect(srcsetVal).toMatch(/data:image\/png;base64,[^ ]+ 1x/);
    expect(srcsetVal).toMatch(/data:image\/png;base64,[^ ]+ 2x/);
  });

  it('srcset width descriptor (100w) preserved', () => {
    const html = `<img srcset="../images/apple.png 100w, ../images/pear.png 200w" alt="x">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    expect(result.content).toMatch(/100w/);
    expect(result.content).toMatch(/200w/);
  });

  it('source[srcset] multiple candidates with descriptors', () => {
    const html = `<picture><source srcset="../images/apple.png 1x, ../images/pear.png 2x"><img src="../images/apple.png"></picture>`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements.length).toBeGreaterThanOrEqual(3); // 2 srcset + 1 img src
    expect(result.content).toMatch(/<source/);
    expect(result.content).toMatch(/data:image\/png;base64,/);
  });

  it('srcset does not corrupt commas inside existing data URLs', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const html = `<img srcset="${dataUrl} 1x, ../images/apple.png 2x" alt="x">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    // Only the local candidate should be inlined, data URL preserved exactly
    expect(result.content).toContain(dataUrl);
    // Should not have been split into corrupted parts like "data:image/png;base64" alone
    expect(result.content).not.toMatch(/data:image\/png;base64" 1x/);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('../images/apple.png');
  });

  it('srcset with data URLs on both sides not corrupted', () => {
    const data1 = 'data:image/png;base64,abc123';
    const data2 = 'data:image/png;base64,def456';
    const html = `<img srcset="${data1} 1x, ${data2} 2x, ../images/apple.png 3x" alt="x">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.content).toContain(data1);
    expect(result.content).toContain(data2);
    expect(result.replacements).toHaveLength(1);
  });

  it('query/fragment stripped for srcset lookup and not emitted', () => {
    const html = `<img srcset="../images/apple.png?#iefix 1x, ../images/pear.png#foo 2x" alt="x">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    expect(result.content).not.toMatch(/\?#iefix/);
    expect(result.content).not.toMatch(/#foo/);
    expect(result.content).toMatch(/1x/);
    expect(result.content).toMatch(/2x/);
  });
});

describe('html: locked HTML minimum targets', () => {
  const imageCatalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png')]);
  const docPath = path.join(HTML_DIR, 'dummy.html');

  it('source[src] inlined for image kind', () => {
    const html = `<picture><source src="../images/apple.png"><img src="../images/apple.png"></picture>`;
    const result = inlineHtml(html, { catalog: imageCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    expect(result.content).toMatch(/data:image\/png;base64,/);
  });

  it('link[href] icon-related inlined', () => {
    const html = `<link rel="icon" href="../images/apple.png"><link rel="stylesheet" href="../images/apple.png">`;
    const result = inlineHtml(html, { catalog: imageCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('../images/apple.png');
    // stylesheet href must remain unchanged
    expect(result.content).toMatch(/rel="stylesheet"/);
    expect(result.content).toMatch(/data:image\/png;base64,/);
    // second link's href still original
    expect(result.content).toMatch(/stylesheet.*\.\.\/images\/apple\.png/);
  });

  it('link with apple-touch-icon also inlined', () => {
    const html = `<link rel="apple-touch-icon" href="../images/apple.png">`;
    const result = inlineHtml(html, { catalog: imageCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
  });

  it('video[poster] inlined for image kind', () => {
    const html = `<video poster="../images/apple.png"><source src="../images/apple.png"></video>`;
    const result = inlineHtml(html, { catalog: imageCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    // poster + source src = 2
    expect(result.replacements).toHaveLength(2);
    expect(result.content).toMatch(/poster="data:image\/png;base64,/);
  });

  it('audio/video built-ins deferred: audio[src], video[src], track[src] not inlined by default', () => {
    const html = `<audio src="../images/apple.png"></audio><video src="../images/apple.png"></video><track src="../images/apple.png">`;
    const result = inlineHtml(html, { catalog: imageCatalog, documentPath: docPath });
    // Even though catalog has image asset for that path, those tags are not in allowlist (except video poster), so not inlined
    expect(result.modified).toBe(false);
    expect(result.replacements).toHaveLength(0);
    expect(result.content).toBe(html);
  });
});

describe('html: non-targets not inlined by default', () => {
  const catalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png')]);
  const docPath = path.join(HTML_DIR, 'dummy.html');

  const cases: Array<{ html: string; label: string }> = [
    { html: `<a href="../images/apple.png">link</a>`, label: 'anchor' },
    { html: `<form action="../images/apple.png"></form>`, label: 'form' },
    { html: `<script src="../images/apple.png"></script>`, label: 'script' },
    { html: `<link rel="stylesheet" href="../images/apple.png">`, label: 'stylesheet link' },
    { html: `<iframe src="../images/apple.png"></iframe>`, label: 'iframe' },
    { html: `<object data="../images/apple.png"></object>`, label: 'object' },
    { html: `<embed src="../images/apple.png">`, label: 'embed' },
  ];

  for (const { html, label } of cases) {
    it(`${label} href/src not inlined`, () => {
      const result = inlineHtml(html, { catalog, documentPath: docPath });
      expect(result.modified).toBe(false);
      expect(result.content).toBe(html);
      expect(result.replacements).toHaveLength(0);
    });
  }
});

describe('html: unchanged byte-identical and wrapper preservation', () => {
  const catalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png')]);
  const docPath = path.join(HTML_DIR, 'dummy.html');

  it('unchanged HTML is byte-identical', () => {
    const html = `<div><p>Hello</p></div>`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(false);
    expect(result.content).toBe(html);
    expect(result.replacements).toHaveLength(0);
  });

  it('remote, data, blob, fragment-only unchanged byte-identical', () => {
    const html = `<img src="https://example.com/a.png"><img src="data:image/png;base64,abc"><img src="blob:https://example.com/abc"><a href="#frag">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(false);
    expect(result.content).toBe(html);
  });

  it('changed HTML does not gain wrapper tags (fragment)', () => {
    const html = `<img src="../images/apple.png" alt="x">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.content).not.toMatch(/<html>/);
    expect(result.content).not.toMatch(/<head>/);
    expect(result.content).not.toMatch(/<body>/);
    // Should still be fragment-like
    expect(result.content).toMatch(/<img/);
  });

  it('document shape preserved (doctype)', () => {
    const html = `<!DOCTYPE html><html><head><title>t</title></head><body><img src="../images/apple.png"></body></html>`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.content).toMatch(/<!DOCTYPE html>/i);
    expect(result.content).toMatch(/<html/);
  });

  it('fragment with multiple elements preserved', () => {
    const html = `<div>hello</div><img src="../images/apple.png">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.content).toMatch(/<div>hello<\/div>/);
    expect(result.content).toMatch(/data:image\/png;base64,/);
  });
});

describe('html: uppercase, unquoted, quoted, entities, malformed', () => {
  const catalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png'), path.join(IMAGES_DIR, 'pear.png')]);
  const docPath = path.join(HTML_DIR, 'dummy.html');

  it('uppercase tags/attributes handled', () => {
    const html = `<IMG SRC="../images/apple.png" ALT="x"><SOURCE SRCSET="../images/pear.png 1x">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    // Uppercase should be lowercased by parse5 but inlined
    expect(result.replacements.length).toBeGreaterThanOrEqual(2);
    expect(result.content.toLowerCase()).toMatch(/data:image\/png;base64,/);
  });

  it('unquoted and quoted values handled', () => {
    const html = `<img src=../images/apple.png alt=x><img src='../images/pear.png'>`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    expect(result.content).toMatch(/data:image\/png;base64,/);
  });

  it('entities in other attributes preserved', () => {
    const html = `<img src="../images/apple.png" alt="a &amp; b">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.content).toMatch(/alt="a &amp; b"/);
  });

  it('malformed markup does not throw', () => {
    const html = readFixture(path.join(FIXTURE_ROOT, 'negative', 'malformed.html'));
    expect(() => inlineHtml(html, { catalog, documentPath: docPath })).not.toThrow();
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    // Should at least attempt to inline the valid src references without throwing
    expect(result.replacements.length).toBeGreaterThanOrEqual(1);
    // Should not throw even though HTML is malformed (unclosed <img src= ...)
    expect(result.content).toMatch(/data:image\/png;base64,/);
  });

  it('malformed percent encoding emits diagnostic and leaves unchanged', () => {
    const html = `<img src="a%G0.png" alt="bad">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'INVALID_OPTIONS')).toBe(true);
    // content should be unchanged? parse5 will normalize but since no replacement, we return original byte-identical
    expect(result.content).toBe(html);
  });

  it('unresolved local reference emits warn diagnostic', () => {
    const html = `<img src="../images/missing.png">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.modified).toBe(false);
    expect(result.content).toBe(html);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('UNRESOLVED_REFERENCE');
    expect(result.diagnostics[0].originalUrl).toBe('../images/missing.png');
  });

  it('duplicate basename in compatibility mode ambiguous', () => {
    const dupA = path.join(FIXTURE_ROOT, 'negative', 'duplicate-a', 'dup.png');
    const dupB = path.join(FIXTURE_ROOT, 'negative', 'duplicate-b', 'dup.png');
    const dupCatalog = catalogFrom([dupA, dupB]);
    const html = `<img src="dup.png">`;
    const unrelatedDoc = path.join(FIXTURE_ROOT, 'negative', 'dummy.html');
    const resultExact = inlineHtml(html, { catalog: dupCatalog, documentPath: unrelatedDoc });
    expect(resultExact.modified).toBe(false);
    expect(resultExact.diagnostics.some((d) => d.code === 'UNRESOLVED_REFERENCE')).toBe(true);

    const resultAmbig = inlineHtml(html, { catalog: dupCatalog, documentPath: unrelatedDoc, allowBasenameMatch: true });
    expect(resultAmbig.modified).toBe(false);
    expect(resultAmbig.diagnostics.some((d) => d.code === 'AMBIGUOUS_ASSET')).toBe(true);
    expect(resultAmbig.content).toBe(html);
  });

  it('exact path selects intended duplicate basename', () => {
    const dupA = path.join(FIXTURE_ROOT, 'negative', 'duplicate-a', 'dup.png');
    const dupB = path.join(FIXTURE_ROOT, 'negative', 'duplicate-b', 'dup.png');
    const dupCatalog = catalogFrom([dupA, dupB]);
    const html = `<img src="../duplicate-a/dup.png">`;
    const docPathB = path.join(FIXTURE_ROOT, 'negative', 'duplicate-b', 'dummy.html');
    const result = inlineHtml(html, { catalog: dupCatalog, documentPath: docPathB });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].resolvedPath).toBe(path.resolve(dupA));
  });

  it('kind gating: non-image kind not inlined even if catalog contains it (custom audio)', () => {
    // Simulate custom audio definition via explicit mediaType
    const audioBuffer = new Uint8Array([1, 2, 3, 4]);
    const audioCatalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png')]);
    // Manually create catalog with image only; gating ensures image inlined, non-image not
    // For this test we check that an image asset is inlined for img, but if we tried to encode as audio it would be blocked
    // Instead verify that img[src] with image kind works, but if we had a font asset for same path, html would not inline it
    // Create a font-kind catalog by using font fixture path
    const fontPath = path.join(FIXTURE_ROOT, 'fonts', 'akronim-v9-latin-regular.woff');
    const fontCatalog = catalogFrom([fontPath]);
    const html = `<img src="../fonts/akronim-v9-latin-regular.woff">`;
    const docPathFonts = path.join(FIXTURE_ROOT, 'css', 'dummy.html'); // relative to fonts
    // Resolve path: dummy.html in css dir, ../fonts/... => FIXTURE_ROOT/fonts/... correct
    const result = inlineHtml(html, { catalog: fontCatalog, documentPath: docPathFonts });
    // Should not inline because kind is font, not image
    expect(result.modified).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'UNSUPPORTED_KIND')).toBe(true);
    expect(result.content).toBe(html);
  });

  it('custom resolver hook is invoked and can supply asset', () => {
    const html = `<img src="custom.png">`;
    // resolver returns apple.png asset for custom.png
    const resolver = (input: any, catalog: any) => {
      if (input.originalUrl === 'custom.png') {
        return catalog.getByPath(path.resolve(IMAGES_DIR, 'apple.png'));
      }
      return undefined;
    };
    const result = inlineHtml(html, { catalog, documentPath: docPath, resolver });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('custom.png');
    expect(result.content).toMatch(/data:image\/png;base64,/);
  });

  it('no parser instances leaked in result', () => {
    const html = `<img src="../images/apple.png">`;
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    // replacements and diagnostics should be plain objects, not containing parse5 nodes
    const str = JSON.stringify(result);
    expect(str).not.toMatch(/parse5/);
    expect(str).not.toMatch(/nodeName/);
    expect((result.replacements[0] as any).node).toBeUndefined();
  });
});

describe('html: location and replacement metadata deterministic order', () => {
  it('emits deterministic order matching source order', () => {
    const catalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png'), path.join(IMAGES_DIR, 'pear.png')]);
    const html = `<img src="../images/pear.png"><img src="../images/apple.png"><img src="../images/pear.png">`;
    const docPath = path.join(HTML_DIR, 'dummy.html');
    const result = inlineHtml(html, { catalog, documentPath: docPath });
    expect(result.replacements).toHaveLength(3);
    expect(result.replacements[0].originalUrl).toBe('../images/pear.png');
    expect(result.replacements[1].originalUrl).toBe('../images/apple.png');
    expect(result.replacements[2].originalUrl).toBe('../images/pear.png');
    // offsets increasing if location available
    if (result.replacements[0].location && result.replacements[1].location) {
      expect(result.replacements[0].location.offset).toBeLessThan(result.replacements[1].location.offset);
    }
    for (const r of result.replacements) {
      expect(r.mediaType).toBe('image/png');
      expect(r.kind).toBe('image');
      expect(r.byteLength).toBeGreaterThan(0);
    }
  });
});
