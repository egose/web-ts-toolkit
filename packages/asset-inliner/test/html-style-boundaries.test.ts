import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as parse5 from 'parse5';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { inlineHtml } from '../src/html.ts';
import { inlineFiles, inlineFilesSync } from '../src/files.ts';
import { ResourceLimitError } from '../src/errors.ts';

vi.mock('parse5', async (importOriginal) => ({ ...(await importOriginal<typeof import('parse5')>()) }));

const IMAGE = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'fixtures/legacy/images/apple.png');
const ASSET_URL = 'apple.png';
const catalog = createAssetCatalogSync([IMAGE]);
const dataUrl = catalog.getByPath(IMAGE)!.dataUrl;
const options = { catalog, rootDir: path.dirname(IMAGE), inlineEmbeddedCss: true };

function elements(html: string) {
  return parse5
    .parseFragment(html)
    .childNodes.filter((node): node is parse5.DefaultTreeAdapterMap['element'] => 'tagName' in node);
}

function expectAttributes(input: string, output: string) {
  const before = elements(input);
  const after = elements(output);
  expect(after).toHaveLength(before.length);
  for (const [index, element] of before.entries()) {
    expect(after[index]!.attrs).toEqual(
      element.attrs.map((attr) => ({
        ...attr,
        value: attr.name === 'style' ? attr.value.replace(ASSET_URL, dataUrl) : attr.value,
      })),
    );
  }
}

const decodedCss = `background:url(${ASSET_URL});--x:&#32;onmouseover&#61;alert(1);--quotes:&#34;a&#39;b&#34;;--keep:é&amp;&lt;&gt;;color:blue`;
// The narrow source-map decoder does not know this named reference. Keeping
// entities in a CSS comment also makes the existing raw-source fallback valid CSS.
const fallbackCss = `background:url(${ASSET_URL});--x:/*&CounterClockwiseContourIntegral;&#32;onmouseover&#61;alert(1);&#34;&#39;&amp;*/blue`;

describe('AIR-01: rewritten style attribute boundaries', () => {
  for (const [mode, css] of [
    ['decoded', decodedCss],
    ['decoder fallback', fallbackCss],
  ]) {
    for (const quote of ['', "'", '"']) {
      it(`${mode}: preserves the whole value with ${quote || 'unquoted'} input and exact byte limits`, () => {
        const html = `<div title='keep'\n style=${quote}${css}${quote} data-tail="ok"></div>`;
        const result = inlineHtml(html, options);
        expect(result.modified).toBe(true);
        expect(result.diagnostics).toEqual([]);
        expect(result.replacements).toHaveLength(1);
        expectAttributes(html, result.content);
        const outputQuote = quote || '"';
        expect(result.content).toContain(`style=${outputQuote}background:url(${dataUrl})`);
        expect(result.content).toContain(`<div title='keep'\n style=`);
        expect(result.content).toContain(` data-tail="ok"></div>`);
        expect(result.replacements[0]!.location).toEqual({
          offset: html.indexOf(ASSET_URL),
          line: 2,
          column: html.indexOf(ASSET_URL) - html.indexOf('\n'),
        });

        const exact = Buffer.byteLength(result.content);
        expect(inlineHtml(html, { ...options, maxOutputBytes: exact }).content).toBe(result.content);
        expect(() => inlineHtml(html, { ...options, maxOutputBytes: exact - 1 })).toThrow(
          expect.objectContaining({
            code: 'RESOURCE_LIMIT',
            actual: exact,
            limit: exact - 1,
            message: expect.stringContaining('Projected output bytes'),
          }),
        );
        expect(inlineHtml(html, options)).toEqual(result);
      });
    }
  }

  it.each(['&#9;', '&#10;', '&#12;', '&#13;', '&#32;'])('keeps encoded whitespace %s inside style', (space) => {
    // Numeric CR deliberately exercises decoder disagreement as well.
    const html = `<div style=background:url(${ASSET_URL});--x:/*${space}onmouseover&#61;alert(1)*/blue></div>`;
    const result = inlineHtml(html, options);
    expect(result.modified).toBe(true);
    expectAttributes(html, result.content);
    expect(result.content).toContain('style="');
  });

  it('escapes literal delimiters in unquoted raw-source fallback, with projected byte accounting', () => {
    const css = fallbackCss.replace('*/blue', `"'<>*/blue`);
    const html = `<div style=${css.replace('<>', '&lt;&gt;')}></div>`;
    const result = inlineHtml(html, options);
    expect(result.modified).toBe(true);
    expectAttributes(html, result.content);
    expect(result.content).toContain('&quot;');
    const exact = Buffer.byteLength(result.content);
    expect(inlineHtml(html, { ...options, maxOutputBytes: exact }).content).toBe(result.content);
    expect(() => inlineHtml(html, { ...options, maxOutputBytes: exact - 1 })).toThrow(
      expect.objectContaining({ actual: exact, message: expect.stringContaining('Projected output bytes') }),
    );
  });

  it.each([decodedCss, fallbackCss])('preserves decoded entities in full-tree serialization (%#)', (css) => {
    const html = `<div style=${css}></div><div style=color:red></div>`;
    const parse = parse5.parseFragment;
    const spy = vi.spyOn(parse5, 'parseFragment').mockImplementationOnce((...args) => {
      const tree = parse(...args);
      // Missing source information on another style forces the supported
      // full-tree serializer path, independently of the decoder fallback.
      tree.childNodes[1]!.sourceCodeLocation = undefined;
      return tree;
    });
    let result;
    try {
      result = inlineHtml(html, options);
    } finally {
      spy.mockRestore();
    }
    expect(result.modified).toBe(true);
    expectAttributes(html, result.content);
    expect(result.content).toContain('style="color:red"');
  });

  it('leaves unmodified styles byte-identical', () => {
    const html = '<div style=--x:&#32;onmouseover&#61;alert(1)></div>';
    expect(inlineHtml(html, options).content).toBe(html);
  });
});

describe('AIR-01: file orchestration', () => {
  for (const [mode, run] of [
    ['async', inlineFiles],
    ['sync', inlineFilesSync],
  ] as const) {
    it(`${mode}: exact output writes safely; one-under preserves the file for both decoder paths`, async () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-inliner-style-'));
      try {
        const target = path.join(tmp, 'page.html');
        fs.copyFileSync(IMAGE, path.join(tmp, ASSET_URL));
        for (const css of [decodedCss, fallbackCss]) {
          const html = `<div style=${css} data-tail=ok></div>`;
          const fileCatalog = createAssetCatalogSync([path.join(tmp, ASSET_URL)]);
          const pure = inlineHtml(html, { catalog: fileCatalog, documentPath: target, inlineEmbeddedCss: true });
          const exact = Buffer.byteLength(pure.content);
          fs.writeFileSync(target, html);
          const fileOptions = { catalog: fileCatalog, targets: [target], write: true, inlineEmbeddedCss: true };
          const failed = await run({ ...fileOptions, maxOutputBytes: exact - 1 });
          expect(failed[0]!.written).toBe(false);
          expect(failed[0]!.modified).toBe(false);
          expect(failed[0]!.replacements).toEqual([]);
          expect(failed[0]!.diagnostics).toEqual([expect.objectContaining({ code: 'RESOURCE_LIMIT' })]);
          expect(fs.readFileSync(target, 'utf8')).toBe(html);
          expect(() => inlineHtml(html, { ...options, maxOutputBytes: exact - 1 })).toThrow(ResourceLimitError);

          const passed = await run({ ...fileOptions, maxOutputBytes: exact });
          expect(passed[0]!.written).toBe(true);
          expect(passed[0]!.content).toBe(pure.content);
          expect(passed[0]!.replacements).toEqual(pure.replacements);
          expect(passed[0]!.diagnostics).toEqual([]);
          expectAttributes(html, fs.readFileSync(target, 'utf8'));
          expect(fs.readdirSync(tmp).sort()).toEqual([ASSET_URL, 'page.html']);
        }
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
});
