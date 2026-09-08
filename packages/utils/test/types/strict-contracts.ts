/**
 * UTILS-09 strict contract fixture (single source of truth).
 *
 * Typechecked in two modes, never executed:
 * - source mode: `../../src/index` resolves to workspace source with strict
 *   `tsc --noEmit` (V3-adjacent gate, Bundler resolution);
 * - installed mode: the import specifier is rewritten to
 *   `@web-ts-toolkit/utils` and checked against the packed artifact under
 *   strict NodeNext (`.mts`/`.cts`) and Bundler (`.ts`) with
 *   `skipLibCheck: false` (V4).
 *
 * Positive assignments must hold; every `@ts-expect-error` line must fail —
 * `tsc` itself rejects unused directives, so a passing run proves the
 * negatives are real. Keep this file lint-clean (`V2` lints `test/**`):
 * reference every binding via the exported `checks` object and describe
 * every expectation directive.
 */
import {
  flattenDeep,
  get,
  intersectionBy,
  isBoolean,
  isNumber,
  isString,
  map,
  omit,
  pick,
  reduce,
  set,
  toAsyncFn,
  type PropertyPath,
} from '../../src/index';

type User = { name: string; age: number };

declare const unknownValue: unknown;
declare const users: User[];

// --- Boxed guards: primitive-only predicates, never boxed-to-primitive. ---
if (isBoolean(unknownValue)) {
  const narrowedBoolean: boolean = unknownValue;
  void narrowedBoolean;
} else {
  // @ts-expect-error unknown stays unknown outside the guard: no unsound narrowing occurred.
  const stillUnknownBoolean: string = unknownValue;
  void stillUnknownBoolean;
}

if (isNumber(unknownValue)) {
  const narrowedNumber: number = unknownValue;
  void narrowedNumber;
} else {
  // @ts-expect-error unknown stays unknown outside the guard: no unsound narrowing occurred.
  const stillUnknownNumber: string = unknownValue;
  void stillUnknownNumber;
}

if (isString(unknownValue)) {
  const narrowedString: string = unknownValue;
  void narrowedString;
} else {
  // @ts-expect-error unknown stays unknown outside the guard: no unsound narrowing occurred.
  const stillUnknownString: string = unknownValue;
  void stillUnknownString;
}

// Boxed wrapper objects carry wrapper types (`Boolean`/`Number`/`String`
// via inferred `.prototype` objects, never named here) which are not the
// primitive types: the exact soundness gap the old `instanceof`-accepting
// guards pretended away. Runtime rejection of the same values is locked in
// `test/primitive-guard-narrowing.test.ts`.
const boxedBooleanProto = Boolean.prototype;
const boxedNumberProto = Number.prototype;
const boxedStringProto = String.prototype;
void [boxedBooleanProto, boxedNumberProto, boxedStringProto];
// @ts-expect-error boxed Boolean is not a primitive boolean.
const boxedAsBoolean: boolean = boxedBooleanProto;
// @ts-expect-error boxed Number is not a primitive number.
const boxedAsNumber: number = boxedNumberProto;
// @ts-expect-error boxed String is not a primitive string.
const boxedAsString: string = boxedStringProto;
if (isString(boxedStringProto)) {
  // Unreachable at runtime (primitive-only guard), but the narrowing itself
  // stays sound: only a genuine primitive string flows here.
  const onlyPrimitive: string = boxedStringProto;
  void onlyPrimitive;
}

// --- map: callback inference plus known-key property shorthand. ---
const names: string[] = map(users, 'name');
const ages: number[] = map(users, 'age');
const doubled: number[] = map([1, 2, 3], (value) => value * 2);
const nullableNames: string[] = map(users as User[] | null, 'name');
// Deeper paths are not key types: honest `unknown[]`, no fabricated inference.
const deepPath: unknown[] = map(users, 'name.first');
// @ts-expect-error string[] is not assignable to number[]: keyof inference is exact.
const miskeyed: number[] = map(users, 'name');

// --- intersectionBy: result follows the first array. ---
const common: number[] = intersectionBy([1, 2, 3], [2, 3, 4], (value) => value);
const commonByKey: User[] = intersectionBy(users, users, 'name');
const ignoredNullish: number[] = intersectionBy([1, 2], null, (value) => value);
// @ts-expect-error result follows the first array (number), not the assertion target.
const misElement: string[] = intersectionBy([1, 2], [2, 3]);
// @ts-expect-error the iteratee must accept the first array element type; it never re-infers it.
const misIteratee: number[] = intersectionBy([1, 2], [2], (value: string) => value);

// --- flattenDeep: explicit caller assertion over an honest unknown default. ---
const assertedFlat: number[] = flattenDeep<number>([1, [2, [3]]]);
const defaultFlat: unknown[] = flattenDeep([1, ['two']]);
const nonArrayFlat: number[] = flattenDeep<number>('not-an-array');
// Two steps: a bare call has no contextual leaf type, so `T` falls back to
// `unknown` rather than a silently inferred leaf type.
const silentFlat = flattenDeep([1, [2]]);
// @ts-expect-error bare calls yield unknown[], never a silently inferred leaf type.
const silentFlatAssign: number[] = silentFlat;

// --- reduce: with-initial versus without-initial overloads. ---
const sumWithInitial: number = reduce([1, 2, 3], (acc, value) => acc + value, 0);
const concatWithInitial: string = reduce(['a', 'b'], (acc, value) => acc + value, '');
const sumNoInitial: number = reduce([1, 2, 3], (acc, value) => acc + value);
const recordSum: number = reduce({ a: 1, b: 2 }, (acc, value) => acc + value, 0);
const recordNoInitial: number = reduce({ a: 1, b: 2 }, (acc, value) => acc + value);
// @ts-expect-error without an initial value the result is the element type, not an arbitrary TResult.
const noInitialMismatch: string = reduce([1, 2, 3], (acc, value) => acc + value);
// @ts-expect-error the accumulator type must match the initial value.
const initialMismatch: string = reduce([1, 2], (acc: number, value) => acc + value, 'zero');

// --- toAsyncFn: approved UTILS-07 contract, typed truthfully. ---
const doubledAsync = toAsyncFn((value: number) => value * 2);
const asyncResult: Promise<number> | PromiseLike<number> = doubledAsync(21);
// @ts-expect-error the adapter never returns a bare synchronous value.
const bareResult: number = doubledAsync(21);
const defaultedAsync: (...args: unknown[]) => Promise<string | undefined> = toAsyncFn(undefined, 'fallback');
const defaultedKnown: Promise<string | undefined> = defaultedAsync();
async function awaitedValue(): Promise<number> {
  return doubledAsync(1);
}

// The result type admits thenables (`PromiseLike`), not only native
// promises, because adapted thenables pass through with identity preserved
// (UTILS-07; runtime identity is locked in `async-adapter-contract.test.ts`).
// Awaiting — rather than `instanceof Promise` — is the supported contract.
const promiseAsync = toAsyncFn((value: number) => Promise.resolve(value));
const promiseResult: Promise<number> | PromiseLike<number> = promiseAsync(1);
async function awaitedPromise(): Promise<number> {
  return promiseAsync(1);
}

// --- PropertyPath is a public named type export. ---
const path: PropertyPath = ['user', 0, 'name'];
const atPath: unknown = get({ user: [{ name: 'Ada' }] }, path);
const target: { count: number } = { count: 0 };
set(target, 'count', 1);
const picked: Partial<typeof target> = pick(target, ['count']);
const omitted: Partial<typeof target> = omit(target, [['count']]);

export const checks = {
  names,
  ages,
  doubled,
  nullableNames,
  deepPath,
  miskeyed,
  common,
  commonByKey,
  ignoredNullish,
  misElement,
  misIteratee,
  assertedFlat,
  defaultFlat,
  nonArrayFlat,
  silentFlat,
  silentFlatAssign,
  sumWithInitial,
  concatWithInitial,
  sumNoInitial,
  recordSum,
  recordNoInitial,
  noInitialMismatch,
  initialMismatch,
  asyncResult,
  bareResult,
  defaultedAsync,
  defaultedKnown,
  awaitedValue,
  awaitedPromise,
  promiseAsync,
  promiseResult,
  boxedAsBoolean,
  boxedAsNumber,
  boxedAsString,
  path,
  atPath,
  picked,
  omitted,
};
