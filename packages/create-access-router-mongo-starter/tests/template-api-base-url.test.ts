// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeApiBaseURL } from '../template/src/shared/normalize-api-base-url';

describe('normalizeApiBaseURL', () => {
  it('defaults to /api when unset', () => {
    expect(normalizeApiBaseURL(undefined)).toBe('/api');
  });

  it('trims whitespace and surrounding slashes', () => {
    expect(normalizeApiBaseURL('  //custom/api//  ')).toBe('/custom/api');
  });

  it('collapses an empty string back to /api', () => {
    expect(normalizeApiBaseURL('   ')).toBe('/api');
  });
});
