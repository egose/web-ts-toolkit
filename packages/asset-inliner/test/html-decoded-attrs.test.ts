import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { inlineHtml } from '../src/html.ts';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { ResourceLimitError } from '../src/errors.ts';

const FIXTURE_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'legacy');
const IMAGES_DIR = path.join(FIXTURE_ROOT, 'images');
const HTML_DIR = path.join(FIXTURE_ROOT, 'html');
const DOC_PATH = path.join(HTML_DIR, 'dummy.html');

function catalog() {
  return createAssetCatalogSync([path.join(IMAGES_DIR, 'apple.png'), path.join(IMAGES_DIR, 'pear.png')]);
}

describe('html AIH-08: decoded srcset attribute values with source mapping', () => {
  it('numeric character reference in srcset URL inlines with original-source offsets', () => {
    const html = `<img srcset="../images/apple&#46;png 1x, ../images/pear.png 2x" alt="x">`;
    const result = inlineHtml(html, { catalog: catalog(), documentPath: DOC_PATH });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    expect(result.replacements[0].originalUrl).toBe('../images/apple.png');
    expect(result.replacements[1].originalUrl).toBe('../images/pear.png');
    expect(result.replacements[0].location!.offset).toBe(html.indexOf('../images/apple&#46;png'));
    expect(result.replacements[1].location!.offset).toBe(html.indexOf('../images/pear.png'));
    expect(result.content).toMatch(/srcset="data:image\/png;base64,[^"]+ 1x, data:image\/png;base64,[^"]+ 2x"/);
    expect(result.content).not.toContain('&#46;');
  });

  it('named references and encoded descriptor whitespace inline in srcset', () => {
    const html = `<img srcset="..&sol;images&sol;apple.png&#32;1x, ..&#x2F;images&#x2F;pear.png&#9;2x">`;
    const result = inlineHtml(html, { catalog: catalog(), documentPath: DOC_PATH });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    expect(result.replacements[0].originalUrl).toBe('../images/apple.png');
    expect(result.replacements[1].originalUrl).toBe('../images/pear.png');
    expect(result.replacements[0].location!.offset).toBe(html.indexOf('..&sol;images&sol;apple.png'));
    expect(result.replacements[1].location!.offset).toBe(html.indexOf('..&#x2F;images&#x2F;pear.png'));
    // Encoded separators/descriptors stay byte-identical around the replacement.
    expect(result.content).toContain('&#32;1x');
    expect(result.content).toContain('&#9;2x');
    expect(result.content).not.toContain('&sol;');
    expect(result.content).not.toContain('&#x2F;');
  });

  it('duplicate entity-encoded references report distinct source offsets and line/column', () => {
    const html = `<img srcset="../images/apple&#46;png 1x,\n  ../images/apple&#46;png 2x">`;
    const result = inlineHtml(html, { catalog: catalog(), documentPath: DOC_PATH });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(2);
    const [a, b] = result.replacements as [(typeof result.replacements)[number], (typeof result.replacements)[number]];
    const off0 = html.indexOf('../images/apple&#46;png');
    const off1 = html.indexOf('../images/apple&#46;png', off0 + 1);
    expect(a.location!.offset).toBe(off0);
    expect(b.location!.offset).toBe(off1);
    expect(a.location!.line).toBe(1);
    expect(a.location!.column).toBe(off0 + 1);
    expect(b.location!.line).toBe(2);
    expect(b.location!.column).toBe(off1 - html.lastIndexOf('\n', off1 - 1));
  });

  it('decoding is applied once: doubly-encoded entities are not resolved', () => {
    const html = `<img srcset="a&amp;amp;png 1x">`;
    const result = inlineHtml(html, { catalog: catalog(), documentPath: DOC_PATH });
    expect(result.modified).toBe(false);
    expect(result.content).toBe(html);
    expect(result.replacements).toHaveLength(0);
    const diag = result.diagnostics.find((d) => d.code === 'UNRESOLVED_REFERENCE');
    expect(diag).toBeDefined();
    // Single decode yields `a&amp;png`; a second decode would yield `a&png`.
    expect(diag!.originalUrl).toBe('a&amp;png');
  });

  it('whole-target accounting uses the original source spelling, not the decoded length', () => {
    const html = `<img srcset="../images/apple&#46;png 1x">`;
    const ok = inlineHtml(html, { catalog: catalog(), documentPath: DOC_PATH });
    expect(ok.modified).toBe(true);
    const dataUrl = /data:image\/png;base64,[A-Za-z0-9+/=]+/.exec(ok.content)?.[0];
    expect(dataUrl).toBeDefined();
    const targetBytes = Buffer.byteLength(html, 'utf8');
    const srcSpanBytes = Buffer.byteLength('../images/apple&#46;png', 'utf8');
    const exact = targetBytes + (Buffer.byteLength(dataUrl!, 'utf8') - srcSpanBytes);
    // Exact budget passes; one byte less fails. Accounting against the
    // shorter decoded spelling (`../images/apple.png`) would reject `exact`.
    const exactRes = inlineHtml(html, { catalog: catalog(), documentPath: DOC_PATH, maxOutputBytes: exact });
    expect(exactRes.modified).toBe(true);
    expect(() => inlineHtml(html, { catalog: catalog(), documentPath: DOC_PATH, maxOutputBytes: exact - 1 })).toThrow(
      ResourceLimitError,
    );
  });
});

describe('html AIH-08: decoded style attributes with source mapping', () => {
  it('encoded CSS quotes in style attribute inline and re-encode safely', () => {
    const html = `<div style="background:url(&quot;../images/apple.png&quot;)"></div>`;
    const result = inlineHtml(html, { catalog: catalog(), documentPath: DOC_PATH, inlineEmbeddedCss: true });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('../images/apple.png');
    expect(result.replacements[0].location!.offset).toBe(html.indexOf('../images/apple.png'));
    expect(result.content).toMatch(/style="background:url\(data:image\/png;base64,[A-Za-z0-9+/=]+\)"/);
    expect(result.content).not.toContain('&quot;../images');
  });

  it('single-quoted style attribute with encoded quotes acquires no new syntax', () => {
    const html = `<div style='background:url(&quot;../images/apple.png&quot;)'></div>`;
    const result = inlineHtml(html, { catalog: catalog(), documentPath: DOC_PATH, inlineEmbeddedCss: true });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.content).toMatch(/style='background:url\(data:image\/png;base64,[A-Za-z0-9+/=]+\)'/);
    expect(result.content).not.toContain('&quot;');
  });
});

describe('html AIH-08: preservation and cross-checks', () => {
  it('unrelated entities and markup remain byte-identical', () => {
    const html = `<div title="&copy; &amp;"><!-- keep &lt;markup&gt; --><img srcset="../images/apple&#46;png 1x" alt="a &amp; b"></div>`;
    const result = inlineHtml(html, { catalog: catalog(), documentPath: DOC_PATH });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.content).toContain(`title="&copy; &amp;"`);
    expect(result.content).toContain(`<!-- keep &lt;markup&gt; -->`);
    expect(result.content).toContain(`alt="a &amp; b"`);
    // Only the entity-encoded URL span is replaced; all other bytes identical.
    const span = '../images/apple&#46;png';
    const off = html.indexOf(span);
    const dataUrl = /data:image\/png;base64,[A-Za-z0-9+/=]+/.exec(result.content)?.[0];
    expect(dataUrl).toBeDefined();
    expect(result.content).toBe(html.slice(0, off) + dataUrl! + html.slice(off + span.length));
  });

  it('ordinary src with character reference resolves (cross-check)', () => {
    const html = `<img src="../images/apple&#46;png" alt="x">`;
    const result = inlineHtml(html, { catalog: catalog(), documentPath: DOC_PATH });
    expect(result.modified).toBe(true);
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].originalUrl).toBe('../images/apple.png');
    expect(result.replacements[0].location!.offset).toBe(html.indexOf('../images/apple&#46;png'));
    expect(result.content).toMatch(/src="data:image\/png;base64,/);
  });

  it('style elements keep raw text: character references are not decoded there', () => {
    const encoded = `<style>.a{background:url(apple&#46;png)}</style>`;
    const opts = {
      catalog: catalog(),
      documentPath: path.join(HTML_DIR, 'page.html'),
      rootDir: HTML_DIR,
      allowBasenameMatch: true,
      inlineEmbeddedCss: true,
    } as const;
    const left = inlineHtml(encoded, opts as never);
    expect(left.modified).toBe(false);
    expect(left.content).toBe(encoded);
    expect(left.replacements).toHaveLength(0);
    // The decoded spelling would resolve, proving the raw text was not decoded.
    const plain = `<style>.a{background:url(apple.png)}</style>`;
    const right = inlineHtml(plain, opts as never);
    expect(right.modified).toBe(true);
    expect(right.replacements).toHaveLength(1);
  });
});
