import { afterEach, describe, expect, it, vi } from 'vitest';
import * as parse5 from 'parse5';
import path from 'node:path';
import { createAssetCatalogSync } from '../src/catalog.ts';
import { inlineHtml } from '../src/html.ts';

vi.mock('parse5', async (importOriginal) => ({ ...(await importOriginal<typeof import('parse5')>()) }));

const catalog = createAssetCatalogSync([{ filename: 'a.png', data: new Uint8Array(10 * 1024).fill(0x61) }]);
const asset = catalog.assets[0]!;
const options = { catalog, allowBasenameMatch: true };
afterEach(() => vi.restoreAllMocks());

describe('AIR-05: HTML assembly preserves source and metadata', () => {
  it.each(['src', 'srcset'] as const)('%s: repeated entity tokens retain bytes, locations and exact limits', (attr) => {
    const refs = 128;
    const raw = 'a&#46;png';
    const input =
      attr === 'src'
        ? `<!-- é😀 -->\n${`<IMG SRC='${raw}' title="é&amp;">\n`.repeat(refs)}<!-- fin -->`
        : `<!-- é😀 -->\n<SOURCE srcset='${Array.from({ length: refs }, (_, i) => `${raw} ${i + 1}w`).join(',&#32;')}' title="é&amp;">`;
    const expected = input.replaceAll(raw, asset.dataUrl);
    const result = inlineHtml(input, options);
    expect(result.content).toBe(expected);
    expect(result.modified).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.replacements).toEqual(
      [...input.matchAll(/a&#46;png/g)].map((match) => {
        const offset = match.index!;
        return {
          originalUrl: 'a.png',
          resolvedPath: path.resolve('a.png'),
          mediaType: asset.mediaType,
          kind: asset.kind,
          byteLength: asset.byteLength,
          location: {
            offset,
            line: input.slice(0, offset).split('\n').length,
            column: offset - input.lastIndexOf('\n', offset),
          },
        };
      }),
    );
    const exact = Buffer.byteLength(expected);
    expect(inlineHtml(input, { ...options, maxOutputBytes: exact, maxReplacements: refs })).toEqual(result);
    expect(() => inlineHtml(input, { ...options, maxOutputBytes: exact - 1 })).toThrow(
      expect.objectContaining({ code: 'RESOURCE_LIMIT', actual: exact, limit: exact - 1 }),
    );
    expect(() => inlineHtml(input, { ...options, maxReplacements: refs - 1 })).toThrow(
      expect.objectContaining({ code: 'RESOURCE_LIMIT', actual: refs, limit: refs - 1 }),
    );
  });

  it('empty patch sets preserve unusual source spelling and empty input', () => {
    for (const input of ['', `<!-- é😀 --><IMG SRC='https://example.test/a.png'><p unclosed`]) {
      expect(inlineHtml(input, options)).toEqual({
        content: input,
        modified: false,
        replacements: [],
        diagnostics: [],
      });
    }
  });

  it('overlapping source locations serialize the mutated tree instead of applying either patch', () => {
    const input = `<IMG src='a.png'>`;
    const parse = parse5.parseFragment;
    vi.spyOn(parse5, 'parseFragment').mockImplementationOnce((...args) => {
      const tree = parse(...args);
      const first = tree.childNodes[0] as parse5.DefaultTreeAdapterMap['element'];
      // Two independent elements with the same source range create genuine
      // overlapping patches while retaining a valid tree for serialization.
      tree.childNodes.push({ ...first, attrs: first.attrs.map((attr) => ({ ...attr })) });
      return tree;
    });
    const serialize = vi.spyOn(parse5, 'serialize');
    const result = inlineHtml(input, options);
    expect(serialize).toHaveBeenCalledOnce();
    expect(result.content).toBe(`<img src="${asset.dataUrl}">`.repeat(2));
    expect(result.replacements).toHaveLength(2);
    expect(result.replacements[0]).toEqual(result.replacements[1]);
    expect(result.replacements[0]!.location).toEqual({ offset: 10, line: 1, column: 11 });
    expect(result.diagnostics).toEqual([]);
  });

  it.each(['missing', 'out of bounds', 'fractional'] as const)(
    'invalid %s source locations retain serialization fallback',
    (mode) => {
      const input = `<IMG src='a.png'>`;
      const parse = parse5.parseFragment;
      vi.spyOn(parse5, 'parseFragment').mockImplementationOnce((...args) => {
        const tree = parse(...args);
        const element = tree.childNodes[0] as parse5.DefaultTreeAdapterMap['element'];
        if (mode === 'missing') element.sourceCodeLocation = undefined;
        else {
          const loc = element.sourceCodeLocation!.attrs!.src!;
          if (mode === 'out of bounds') loc.endOffset = input.length + 1;
          else loc.startOffset += 0.5;
        }
        return tree;
      });
      const serialize = vi.spyOn(parse5, 'serialize');
      const result = inlineHtml(input, options);
      expect(serialize).toHaveBeenCalledOnce();
      expect(result.content).toBe(`<img src="${asset.dataUrl}">`);
      expect(result.modified).toBe(true);
      expect(result.replacements).toHaveLength(1);
      expect(result.diagnostics).toEqual([]);
    },
  );

  it('serialization fallback still enforces final output bytes including added quotes', () => {
    const input = '<IMG src=a.png>';
    const expected = `<img src="${asset.dataUrl}">`;
    const exact = Buffer.byteLength(expected);
    const parse = parse5.parseFragment;
    vi.spyOn(parse5, 'parseFragment').mockImplementation((...args) => {
      const tree = parse(...args);
      tree.childNodes[0]!.sourceCodeLocation = undefined;
      return tree;
    });
    expect(inlineHtml(input, { ...options, maxOutputBytes: exact }).content).toBe(expected);
    expect(() => inlineHtml(input, { ...options, maxOutputBytes: exact - 1 })).toThrow(
      expect.objectContaining({
        code: 'RESOURCE_LIMIT',
        actual: exact,
        limit: exact - 1,
        message: expect.stringContaining('Transformed output bytes'),
      }),
    );
  });
});
