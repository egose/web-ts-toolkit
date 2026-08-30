import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { inlineCss } from '../src/css.ts';

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');
const FONTS_DIR = path.join(FIXTURE_ROOT, 'fonts');
const CSS_DIR = path.join(FIXTURE_ROOT, 'css');

function catalogFor(files: string[]) {
  return createAssetCatalogSync(files);
}

describe('css escapes and locations (AINL2-08)', () => {
  it('simple hex escape resolves to intended asset (apple\\2e png -> apple.png)', () => {
    const catalog = catalogFor([path.join(IMAGES_DIR, 'apple.png')]);
    const docPath = path.join(IMAGES_DIR, 'dummy.css');
    const css = ".a { background: url('apple\\2e png'); }";
    const result = inlineCss(css, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('apple\\2e png');
    expect(result.replacements[0].resolvedPath).toBe(path.resolve(path.join(IMAGES_DIR, 'apple.png')));
    expect(result.content).toMatch(/data:image\/png;base64,/);
    expect(result.diagnostics.filter((d) => d.code === 'UNRESOLVED_REFERENCE')).toHaveLength(0);
  });

  it('hex escape with 6 digits and optional whitespace resolves', () => {
    const catalog = catalogFor([path.join(IMAGES_DIR, 'apple.png')]);
    const docPath = path.join(IMAGES_DIR, 'dummy.css');
    // \00002e is hex 2e (.) with leading zeros, optional single space consumed
    const css = ".a { background: url('apple\\00002e png'); }";
    const result = inlineCss(css, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('apple\\00002e png');
    expect(result.content).toMatch(/data:image\/png;base64,/);
  });

  it('simple escape resolves (quoted and unquoted)', () => {
    const catalog = catalogFor([path.join(IMAGES_DIR, 'apple.png')]);
    const docPath = path.join(IMAGES_DIR, 'dummy.css');
    // simple escape: \a -> a, so test\61.png where \61 = 'a' hex? Actually \a simple is 'a'
    // Use apple.png with escaped 'p' as \p -> p
    const cssQuoted = '.a { background: url(\'apple\\2e png\'); } .b { background: url("apple\\2e png"); }';
    const r1 = inlineCss(cssQuoted, { catalog, documentPath: docPath });
    expect(r1.modified).toBe(true);
    expect(r1.replacements).toHaveLength(2);

    const cssUnquoted = '.a { background: url(apple\\2epng); }';
    const r2 = inlineCss(cssUnquoted, { catalog, documentPath: docPath });
    expect(r2.modified).toBe(true);
    expect(r2.replacements).toHaveLength(1);
    expect(r2.replacements[0].originalUrl).toBe('apple\\2epng');
  });

  it('escaped newline (backslash + newline) is ignored and resolves', () => {
    const catalog = catalogFor([path.join(IMAGES_DIR, 'apple.png')]);
    const docPath = path.join(IMAGES_DIR, 'dummy.css');
    // CSS escaped newline: backslash followed by newline is line continuation -> removed
    const css = ".a { background: url('ap\\\nple.png'); }";
    const result = inlineCss(css, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('ap\\\nple.png');
    expect(result.content).toMatch(/data:image\/png;base64,/);
  });

  it('duplicate URL spellings in unrelated decls get distinct correct offsets (comment trap)', () => {
    const catalog = catalogFor([path.join(IMAGES_DIR, 'apple.png')]);
    const docPath = path.join(IMAGES_DIR, 'dummy.css');
    const css =
      ".a { background: url('apple.png'); } /* apple.png comment with same text */ .b { background: url('apple.png'); }";
    const result = inlineCss(css, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    // Both originalUrl same spelling
    expect(result.replacements[0].originalUrl).toBe('apple.png');
    expect(result.replacements[1].originalUrl).toBe('apple.png');
    const off0 = result.replacements[0].location!.offset;
    const off1 = result.replacements[1].location!.offset;
    expect(off1).toBeGreaterThan(off0);
    // The comment contains apple.png; second url's offset must NOT point inside comment
    const commentIdx = css.indexOf('/*');
    const commentEnd = css.indexOf('*/') + 2;
    const commentTextIdx = css.indexOf('apple.png', commentIdx);
    expect(off1).not.toBe(commentTextIdx);
    // Second offset should be after comment, pointing to second decl's url token
    const secondDeclUrlIdx = css.indexOf("url('apple.png')", commentEnd);
    // originalUrl inside quotes: offset of apple.png inside second url
    const expectedSecond = secondDeclUrlIdx + "url('".length;
    expect(off1).toBe(expectedSecond);
    expect(off0).toBe(css.indexOf("url('apple.png')") + "url('".length);
  });

  it('nested image-set and multiple URL ordering deterministic', () => {
    const catalog = catalogFor([path.join(IMAGES_DIR, 'apple.png'), path.join(IMAGES_DIR, 'pear.png')]);
    const docPath = path.join(IMAGES_DIR, 'dummy.css');
    const css =
      ".a { background: image-set( url('apple.png') 1x, url('pear.png') 2x ); } .b { background: url('apple.png'), url('pear.png'); }";
    const result = inlineCss(css, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(4);
    // Order must be source order: apple (inside image-set first), pear (second), apple (multiple), pear (second multiple)
    expect(result.replacements[0].originalUrl).toBe('apple.png');
    expect(result.replacements[1].originalUrl).toBe('pear.png');
    expect(result.replacements[2].originalUrl).toBe('apple.png');
    expect(result.replacements[3].originalUrl).toBe('pear.png');
    // Offsets strictly increasing in source order
    const offsets = result.replacements.map((r) => r.location!.offset);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]!);
    }
  });

  it('malformed escape (invalid hex zero) produces diagnostic and no partial mutation', () => {
    const catalog = catalogFor([path.join(IMAGES_DIR, 'apple.png')]);
    const docPath = path.join(IMAGES_DIR, 'dummy.css');
    // Hex escape \0 produces invalid codepoint (0) -> should be diagnostic
    const css = ".a { background: url('apple\\0.png'); } .b { background: url('apple.png'); }";
    const result = inlineCss(css, { catalog, documentPath: docPath });
    // One good replacement, one malformed diagnostic, no partial mutation for bad token
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('apple.png');
    expect(result.content).toMatch(/data:image\/png;base64,/);
    // Malformed should be diagnostic with INVALID_OPTIONS and originalUrl preserved
    const diag = result.diagnostics.find((d) => d.originalUrl === 'apple\\0.png');
    expect(diag).toBeDefined();
    expect(diag!.code).toBe('INVALID_OPTIONS');
    // Original malformed url text should remain unchanged in output (no partial mutation)
    expect(result.content).toContain('apple\\0.png');
    // Ensure good replacement happened but malformed remains
    expect(result.replacements[0].originalUrl).toBe('apple.png');
  });

  it('comments and whitespace around URLs do not affect offsets', () => {
    const catalog = catalogFor([path.join(IMAGES_DIR, 'apple.png'), path.join(IMAGES_DIR, 'pear.png')]);
    const docPath = path.join(IMAGES_DIR, 'dummy.css');
    const css = ".a { background: url('apple.png') /* comment */ , url('pear.png'); }";
    const result = inlineCss(css, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    expect(result.replacements[0].originalUrl).toBe('apple.png');
    expect(result.replacements[1].originalUrl).toBe('pear.png');
    // offsets should point to URL tokens, not comment
    expect(result.replacements[0].location!.offset).toBeLessThan(result.replacements[1].location!.offset!);
  });

  it('preserves format(...) rule for @font-face src with escapes', () => {
    const catalog = catalogFor([path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff2')]);
    const docPath = path.join(FONTS_DIR, 'dummy.css');
    const css = "@font-face { font-family: 'Test'; src: url('akronim-v9-latin-regular\\2e woff2'); }";
    // The file is akronim-v9-latin-regular.woff2, escaped \2e -> '.' => should resolve and add format
    const result = inlineCss(css, { catalog, documentPath: docPath });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('akronim-v9-latin-regular\\2e woff2');
    expect(result.content).toMatch(/format\('woff2'\)/);
  });
});
