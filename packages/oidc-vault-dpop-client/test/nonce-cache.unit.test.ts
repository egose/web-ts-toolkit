import { describe, expect, it } from 'vitest';

import { DpopNonceCache } from '../src/nonce-cache';

describe('CLIENT-05 DpopNonceCache per (space,jkt)', () => {
  it('returns undefined before anything is remembered', () => {
    const cache = new DpopNonceCache();
    expect(cache.get('space', 'jkt')).toBeUndefined();
  });

  it('remembers and returns a valid nonce', () => {
    const cache = new DpopNonceCache();
    expect(cache.remember('space', 'jkt', 'server-nonce')).toBe(true);
    expect(cache.get('space', 'jkt')).toBe('server-nonce');
  });

  it('isolates entries per space and per jkt', () => {
    const cache = new DpopNonceCache();
    expect(cache.remember('space-a', 'jkt-1', 'nonce-a')).toBe(true);
    expect(cache.get('space-a', 'jkt-1')).toBe('nonce-a');
    expect(cache.get('space-b', 'jkt-1')).toBeUndefined();
    expect(cache.get('space-a', 'jkt-2')).toBeUndefined();
    expect(cache.remember('space-a', 'jkt-2', 'nonce-b')).toBe(true);
    expect(cache.get('space-a', 'jkt-1')).toBe('nonce-a');
    expect(cache.get('space-a', 'jkt-2')).toBe('nonce-b');
  });

  it.each([[''], ['x'.repeat(513)], ['bad\r\n'], [null]] as const)(
    'rejects invalid nonce %j without clobbering the stored value',
    (nonce) => {
      const cache = new DpopNonceCache();
      expect(cache.remember('space', 'jkt', 'good')).toBe(true);
      expect(cache.remember('space', 'jkt', nonce)).toBe(false);
      expect(cache.get('space', 'jkt')).toBe('good');
    },
  );

  it('clear() drops every remembered nonce', () => {
    const cache = new DpopNonceCache();
    expect(cache.remember('space-a', 'jkt-1', 'nonce-a')).toBe(true);
    expect(cache.remember('space-b', 'jkt-2', 'nonce-b')).toBe(true);
    cache.clear();
    expect(cache.get('space-a', 'jkt-1')).toBeUndefined();
    expect(cache.get('space-b', 'jkt-2')).toBeUndefined();
  });
});
