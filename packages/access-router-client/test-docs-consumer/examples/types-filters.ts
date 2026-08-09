/**
 * ARC-20: extracted from website typescript-and-errors.mdx "Selected Field
 * Inference", "Filter Query Types", "Escape hatches for dynamic dotted paths
 * and server-side casting", and "Overriding The Inferred Shape".
 *
 * Verifies the typed `FilterQuery<T>` surface (scalar/Regexp/operators/root
 * ops) compiles, the negative cases (unknown field, wrong operator for the
 * scalar) are rejected at compile time via `@ts-expect-error`, the
 * `DottedPathFilter<T>` / `ServerSideCast<T>` escape hatches are named
 * public type exports, and an explicit result type narrows `readAdvanced`.
 */
import {
  type DottedPathFilter,
  type FilterQuery,
  type ServerSideCast,
  createAdapter,
} from '@web-ts-toolkit/access-router-client';

interface User {
  _id?: string;
  name: string;
  role: string;
  public: boolean;
  age: number;
  tags: string[];
}

const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
const userService = adapter.createModelService<User>({
  modelName: 'User',
  basePath: 'users',
});

const user = await userService.readAdvanced('user-1', {
  select: ['name', 'role'] as const,
});
void user.raw;

const filter: FilterQuery<User> = {
  name: /^Max/,
  role: { $in: ['admin', 'maintainer'] },
  age: { $gte: 18, $lt: 65 },
  public: true,
  tags: 'vip',
  $or: [{ name: 'Max' }, { age: { $gt: 99 } }],
};
void filter;

// @ts-expect-error — `nonExistentField` is not a key of `User`.
const _badField: FilterQuery<User> = { nonExistentField: 'x' };
// @ts-expect-error — `$regex` is only valid where `T extends string`.
const _badRegex: FilterQuery<User> = { age: { $regex: '^42' } };
// @ts-expect-error — `$mod` is only valid where `T extends number`.
const _badMod: FilterQuery<User> = { name: { $mod: [10, 0] } };
void _badField;
void _badRegex;
void _badMod;

const escaped: DottedPathFilter<User> = {
  'user.friends.name': 'Max',
  'profile.serverside.cast': 42,
};
void escaped;

const cast: ServerSideCast<User> = {
  name: 'Max',
  'computed.score': { $gt: 0.5 },
};
void cast;

const explicit = await userService.readAdvanced<{ name: string }>('user-1', {
  select: { name: 1, role: 1 } as const,
});
void explicit;
