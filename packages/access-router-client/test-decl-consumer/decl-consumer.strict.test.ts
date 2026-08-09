import { describe, expect, it } from 'vitest';

import {
  createAdapter,
  CustomHeaders,
  Model,
  ModelService,
  DataService,
  SuccessResult,
  FailureResult,
  Response,
  ListModelResponse,
  SubDocumentResponse,
  ArrayModelResponse,
} from '@web-ts-toolkit/access-router-client';

interface Pet {
  _id?: string;
  name: string;
  age: number;
  statusHistory: Array<{ label: string; flag: string }>;
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
    const petService = adapter.createModelService<Pet>({ modelName: 'Pet', basePath: 'pets' });
    const created = petService.create({ name: 'Max', age: 1, statusHistory: [] });
    type Created = Awaited<typeof created>;
    // `petService.create(...)` resolves to `ModelResponse<Pet>`, the discriminated
    // Response<...>. Narrowing with `success` exposes `created.data: Model<Pet> & Pet`
    // (so `.save()` is callable) on success and `null` on failure.
    type SuccessBranch = Extract<Created, SuccessResult<Pet, Model<Pet> & Pet>>;
    type FailureBranch = Extract<Created, FailureResult>;
    const acceptSuccessData = (value: SuccessBranch['data']): Model<Pet> & Pet => value;
    const failureData: FailureBranch['data'] = null;
    void created;
    expectTypeAssignableTo<Model<Pet> & Pet>(acceptSuccessData({} as Model<Pet> & Pet));
    expectTypeAssignableTo<null>(failureData);
  });

  it('model create overloads preserve scalar and bulk cardinality', () => {
    const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
    const petService = adapter.createModelService<Pet>({ modelName: 'Pet', basePath: 'pets' });
    const scalar = petService.create({ name: 'Max', age: 1, statusHistory: [] });
    const bulk = petService.create([{ name: 'Max', age: 1, statusHistory: [] }]);
    const advancedBulk = petService.createAdvanced([{ name: 'Max', age: 1, statusHistory: [] }], {
      select: ['name'] as const,
    });

    expectTypeAssignableTo<PromiseLike<import('@web-ts-toolkit/access-router-client').ModelResponse<Pet>>>(scalar);
    expectTypeAssignableTo<PromiseLike<ArrayModelResponse<Pet>>>(bulk);
    type AdvancedData = Extract<Awaited<typeof advancedBulk>, { success: true }>['data'];
    void advancedBulk;
    expectTypeAssignableTo<Array<{ name: string } & Partial<Pet>>>([] as AdvancedData);
  });

  it('Response separates success and error payload generics while narrowing', () => {
    type Res = Response<Pet, Pet>;
    const successOnly = (res: Res): Pet | null => (res.success ? res.data : null);
    expectTypeAssignableTo<Pet | null>(successOnly({} as Res));
    const failureOnly = (res: Res): null => (res.success ? null : res.data);
    expectTypeAssignableTo<null>(failureOnly({} as Res));

    const defaultFailure = {} as Extract<Res, { success: false }>;
    expectTypeAssignableTo<unknown>(defaultFailure.raw);
    // @ts-expect-error The default failure payload is unknown, not the successful Pet payload.
    expectTypeAssignableTo<Pet | null>(defaultFailure.raw);

    type Problem = { code: string; errors?: string[] };
    const customFailure = {} as Extract<Response<Pet, Pet, Problem>, { success: false }>;
    expectTypeAssignableTo<Problem | null>(customFailure.raw);
  });

  it('ListModelResponse keeps totalCount present on both branches', () => {
    const res = {} as ListModelResponse<Pet>;
    expectTypeAssignableTo<number>(res.totalCount);
    expectTypeAssignableTo<number>(res.totalCount);
    if (res.success) {
      expectTypeAssignableTo<Pet[]>(res.raw);
    } else {
      expectTypeAssignableTo<unknown>(res.raw);
    }
  });

  it('infers array-element subdocument types and narrows successful single responses', () => {
    const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
    const petService = adapter.createModelService<Pet>({ modelName: 'Pet', basePath: 'pets' });
    const request = petService.id('pet-1').subs('statusHistory').read('status-1');
    type Result = Awaited<typeof request>;
    type SuccessBranch = Extract<Result, { success: true }>;
    type Status = Pet['statusHistory'][number];

    const inferredValue: SuccessBranch['data'] = { label: 'created', flag: 'green' };
    void request;
    expectTypeAssignableTo<Status>(inferredValue);

    const narrowed = (result: SubDocumentResponse<Status>): Status => {
      if (result.success) return result.data;
      return { label: result.message, flag: 'failed' };
    };
    expectTypeAssignableTo<Status>(narrowed({} as SubDocumentResponse<Status>));
  });

  it('retains an explicit subdocument generic when a field is not inferable as an array', () => {
    const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
    const petService = adapter.createModelService<Pet>({ modelName: 'Pet', basePath: 'pets' });
    type ExternalStatus = { externalCode: string };
    const request = petService.id('pet-1').subs<ExternalStatus>('name').read('status-1');
    type SuccessData = Extract<Awaited<typeof request>, { success: true }>['data'];

    const explicitValue: SuccessData = { externalCode: 'external-1' };
    void request;
    expectTypeAssignableTo<ExternalStatus>(explicitValue);
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
