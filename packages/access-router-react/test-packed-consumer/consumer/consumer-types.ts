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
