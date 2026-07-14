// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isExcluded, normalize, EXCLUDED_PATHS } from '../scripts/stage-template';

describe('normalize', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalize('node_modules\\foo\\bar')).toBe('node_modules/foo/bar');
  });

  it('leaves forward slashes unchanged', () => {
    expect(normalize('src/index.ts')).toBe('src/index.ts');
  });

  it('handles mixed separators', () => {
    expect(normalize('src\\api/utils')).toBe('src/api/utils');
  });
});

describe('isExcluded', () => {
  it('exacts match on excluded path names', () => {
    expect(isExcluded('node_modules')).toBe(true);
    expect(isExcluded('dist')).toBe(true);
    expect(isExcluded('.netlify')).toBe(true);
    expect(isExcluded('netlify')).toBe(true);
    expect(isExcluded('netlify.toml')).toBe(true);
    expect(isExcluded('api/functions')).toBe(true);
    expect(isExcluded('.tmp')).toBe(true);
  });

  it('excludes paths under excluded directories', () => {
    expect(isExcluded('node_modules/react/index.js')).toBe(true);
    expect(isExcluded('dist/template/index.html')).toBe(true);
    expect(isExcluded('.netlify/state.json')).toBe(true);
    expect(isExcluded('api/functions/main.cjs')).toBe(true);
  });

  it('does not exclude non-matching paths', () => {
    expect(isExcluded('src/index.ts')).toBe(false);
    expect(isExcluded('api/app.ts')).toBe(false);
    expect(isExcluded('tests/setup.ts')).toBe(false);
    expect(isExcluded('package.json')).toBe(false);
  });

  it('does not match partial directory names', () => {
    expect(isExcluded('node_modules_extra/foo')).toBe(false);
    expect(isExcluded('dist-bak/index.html')).toBe(false);
  });
});

describe('EXCLUDED_PATHS', () => {
  it('contains the expected entries', () => {
    expect(EXCLUDED_PATHS).toContain('node_modules');
    expect(EXCLUDED_PATHS).toContain('dist');
    expect(EXCLUDED_PATHS).toContain('.netlify');
    expect(EXCLUDED_PATHS).toContain('netlify');
    expect(EXCLUDED_PATHS).toContain('netlify.toml');
    expect(EXCLUDED_PATHS).toContain('api/functions');
    expect(EXCLUDED_PATHS).toContain('.tmp');
  });
});
