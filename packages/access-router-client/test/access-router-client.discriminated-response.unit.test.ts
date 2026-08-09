import { describe, expectTypeOf, it } from 'vitest';

import type {
  FailureResult,
  ListDataResponse,
  ListModelResponse,
  ModelResponse,
  Response,
  SuccessResult,
} from '../src';

interface Pet {
  name: string;
  age: number;
}

/**
 * ARC-14: discriminated success/failure result types. The `Response<T1, T2>`
 * union narrows on `success` so consumers can destructure `data`/`raw` on
 * the success branch and read the documented error payload on the failure
 * branch without unsafe casts.
 */
describe('access-router-client discriminated response types (ARC-14)', () => {
  it('narrows Response<T1, T2> on `success` so the success branch exposes non-null raw/data', () => {
    const res = {} as Response<Pet, Pet>;
    if (res.success) {
      expectTypeOf(res).toMatchTypeOf<SuccessResult<Pet, Pet>>();
      expectTypeOf(res.raw).toEqualTypeOf<Pet>();
      expectTypeOf(res.data).toEqualTypeOf<Pet>();
      expectTypeOf(res.message).toEqualTypeOf<string>();
    } else {
      expectTypeOf(res).toMatchTypeOf<FailureResult<Pet>>();
      expectTypeOf(res.raw).toEqualTypeOf<Pet | null>();
      expectTypeOf(res.data).toEqualTypeOf<null>();
      expectTypeOf(res.message).toEqualTypeOf<string>();
      expectTypeOf(res.status).toEqualTypeOf<number>();
    }
  });

  it('keeps data narrower (no union leak) when success branch is taken', () => {
    const res = {} as ModelResponse<Pet>;
    if (res.success) {
      // data is the wrapped Model payload; narrowing removes the null branch.
      expectTypeOf(res.success).toEqualTypeOf<true>();
      expectTypeOf(res.data).not.toBeNever();
    }
  });

  it('contracts FailureResult<T1> as the public shape of failure results', () => {
    const res = {} as FailureResult<Pet>;
    expectTypeOf(res.success).toEqualTypeOf<false>();
    expectTypeOf(res.raw).toEqualTypeOf<Pet | null>();
    expectTypeOf(res.data).toEqualTypeOf<null>();
    expectTypeOf(res.message).toEqualTypeOf<string>();
    expectTypeOf(res.headers).toEqualTypeOf<Record<string, string>>();
  });

  it('contracts SuccessResult<T1, T2> as the public shape of successful results', () => {
    const res = {} as SuccessResult<Pet, Pet>;
    expectTypeOf(res.success).toEqualTypeOf<true>();
    expectTypeOf(res.raw).toEqualTypeOf<Pet>();
    expectTypeOf(res.data).toEqualTypeOf<Pet>();
    expectTypeOf(res.message).toEqualTypeOf<string>();
  });

  it('keeps `totalCount` present on model list responses (success branch) and on the failure branch invariant', () => {
    const res = {} as ListModelResponse<Pet>;
    // Failure branch invariant: `totalCount: 0` is initialized so the field
    // is always `number` regardless of whether count metadata was requested.
    expectTypeOf(res.totalCount).toEqualTypeOf<number>();
    if (res.success) {
      expectTypeOf(res).toMatchTypeOf<SuccessResult<Pet[], Pet[]>>();
    } else {
      expectTypeOf(res).toMatchTypeOf<FailureResult<Pet[]>>();
    }
  });

  it('keeps `totalCount` present on data list responses (success branch) and on the failure branch invariant', () => {
    const res = {} as ListDataResponse<Pet>;
    expectTypeOf(res.totalCount).toEqualTypeOf<number>();
    if (res.success) {
      expectTypeOf(res).toMatchTypeOf<SuccessResult<Pet[], Pet[]>>();
    } else {
      expectTypeOf(res).toMatchTypeOf<FailureResult<Pet[]>>();
    }
  });

  it('does not let a non-discriminated access read the success payload as T2 without narrowing', () => {
    const res = {} as Response<Pet, Pet>;
    // Without narrowing, `data` is `Pet | null` (the union of the two branches).
    expectTypeOf(res.data).toEqualTypeOf<Pet | null>();
    expectTypeOf(res.raw).toEqualTypeOf<Pet | null>();
  });
});
