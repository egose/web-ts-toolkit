/**
 * Consumer TS source exercised by ARC-18 packed-tarball install test under
 * both NodeNext and Bundler resolution with `strict: true`,
 * `skipLibCheck: false`, `noEmit: true`. Declarations are resolved from the
 * installed `node_modules/@web-ts-toolkit/access-router-client` tarball via
 * the real export map (no `paths` override), mirroring how an external
 * TypeScript consumer installs and uses the package.
 *
 * The `await petService.create(...)` narrowings below force the call-site
 * inference of the generic `TData extends Partial<T> = T` param (rather than
 * extracting `ReturnType<typeof petService.create>` without a call, where
 * TypeScript surfaces the constraint's lower bound `Partial<T>` as the free
 * type argument). The runtime body is empty; `tsc --noEmit` enforces the
 * type-level checks, mirroring a normal typed consumer.
 */
import {
  createAdapter,
  CustomHeaders,
  Model,
  ModelService,
  DataService,
  Response,
  SuccessResult,
  FailureResult,
  ListModelResponse,
  ServiceError,
  MissingPersistenceIdentityError,
  ResultError,
  parentField,
  CorrelatedIncludeError,
  CorrelatedInclude,
  CorrelatedFilterQuery,
  ParentRef,
  WithCorrelatedOutputs,
} from '@web-ts-toolkit/access-router-client';

interface Pet {
  _id?: string;
  name: string;
  age: number;
}

const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
const petService = adapter.createModelService<Pet>({ modelName: 'Pet', basePath: 'pets' });
const fruitService = adapter.createDataService<Pet>({ dataName: 'fruit', basePath: 'fruit' });

// Positive: services typed correctly
petService satisfies ModelService<Pet>;
fruitService satisfies DataService<Pet>;

// Positive: discriminated Response narrowing
const res = {} as Response<Pet, Pet>;
if (res.success) {
  res satisfies SuccessResult<Pet, Pet>;
  res.raw satisfies Pet;
  res.data satisfies Pet;
} else {
  res satisfies FailureResult;
  res.data satisfies null;
  res.raw satisfies unknown;
  // @ts-expect-error Default failure raw is not the successful payload type.
  res.raw satisfies Pet | null;
}

type Problem = { code: string; errors?: string[] };
const customErrorResponse = {} as Response<Pet, Pet, Problem>;
if (!customErrorResponse.success) {
  customErrorResponse satisfies FailureResult<Problem>;
  customErrorResponse.raw satisfies Problem | null;
}

// Positive: list response guarantees totalCount on both branches
const list = {} as ListModelResponse<Pet>;
list.totalCount satisfies number;
if (list.success) {
  list satisfies SuccessResult<Pet[], Pet[]>;
} else {
  list satisfies FailureResult;
}

// Positive: CustomHeaders enum reachable and typed
CustomHeaders.TotalCount satisfies CustomHeaders;

// Negative: non-Document models rejected at the consumer boundary
// @ts-expect-error — `number` does not satisfy `extends Document`.
adapter.createModelService<number>({ modelName: 'N', basePath: 'n' });

// Positive: invoking petService.create(...) at a call site forces TData
// inference (rather than reading the method's bare generic signature, where
// TypeScript surfaces the constraint's lower bound `Partial<T>` as the free
// type argument). The await path resolves to `ModelResponse<Pet>`, after
// which the discriminated `success` narrowing yields `data: Model<Pet> & Pet`
// (so `.save()` is callable on the success branch).
let successBranchData: (Model<Pet> & Pet) | null;

declare const createResult: Promise<Response<Pet, Model<Pet> & Pet>>;
const awaited = await createResult;
if (awaited.success) {
  awaited satisfies SuccessResult<Pet, Model<Pet> & Pet>;
  successBranchData = awaited.data;
} else {
  awaited satisfies FailureResult;
  successBranchData = null;
}
void successBranchData;

// Positive: ServiceError is constructible from a ResultError and exposes
// the documented failure shape (`data: null`, `success: false`).
const errorInput: ResultError = {
  success: false,
  raw: {},
  data: null,
  message: 'boom',
  status: 500,
  headers: { 'x-trace': 'abc' },
};
const err = new ServiceError(errorInput) as ServiceError;
if (!err.success) {
  err.data satisfies null;
}
void err;

// Positive: ARC-21 — MissingPersistenceIdentityError is a public runtime+type
// export that extends Error so consumers can `catch (e) { if (e instanceof
// MissingPersistenceIdentityError) ... }` against a projected-read Model save
// the server-refuses-to-duplicate contract.
const persistenceErr = new MissingPersistenceIdentityError('no id');
persistenceErr satisfies MissingPersistenceIdentityError;
const _isError: Error = persistenceErr;
void _isError;

import type { ModelResponse } from '@web-ts-toolkit/access-router-client';
declare const lazyCreate: Promise<ModelResponse<Pet>>;
const fromLazy = await lazyCreate;
fromLazy satisfies Response<Pet, Model<Pet> & Pet>;

// Positive: ACI-04 — parentField markers, correlated filters, and $include
// composition are reachable from the packed declarations.
const ownerRef: ParentRef = parentField('orgId');
ownerRef satisfies ParentRef;
const correlatedFilter: CorrelatedFilterQuery<Pet> = { name: parentField('name') };
void correlatedFilter;
const ownerInc = petService.read(parentField('_id')).$include<'owner', Pet>('owner');
ownerInc satisfies CorrelatedInclude<'owner', Pet, 'read'>;
type PetWithOwner = WithCorrelatedOutputs<Pet, [typeof ownerInc]>;
declare const petWithOwner: PetWithOwner;
const owner: Pet | null = petWithOwner.owner;
void owner;
const correlatedErr = new CorrelatedIncludeError('bad include');
const _correlatedIsError: Error = correlatedErr;
void _correlatedIsError;

// SVA-10: server capabilities must not become typed client request options.
import type {
  ListOptions,
  ReadOptions,
  CreateOptions,
  UpdateOptions,
  UpsertOptions,
  Populate,
} from '@web-ts-toolkit/access-router-client';
type ClientOptions = ListOptions | ReadOptions | CreateOptions | UpdateOptions | UpsertOptions | Populate;
type Keys<T> = T extends unknown ? keyof T : never;
type AssertNever<T extends never> = T;
export type NoServerAuthority = AssertNever<
  Extract<Keys<ClientOptions>, 'authorization' | 'overrides' | 'documentAuthorization' | 'execution' | 'preparedQuery'>
>;
// @ts-expect-error list transport cannot carry server policy
const backendList: ListOptions = { authorization: { rows: { mode: 'unrestricted' } } };
// @ts-expect-error read transport cannot carry server policy
const backendRead: ReadOptions = { authorization: { outputFields: { mode: 'grant', paths: ['name'] } } };
// @ts-expect-error create transport cannot carry server policy
const backendCreate: CreateOptions = { authorization: {} };
// @ts-expect-error update transport cannot carry document-state handles
const backendUpdate: UpdateOptions = { documentAuthorization: {} };
// @ts-expect-error upsert transport cannot carry prepared execution
const backendUpsert: UpsertOptions = { preparedQuery: {} };
// @ts-expect-error populate descriptors cannot carry target authority
const backendPopulate: Populate = { path: 'owner', authorization: {} };
// @ts-expect-error client read methods do not acquire the backend service API
petService.read('pet-1', {}, { authorization: {} });
// @ts-expect-error removed service overrides are not client options
petService.list({}, { overrides: {} });
// @ts-expect-error backend policy types are not client exports
export type NoClientPolicyExport = import('@web-ts-toolkit/access-router-client').ServiceAuthorization;
void [backendList, backendRead, backendCreate, backendUpdate, backendUpsert, backendPopulate];

// HYD-04: installed declarations expose no client hydration control, including
// advanced calls, adapter/service defaults and reference-bearing descriptors.
import type {
  AdapterOptions,
  ModelServiceOptions,
  ListAdvancedOptions,
  ReadAdvancedOptions,
  Defaults,
  DataDefaults,
  SubQueryOptions,
} from '@web-ts-toolkit/access-router-client';

type HydrationControl = 'lean' | 'hydration';
type OperationDefaults = NonNullable<Defaults[keyof Defaults]>;
export type NoClientHydration = AssertNever<
  Extract<HydrationControl, Keys<ClientOptions | ListAdvancedOptions | ReadAdvancedOptions | SubQueryOptions>>
>;
export type NoDefaultHydration = AssertNever<
  Extract<HydrationControl, Keys<Defaults | DataDefaults | OperationDefaults | AdapterOptions | ModelServiceOptions>>
>;

// @ts-expect-error basic list options never select Mongoose hydration
petService.list({}, { lean: false });
// @ts-expect-error shorthand list options have no replacement knob
petService.list({ hydration: 'hydrated' });
// @ts-expect-error advanced list options never select Mongoose hydration
petService.listAdvanced({}, undefined, { lean: true });
// @ts-expect-error advanced list options have no replacement knob
petService.listAdvanced({}, undefined, { hydration: { publicList: 'lean' } });
// @ts-expect-error basic read options never select Mongoose hydration
petService.read('pet-1', { lean: true });
// @ts-expect-error full-form read options have no replacement knob
petService.read('pet-1', {}, { hydration: 'lean' });
// @ts-expect-error advanced identifier read options never select hydration
petService.readAdvanced('pet-1', undefined, { lean: false });
// @ts-expect-error advanced identifier read options have no replacement knob
petService.readAdvanced('pet-1', undefined, { hydration: 'hydrated' });
// @ts-expect-error advanced filter read options never select hydration
petService.readAdvancedFilter({}, undefined, { lean: false });
// @ts-expect-error advanced filter read options have no replacement knob
petService.readAdvancedFilter({}, undefined, { hydration: 'lean' });
// @ts-expect-error descriptors do not acquire hydration settings
petService.read(parentField('_id'), undefined, { lean: false });
// @ts-expect-error correlated list descriptors have no replacement knob
petService.listAdvanced({ name: parentField('name') }, undefined, { hydration: 'lean' });

const noHydrationDefaults: Defaults = {
  // @ts-expect-error basic list defaults do not select hydration
  listOptions: { lean: false },
  // @ts-expect-error advanced list defaults have no replacement knob
  listAdvancedOptions: { hydration: 'hydrated' },
  // @ts-expect-error basic read defaults do not select hydration
  readOptions: { lean: true },
  // @ts-expect-error advanced read defaults have no replacement knob
  readAdvancedOptions: { hydration: { publicRead: 'lean' } },
};
void noHydrationDefaults;
// @ts-expect-error adapter model defaults cannot configure server hydration
createAdapter({}, { modelDefaults: { listOptions: { lean: false } } });
// @ts-expect-error service defaults cannot configure server hydration
adapter.createModelService<Pet>({ modelName: 'Pet', basePath: 'pets' }, { readOptions: { hydration: 'lean' } });
// @ts-expect-error server hydration configuration types are not client exports
export type NoClientHydrationExport = import('@web-ts-toolkit/access-router-client').ModelHydrationOptions;

// The same names remain valid business fields, not recursively stripped keys.
interface BusinessDocument extends Pet {
  lean: string;
  hydration: string;
}
const businessService = adapter.createModelService<BusinessDocument>({ modelName: 'Business', basePath: 'business' });
businessService.listAdvanced({ lean: 'value', hydration: 'value' }, { select: ['lean', 'hydration'] });
businessService.create({ lean: 'value', hydration: 'value' });
businessService.update('id', { lean: 'changed', hydration: 'changed' });
businessService.listAdvanced(
  {},
  {
    tasks: { type: 'MASK', args: [{ src: 'payload', replacement: { lean: 'data', hydration: 'data' } }], options: {} },
  },
);
