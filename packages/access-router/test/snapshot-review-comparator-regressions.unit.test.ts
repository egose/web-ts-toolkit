import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import { copyAuthorizationValue, matchesAuthorizationSnapshot } from '../src/acl/authorization-snapshot';

describe('SNAPCPU-05 array comparison observation order', () => {
  it.each(
    ['4294967295', '999999999999999999999'].flatMap((key) =>
      [false, true].map((repairIndex) => ({ key, repairIndex })),
    ),
  )('compares non-index numeric property $key before array indices (repair: $repairIndex)', ({ key, repairIndex }) => {
    function run(match: typeof matchesAuthorizationSnapshot) {
      const events: string[] = [];
      const value = Object.assign([1], { [key]: 'extra' });
      const snapshot = [2];
      Object.defineProperty(snapshot, key, {
        enumerable: true,
        get() {
          events.push('extra getter');
          if (repairIndex) snapshot[0] = 1;
          return 'extra';
        },
      });
      const result = match(value, snapshot);
      return { result, events, first: snapshot[0] };
    }
    const previous = run((value, snapshot) => isDeepStrictEqual(copyAuthorizationValue(value, 'document'), snapshot));
    expect(previous).toEqual({ result: repairIndex, events: ['extra getter'], first: repairIndex ? 1 : 2 });
    expect(run(matchesAuthorizationSnapshot)).toEqual(previous);
  });
});
