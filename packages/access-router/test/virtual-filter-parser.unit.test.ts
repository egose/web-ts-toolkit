import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import '../src/core';
import { stripSubVirtualKeysFromFilter, stripVirtualKeysFromFilter } from '../src/services/base';

const leaf = { get: () => 'computed' };
const snapshot = {
  virtuals: {
    display: leaf,
    contacts: { sub: { nick: leaf, notes: { sub: { excerpt: leaf } } } },
  },
};

describe('ARL-02 virtual filter parser boundary', () => {
  it.each([undefined, null, {}, { virtuals: {} }])(
    'preserves all values without virtual definitions (%j)',
    (config) => {
      const filter = {
        reconciliation: {},
        values: [{}, []],
        field: { $eq: {}, $in: [{}], $nin: [], $not: { $eq: [] } },
        $or: [{}, { 'ordinary.sub.value': {} }],
        $and: [],
        absent: undefined,
      };
      expect(stripVirtualKeysFromFilter(filter, config)).toEqual(filter);
    },
  );

  it('prunes only clauses actually emptied by virtual removal, without mutating its input', () => {
    const filter = Object.freeze({
      $or: Object.freeze([Object.freeze({ display: 'ignored' }), Object.freeze({ reconciliation: {} }), {}]),
      contacts: Object.freeze({ nick: 'ignored', payload: Object.freeze({ nick: 'data' }) }),
    });
    expect(stripVirtualKeysFromFilter(filter, snapshot)).toEqual({
      $or: [{ reconciliation: {} }, {}],
      contacts: { payload: { nick: 'data' } },
    });
    expect(filter.$or).toHaveLength(3);
    expect(filter.contacts).toHaveProperty('nick', 'ignored');
  });

  it('leaves operator literals, unknown operators and native operands opaque', () => {
    const when = new Date(1234);
    const id = new mongoose.Types.ObjectId();
    const bytes = Buffer.from('literal');
    const regex = /literal/i;
    const literal = { display: {}, contacts: [{ nick: 'data' }] };
    const filter = {
      display: 'ignored',
      data: { $eq: literal, $in: [{}, literal], $custom: { display: 'data' } },
      contacts: { $eq: { nick: 'data' } },
      when,
      id,
      bytes,
      regex,
      $expr: { $eq: ['$data', { $literal: literal }] },
    };
    const { display: _display, ...expected } = filter;
    const result = stripVirtualKeysFromFilter(filter, snapshot);
    expect(result).toEqual(expected);
    expect(result.when).toBe(when);
    expect(result.id).toBe(id);
    expect(result.bytes).toBe(bytes);
    expect(result.regex).toBe(regex);
  });

  it('resolves dotted/indexed fields only through the registered container scopes', () => {
    expect(
      stripVirtualKeysFromFilter(
        {
          'display.deep': {},
          'contacts.0.nick': { $eq: {} },
          'contacts.notes.excerpt': 'ignored',
          'contacts.payload.nick': {},
          'payload.display': { $eq: { display: 'data' } },
        },
        snapshot,
      ),
    ).toEqual({ 'contacts.payload.nick': {}, 'payload.display': { $eq: { display: 'data' } } });
  });

  it('retains scope through nested query operators but keeps $all data elements', () => {
    expect(
      stripVirtualKeysFromFilter(
        {
          contacts: {
            $not: { $elemMatch: { $and: [{ nick: 'ignored' }, { payload: {} }] } },
            $all: [{ $elemMatch: { nick: 'ignored' } }, {}, { nick: 'data' }],
          },
        },
        snapshot,
      ),
    ).toEqual({
      contacts: { $not: { $elemMatch: { $and: [{ payload: {} }] } }, $all: [{}, { nick: 'data' }] },
    });
  });

  it('preserves terminal false, native roots and malformed query shapes for existing validation', () => {
    for (const filter of [false, null, undefined, 0, 'invalid', /native/, [], [{}], { $or: [] }, { $and: {} }]) {
      expect(stripVirtualKeysFromFilter(filter, snapshot)).toEqual(filter);
    }
    expect(stripVirtualKeysFromFilter({ $or: { display: 'invalid clause' } }, snapshot)).toEqual({
      $or: { display: 'invalid clause' },
    });
    expect(stripVirtualKeysFromFilter({ contacts: { $not: { nick: 'invalid operator' } } }, snapshot)).toEqual({
      contacts: { $not: { nick: 'invalid operator' } },
    });
  });

  it('uses the same rules relative to a dedicated subdocument scope', () => {
    const filter = {
      nick: 'ignored',
      reconciliation: {},
      payload: { $in: [{}, { nick: 'data' }] },
      notes: { $elemMatch: { excerpt: 'ignored', label: 'kept' } },
    };
    expect(stripSubVirtualKeysFromFilter(filter, snapshot, 'contacts')).toEqual({
      reconciliation: {},
      payload: { $in: [{}, { nick: 'data' }] },
      notes: { $elemMatch: { label: 'kept' } },
    });
    expect(stripSubVirtualKeysFromFilter(filter, snapshot, 'unregistered')).toEqual(filter);
    expect(stripSubVirtualKeysFromFilter(false, snapshot, 'contacts')).toBe(false);
  });
});
