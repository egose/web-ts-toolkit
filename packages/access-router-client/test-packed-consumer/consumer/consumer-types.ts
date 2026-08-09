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
