import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { inlineCss } from '../src/css.ts';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { ParseError } from '../src/errors.ts';

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const FONTS_DIR = path.join(FIXTURE_ROOT, 'fonts');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');
const CSS_DIR = path.join(FIXTURE_ROOT, 'css');

function readFixture(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

// Helper to create catalog with specific files
function catalogFrom(files: string[]) {
  return createAssetCatalogSync(files);
}

describe('css: legacy font fixture inlines correctly', () => {
  it('example.css inlines all local font urls with format logic and preserves remote/local mix', () => {
    const cssPath = path.join(CSS_DIR, 'example.css');
    const content = readFixture(cssPath);
    const fontFiles = fs.readdirSync(FONTS_DIR).map((n) => path.join(FONTS_DIR, n));
    const catalog = catalogFrom(fontFiles);

    const result = inlineCss(content, { catalog, documentPath: cssPath });

    expect(result.modified).toBe(true);
    expect(result.replacements.length).toBeGreaterThanOrEqual(5);
    // each replacement has required fields; .svg defaults to image kind unless explicit font svg registry
    for (const r of result.replacements) {
      expect(r.originalUrl).toBeDefined();
      expect(r.resolvedPath).toBeDefined();
      expect(r.mediaType).toBeDefined();
      // svg file will be image/svg+xml with kind image by default
      if (r.mediaType === 'image/svg+xml') {
        expect(['font', 'image']).toContain(r.kind);
      } else {
        expect(r.kind).toBe('font');
      }
      expect(r.byteLength).toBeGreaterThan(0);
      expect(r.location?.offset).toBeGreaterThanOrEqual(0);
    }

    // Should contain data URLs
    expect(result.content).toMatch(/data:font\//);
    expect(result.content).toMatch(/data:image\/svg\+xml/);
    // Should not retain original relative paths for inlined entries
    // The second src block's woff entries should be replaced
    expect(result.content).not.toMatch(/url\('\.\.\/fonts\/akronim-v9-latin-regular\.woff'\)/);
    // format hints preserved/added: existing woff2/woff/truetype/svg should remain, missing first eot without format should gain one? Check
    // The fixture has duplicate eot without format on second src with ?#iefix and format embedded-opentype -> should stay
    expect(result.content).toMatch(/format\('woff2'\)/);
    expect(result.content).toMatch(/format\('woff'\)/);
    expect(result.content).toMatch(/format\('truetype'\)/);
    expect(result.content).toMatch(/format\('svg'\)/);
    // original css local() entries should be preserved
    expect(result.content).toMatch(/local\('Akronim Regular'\)/);
    // diagnostics: no unresolved for this fixture (all fonts exist)
    const unresolved = result.diagnostics.filter((d) => d.code === 'UNRESOLVED_REFERENCE');
    expect(unresolved).toHaveLength(0);
  });

  it('fruit-background.css inlines background image urls generically', () => {
    const cssPath = path.join(CSS_DIR, 'fruit-background.css');
    const content = readFixture(cssPath);
    const catalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png'), path.join(IMAGES_DIR, 'pear.png')]);

    const result = inlineCss(content, { catalog, documentPath: cssPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    expect(result.replacements[0].originalUrl).toBe('../images/apple.png');
    expect(result.replacements[1].originalUrl).toBe('../images/pear.png');
    for (const r of result.replacements) {
      expect(r.kind).toBe('image');
      expect(r.mediaType).toBe('image/png');
    }
    expect(result.content).toMatch(/data:image\/png;base64,/);
    expect(result.content).not.toMatch(/url\('\.\.\/images\/apple\.png'\)/);
    // Should not have added format
    expect(result.content).not.toMatch(/format\(/);
  });

  it('query-fragment fixture strips query/fragment for lookup and does not emit them', () => {
    const cssPath = path.join(FIXTURE_ROOT, 'negative', 'query-fragment.css');
    const content = readFixture(cssPath);
    const catalog = catalogFrom([
      path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff'),
      path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff2'),
    ]);
    // documentPath inside css folder to resolve ../fonts correctly
    const docPath = path.join(CSS_DIR, 'dummy.css');
    const result = inlineCss(content, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    // originalUrl includes query/fragment as extracted (before stripping)
    // For our fixture, urls are with ?#iefix and #Akronim
    const urls = result.replacements.map((r) => r.originalUrl);
    // One should contain ?#iefix, other #Akronim? Actually fixture has both: first url('../fonts/akronim-v9-latin-regular.woff?#iefix'), second url("../fonts/akronim-v9-latin-regular.woff2#Akronim")
    expect(urls.some((u) => u.includes('woff'))).toBe(true);
    // Data URL must not retain query/fragment
    expect(result.content).not.toMatch(/\?#iefix/);
    expect(result.content).not.toMatch(/#Akronim.*data:/);
    // But format hints preserved
    expect(result.content).toMatch(/format\('woff'\)/);
  });
});

describe('css: generic declaration coverage (masks, borders, cursors, list, generated content, custom props)', () => {
  const imageCatalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png'), path.join(IMAGES_DIR, 'pear.png')]);
  const docPath = path.join(CSS_DIR, 'dummy.css');

  it('masks, borders, cursors, list-style-image work through same implementation', () => {
    const css = `
.mask { mask-image: url('../images/apple.png'); }
.border { border-image: url('../images/pear.png') 30 round; }
.cursor { cursor: url('../images/apple.png'), auto; }
.list { list-style-image: url('../images/pear.png'); }
`;
    const result = inlineCss(css, { catalog: imageCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(4);
    expect(result.content).toMatch(/mask-image:\s*url\(data:image\/png;base64,/);
    expect(result.content).toMatch(/border-image:\s*url\(data:image\/png;base64,/);
    expect(result.content).toMatch(/cursor:\s*url\(data:image\/png;base64,/);
    expect(result.content).toMatch(/list-style-image:\s*url\(data:image\/png;base64,/);
    // Original paths gone
    expect(result.content).not.toMatch(/apple\.png/);
    expect(result.content).not.toMatch(/pear\.png/);
  });

  it('generated content and custom properties', () => {
    const css = `
.gen::before { content: url('../images/apple.png'); }
:root { --my-bg: url('../images/pear.png'); }
.use { background: var(--my-bg); }
`;
    const result = inlineCss(css, { catalog: imageCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    expect(result.content).toMatch(/content:\s*url\(data:image\/png;base64,/);
    expect(result.content).toMatch(/--my-bg:\s*url\(data:image\/png;base64,/);
  });

  it('gradients with multiple urls and multiple backgrounds', () => {
    const css = `
.grad { background: linear-gradient(red, blue), url('../images/apple.png'), url('../images/pear.png'); }
`;
    const result = inlineCss(css, { catalog: imageCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    expect(result.content).toMatch(/linear-gradient\(red, blue\)/);
    const dataMatches = result.content.match(/data:image\/png;base64,/g);
    expect(dataMatches).toHaveLength(2);
  });

  it('supports quoted, unquoted, spaces, escapes handling', () => {
    const css = `
.a { background: url('../images/apple.png'); }
.b { background: url("../images/apple.png"); }
.c { background: url(../images/apple.png); }
.d { background: url( '../images/apple.png' ); }
`;
    const result = inlineCss(css, { catalog: imageCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    // All four should be replaced (same file, four declarations)
    expect(result.replacements).toHaveLength(4);
    for (const r of result.replacements) {
      expect(r.originalUrl).toBe('../images/apple.png');
    }
    // No original quoted form remains
    expect(result.content).not.toMatch(/'..\/images\/apple\.png'/);
    expect(result.content).not.toMatch(/"..\//);
  });

  it('preserves comments and surrounding whitespace closely', () => {
    const css = `/* comment before */
.a { background: url('../images/apple.png'); /* trailing comment */ }
`;
    const result = inlineCss(css, { catalog: imageCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.content).toMatch(/\/\* comment before \*\//);
    expect(result.content).toMatch(/\/\* trailing comment \*\//);
    expect(result.content).toMatch(/data:image\/png;base64,/);
  });
});

describe('css: existing data/remote untouched', () => {
  const imageCatalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png')]);
  const docPath = path.join(CSS_DIR, 'dummy.css');

  it('data URL remains untouched and byte-identical if only data urls present', () => {
    const css = readFixture(path.join(FIXTURE_ROOT, 'negative', 'data-url.css'));
    const result = inlineCss(css, { catalog: imageCatalog, documentPath: docPath });
    expect(result.modified).toBe(false);
    expect(result.content).toBe(css);
    expect(result.replacements).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('remote and protocol-relative urls are untouched and not diagnosed', () => {
    const css = `
.a { background: url('https://example.com/a.png'); }
.b { background: url('//cdn.example.com/b.png'); }
.c { background: url('data:image/png;base64,abc'); }
.d { background: url('blob:https://example.com/abc'); }
.e { background: url('#fragment'); }
.f { background: url('../images/apple.png'); }
`;
    const result = inlineCss(css, { catalog: imageCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('../images/apple.png');
    expect(result.content).toMatch(/https:\/\/example\.com\/a\.png/);
    expect(result.content).toMatch(/\/\/cdn\.example\.com\/b\.png/);
    expect(result.content).toMatch(/data:image\/png;base64,abc/);
    expect(result.content).toMatch(/blob:https:\/\/example\.com\/abc/);
    expect(result.content).toMatch(/#fragment/);
    // No diagnostics for skipped remotes
    const skippedDiag = result.diagnostics.filter((d) => d.originalUrl && /example\.com/.test(d.originalUrl));
    expect(skippedDiag).toHaveLength(0);
  });
});

describe('css: format() logic', () => {
  const fontsCatalog = catalogFrom([
    path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff2'),
    path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff'),
    path.join(FONTS_DIR, 'akronim-v9-latin-regular.ttf'),
  ]);
  const imageCatalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png')]);
  const docPath = path.join(CSS_DIR, 'dummy.css');

  it('adds format only for font kind inside @font-face src when missing', () => {
    const css = `
@font-face {
  font-family: 'Test';
  src: url('../fonts/akronim-v9-latin-regular.woff2');
}
`;
    const result = inlineCss(css, { catalog: fontsCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].kind).toBe('font');
    expect(result.content).toMatch(/url\(data:font\/woff2;base64,/);
    expect(result.content).toMatch(/format\('woff2'\)/);
  });

  it('does not duplicate existing format descriptor', () => {
    const css = `
@font-face {
  font-family: 'Test';
  src: url('../fonts/akronim-v9-latin-regular.woff2') format('woff2'),
       url('../fonts/akronim-v9-latin-regular.woff') format('woff');
}
`;
    const result = inlineCss(css, { catalog: fontsCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    // Each should not have duplicate format
    const formatWoff2Count = (result.content.match(/format\('woff2'\)/g) ?? []).length;
    const formatWoffCount = (result.content.match(/format\('woff'\)/g) ?? []).length;
    expect(formatWoff2Count).toBe(1);
    expect(formatWoffCount).toBe(1);
    // No nested format like format('woff2') format('woff2')
    expect(result.content).not.toMatch(/format\('woff2'\)\s*format\('woff2'\)/);
  });

  it('does not add format for non-font assets even inside @font-face', () => {
    const css = `
@font-face {
  font-family: 'Test';
  src: url('../images/apple.png');
}
`;
    const result = inlineCss(css, { catalog: imageCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.content).toMatch(/url\(data:image\/png;base64,/);
    expect(result.content).not.toMatch(/format\(/);
  });

  it('does not add format for font assets outside @font-face src', () => {
    const css = `
.a { background: url('../fonts/akronim-v9-latin-regular.woff2'); }
`;
    const result = inlineCss(css, { catalog: fontsCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.content).toMatch(/url\(data:font\/woff2;base64,/);
    expect(result.content).not.toMatch(/format\(/);
  });

  it('font format uses kind check (image svg should not get format)', () => {
    // SVG defaults to image kind; if we inline svg image inside font-face, it should not get format
    const svgImageCatalog = catalogFrom([path.join(IMAGES_DIR, 'sample.svg')]);
    const css = `
@font-face {
  font-family: 'Test';
  src: url('../images/sample.svg');
}
`;
    const result = inlineCss(css, { catalog: svgImageCatalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.content).not.toMatch(/format\(/);
  });
});

describe('css: duplicate basenames and malformed handling', () => {
  it('duplicate basename in compatibility mode emits diagnostic and leaves url unchanged', () => {
    const dupA = path.join(FIXTURE_ROOT, 'negative', 'duplicate-a', 'dup.png');
    const dupB = path.join(FIXTURE_ROOT, 'negative', 'duplicate-b', 'dup.png');
    const catalog = catalogFrom([dupA, dupB]);
    const css = `.a { background: url('dup.png'); }`;
    // Use a document path unrelated to both duplicate-a/b so exact lookup fails (resolves to /tmp/.../dup.png)
    const unrelatedDoc = path.join(FIXTURE_ROOT, 'negative', 'dummy.css');
    // First, from duplicate-a's directory exact lookup succeeds for that specific file — verify exact path behavior elsewhere;
    // For this test we want unresolved vs ambiguous via basename fallback from an unrelated location.
    const resultExact = inlineCss(css, { catalog, documentPath: unrelatedDoc });
    expect(resultExact.modified).toBe(false);
    expect(resultExact.diagnostics.some((d) => d.code === 'UNRESOLVED_REFERENCE')).toBe(true);

    // With allowBasenameMatch, basename 'dup.png' has two candidates -> ambiguous
    const resultAmbig = inlineCss(css, { catalog, documentPath: unrelatedDoc, allowBasenameMatch: true });
    expect(resultAmbig.modified).toBe(false);
    expect(resultAmbig.diagnostics.some((d) => d.code === 'AMBIGUOUS_ASSET')).toBe(true);
    expect(resultAmbig.content).toBe(css);
  });

  it('exact path selects intended duplicate basename', () => {
    const dupA = path.join(FIXTURE_ROOT, 'negative', 'duplicate-a', 'dup.png');
    const dupB = path.join(FIXTURE_ROOT, 'negative', 'duplicate-b', 'dup.png');
    const catalog = catalogFrom([dupA, dupB]);
    const css = `.a { background: url('../duplicate-a/dup.png'); }`;
    const docPath = path.join(FIXTURE_ROOT, 'negative', 'duplicate-b', 'dummy.css'); // from B's dir, relative to A requires going up
    const result = inlineCss(css, { catalog, documentPath: docPath });
    // Resolved should be dupA (since path points to duplicate-a)
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].resolvedPath).toBe(path.resolve(dupA));
  });

  it('malformed CSS throws ParseError', () => {
    const css = readFixture(path.join(FIXTURE_ROOT, 'negative', 'malformed.css'));
    const catalog = catalogFrom([path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff')]);
    expect(() => inlineCss(css, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css') })).toThrow(ParseError);
    try {
      inlineCss(css, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css') });
    } catch (e) {
      expect((e as ParseError).code).toBe('PARSE_ERROR');
    }
  });

  it('malformed percent encoding emits diagnostic and leaves url unchanged', () => {
    const catalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png')]);
    const css = `.a { background: url('a%G0.png'); }`;
    const result = inlineCss(css, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css') });
    expect(result.modified).toBe(false);
    // decodeUrlPath will throw InvalidOptionsError for %G0
    expect(result.diagnostics.some((d) => d.code === 'INVALID_OPTIONS')).toBe(true);
    expect(result.content).toBe(css);
  });

  it('unresolved local reference emits warn diagnostic', () => {
    const catalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png')]);
    const css = `.a { background: url('../images/missing.png'); }`;
    const result = inlineCss(css, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css') });
    expect(result.modified).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('UNRESOLVED_REFERENCE');
    expect(result.content).toBe(css);
  });
});

describe('css: byte-identical and minimal edits', () => {
  const imageCatalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png')]);

  it('unchanged content is byte-identical', () => {
    const css = `.foo { color: red; }`;
    const result = inlineCss(css, { catalog: imageCatalog, documentPath: path.join(CSS_DIR, 'dummy.css') });
    expect(result.modified).toBe(false);
    expect(result.content).toBe(css);
    expect(result.content).toBe(`.foo { color: red; }`);
    expect(result.replacements).toHaveLength(0);
  });

  it('changed content does not reformat unrelated rules', () => {
    const css = `.keep { color: red;   margin: 0; }
.change { background: url('../images/apple.png'); }
.keep2 { padding: 10px; }`;
    const result = inlineCss(css, { catalog: imageCatalog, documentPath: path.join(CSS_DIR, 'dummy.css') });
    expect(result.modified).toBe(true);
    // keep rules should remain with original whitespace
    expect(result.content).toContain('.keep { color: red;   margin: 0; }');
    expect(result.content).toContain('.keep2 { padding: 10px; }');
    expect(result.content).toMatch(/data:image\/png;base64,/);
  });

  it('comma-separated @font-face src preserves remote, unsupported, already-inlined alternatives', () => {
    const catalog = catalogFrom([path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff2')]);
    const css = `
@font-face {
  font-family: 'Test';
  src: url('../fonts/akronim-v9-latin-regular.woff2') format('woff2'),
       url('https://example.com/remote.woff') format('woff'),
       url('data:font/woff2;base64,abc') format('woff2'),
       url('../fonts/missing.woff') format('woff');
}
`;
    const result = inlineCss(css, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css') });
    expect(result.modified).toBe(true);
    // Only first local should be replaced
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('../fonts/akronim-v9-latin-regular.woff2');
    expect(result.content).toMatch(/https:\/\/example\.com\/remote\.woff/);
    expect(result.content).toMatch(/data:font\/woff2;base64,abc/);
    expect(result.content).toMatch(/missing\.woff/);
    // diagnostics for missing
    expect(result.diagnostics.some((d) => d.code === 'UNRESOLVED_REFERENCE')).toBe(true);
    // Should still have format hints for preserved entries
    expect(result.content.match(/format\('woff2'\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('handles multiple urls with gradients without normalizing whole stylesheet', () => {
    const css = `.a { background: linear-gradient(to right, red, blue); }
.b { background: url('../images/apple.png'); }
.c { background: url('../images/apple.png'), linear-gradient(red, blue); }`;
    const result = inlineCss(css, { catalog: imageCatalog, documentPath: path.join(CSS_DIR, 'dummy.css') });
    expect(result.modified).toBe(true);
    // Should have replaced both .b and .c's apple.png
    expect(result.replacements).toHaveLength(2);
    expect(result.content).toContain('linear-gradient(to right, red, blue)');
    expect(result.content).toContain('linear-gradient(red, blue)');
  });
});

describe('css: location and replacement metadata deterministic order', () => {
  it('emits deterministic order matching source order', () => {
    const catalog = catalogFrom([path.join(IMAGES_DIR, 'apple.png'), path.join(IMAGES_DIR, 'pear.png')]);
    const css = `
.a { background: url('../images/pear.png'); }
.b { background: url('../images/apple.png'); }
.c { background: url('../images/pear.png'); }
`;
    const result = inlineCss(css, { catalog, documentPath: path.join(CSS_DIR, 'dummy.css') });
    expect(result.replacements).toHaveLength(3);
    expect(result.replacements[0].originalUrl).toBe('../images/pear.png');
    expect(result.replacements[1].originalUrl).toBe('../images/apple.png');
    expect(result.replacements[2].originalUrl).toBe('../images/pear.png');
    // offsets increasing
    expect(result.replacements[0].location!.offset).toBeLessThan(result.replacements[1].location!.offset!);
    expect(result.replacements[1].location!.offset).toBeLessThan(result.replacements[2].location!.offset!);
    // Each has correct mediaType/kind/bytes
    for (const r of result.replacements) {
      expect(r.mediaType).toBe('image/png');
      expect(r.kind).toBe('image');
      expect(r.byteLength).toBeGreaterThan(0);
      expect(r.location?.line).toBeGreaterThan(0);
    }
  });
});
