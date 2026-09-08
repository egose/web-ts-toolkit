import { describe, it, expect } from 'vitest';
import type {
  Document as ARDocument,
  ModelService,
  Projection,
  Model,
  ModelResponse,
  ListModelResponse,
} from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '@web-ts-toolkit/access-router-react';
import type {
  UseReadQueryOptions,
  UseReadQueryResult,
  UseListQueryResult,
  UseCreateMutateOptions,
  UseCreateMutateResult,
  UseUpdateMutateOptions,
  UseUpsertMutateOptions,
  ProjectedShape,
  ProjectedShapeArray,
  ProjectedModelResponse,
  ProjectedListModelResponse,
} from '@web-ts-toolkit/access-router-react';

interface Pet extends ARDocument {
  _id?: string;
  name: string;
  age: number;
  status: string;
}

interface PetCreateInput {
  name: string;
  source: 'import' | 'manual';
}

interface PetUpdateInput {
  status: 'active' | 'disabled';
  auditToken: string;
}

interface PetUpsertInput {
  externalId: string;
  name: string;
}

const petService = {} as unknown as ModelService<Pet>;
const hooks = createModelHooks({ modelService: petService });
const typedPetService = {} as unknown as ModelService<Pet, PetCreateInput, PetUpdateInput, PetUpsertInput>;
const typedHooks = createModelHooks({ modelService: typedPetService });

// Type-only helper mirroring the client package's strict consumer
// harness so the `tsc` errors caught by `@ts-expect-error` directives
// confirm the bug class is suppressed at the public declaration surface.
const expectTypeAssignableTo = <TExpected>(_actual: TExpected): void => {
  void _actual;
};

/**
 * Strict declaration-consumer tests for
 * `@web-ts-toolkit/access-router-react` (Task ARR-09). Built declarations
 * (`dist/index.d.ts`) must compile under `strict: true` and
 * `skipLibCheck: false` for both NodeNext and Bundler consumers. The
 * suite verifies the public projection-aware generic surface:
 *
 *  - No-projection defaults preserve the full-model shape
 *    (`Model<T> & T` / `(Model<T> & T)[]`).
 *  - A literal tuple projection (`['name'] as const`) narrows `data`,
 *    callback result payloads, manual `query()`/`refetch()` /
 *    `mutate()` responses, and the `onSuccess`/`onSettled` callback
 *    payload shapes.
 *  - String and `{ name: 1 }` projection literals also narrow.
 *  - A consumer selecting only `['name']` accessing `data.status` is
 *    typed as `string | undefined` rather than definitely-present;
 *    `@ts-expect-error` directives confirm the historical "consumer
 *    accesses a server-omitted field as definitely present" bug class
 *    is suppressed.
 */
describe('access-router-react built-declaration consumer (ARR-09)', () => {
  it('createModelHooks returns hooks inferrable from a ModelService<T>', () => {
    const h = createModelHooks({ modelService: petService });
    expectTypeAssignableTo<typeof hooks>(h);
    expect(typeof hooks).toBe('object');
  });

  it('useRead without a `select` keeps the full-model shape on data and callbacks', () => {
    type Result = UseReadQueryResult<Pet>;
    const r = hooks.useRead({ id: '1' });
    expectTypeAssignableTo<Result>(r);

    // data is `Model<T> & T | null` for the no-projection case.
    expectTypeAssignableTo<(Model<Pet> & Pet) | null>(r.data);

    // When `r.data` is narrowed past `null`, all model fields are
    // definitely-present (full-T).
    if (r.data) {
      expectTypeAssignableTo<string>(r.data.name);
      expectTypeAssignableTo<number>(r.data.age);
      expectTypeAssignableTo<string>(r.data.status);
    }

    // onSuccess result must be the full ModelResponse<Pet> when no projection.
    const opts: UseReadQueryOptions<Pet> = {
      onSuccess: (result) => {
        // result is `ModelResponse<Pet>` in the no-projection case, so
        // `result.data` is `Model<Pet> & Pet` once narrowed.
        if (result.success) {
          expectTypeAssignableTo<string>(result.data.name);
        }
      },
    };
    void opts;
  });

  it('useRead with `select: ["name"] as const` narrows data and callback result shapes', () => {
    // The narrowed result type.
    type ResM = ProjectedModelResponse<Pet, readonly ['name']>;
    type SuccData = Extract<ResM, { success: true }>['data'];
    const s: SuccData = {} as SuccData;
    expectTypeAssignableTo<string>(s.name);
    // `status` becomes `string | undefined` because the client
    // `SelectedShape` intersection inherits a `Partial<T>` widening.
    // @ts-expect-error status is narrowed to optional under ['name'] select.
    expectTypeAssignableTo<string>(s.status);

    const r = hooks.useRead({ id: '1', advanced: true, select: ['name'] as const });
    if (r.data) {
      expectTypeAssignableTo<string>(r.data.name);
      // @ts-expect-error projecting to ['name'] drops unselected fields to `string | undefined`.
      expectTypeAssignableTo<string>(r.data.status);
    }
  });

  it('useRead with string projection `select: "name"` narrows the same way', () => {
    type ResM = ProjectedModelResponse<Pet, 'name'>;
    type SuccData = Extract<ResM, { success: true }>['data'];
    const s: SuccData = {} as SuccData;
    expectTypeAssignableTo<string>(s.name);
    // @ts-expect-error string-narrowing also drops unselected keys to `string | undefined`.
    expectTypeAssignableTo<string>(s.status);
  });

  it('useRead with object projection `select: { name: 1 }` narrows the same way', () => {
    type ResM = ProjectedModelResponse<Pet, { name: 1 }>;
    type SuccData = Extract<ResM, { success: true }>['data'];
    const s: SuccData = {} as SuccData;
    expectTypeAssignableTo<string>(s.name);
    // @ts-expect-error object-narrowing also drops unselected keys to `string | undefined`.
    expectTypeAssignableTo<string>(s.status);
  });

  it('useList without a `select` keeps the full-model array shape', () => {
    type Result = UseListQueryResult<Pet>;
    const r = hooks.useList({ listParams: { pageSize: 10 } });
    expectTypeAssignableTo<Result>(r);
    expectTypeAssignableTo<(Model<Pet> & Pet)[]>(r.data);
    if (r.data.length > 0) {
      expectTypeAssignableTo<string>(r.data[0].name);
    }
  });

  it('useList with `select: ["name"] as const` narrows the list array and callbacks', () => {
    type ArrayShape = ProjectedShapeArray<Pet, readonly ['name']>;
    expectTypeAssignableTo<ArrayShape>([] as ProjectedShapeArray<Pet, readonly ['name']>);

    type ResL = ProjectedListModelResponse<Pet, readonly ['name']>;
    type SuccData = Extract<ResL, { success: true }>['data'];
    expectTypeAssignableTo<ArrayShape>([] as SuccData);

    const arr: ArrayShape = [{} as ArrayShape[number]];
    expectTypeAssignableTo<string>(arr[0].name);
    // @ts-expect-error array-element narrowing drops `status` to `string | undefined`.
    expectTypeAssignableTo<string>(arr[0].status);

    const r = hooks.useList({ listParams: { pageSize: 10 }, advanced: true, select: ['name'] as const });
    if (r.data.length > 0) {
      expectTypeAssignableTo<string>(r.data[0].name);
      // @ts-expect-error use-list narrowing suppresses the omitted field at the public surface.
      expectTypeAssignableTo<string>(r.data[0].status);
    }

    r.refetch().then((_result) => {
      type SuccP = typeof _result;
      type InnerData = Extract<SuccP, { success: true }>['data'];
      const inner: InnerData = [];
      expectTypeAssignableTo<ArrayShape>(inner);
    });
  });

  it('useCreate without a `select` keeps the full-model mutation response', () => {
    type ResM = ProjectedModelResponse<Pet, Projection>;
    expectTypeAssignableTo<ModelResponse<Pet>>({} as ResM);

    const mutation = hooks.useCreate();
    type Opts = UseCreateMutateOptions<Pet>;
    void ({} as Opts);
    const res: UseCreateMutateResult<Pet> = mutation;
    expectTypeAssignableTo<(Model<Pet> & Pet) | null>(res.data);
    if (mutation.data) {
      expectTypeAssignableTo<string>(mutation.data.name);
    }
  });

  it('useCreate with `select: ["name"] as const` narrows the mutation response and data', () => {
    const mutation = hooks.useCreate({ advanced: true, select: ['name'] as const });
    if (mutation.data) {
      expectTypeAssignableTo<string>(mutation.data.name);
      // @ts-expect-error use-create narrowing drops `status` to `string | undefined` for the projected case too.
      expectTypeAssignableTo<string>(mutation.data.status);
    }

    const opts: UseCreateMutateOptions<Pet, readonly ['name']> = {
      advanced: true,
      select: ['name'] as const,
      onSuccess: (result) => {
        if (result.success) {
          expectTypeAssignableTo<string>(result.data.name);
          // @ts-expect-error callback result also narrows the omitted field.
          expectTypeAssignableTo<string>(result.data.status);
        }
      },
    };
    void opts;
  });

  it('useUpdate with `select: ["name"] as const` narrows the mutation response and data', () => {
    const mutation = hooks.useUpdate({ advanced: true, select: ['name'] as const });
    if (mutation.data) {
      expectTypeAssignableTo<string>(mutation.data.name);
      // @ts-expect-error use-update narrowing drops unselected fields.
      expectTypeAssignableTo<string>(mutation.data.status);
    }

    const opts: UseUpdateMutateOptions<Pet, readonly ['name']> = {
      advanced: true,
      select: ['name'] as const,
      onSettled: (result, err) => {
        if (result && result.success) {
          expectTypeAssignableTo<string>(result.data.name);
        }
        if (err) {
          expectTypeAssignableTo<Error>(err as unknown as Error);
        }
      },
    };
    void opts;
  });

  it('useUpsert with `select: ["name"] as const` narrows the mutation response and data', () => {
    const mutation = hooks.useUpsert({ advanced: true, select: ['name'] as const });
    if (mutation.data) {
      expectTypeAssignableTo<string>(mutation.data.name);
      // @ts-expect-error use-upsert narrowing drops unselected fields.
      expectTypeAssignableTo<string>(mutation.data.status);
    }

    const opts: UseUpsertMutateOptions<Pet, readonly ['name']> = {
      advanced: true,
      select: ['name'] as const,
      onSuccess: (result) => {
        if (result.success) {
          expectTypeAssignableTo<string>(result.data.name);
        }
      },
    };
    void opts;
  });

  it('preserves custom create/update/upsert input types from the bound service and rejects array create input', () => {
    const createMutation = typedHooks.useCreate();
    void createMutation.mutate({ name: 'Northwind Labs', source: 'manual' });
    // @ts-expect-error create input keeps the service-required `source` field.
    void createMutation.mutate({ name: 'Northwind Labs' });
    // @ts-expect-error unrelated keys are still rejected.
    void createMutation.mutate({ name: 'Northwind Labs', source: 'manual', status: 'active' });
    // @ts-expect-error useCreate is single-record-only; array input is rejected.
    void createMutation.mutate([{ name: 'Northwind Labs', source: 'manual' }]);

    const updateMutation = typedHooks.useUpdate();
    void updateMutation.mutate('pet_1', { status: 'active', auditToken: 'audit-1' });
    // @ts-expect-error update input keeps the service-required audit token.
    void updateMutation.mutate('pet_1', { status: 'active' });
    // @ts-expect-error update input rejects unrelated keys.
    void updateMutation.mutate('pet_1', { status: 'active', auditToken: 'audit-1', name: 'Extra' });

    const upsertMutation = typedHooks.useUpsert();
    void upsertMutation.mutate({ externalId: 'crm-1', name: 'Northwind Labs' });
    // @ts-expect-error upsert input keeps the service-required external id.
    void upsertMutation.mutate({ name: 'Northwind Labs' });
    // @ts-expect-error upsert input rejects unrelated keys.
    void upsertMutation.mutate({ externalId: 'crm-1', name: 'Northwind Labs', source: 'manual' });
  });

  it('useList without `select` returns ListModelResponse<Pet> from query()', async () => {
    const r = hooks.useList({ listParams: { pageSize: 10 } });
    type PromiseRes = Awaited<ReturnType<typeof r.query>>;
    expectTypeAssignableTo<ListModelResponse<Pet>>({} as PromiseRes);
    // suppress the unawaited promise lint without awaiting it (no
    // network call is made).
    void r;
  });

  it('useRead without `select` returns ModelResponse<Pet> from refetch()', async () => {
    const r = hooks.useRead({ id: '1' });
    type PromiseRes = Awaited<ReturnType<typeof r.refetch>>;
    expectTypeAssignableTo<ModelResponse<Pet>>({} as PromiseRes);
    void r;
  });
});

/**
 * Conservative projection results (Task ARR-B03). Supplied-but-
 * indeterminable selections (broad `string` / `string[]`,
 * exclusion-only objects) and union selections must NOT fall back to
 * the full required model. Every negative assertion below carries an
 * `@ts-expect-error` so `tsc` fails if the alias ever resolves the
 * field back to definitely-present. Positive omitted/literal controls
 * keep the useful shapes. These fixtures compile against
 * `dist/index.d.ts` under both the NodeNext and Bundler strict
 * configs, so they verify the shipped declarations, not source
 * aliases alone.
 */
describe('access-router-react conservative projections (ARR-B03)', () => {
  const dynString: string = 'status';
  const dynArray: string[] = ['name'];
  const exclSelect = { status: -1 } as const;
  const unionSelect: readonly ['name'] | readonly ['status'] =
    Date.now() > 0 ? (['name'] as const) : (['status'] as const);

  it('omitted selection keeps the full-model shape (positive control)', () => {
    type Data = ProjectedShape<Pet, Projection>;
    expectTypeAssignableTo<Model<Pet> & Pet>({} as Data);
    const r = hooks.useRead({ id: '1' });
    if (r.data) {
      expectTypeAssignableTo<string>(r.data.status);
    }
  });

  it('literal tuple selection keeps the selected field required (positive control)', () => {
    type Data = ProjectedShape<Pet, readonly ['name']>;
    const d = {} as Data;
    expectTypeAssignableTo<string>(d.name);
    // @ts-expect-error literal ['name'] drops `status` to optional.
    expectTypeAssignableTo<string>(d.status);
  });

  it('broad `string` select marks every field optional on data and response payloads', () => {
    type Data = ProjectedShape<Pet, string>;
    const d = {} as Data;
    // @ts-expect-error ARR-B03: dynamic string select cannot claim `status` as required.
    expectTypeAssignableTo<string>(d.status);
    expectTypeAssignableTo<string | undefined>(d.status);

    type ResM = ProjectedModelResponse<Pet, string>;
    type SuccData = Extract<ResM, { success: true }>['data'];
    const s = {} as SuccData;
    // @ts-expect-error ARR-B03: dynamic string response payload cannot claim `status` as required.
    expectTypeAssignableTo<string>(s.status);

    const r = hooks.useRead({ id: '1', advanced: true, select: dynString });
    if (r.data) {
      // @ts-expect-error ARR-B03: hook data under a dynamic string select is optional.
      expectTypeAssignableTo<string>(r.data.status);
    }
    type PromiseRes = Awaited<ReturnType<typeof r.query>>;
    type PromiseData = Extract<PromiseRes, { success: true }>['data'];
    const pd = {} as PromiseData;
    // @ts-expect-error ARR-B03: query() payload under a dynamic string select is optional.
    expectTypeAssignableTo<string>(pd.status);
  });

  it('broad `string[]` select marks every field optional on list data, previousData, and callbacks', () => {
    type Arr = ProjectedShapeArray<Pet, string[]>;
    const arr = {} as Arr;
    if (arr.length > 0) {
      // @ts-expect-error ARR-B03: dynamic array select cannot claim `status` as required.
      expectTypeAssignableTo<string>(arr[0].status);
    }

    type ResL = ProjectedListModelResponse<Pet, string[]>;
    type SuccData = Extract<ResL, { success: true }>['data'];
    const sd = {} as SuccData;
    if (sd.length > 0) {
      // @ts-expect-error ARR-B03: dynamic array list payload cannot claim `status` as required.
      expectTypeAssignableTo<string>(sd[0].status);
    }

    const r = hooks.useList({ listParams: { pageSize: 10 }, advanced: true, select: dynArray });
    if (r.data.length > 0) {
      // @ts-expect-error ARR-B03: hook list data under a dynamic array select is optional.
      expectTypeAssignableTo<string>(r.data[0].status);
    }
    if (r.previousData && r.previousData.length > 0) {
      // @ts-expect-error ARR-B03: previousData follows the same conservative element shape.
      expectTypeAssignableTo<string>(r.previousData[0].status);
    }

    const opts: UseReadQueryOptions<Pet, string> = {
      onSuccess: (result) => {
        if (result.success) {
          // @ts-expect-error ARR-B03: onSuccess payload under a dynamic select is optional.
          expectTypeAssignableTo<string>(result.data.status);
        }
      },
      onSettled: (result) => {
        if (result && result.success) {
          // @ts-expect-error ARR-B03: onSettled payload under a dynamic select is optional.
          expectTypeAssignableTo<string>(result.data.status);
        }
      },
    };
    void opts;
  });

  it('exclusion-only `{ status: -1 }` select marks every field optional', () => {
    type ResM = ProjectedModelResponse<Pet, { status: -1 }>;
    type SuccData = Extract<ResM, { success: true }>['data'];
    const s = {} as SuccData;
    // @ts-expect-error ARR-B03: exclusion-only select cannot claim `status` as required.
    expectTypeAssignableTo<string>(s.status);
    // @ts-expect-error ARR-B03: exclusion-only select cannot claim `name` as required either.
    expectTypeAssignableTo<string>(s.name);

    const r = hooks.useRead({ id: '1', advanced: true, select: exclSelect });
    if (r.data) {
      // @ts-expect-error ARR-B03: hook data under an exclusion-only select is optional.
      expectTypeAssignableTo<string>(r.data.status);
    }
  });

  it('union `readonly ["name"] | readonly ["status"]` preserves alternatives instead of requiring both', () => {
    type Data = ProjectedShape<Pet, readonly ['name'] | readonly ['status']>;
    const d = {} as Data;
    // @ts-expect-error ARR-B03: union select cannot claim `status` as required (absent in the ['name'] branch).
    expectTypeAssignableTo<string>(d.status);
    // @ts-expect-error ARR-B03: union select cannot claim `name` as required (absent in the ['status'] branch).
    expectTypeAssignableTo<string>(d.name);

    const r = hooks.useRead({ id: '1', advanced: true, select: unionSelect });
    if (r.data) {
      // @ts-expect-error ARR-B03: hook data under a union select cannot claim `status` as required.
      expectTypeAssignableTo<string>(r.data.status);
      // @ts-expect-error ARR-B03: hook data under a union select cannot claim `name` as required.
      expectTypeAssignableTo<string>(r.data.name);
    }
    type PromiseRes = Awaited<ReturnType<typeof r.refetch>>;
    type PromiseData = Extract<PromiseRes, { success: true }>['data'];
    const pd = {} as PromiseData;
    // @ts-expect-error ARR-B03: refetch() payload under a union select cannot claim `status` as required.
    expectTypeAssignableTo<string>(pd.status);
  });

  it('conservative shapes apply to create/update/upsert data, callbacks, and mutate() payloads', () => {
    const dynCreate = hooks.useCreate({ advanced: true, select: dynString });
    if (dynCreate.data) {
      // @ts-expect-error ARR-B03: create data under a dynamic select is optional.
      expectTypeAssignableTo<string>(dynCreate.data.status);
    }
    type CreatePromise = Awaited<ReturnType<typeof dynCreate.mutate>>;
    type CreateData = Extract<CreatePromise, { success: true }>['data'];
    const cd = {} as CreateData;
    // @ts-expect-error ARR-B03: create mutate() payload under a dynamic select is optional.
    expectTypeAssignableTo<string>(cd.status);

    const unionUpdate = hooks.useUpdate({ advanced: true, select: unionSelect });
    if (unionUpdate.data) {
      // @ts-expect-error ARR-B03: update data under a union select cannot claim `status` as required.
      expectTypeAssignableTo<string>(unionUpdate.data.status);
    }
    const updateOpts: UseUpdateMutateOptions<Pet, readonly ['name'] | readonly ['status']> = {
      advanced: true,
      select: unionSelect,
      onSuccess: (result) => {
        if (result.success) {
          // @ts-expect-error ARR-B03: update callback payload under a union select is optional.
          expectTypeAssignableTo<string>(result.data.status);
        }
      },
    };
    void updateOpts;

    const exclUpsert = hooks.useUpsert({ advanced: true, select: exclSelect });
    if (exclUpsert.data) {
      // @ts-expect-error ARR-B03: upsert data under an exclusion-only select is optional.
      expectTypeAssignableTo<string>(exclUpsert.data.name);
    }
    const createOpts: UseCreateMutateOptions<Pet, string> = {
      advanced: true,
      select: dynString,
      onSettled: (result) => {
        if (result && result.success) {
          // @ts-expect-error ARR-B03: create onSettled payload under a dynamic select is optional.
          expectTypeAssignableTo<string>(result.data.status);
        }
      },
    };
    void createOpts;
  });
});
