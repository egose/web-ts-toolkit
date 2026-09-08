/**
 * Consumer TS source exercised by ARR-10 packed-tarball install test under
 * both NodeNext and Bundler resolution with `strict: true`,
 * `skipLibCheck: false`, `noEmit: true`. Declarations are resolved from the
 * installed `node_modules/@web-ts-toolkit/access-router-react` tarball via
 * the real export map (no `paths` override), mirroring how an external
 * TypeScript consumer installs and uses the package. The ambient
 * `@web-ts-toolkit/access-router-client` peer dep resolves through the same
 * consumer install so the projection-aware hook option and result types
 * reference the real published `Model<T> & T` and `ModelResponse<T>` shapes.
 *
 * The runtime body would normally need to run inside a React renderer
 * (`createModelHooks` is a hooks factory); for the packed-consumer compile
 * gate we declare values and call signatures in a typed way `tsc --noEmit`
 * typechecks without executing — exactly how the existing in-repo
 * `test-decl-consumer` harness exercises the same surface. Calling the hooks
 * outside `renderHook` is the documented React-rule-of-hooks violation; the
 * packed-consumer fixture mirrors the compile-only pattern.
 */
import type {
  Document as ARDocument,
  Model,
  ModelResponse,
  ListModelResponse,
  ModelService,
  Projection,
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

// Type-only helper mirroring the in-repo ARR-09 strict consumer harness so
// the `tsc` errors caught by `@ts-expect-error` directives confirm the bug
// class is suppressed at the public declaration surface.
const expectTypeAssignableTo = <TExpected>(_actual: TExpected): void => {
  void _actual;
};

// Positive: createModelHooks returns hooks inferrable from a ModelService<T>.
const h = createModelHooks({ modelService: petService });
expectTypeAssignableTo<typeof hooks>(h);

// ── No-projection defaults preserve the full-model shape ──

type ReadResult = UseReadQueryResult<Pet>;
const r = hooks.useRead({ id: '1' });
expectTypeAssignableTo<ReadResult>(r);
expectTypeAssignableTo<(Model<Pet> & Pet) | null>(r.data);
if (r.data) {
  expectTypeAssignableTo<string>(r.data.name);
  expectTypeAssignableTo<number>(r.data.age);
  expectTypeAssignableTo<string>(r.data.status);
}

const noProjectionOnSuccess: UseReadQueryOptions<Pet> = {
  onSuccess: (result) => {
    if (result.success) {
      expectTypeAssignableTo<string>(result.data.name);
    }
  },
};
void noProjectionOnSuccess;

// ── Literal tuple projection narrows data and callback result shapes ──

type ResM = ProjectedModelResponse<Pet, readonly ['name']>;
type SuccData = Extract<ResM, { success: true }>['data'];
const s: SuccData = {} as SuccData;
expectTypeAssignableTo<string>(s.name);
// @ts-expect-error — `status` becomes `string | undefined` because the
//   client `SelectedShape` intersection inherits a `Partial<T>` widening.
expectTypeAssignableTo<string>(s.status);

const projectedRead = hooks.useRead({ id: '1', advanced: true, select: ['name'] as const });
if (projectedRead.data) {
  expectTypeAssignableTo<string>(projectedRead.data.name);
  // @ts-expect-error — projecting to ['name'] drops unselected fields to `string | undefined`.
  expectTypeAssignableTo<string>(projectedRead.data.status);
}

// String and object projection literals narrow the same way.
type StringResM = ProjectedModelResponse<Pet, 'name'>;
type StringSuccData = Extract<StringResM, { success: true }>['data'];
const ss: StringSuccData = {} as StringSuccData;
expectTypeAssignableTo<string>(ss.name);
// @ts-expect-error — string-narrowing also drops unselected keys to `string | undefined`.
expectTypeAssignableTo<string>(ss.status);

type ObjectResM = ProjectedModelResponse<Pet, { name: 1 }>;
type ObjectSuccData = Extract<ObjectResM, { success: true }>['data'];
const os: ObjectSuccData = {} as ObjectSuccData;
expectTypeAssignableTo<string>(os.name);
// @ts-expect-error — object-narrowing also drops unselected keys to `string | undefined`.
expectTypeAssignableTo<string>(os.status);

// ── List narrowing ──

type ListResult = UseListQueryResult<Pet>;
const lr = hooks.useList({ listParams: { pageSize: 10 } });
expectTypeAssignableTo<ListResult>(lr);
expectTypeAssignableTo<(Model<Pet> & Pet)[]>(lr.data);
if (lr.data.length > 0) {
  expectTypeAssignableTo<string>(lr.data[0].name);
}

const listArrayShape = [] as ProjectedShapeArray<Pet, readonly ['name']>;
expectTypeAssignableTo<ProjectedShapeArray<Pet, readonly ['name']>>(listArrayShape);
type ListResL = ProjectedListModelResponse<Pet, readonly ['name']>;
type ListSuccData = Extract<ListResL, { success: true }>['data'];
expectTypeAssignableTo<ProjectedShapeArray<Pet, readonly ['name']>>([] as ListSuccData);

const arr: ProjectedShapeArray<Pet, readonly ['name']> = [{} as ProjectedShapeArray<Pet, readonly ['name']>[number]];
expectTypeAssignableTo<string>(arr[0].name);
// @ts-expect-error — array-element narrowing drops `status` to `string | undefined`.
expectTypeAssignableTo<string>(arr[0].status);

const projectedList = hooks.useList({
  listParams: { pageSize: 10 },
  advanced: true,
  select: ['name'] as const,
});
if (projectedList.data.length > 0) {
  expectTypeAssignableTo<string>(projectedList.data[0].name);
  // @ts-expect-error — use-list narrowing suppresses the omitted field at the public surface.
  expectTypeAssignableTo<string>(projectedList.data[0].status);
}

// ── Mutation narrowing ──

const noProjCreate = hooks.useCreate();
type CreateResult = UseCreateMutateResult<Pet>;
const createRes: CreateResult = noProjCreate;
expectTypeAssignableTo<(Model<Pet> & Pet) | null>(createRes.data);
if (noProjCreate.data) {
  expectTypeAssignableTo<string>(noProjCreate.data.name);
}

const projectedCreate = hooks.useCreate({ advanced: true, select: ['name'] as const });
if (projectedCreate.data) {
  expectTypeAssignableTo<string>(projectedCreate.data.name);
  // @ts-expect-error — use-create narrowing drops `status` to `string | undefined` for the projected case too.
  expectTypeAssignableTo<string>(projectedCreate.data.status);
}

const createOpts: UseCreateMutateOptions<Pet, readonly ['name']> = {
  advanced: true,
  select: ['name'] as const,
  onSuccess: (result) => {
    if (result.success) {
      expectTypeAssignableTo<string>(result.data.name);
      // @ts-expect-error — callback result also narrows the omitted field.
      expectTypeAssignableTo<string>(result.data.status);
    }
  },
};
void createOpts;

const projectedUpdate = hooks.useUpdate({ advanced: true, select: ['name'] as const });
if (projectedUpdate.data) {
  expectTypeAssignableTo<string>(projectedUpdate.data.name);
  // @ts-expect-error — use-update narrowing drops unselected fields.
  expectTypeAssignableTo<string>(projectedUpdate.data.status);
}

const updateOpts: UseUpdateMutateOptions<Pet, readonly ['name']> = {
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
void updateOpts;

const projectedUpsert = hooks.useUpsert({ advanced: true, select: ['name'] as const });
if (projectedUpsert.data) {
  expectTypeAssignableTo<string>(projectedUpsert.data.name);
  // @ts-expect-error — use-upsert narrowing drops unselected fields.
  expectTypeAssignableTo<string>(projectedUpsert.data.status);
}

const upsertOpts: UseUpsertMutateOptions<Pet, readonly ['name']> = {
  advanced: true,
  select: ['name'] as const,
  onSuccess: (result) => {
    if (result.success) {
      expectTypeAssignableTo<string>(result.data.name);
    }
  },
};
void upsertOpts;

// ── Mutation input inference from ModelService generics ──

const typedCreate = typedHooks.useCreate();
void typedCreate.mutate({ name: 'Northwind Labs', source: 'manual' });
// @ts-expect-error — create input keeps the service-required `source` field.
void typedCreate.mutate({ name: 'Northwind Labs' });
// @ts-expect-error — useCreate is single-record-only; array input is rejected.
void typedCreate.mutate([{ name: 'Northwind Labs', source: 'manual' }]);

const typedUpdate = typedHooks.useUpdate();
void typedUpdate.mutate('pet_1', { status: 'active', auditToken: 'audit-1' });
// @ts-expect-error — update input keeps the service-required audit token.
void typedUpdate.mutate('pet_1', { status: 'active' });

const typedUpsert = typedHooks.useUpsert();
void typedUpsert.mutate({ externalId: 'crm-1', name: 'Northwind Labs' });
// @ts-expect-error — upsert input keeps the service-required external id.
void typedUpsert.mutate({ name: 'Northwind Labs' });

// ── Manual query()/refetch() response payloads ──

void hooks
  .useList({ listParams: { pageSize: 10 } })
  .refetch()
  .then((_result): void => {
    type SuccP = typeof _result;
    type InnerData = Extract<SuccP, { success: true }>['data'];
    expectTypeAssignableTo<ProjectedShapeArray<Pet, Projection>>([] as InnerData);
  });

const manualRead = hooks.useRead({ id: '1' });
type ManualPromiseRes = Awaited<ReturnType<typeof manualRead.refetch>>;
expectTypeAssignableTo<ModelResponse<Pet>>({} as ManualPromiseRes);
void manualRead;

const manualList = hooks.useList({ listParams: { pageSize: 10 } });
type ManualListRes = Awaited<ReturnType<typeof manualList.query>>;
expectTypeAssignableTo<ListModelResponse<Pet>>({} as ManualListRes);
void manualList;

// ── ARR-B03 conservative projections: supplied-but-indeterminable and
// union selections must NOT fall back to the full required model ──

const b03DynString: string = 'status';
const b03DynArray: string[] = ['name'];
const b03Excl = { status: -1 } as const;
const b03Union: readonly ['name'] | readonly ['status'] = Date.now() > 0 ? (['name'] as const) : (['status'] as const);

// Omitted selection keeps the full-model shape (positive control).
type B03Omitted = ProjectedShape<Pet, Projection>;
expectTypeAssignableTo<Model<Pet> & Pet>({} as B03Omitted);

// Literal tuple keeps the selected field required (positive control).
type B03Literal = ProjectedShape<Pet, readonly ['name']>;
const b03Literal = {} as B03Literal;
expectTypeAssignableTo<string>(b03Literal.name);
// @ts-expect-error — literal ['name'] drops `status` to optional.
expectTypeAssignableTo<string>(b03Literal.status);

// Broad `string` select: every field optional on data and response payloads.
type B03DynStrData = ProjectedShape<Pet, string>;
const b03DynStrData = {} as B03DynStrData;
// @ts-expect-error — ARR-B03: dynamic string select cannot claim `status` as required.
expectTypeAssignableTo<string>(b03DynStrData.status);
type B03DynStrRes = ProjectedModelResponse<Pet, string>;
type B03DynStrSucc = Extract<B03DynStrRes, { success: true }>['data'];
const b03DynStrSucc = {} as B03DynStrSucc;
// @ts-expect-error — ARR-B03: dynamic string response payload cannot claim `status` as required.
expectTypeAssignableTo<string>(b03DynStrSucc.status);
const b03DynRead = hooks.useRead({ id: '1', advanced: true, select: b03DynString });
if (b03DynRead.data) {
  // @ts-expect-error — ARR-B03: hook data under a dynamic string select is optional.
  expectTypeAssignableTo<string>(b03DynRead.data.status);
}

// Broad `string[]` select: every field optional on list data, previousData, callbacks.
type B03DynArr = ProjectedShapeArray<Pet, string[]>;
const b03DynArr = {} as B03DynArr;
if (b03DynArr.length > 0) {
  // @ts-expect-error — ARR-B03: dynamic array select cannot claim `status` as required.
  expectTypeAssignableTo<string>(b03DynArr[0].status);
}
const b03DynList = hooks.useList({ listParams: { pageSize: 10 }, advanced: true, select: b03DynArray });
if (b03DynList.data.length > 0) {
  // @ts-expect-error — ARR-B03: hook list data under a dynamic array select is optional.
  expectTypeAssignableTo<string>(b03DynList.data[0].status);
}
if (b03DynList.previousData && b03DynList.previousData.length > 0) {
  // @ts-expect-error — ARR-B03: previousData follows the same conservative element shape.
  expectTypeAssignableTo<string>(b03DynList.previousData[0].status);
}
const b03DynOpts: UseReadQueryOptions<Pet, string> = {
  onSuccess: (result) => {
    if (result.success) {
      // @ts-expect-error — ARR-B03: onSuccess payload under a dynamic select is optional.
      expectTypeAssignableTo<string>(result.data.status);
    }
  },
};
void b03DynOpts;

// Exclusion-only `{ status: -1 }`: every field optional.
type B03ExclRes = ProjectedModelResponse<Pet, { status: -1 }>;
type B03ExclSucc = Extract<B03ExclRes, { success: true }>['data'];
const b03ExclSucc = {} as B03ExclSucc;
// @ts-expect-error — ARR-B03: exclusion-only select cannot claim `status` as required.
expectTypeAssignableTo<string>(b03ExclSucc.status);
const b03ExclRead = hooks.useRead({ id: '1', advanced: true, select: b03Excl });
if (b03ExclRead.data) {
  // @ts-expect-error — ARR-B03: hook data under an exclusion-only select is optional.
  expectTypeAssignableTo<string>(b03ExclRead.data.status);
}

// Union preserves alternatives instead of requiring both.
type B03Union = ProjectedShape<Pet, readonly ['name'] | readonly ['status']>;
const b03UnionShape = {} as B03Union;
// @ts-expect-error — ARR-B03: union select cannot claim `status` as required.
expectTypeAssignableTo<string>(b03UnionShape.status);
// @ts-expect-error — ARR-B03: union select cannot claim `name` as required.
expectTypeAssignableTo<string>(b03UnionShape.name);
const b03UnionRead = hooks.useRead({ id: '1', advanced: true, select: b03Union });
if (b03UnionRead.data) {
  // @ts-expect-error — ARR-B03: hook data under a union select cannot claim `status` as required.
  expectTypeAssignableTo<string>(b03UnionRead.data.status);
}

// Mutations: dynamic/union/exclusion selections are conservative on data,
// callbacks, and mutate() payloads.
const b03DynCreate = hooks.useCreate({ advanced: true, select: b03DynString });
if (b03DynCreate.data) {
  // @ts-expect-error — ARR-B03: create data under a dynamic select is optional.
  expectTypeAssignableTo<string>(b03DynCreate.data.status);
}
const b03UnionUpdate = hooks.useUpdate({ advanced: true, select: b03Union });
if (b03UnionUpdate.data) {
  // @ts-expect-error — ARR-B03: update data under a union select cannot claim `status` as required.
  expectTypeAssignableTo<string>(b03UnionUpdate.data.status);
}
const b03ExclUpsert = hooks.useUpsert({ advanced: true, select: b03Excl });
if (b03ExclUpsert.data) {
  // @ts-expect-error — ARR-B03: upsert data under an exclusion-only select is optional.
  expectTypeAssignableTo<string>(b03ExclUpsert.data.name);
}
