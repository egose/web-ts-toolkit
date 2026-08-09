import { describe, expect, it } from 'vitest';

import {
  createAdapter,
  CustomHeaders,
  Model,
  ModelService,
  DataService,
  SuccessResult,
  FailureResult,
  ListModelResponse,
} from '@web-ts-toolkit/access-router-client';

interface Pet {
  _id?: string;
  name: string;
  age: number;
}

// TypeScript narrowing helper used in place of `expectTypeOf` so the
// underlying type-level assertion is enforced by the strict consumer
// `tsc --noEmit` checks (the `tsconfig-nodenext.json` and
// `tsconfig-bundler.json` files in this directory). Vitest's runtime only
// executes the `expect(...)` lines; the `// strict-assert` blocks are
// type-only and stripped at runtime.
const expectTypeAssignableTo = <TExpected>(_actual: TExpected): void => {
  // type-only side-effect: if `_actual` does not satisfy `TExpected`,
  // `tsc` errors at compile time. The runtime body is intentionally
  // empty.
  void _actual;
};

/**
 * ARC-15: built declarations must compile under `strict: true` and
 * `skipLibCheck: false` for both NodeNext and Bundler consumers. These
 * positive tests use the published generic surface (model factories,
 * response aliases, adapter factories) the way external callers do.
 *
 * Compiled against `dist/index.d.ts` via the consumer `tsconfig-nodenext.json`
 * and `tsconfig-bundler.json` scripts in this directory.
 */
describe('access-router-client built-declaration consumer (ARC-15)', () => {
  it('creates an adapter and model service without inferred-type leaks', () => {
    const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
    const petService = adapter.createModelService<Pet>({ modelName: 'Pet', basePath: 'pets' });
    expectTypeAssignableTo<ModelService<Pet>>(petService);
  });

  it('creates a data service without inferred-type leaks', () => {
    const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
    const fruitService = adapter.createDataService<Pet>({ dataName: 'fruit', basePath: 'fruit' });
    expectTypeAssignableTo<DataService<Pet>>(fruitService);
  });

  it('Model<T> preserves the Document constraint and save() returns a useful generic', () => {
    const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const petService = adapter.createModelService<Pet>({ modelName: 'Pet', basePath: 'pets' });
    type Created = Awaited<ReturnType<typeof petService.create>>;
    // `petService.create(...)` resolves to `ModelResponse<Pet>`, the discriminated
    // Response<...>. Narrowing with `success` exposes `created.data: Model<Pet> & Pet`
    // (so `.save()` is callable) on success and `null` on failure.
    type SuccessBranch = Extract<Created, SuccessResult<Pet, Model<Pet> & Pet>>;
    type FailureBranch = Extract<Created, FailureResult<Pet>>;
    expectTypeAssignableTo<Model<Pet> & Pet>({} as SuccessBranch['data']);
    expectTypeAssignableTo<null>({} as FailureBranch['data']);
  });

  it('Response<SuccessResult|FailureResult> narrows on success', () => {
    type Res = SuccessResult<Pet, Pet> | FailureResult<Pet>;
    const successOnly = (res: Res): Pet => (res.success ? res.data : (res.raw ?? ({} as Pet)));
    expectTypeAssignableTo<Pet>(successOnly({} as Res));
    const failureOnly = (res: Res): null => (res.success ? null : res.data);
    expectTypeAssignableTo<null>(failureOnly({} as Res));
  });

  it('ListModelResponse keeps totalCount present on both branches', () => {
    const res = {} as ListModelResponse<Pet>;
    expectTypeAssignableTo<number>(res.totalCount);
    expectTypeAssignableTo<number>(res.totalCount);
    if (res.success) {
      expectTypeAssignableTo<Pet[]>(res.raw);
    } else {
      expectTypeAssignableTo<Pet[] | null>(res.raw);
    }
  });

  it('CustomHeaders members are available as the documented header names', () => {
    expect(CustomHeaders.TotalCount).toBe('wtt-total-count');
    expect(CustomHeaders.ReturnedCount).toBe('wtt-returned-count');
  });

  it('rejects unconstrained model shapes at the consumer boundary', () => {
    // @ts-expect-error — `number` does not satisfy `extends Document`.
    createAdapter({ baseURL: 'x' }).createModelService<number>({ modelName: 'N', basePath: 'n' });
  });
});
