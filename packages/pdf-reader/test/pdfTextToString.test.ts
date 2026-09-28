import { describe, expect, it } from 'vitest';

import { pdfTextToString } from '../src/pdfTextToString';
import type { PdfTextContent } from '../src/types';

type TextItem = Extract<PdfTextContent['items'][number], { str: string }>;

function text(str: string, hasEOL = false): TextItem {
  return { str, hasEOL, dir: 'ltr', transform: [1, 0, 0, 1, 0, 0], width: 0, height: 0, fontName: 'test' };
}

describe('pdfTextToString', () => {
  it.each<{ name: string; items: PdfTextContent['items']; expected: string }>([
    { name: 'empty content', items: [], expected: '' },
    { name: 'fragmented words without guessed spaces', items: [text('frag'), text('ment')], expected: 'fragment' },
    {
      name: 'explicit spaces, tabs, and trailing whitespace',
      items: [text('  one'), text(' '), text('\t two  ')],
      expected: '  one \t two  ',
    },
    { name: 'line breaks between text items', items: [text('one', true), text('two')], expected: 'one\ntwo' },
    { name: 'a final EOL', items: [text('one', true)], expected: 'one\n' },
    {
      name: 'empty EOL items including leading and trailing blank lines',
      items: [text('', true), text('one'), text('', true), text('', true)],
      expected: '\none\n\n',
    },
    { name: 'empty items without EOL', items: [text(''), text('one'), text('')], expected: 'one' },
    { name: 'supplied newlines without deduplication', items: [text('one\r\n', true)], expected: 'one\r\n\n' },
    {
      name: 'marked-content entries interleaved with fragments',
      items: [
        { type: 'beginMarkedContent', id: '' },
        text('frag'),
        { type: 'beginMarkedContentProps', id: 'p1_mc0' },
        text('ment', true),
        { type: 'endMarkedContent', id: '' },
      ],
      expected: 'fragment\n',
    },
    { name: 'marker-only content', items: [{ type: 'endMarkedContent', id: '' }], expected: '' },
    {
      name: 'Unicode and supplied order regardless of direction or geometry',
      items: [
        { ...text('日本語 🧑🏽‍💻 e\u0301\u00a0'), transform: [1, 0, 0, 1, 100, 100] },
        { ...text('שלום'), dir: 'rtl', transform: [1, 0, 0, 1, 0, 0] },
      ],
      expected: '日本語 🧑🏽‍💻 e\u0301\u00a0שלום',
    },
  ])('assembles $name without mutating input', ({ items, expected }) => {
    const content: PdfTextContent = { items, styles: {}, lang: null };
    const before = structuredClone(content);
    for (const item of items) Object.freeze(item);
    Object.freeze(items);
    Object.freeze(content);

    expect(pdfTextToString(content)).toBe(expected);
    expect(pdfTextToString(content)).toBe(expected);
    expect(content).toEqual(before);
  });

  it('accepts PDF.js XFA-style string items without geometry or hasEOL', () => {
    // PDF.js XfaText emits { str } at runtime despite its narrower TextItem declaration.
    const content = { items: [{ str: 'XFA' }, { str: ' ' }, { str: 'text' }], styles: {}, lang: null };
    expect(pdfTextToString(content as PdfTextContent)).toBe('XFA text');
  });
});
