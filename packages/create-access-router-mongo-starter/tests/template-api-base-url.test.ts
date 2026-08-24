// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeApiBaseURL } from '../template/src/shared/normalize-api-base-url';

describe('normalizeApiBaseURL', () => {
  it('defaults to /api when unset', () => {
    expect(normalizeApiBaseURL(undefined)).toBe('/api');
  });

  it('trims outer whitespace and trailing slashes', () => {
    expect(normalizeApiBaseURL('  /custom/api//  ')).toBe('/custom/api');
  });

  it('collapses an empty string back to /api', () => {
    expect(normalizeApiBaseURL('   ')).toBe('/api');
  });

  it.each([
    'https://example.test/api',
    '//example.test/api',
    'api',
    '/',
    '/api?version=1',
    '/api#fragment',
    '/api\\todos',
    '/api/./todos',
    '/api/../todos',
    '/api/%2e%2e/todos',
    '/api/%2Ftodos',
    '/api//todos',
  ])('rejects a non-path-prefix value: %s', (value) => {
    expect(() => normalizeApiBaseURL(value)).toThrow(/API_BASE_URL/u);
  });
});
