import { describe, expect, it } from 'vitest';
import { assembleSourcePatches, type SourcePatch } from '../src/source-patches.ts';

describe('source-coordinate patch assembly', () => {
  it('sorts without mutating, accepting adjacent spans at both source boundaries', () => {
    const patches = Object.freeze([
      Object.freeze({ start: 2, end: 4, newValue: 'last' }),
      Object.freeze({ start: 0, end: 1, newValue: 'first' }),
      Object.freeze({ start: 1, end: 2, newValue: '' }),
    ]);
    expect(assembleSourcePatches('abcd', patches)).toBe('firstlast');
    expect(patches.map((patch) => patch.start)).toEqual([2, 0, 1]);
    expect(assembleSourcePatches('abcd', [{ start: 0, end: 4, newValue: '' }])).toBe('');
  });

  it('uses UTF-16 source offsets while preserving untouched multibyte text and entities', () => {
    const input = 'é😀a&amp;b中';
    expect(
      assembleSourcePatches(input, [
        { start: 9, end: 10, newValue: '😀' },
        { start: 3, end: 4, newValue: '界' },
      ]),
    ).toBe('é😀界&amp;😀中');
  });

  it.each(['', 'é😀&amp;\r\n'])('returns the original content for an empty patch list (%j)', (input) => {
    expect(assembleSourcePatches(input, [])).toBe(input);
  });

  it.each([
    [-1, 1],
    [0, 5],
    [2, 2],
    [3, 2],
    [0.5, 2],
    [0, 2.5],
    [NaN, 2],
    [0, NaN],
    [Infinity, 2],
    [0, Infinity],
    [Number.MAX_SAFE_INTEGER + 1, 2],
    [0, Number.MAX_SAFE_INTEGER + 1],
  ])('rejects invalid span [%s, %s) without partially applying valid patches', (start, end) => {
    expect(
      assembleSourcePatches('abcd', [
        { start: 2, end: 3, newValue: 'valid' },
        { start, end, newValue: 'invalid' },
      ]),
    ).toBeNull();
  });

  it.each([
    {
      spans: [
        [0, 2],
        [1, 3],
      ],
    }, // partial overlap
    {
      spans: [
        [0, 4],
        [1, 2],
      ],
    }, // containment
    {
      spans: [
        [0, 2],
        [0, 2],
      ],
    }, // duplicate range
  ])('rejects overlapping spans $spans', ({ spans }) => {
    const patches: SourcePatch[] = spans.map(([start, end]) => ({ start: start!, end: end!, newValue: 'x' }));
    expect(assembleSourcePatches('abcd', patches)).toBeNull();
  });
});
