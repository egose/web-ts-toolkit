import { describe, expect, it } from 'vitest';
import addLeadingSlash from '../src/addLeadingSlash';
import normalizeUrlPath from '../src/normalizeUrlPath';
import parseBooleanString from '../src/parseBooleanString';
import removeConsecutiveSlashesFromUrl from '../src/removeConsecutiveSlashesFromUrl';

// UTILS-11 executable documentation examples: every behavior asserted here
// is quoted in packages/utils/README.md and website/docs/packages/utils.md.
describe('documented boolean and URL contracts', () => {
  it('parses only the exact string "true" as true', () => {
    expect(parseBooleanString('true')).toBe(true);
    expect(parseBooleanString('true', false)).toBe(true);
    expect(parseBooleanString('false')).toBe(false);
    expect(parseBooleanString('false', true)).toBe(false);
    expect(parseBooleanString('TRUE')).toBe(false);
    expect(parseBooleanString('1')).toBe(false);
  });

  it('treats empty string like missing input, not like "false"', () => {
    expect(parseBooleanString('')).toBeUndefined();
    expect(parseBooleanString('', true)).toBe(true);
    expect(parseBooleanString('', false)).toBe(false);
    expect(parseBooleanString(undefined)).toBeUndefined();
    expect(parseBooleanString(undefined, true)).toBe(true);
    expect(parseBooleanString(undefined, false)).toBe(false);
  });

  it('normalizes pathname fragments', () => {
    expect(normalizeUrlPath('api//users')).toBe('/api/users');
    expect(normalizeUrlPath('api//users/42')).toBe('/api/users/42');
    expect(normalizeUrlPath('/already/clean')).toBe('/already/clean');
    expect(removeConsecutiveSlashesFromUrl('api//users')).toBe('api/users');
    expect(addLeadingSlash('api')).toBe('/api');
    expect(addLeadingSlash('/api')).toBe('/api');
    expect(addLeadingSlash('')).toBe('/');
  });

  it('documents that full URLs are out of domain (unsupported, not normalized)', () => {
    // Pathname-only contract: slash runs collapse everywhere, including the
    // scheme, and a leading slash is always added. Full-URL input is mangled
    // rather than normalized; pass path fragments only.
    expect(removeConsecutiveSlashesFromUrl('https://example.com//a')).toBe('https:/example.com/a');
    expect(normalizeUrlPath('https://example.com//a')).toBe('/https:/example.com/a');
    expect(normalizeUrlPath('/a?x=1//2')).toBe('/a?x=1/2');
    expect(normalizeUrlPath('/a#frag//x')).toBe('/a#frag/x');
  });
});
