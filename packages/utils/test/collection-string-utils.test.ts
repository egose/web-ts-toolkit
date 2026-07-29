import { describe, expect, it } from 'vitest';
import eachRight from '../src/eachRight';
import groupBy from '../src/groupBy';
import join from '../src/join';
import mapKeys from '../src/mapKeys';
import pickBy from '../src/pickBy';
import startCase from '../src/startCase';
import sum from '../src/sum';
import sumBy from '../src/sumBy';
import upperCase from '../src/upperCase';

describe('collection and string helpers', () => {
  it('iterates collections from right to left', () => {
    const arrayVisits: string[] = [];
    const numbers = [1, 2, 3];

    expect(
      eachRight(numbers, (value, index) => {
        arrayVisits.push(`${index}:${value}`);
      }),
    ).toBe(numbers);
    expect(arrayVisits).toEqual(['2:3', '1:2', '0:1']);

    const objectVisits: string[] = [];
    const record = { first: 'Ada', second: 'Grace', third: 'Linus' };
    eachRight(record, (value, key) => {
      objectVisits.push(`${key}:${value}`);
      if (key === 'second') {
        return false;
      }
    });

    expect(objectVisits).toEqual(['third:Linus', 'second:Grace']);
    expect(eachRight(null, () => true)).toBeNull();
  });

  it('groups values with property-path and function iteratees', () => {
    expect(
      groupBy(
        [
          { type: 'fruit', name: 'apple' },
          { type: 'vegetable', name: 'carrot' },
          { type: 'fruit', name: 'banana' },
        ],
        'type',
      ),
    ).toEqual({
      fruit: [
        { type: 'fruit', name: 'apple' },
        { type: 'fruit', name: 'banana' },
      ],
      vegetable: [{ type: 'vegetable', name: 'carrot' }],
    });

    expect(groupBy({ a: 1, b: 2, c: 3 }, (value) => (value % 2 === 0 ? 'even' : 'odd'))).toEqual({
      odd: [1, 3],
      even: [2],
    });

    expect(groupBy(null, 'type')).toEqual({});
  });

  it('maps and filters object keys', () => {
    expect(mapKeys({ firstName: 'Ada', lastName: 'Lovelace' }, (_, key) => `user_${key}`)).toEqual({
      user_firstName: 'Ada',
      user_lastName: 'Lovelace',
    });

    expect(pickBy({ empty: '', enabled: true, count: 0, label: 'ready' }, (value) => Boolean(value))).toEqual({
      enabled: true,
      label: 'ready',
    });

    expect(mapKeys(null, () => 'ignored')).toEqual({});
    expect(pickBy(undefined, () => true)).toEqual({});
  });

  it('sums numeric collections', () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum(null)).toBe(0);

    const items: Array<{ hours?: number }> = [{ hours: 2 }, {}, { hours: 3 }];
    expect(sumBy(items, 'hours')).toBe(5);
    expect(sumBy(items, (item) => item.hours)).toBe(5);
    expect(sumBy(null, 'hours')).toBe(0);
  });

  it('converts strings into title and uppercase words', () => {
    expect(startCase('fooBar_baz-qux')).toBe('Foo Bar Baz Qux');
    expect(startCase('__FOO_BAR__')).toBe('FOO BAR');
    expect(startCase(undefined)).toBe('');

    expect(upperCase('fooBar_baz-qux')).toBe('FOO BAR BAZ QUX');
    expect(upperCase('__FOO_BAR__')).toBe('FOO BAR');
    expect(upperCase(undefined)).toBe('');
  });

  it('joins arrays with the requested separator', () => {
    expect(join(['Ada', 'Grace', 'Linus'])).toBe('Ada,Grace,Linus');
    expect(join(['Ada', 'Grace', 'Linus'], ' | ')).toBe('Ada | Grace | Linus');
    expect(join([1, null, undefined], '-')).toBe('1--');
    expect(join(null)).toBe('');
  });
});
