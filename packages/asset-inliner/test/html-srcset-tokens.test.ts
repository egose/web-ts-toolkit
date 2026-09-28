import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as parse5 from 'parse5';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { inlineHtml } from '../src/html.ts';
import { inlineFiles, inlineFilesSync } from '../src/files.ts';
import type { AssetResolverSync } from '../src/types.ts';

vi.mock('parse5', async (importOriginal) => ({ ...(await importOriginal<typeof import('parse5')>()) }));

const rootDir = path.resolve('test/fixtures/legacy/images');
const names = ['apple,pear.png', 'apple.png', 'pear.png', 'a.png,b.png', 'é,pear.png'];
const catalog = createAssetCatalogSync(
  names.map((filename, i) => ({
    data: Buffer.from(`image-${i}`),
    filename,
    mediaType: 'image/png',
  })),
);
const dataUrl = (name: string) => catalog.getByBasename(name)!.dataUrl;
const options = { catalog, rootDir, allowBasenameMatch: true };

describe('AIR-02: complete srcset URL tokens', () => {
  for (const tag of ['img', 'source']) {
    it(`${tag}: remote comma URLs never resolve suffix decoys`, () => {
      const resolver = vi.fn<AssetResolverSync>(() => undefined);
      const html = `<${tag} srcset="https://example.test/a,apple.png 1x, //example.test/b,pear.png 2x">`;
      const result = inlineHtml(html, { ...options, resolver });
      expect(result.content).toBe(html);
      expect(result.replacements).toEqual([]);
      expect(result.diagnostics).toEqual([]);
      expect(resolver).not.toHaveBeenCalled();
    });

    it(`${tag}: resolves a whole comma filename, never its existing suffix decoy`, () => {
      const html = `<${tag} srcset='apple,pear.png 1x, pear.png 2x' data-keep="&amp;">`;
      const result = inlineHtml(html, options);
      expect(result.content).toBe(
        html.replace('apple,pear.png', dataUrl('apple,pear.png')).replace('pear.png 2x', `${dataUrl('pear.png')} 2x`),
      );
      expect(result.replacements.map((r) => r.originalUrl)).toEqual(['apple,pear.png', 'pear.png']);
      expect(result.diagnostics).toEqual([]);
    });
  }

  it('missing comma filename diagnoses only the whole URL, despite suffix assets', () => {
    const resolver = vi.fn<AssetResolverSync>(() => undefined);
    const html = '<img srcset="missing,pear.png 1x">';
    const result = inlineHtml(html, { ...options, resolver });
    expect(result.content).toBe(html);
    expect(result.diagnostics.map((d) => d.originalUrl)).toEqual(['missing,pear.png']);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver.mock.calls[0]![0].originalUrl).toBe('missing,pear.png');
  });

  it.each(['', '1x', '0x', '-0x', '.5x', '1e2x', '1E-2x', '100w', '100w 50h', '50h 100w'])(
    'accepts descriptor %j',
    (descriptor) => {
      const html = `<img srcset="apple,pear.png${descriptor ? ` ${descriptor}` : ''}">`;
      expect(inlineHtml(html, options).content).toBe(html.replace('apple,pear.png', dataUrl('apple,pear.png')));
    },
  );

  it.each([
    '0w',
    '-1x',
    '+1x',
    '1.x',
    'Infinityx',
    '1e999x',
    'NaNx',
    '1X',
    '1w 2w',
    '1x 2x',
    '1w 2x',
    '1h',
    '1h 2h',
    '1w 0h',
    '1x 2h',
    '1q',
    '(bad,pear.png)',
    '(unclosed,pear.png',
  ])('leaves malformed descriptor %j untouched without resolver calls', (descriptor) => {
    const resolver = vi.fn<AssetResolverSync>(() => undefined);
    const html = `<img srcset="apple,pear.png ${descriptor}">`;
    const result = inlineHtml(html, { ...options, resolver });
    expect(result.content).toBe(html);
    expect(result.replacements).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('does not reinterpret comma adjacency as separate descriptorless URLs', () => {
    const html = '<img srcset="a.png,b.png">';
    const result = inlineHtml(html, options);
    expect(result.replacements.map((r) => r.originalUrl)).toEqual(['a.png,b.png']);
    expect(result.content).toBe(`<img srcset="${dataUrl('a.png,b.png')}">`);
    // The final 2x is another URL token, not a second density descriptor.
    const unresolved = '<img srcset="apple.png,pear.png 1x,2x">';
    const r = inlineHtml(unresolved, options);
    expect(r.replacements).toEqual([]);
    expect(r.diagnostics.map((d) => d.originalUrl)).toEqual(['apple.png,pear.png', '2x']);
  });

  it('allows adjacency after a descriptor comma but does not repair missing separators', () => {
    const html = '<img srcset="apple.png 1x,pear.png 2x">';
    expect(inlineHtml(html, options).content).toBe(
      html.replace('apple.png', dataUrl('apple.png')).replace('pear.png', dataUrl('pear.png')),
    );
    const malformed = '<img srcset="apple.png 1x pear.png 2x">';
    const resolver = vi.fn<AssetResolverSync>(() => undefined);
    expect(inlineHtml(malformed, { ...options, resolver }).content).toBe(malformed);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('preserves descriptorless data URLs and trailing/repeated separators', () => {
    const html = '<img srcset=" ,,, data:text/plain,a,b,,, \tapple,pear.png,,,\n pear.png,  ,">';
    const result = inlineHtml(html, options);
    expect(result.content).toBe(
      html.replace('apple,pear.png', dataUrl('apple,pear.png')).replace('pear.png,  ,', `${dataUrl('pear.png')},  ,`),
    );
    expect(result.replacements.map((r) => r.originalUrl)).toEqual(['apple,pear.png', 'pear.png']);
    expect(result.diagnostics).toEqual([]);
  });

  it('commas in descriptor parentheses do not expose decoy candidates; parsing resumes after the outer separator', () => {
    const html = '<img srcset="apple.png (bad,pear.png), apple,pear.png 2x">';
    const result = inlineHtml(html, options);
    expect(result.content).toBe(html.replace('apple,pear.png 2x', `${dataUrl('apple,pear.png')} 2x`));
    expect(result.replacements.map((r) => r.originalUrl)).toEqual(['apple,pear.png']);
  });

  it.each([' ', '\t', '\n', '\f', '\r', '\r\n', '&#9;', '&#10;', '&#12;', '&#13;', '&#32;', '&Tab;', '&NewLine;'])(
    'uses ASCII whitespace %j with source-mapped duplicates',
    (space) => {
      const raw = 'é&comma;pear.png';
      const html = `<img srcset="${raw}${space}1x,\n${raw}${space}2x">`;
      const result = inlineHtml(html, options);
      expect(result.content).toBe(html.replaceAll(raw, dataUrl('é,pear.png')));
      expect(result.replacements.map((r) => r.originalUrl)).toEqual(['é,pear.png', 'é,pear.png']);
      const first = html.indexOf(raw);
      const second = html.indexOf(raw, first + 1);
      expect(result.replacements.map((r) => r.location)).toEqual(
        [first, second].map((offset) => ({
          offset,
          line: html.slice(0, offset).split('\n').length,
          column: offset - html.lastIndexOf('\n', offset - 1),
        })),
      );
    },
  );

  it('non-ASCII whitespace stays inside a complete URL token', () => {
    const html = '<img srcset="apple.png&nbsp;1x,pear.png">';
    const result = inlineHtml(html, options);
    expect(result.content).toBe(html);
    expect(result.diagnostics.map((d) => d.originalUrl)).toEqual(['apple.png\u00a01x,pear.png']);
  });

  it('decoder fallback preserves unknown named references and remote spelling around a local candidate', () => {
    const html =
      '<source srcset="https://example.test/&CounterClockwiseContourIntegral;,pear.png 1x, apple&comma;pear.png&#13;2x">';
    const result = inlineHtml(html, options);
    expect(result.content).toBe(html.replace('apple&comma;pear.png', dataUrl('apple,pear.png')));
    expect(result.replacements[0]!.location!.offset).toBe(html.indexOf('apple&comma;pear.png'));
    expect(result.replacements.map((r) => r.originalUrl)).toEqual(['apple,pear.png']);
  });

  it('entity commas can delimit candidates only at the end of URL tokens', () => {
    const html = '<img srcset="apple&comma;pear.png&comma;&#32;pear.png&#44;&#44;">';
    const result = inlineHtml(html, options);
    expect(result.content).toBe(
      `<img srcset="${dataUrl('apple,pear.png')}&comma;&#32;${dataUrl('pear.png')}&#44;&#44;">`,
    );
    expect(result.replacements.map((r) => r.location!.offset)).toEqual([
      html.indexOf('apple'),
      html.lastIndexOf('pear.png'),
    ]);
  });

  it.each(['apple,pear.png', 'apple&comma;pear.png&#32;1x', 'apple&comma;pear.png&#13;1x'])(
    'quotes unquoted input %s with exact output accounting',
    (srcset) => {
      const html = `<img srcset=${srcset} alt=keep>`;
      const result = inlineHtml(html, options);
      const expected = `<img srcset="${srcset.replace(/apple(?:,|&comma;)pear.png/, dataUrl('apple,pear.png'))}" alt=keep>`;
      expect(result.content).toBe(expected);
      const exact = Buffer.byteLength(expected);
      expect(inlineHtml(html, { ...options, maxOutputBytes: exact }).content).toBe(expected);
      expect(() => inlineHtml(html, { ...options, maxOutputBytes: exact - 1 })).toThrow(
        expect.objectContaining({
          code: 'RESOURCE_LIMIT',
          limit: exact - 1,
          actual: exact,
        }),
      );
      const tree = parse5.parseFragment(result.content);
      expect((tree.childNodes[0] as parse5.DefaultTreeAdapterMap['element']).attrs.map((a) => a.name)).toEqual([
        'srcset',
        'alt',
      ]);
    },
  );

  it.each([false, true])(
    'full-tree serialization keeps invalid candidates and single-decoded entities (missing srcset location: %s)',
    (missingLocation) => {
      const html =
        '<source srcset=" , https://example.test/&CounterClockwiseContourIntegral;,pear.png 1x, apple.png (bad,pear.png), &eacute;&comma;pear.png&#13;2x, &eacute;&comma;pear.png 3x"><img src="apple.png">';
      const parse = parse5.parseFragment;
      const before = parse(html);
      const spy = vi.spyOn(parse5, 'parseFragment').mockImplementationOnce((...args) => {
        const tree = parse(...args);
        tree.childNodes[missingLocation ? 0 : 1]!.sourceCodeLocation = undefined;
        return tree;
      });
      let result;
      try {
        result = inlineHtml(html, options);
      } finally {
        spy.mockRestore();
      }
      const after = parse(result.content);
      const value = (tree: typeof before) =>
        (tree.childNodes[0] as parse5.DefaultTreeAdapterMap['element']).attrs[0]!.value;
      // Full-tree serialization may normalize CR to LF on reparse; both are
      // ASCII descriptor whitespace, with identical srcset token semantics.
      expect(value(after)).toBe(value(before).replaceAll('é,pear.png', dataUrl('é,pear.png')).replaceAll('\r', '\n'));
      expect(result.replacements.map((r) => r.originalUrl)).toEqual(['é,pear.png', 'é,pear.png', 'apple.png']);
      expect(result.replacements.slice(0, 2).map((r) => r.location!.offset)).toEqual(
        missingLocation ? [-1, -1] : [html.indexOf('&eacute;'), html.lastIndexOf('&eacute;')],
      );
      expect(result.diagnostics).toEqual([]);
    },
  );
});

describe('AIR-02: file paths', () => {
  for (const [mode, run] of [
    ['async', inlineFiles],
    ['sync', inlineFilesSync],
  ] as const) {
    it(`${mode}: preserves srcset identity and decoded source offsets`, async () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-inliner-srcset-'));
      try {
        const target = path.join(tmp, 'page.html');
        // Real whole-name assets and a different-content suffix decoy under
        // exact path lookup (no basename compatibility mode).
        for (const name of ['apple,pear.png', 'pear.png']) fs.writeFileSync(path.join(tmp, name), name);
        const fileCatalog = createAssetCatalogSync([path.join(tmp, 'apple,pear.png'), path.join(tmp, 'pear.png')]);
        const fileOptions = { catalog: fileCatalog, documentPath: target };
        const html =
          '<picture><source srcset="apple&comma;pear.png&#13;1x, https://example.test/a,pear.png 2x"><img srcset="apple,pear.png 1x, apple,pear.png 2x"></picture>';
        fs.writeFileSync(target, html);
        const pure = inlineHtml(html, fileOptions);
        const results = await run({ catalog: fileCatalog, targets: [target], write: true });
        expect(results[0]!.written).toBe(true);
        expect(results[0]!.content).toBe(pure.content);
        expect(results[0]!.replacements).toEqual(pure.replacements);
        expect(results[0]!.replacements).toHaveLength(3);
        expect(results[0]!.diagnostics).toEqual([]);
        expect(fs.readFileSync(target, 'utf8')).toBe(pure.content);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
});
