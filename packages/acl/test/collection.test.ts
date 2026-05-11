import { describe, expect, it } from 'vitest';

import { matchElement } from '../src/helpers/collection';

describe('collection helpers', () => {
  it('evaluates matchElement predicates using sift semantics', () => {
    const element = {
      _id: 'user-1',
      role: 'user',
      public: false,
      tags: ['member'],
    };

    expect(matchElement(element, { _id: 'user-1' })).toBe(true);
    expect(matchElement(element, { role: 'admin' })).toBe(false);
    expect(matchElement(element, { tags: { $in: ['member'] } })).toBe(true);
    expect(matchElement(element, { $or: [{ public: true }, { role: 'admin' }] })).toBe(false);
  });
});
