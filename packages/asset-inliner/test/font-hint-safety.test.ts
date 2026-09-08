import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import * as valueParserModule from 'postcss-value-parser';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { inlineCss } from '../src/css.ts';
import { escapeCssSingleQuoteString, formatFontSource } from '../src/format.ts';
import type { EncodedAsset } from '../src/types.ts';

// Same ESM/CJS interop normalization as src/css.ts
const parseValue: typeof import('postcss-value-parser') = ((
  valueParserModule as unknown as { default?: typeof import('postcss-value-parser') }
).default ??
  (valueParserModule as unknown as typeof import('postcss-value-parser'))) as typeof import('postcss-value-parser');

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const FONTS_DIR = path.join(FIXTURE_ROOT, 'fonts');
const CSS_DIR = path.join(FIXTURE_ROOT, 'css');
const WOFF2_PATH = path.join(FONTS_DIR, 'akronim-v9-latin-regular.woff2');

// Adversarial hints: attempt to break out of format('...') into new declarations.
const QUOTE_BREAKER = "woff2'); font-display:swap; src:local('x";
const BACKSLASH_HINT = "a\\b'c";
const NEWLINE_HINTS = ['woff2\ninjected', 'woff2\rinjected', 'woff2\finjected', 'woff2\r\ninjected'];

function fontBytes(): Uint8Array {
  return new Uint8Array(fs.readFileSync(WOFF2_PATH));
}

/** End-to-end: byte input -> catalog -> @font-face output. Byte assets resolve via basename. */
function byteCatalogWithHint(hint: string) {
  return createAssetCatalogSync([{ data: fontBytes(), filename: 'evil.woff2', kind: 'font', fontFormat: hint }]);
}

function fileCatalog() {
  return createAssetCatalogSync([WOFF2_PATH]);
}

function realFontAsset(): EncodedAsset {
  const catalog = fileCatalog();
  const asset = catalog.getByPath(path.resolve(WOFF2_PATH))!;
  expect(asset).toBeDefined();
  expect(asset.kind).toBe('font');
  return asset;
}

function fontFaceCss(url: string): string {
  return `@font-face {\n  font-family: 'Test';\n  src: url('${url}');\n}\n`;
}

/** Parsed assertions: declaration count in @font-face plus the single format() string value. */
function assertSingleFontFaceSrc(content: string, expectedEscapedHint: string): void {
  const root = postcss.parse(content);
  const fontFaces: postcss.AtRule[] = [];
  root.walkAtRules('font-face', (rule) => fontFaces.push(rule));
  expect(fontFaces).toHaveLength(1);
  const decls = fontFaces[0]!.nodes?.filter((n) => n.type === 'decl') ?? [];
  // font-family + src only — no injected font-display / extra src declarations
  expect(decls.map((d) => (d as postcss.Declaration).prop.toLowerCase()).sort()).toEqual(['font-family', 'src']);
  const srcDecl = decls.find((d) => (d as postcss.Declaration).prop.toLowerCase() === 'src') as postcss.Declaration;
  const parsed = parseValue(srcDecl.value);
  const formatFns: Array<{ nodes?: unknown[] }> = [];
  parsed.walk((node) => {
    if (node.type === 'function' && (node.value as string).toLowerCase() === 'format') {
      formatFns.push(node as unknown as { nodes?: unknown[] });
    }
    return undefined;
  });
  expect(formatFns).toHaveLength(1);
  const strNodes = (formatFns[0]!.nodes ?? []).filter((n) => (n as { type: string }).type === 'string') as Array<{
    value: string;
  }>;
  expect(strNodes).toHaveLength(1);
  expect(strNodes[0]!.value).toBe(expectedEscapedHint);
}

describe('font-hint safety: shared escaping', () => {
  it('escapes quotes, backslashes, and line breaks deterministically', () => {
    expect(escapeCssSingleQuoteString("a'b")).toBe("a\\'b");
    expect(escapeCssSingleQuoteString('a\\b')).toBe('a\\\\b');
    expect(escapeCssSingleQuoteString('a\nb')).toBe('a\\A b');
    expect(escapeCssSingleQuoteString('a\rb')).toBe('a\\D b');
    expect(escapeCssSingleQuoteString('a\fb')).toBe('a\\C b');
    expect(escapeCssSingleQuoteString('a\r\nb')).toBe('a\\D \\A b');
    // ordinary hints are untouched
    for (const hint of ['woff2', 'woff', 'truetype', 'embedded-opentype', 'svg', 'my-custom_hint-2']) {
      expect(escapeCssSingleQuoteString(hint)).toBe(hint);
    }
  });

  it('byte input to catalog to @font-face cannot create extra declarations (quote breaker)', () => {
    const catalog = byteCatalogWithHint(QUOTE_BREAKER);
    const result = inlineCss(fontFaceCss('evil.woff2'), {
      catalog,
      documentPath: path.join(CSS_DIR, 'dummy.css'),
      allowBasenameMatch: true,
    });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    assertSingleFontFaceSrc(result.content, escapeCssSingleQuoteString(QUOTE_BREAKER.trim()));
  });

  it.each(NEWLINE_HINTS)('byte input with line-break hint %j stays a single declaration', (hint) => {
    const catalog = byteCatalogWithHint(hint);
    const result = inlineCss(fontFaceCss('evil.woff2'), {
      catalog,
      documentPath: path.join(CSS_DIR, 'dummy.css'),
      allowBasenameMatch: true,
    });
    expect(result.modified).toBe(true);
    // Raw line break must not survive into the output string context:
    // extract the format(...) span and assert it holds no raw CR/LF/FF.
    const formatSpan = result.content.slice(result.content.indexOf('format(')).split(')')[0]!;
    expect(formatSpan).not.toContain('\r');
    expect(formatSpan).not.toContain('\n');
    expect(formatSpan).not.toContain('\f');
    assertSingleFontFaceSrc(result.content, escapeCssSingleQuoteString(hint.trim()));
  });

  it('byte input with backslash/quote hint stays a single declaration', () => {
    const catalog = byteCatalogWithHint(BACKSLASH_HINT);
    const result = inlineCss(fontFaceCss('evil.woff2'), {
      catalog,
      documentPath: path.join(CSS_DIR, 'dummy.css'),
      allowBasenameMatch: true,
    });
    expect(result.modified).toBe(true);
    assertSingleFontFaceSrc(result.content, escapeCssSingleQuoteString(BACKSLASH_HINT));
  });

  it('resolver-supplied hint has equivalent safe behavior', () => {
    const base = realFontAsset();
    const evil = Object.freeze({ ...base, fontFormat: QUOTE_BREAKER }) as EncodedAsset;
    const result = inlineCss(fontFaceCss('../fonts/akronim-v9-latin-regular.woff2'), {
      catalog: fileCatalog(),
      documentPath: path.join(CSS_DIR, 'dummy.css'),
      resolver: () => evil as never,
    });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    assertSingleFontFaceSrc(result.content, escapeCssSingleQuoteString(QUOTE_BREAKER.trim()));
  });

  it('standalone formatFontSource has equivalent safe behavior', () => {
    const base = realFontAsset();
    for (const hint of [QUOTE_BREAKER, BACKSLASH_HINT, ...NEWLINE_HINTS]) {
      const frag = formatFontSource(Object.freeze({ ...base, fontFormat: hint }) as EncodedAsset);
      expect(frag).toBe(`url(${base.dataUrl}) format('${escapeCssSingleQuoteString(hint.trim())}')`);
      const css = `@font-face {\n  font-family: 'Test';\n  src: ${frag};\n}\n`;
      assertSingleFontFaceSrc(css, escapeCssSingleQuoteString(hint.trim()));
    }
  });

  it('ordinary font hints and existing format(...) preservation pass', () => {
    // ordinary hint end-to-end
    const catalog = byteCatalogWithHint('woff2');
    const result = inlineCss(fontFaceCss('evil.woff2'), {
      catalog,
      documentPath: path.join(CSS_DIR, 'dummy.css'),
      allowBasenameMatch: true,
    });
    expect(result.modified).toBe(true);
    expect(result.content).toContain("format('woff2')");
    assertSingleFontFaceSrc(result.content, 'woff2');

    // standalone ordinary hint is byte-exact
    const base = realFontAsset();
    expect(formatFontSource(base)).toBe(`url(${base.dataUrl}) format('woff2')`);

    // pre-existing format(...) is preserved, adversarial catalog hint is not appended
    const evilCatalog = byteCatalogWithHint(QUOTE_BREAKER);
    const withFormat = `@font-face {\n  font-family: 'Test';\n  src: url('evil.woff2') format('woff2');\n}\n`;
    const preserved = inlineCss(withFormat, {
      catalog: evilCatalog,
      documentPath: path.join(CSS_DIR, 'dummy.css'),
      allowBasenameMatch: true,
    });
    expect(preserved.modified).toBe(true);
    const root = postcss.parse(preserved.content);
    let formatCount = 0;
    root.walkDecls((decl) => {
      parseValue(decl.value).walk((node) => {
        if (node.type === 'function' && node.value.toLowerCase() === 'format') formatCount++;
        return undefined;
      });
    });
    expect(formatCount).toBe(1);
    expect(preserved.content).toContain("format('woff2')");
  });
});
