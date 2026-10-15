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

describe('DPH-04 bounded, unambiguous nonce storage', () => {
  it.each(
    [
      '',
      ' ',
      ' leading',
      'trailing ',
      'two nonces',
      'two\tnonces',
      'one,two',
      'one, two',
      '"quoted"',
      'back\\slash',
      'line\r\nbreak',
      'del\x7f',
      'non-ascii-é',
      'x'.repeat(513),
      null,
      undefined,
      123,
      ['nonce'],
    ].map((nonce) => ({ nonce })),
  )('rejects $nonce without replacing a usable nonce', ({ nonce }) => {
    const cache = new DpopNonceCache();
    cache.remember('space', 'jkt', 'usable');
    expect(cache.remember('space', 'jkt', nonce as string | null)).toBe(false);
    expect(cache.get('space', 'jkt')).toBe('usable');
  });

  it('rejects coalesced duplicate DPoP-Nonce fields, including identical values', () => {
    const cache = new DpopNonceCache();
    for (const second of ['first', 'second']) {
      const headers = new Headers([
        ['DPoP-Nonce', 'first'],
        ['DPoP-Nonce', second],
      ]);
      expect(cache.remember('space', 'jkt', headers.get('DPoP-Nonce'))).toBe(false);
    }
    expect(cache.get('space', 'jkt')).toBeUndefined();
  });

  it.each(['!', 'opaque/+._-===', 'x'.repeat(512)])(
    'accepts bounded opaque nonce %s without interpreting its contents',
    (nonce) => {
      const cache = new DpopNonceCache();
      expect(cache.remember('space', 'jkt', nonce)).toBe(true);
      expect(cache.get('space', 'jkt')).toBe(nonce);
    },
  );

  it('keeps 64 entries and evicts the oldest remembered tuple; reads do not promote it', () => {
    const cache = new DpopNonceCache();
    for (let index = 0; index < 64; index++) cache.remember(`space-${index}`, 'jkt', `nonce-${index}`);
    expect(cache.get('space-0', 'jkt')).toBe('nonce-0');
    cache.remember('next-space', 'jkt', 'next');
    expect(cache.get('space-0', 'jkt')).toBeUndefined();
    for (let index = 1; index < 64; index++) expect(cache.get(`space-${index}`, 'jkt')).toBe(`nonce-${index}`);
    expect(cache.get('next-space', 'jkt')).toBe('next');
  });

  it('a valid replacement renews write order, but invalid writes neither promote nor evict', () => {
    const cache = new DpopNonceCache();
    for (let index = 0; index < 64; index++) cache.remember('space', `jkt-${index}`, `nonce-${index}`);
    cache.remember('space', 'jkt-0', 'replacement');
    expect(cache.remember('space', 'jkt-1', 'ambiguous,nonce')).toBe(false);
    expect(cache.remember('new-space', 'jkt', 'ambiguous,nonce')).toBe(false);
    expect(cache.get('space', 'jkt-1')).toBe('nonce-1');
    cache.remember('new-space', 'jkt', 'next');
    expect(cache.get('space', 'jkt-1')).toBeUndefined();
    expect(cache.get('space', 'jkt-0')).toBe('replacement');
    cache.clear();
    expect(cache.get('space', 'jkt-0')).toBeUndefined();
    expect(cache.get('new-space', 'jkt')).toBeUndefined();
  });
});
