import { describe, expect, it } from 'vitest';

import { createAdapter } from '../src';
import type { DottedPathFilter, FilterQuery, ServerSideCast, ModelService, Document } from '../src';

/**
 * ARC-16: Restore useful filter query type safety.
 *
 * The previous `ApplyBasicQueryCasting<T>` terminated in a naked `unknown`
 * and `RootQuerySelector<T>` carried an unrestricted `[key: string]: unknown`
 * index signature, which together made the documented typed-filter API
 * unable to reject invalid values or invalid operators on known fields. ARC-16
 * removes the naked `unknown`, drops the unrestricted index signature, and
 * introduces two deliberate, named escape hatches (`DottedPathFilter<T>` and
 * `ServerSideCast<T>`) for dynamic dotted paths and explicit server-side
 * casting.
 *
 * The assertions below are mostly *type-level*. Vitest strips type-only
 * imports at runtime, so a value that should NOT compile is wrapped in
 * `@ts-expect-error`; a value that SHOULD compile is constructed and either
 * returned or assigned to a `void` use so it survives dead-code elimination.
 * One positive case constructs a real `countAdvanced` lazy request through
 * the public API surface (without awaiting it) so the typed filter threads
 * end-to-end into a real call site, not just a local variable.
 */

interface User extends Document {
  _id?: string;
  name: string;
  role: string;
  public: boolean;
  age: number;
  tags: string[];
  statusHistory: Array<{ _id?: string; label: string; flag: string }>;
}

describe('access-router-client filter query type safety (ARC-16)', () => {
  describe('typed known-field conditions compile (positive)', () => {
    it('accepts a bare scalar equality on a known string field', () => {
      const f: FilterQuery<User> = { name: 'Max' };
      expect(f.name).toBe('Max');
    });

    it('accepts a bare scalar equality on a known boolean field', () => {
      const f: FilterQuery<User> = { public: true };
      expect(f.public).toBe(true);
    });

    it('accepts a bare scalar equality on a known number field', () => {
      const f: FilterQuery<User> = { age: 42 };
      expect(f.age).toBe(42);
    });

    it('accepts an array of scalars on a known string field (server expands to $in)', () => {
      const f: FilterQuery<User> = { role: ['admin', 'maintainer'] };
      expect(Array.isArray(f.role)).toBe(true);
    });

    it('accepts RegExp on a string-typed known field', () => {
      const f: FilterQuery<User> = { name: /^Max/ };
      expect(f.name).toBeInstanceOf(RegExp);
    });

    it('accepts an element-typed bare condition on an array-typed field', () => {
      const f: FilterQuery<User> = { tags: 'vip' };
      expect(f.tags).toBe('vip');
    });

    it('accepts comparison operators valid for the scalar', () => {
      const f: FilterQuery<User> = { age: { $gt: 18, $lte: 65 } };
      expect(f.age?.$gt).toBe(18);
    });

    it('accepts $in/$nin typed element arrays on a scalar', () => {
      const f: FilterQuery<User> = { role: { $in: ['admin', 'maintainer'], $nin: ['banned'] } };
      expect(f.role?.$in).toContain('admin');
    });

    it('accepts $regex/$options on a string-typed field', () => {
      const f: FilterQuery<User> = { name: { $regex: '^Max', $options: 'i' } };
      expect(f.name?.$regex).toBe('^Max');
    });

    it('accepts $exists on any known field', () => {
      const f: FilterQuery<User> = { name: { $exists: true } };
      expect(f.name?.$exists).toBe(true);
    });

    it('accepts $mod on a number-typed field', () => {
      const f: FilterQuery<User> = { age: { $mod: [10, 0] } };
      expect(f.age?.$mod).toEqual([10, 0]);
    });

    it('accepts root logical operators $and/$or/$nor with nested typed filters', () => {
      const f: FilterQuery<User> = {
        $and: [{ name: 'Max' }, { age: { $gt: 18 } }],
        $or: [{ role: 'admin' }, { public: true }],
        $nor: [{ role: 'banned' }],
      };
      expect(f.$and?.[0].name).toBe('Max');
    });

    it('accepts root $text/$where/$comment without coupling to T', () => {
      const f: FilterQuery<User> = {
        $text: { $search: 'phrase' },
        $where: 'this.name.length > 3',
        $comment: 'audit',
      };
      expect(f.$text?.$search).toBe('phrase');
    });

    it('compiles a real countAdvanced call with a fully typed filter', () => {
      const adapter = createAdapter({ baseURL: 'http://localhost:0/api' });
      const userService: ModelService<User> = adapter.createModelService<User>({
        modelName: 'User',
        basePath: 'users',
      });
      // Constructing the lazy request does NOT execute it (no network hit
      // until `.then`/`await`/`.exec()`). The assignment compiles iff
      // FilterQuery<User> accepts the combination of scalars, arrays, RegExp,
      // and operator-wrapped conditions the docs claim it does.
      const filter: FilterQuery<User> = {
        name: /^Max/,
        role: { $in: ['admin', 'maintainer'] },
        age: { $gte: 18 },
        public: true,
        tags: 'vip',
        $or: [{ name: 'Max' }, { age: { $lt: 99 } }],
      };
      const lazy = userService.countAdvanced(filter);
      // `.then` is read-only here — we never invoke it, so no network request
      // is fired. The property existence check verifies the call returned a
      // thenable lazy request rather than throwing at construction time.
      expect(typeof lazy.then).toBe('function');
    });
  });

  describe('invalid known-field conditions fail to compile (negative)', () => {
    it('rejects a boolean where a string is required', () => {
      // @ts-expect-error — `name: string` does not accept a boolean.
      const _f: FilterQuery<User> = { name: true };
      void _f;
    });

    it('rejects an object literal with an unknown field key', () => {
      // @ts-expect-error — `nonExistentField` is not a member of `User`; the
      //   unrestricted `[key: string]: unknown` index signature was removed.
      const _f: FilterQuery<User> = { nonExistentField: 'whatever' };
      void _f;
    });

    it('rejects a string operator on a number-typed field', () => {
      // @ts-expect-error — `$regex` is `never` for non-string fields; the
      //   type-level prohibition must surface at the call site.
      const _f: FilterQuery<User> = { age: { $regex: '18' } };
      void _f;
    });

    it('rejects $mod on a string-typed field', () => {
      // @ts-expect-error — `$mod` is `never` for non-number fields.
      const _f: FilterQuery<User> = { name: { $mod: [10, 0] } };
      void _f;
    });

    it('rejects a comparison operator with the wrong scalar type', () => {
      // @ts-expect-error — `$gt` on `age: number` must be a number, not a string.
      const _f: FilterQuery<User> = { age: { $gt: 'old' } };
      void _f;
    });

    it('rejects a RegExp on a number-typed field', () => {
      // @ts-expect-error — RegExp is only accepted where `T extends string`.
      const _f: FilterQuery<User> = { age: /^42/ };
      void _f;
    });

    it('rejects an unknown query operator on a known field', () => {
      // @ts-expect-error — `$bogus` is not part of `QuerySelector<T>`.
      const _f: FilterQuery<User> = { name: { $bogus: 1 } };
      void _f;
    });
  });

  describe('deliberate escape hatches (positive + behavioral)', () => {
    it('DottedPathFilter<T> accepts dynamic dotted-path conditions that FilterQuery<T> rejects', () => {
      // First confirm the typed surface rejects the dotted path:
      // @ts-expect-error — `user.friends.name` is not a key of `User` and the
      //   typed `FilterQuery<T>` no longer carries an unrestricted index
      //   signature, so this object literal is a compile error.
      const _typed: FilterQuery<User> = { 'user.friends.name': 'Max' };
      void _typed;

      // The escape hatch restores schema-less field matching deliberately:
      const escaped: DottedPathFilter<User> = {
        'user.friends.name': 'Max',
        'profile.serverside.cast': 42,
      };
      expect(escaped['user.friends.name']).toBe('Max');
    });

    it('ServerSideCast<T> is a type alias of DottedPathFilter<T> and accepts arbitrary server-side shapes', () => {
      const f: ServerSideCast<User> = {
        name: 'Max',
        'computed.score': { $gt: 0.5 },
        'profile.cast.as.number': '42',
      };
      expect(f['computed.score']).toEqual({ $gt: 0.5 });
      // The two names are intentionally interchangeable; assign one to the
      // other to lock the alias relationship.
      const g: DottedPathFilter<User> = f;
      expect(g).toBe(f);
    });

    it('the escape hatch is reachable as a named public type from the package root', () => {
      // Compile-time only — confirms the named exports participate in the
      // public surface so consumers can spell them at typed call sites.
      type _D = import('../src').DottedPathFilter<User>;
      type _S = import('../src').ServerSideCast<User>;
      void ({} as _D);
      void ({} as _S);
    });
  });
});
