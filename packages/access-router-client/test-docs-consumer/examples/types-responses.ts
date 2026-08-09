/**
 * ARC-20: extracted from website typescript-and-errors.mdx "Important Response
 * Types" + index.md "Response shape". Exercises the discriminated
 * `Response<TRaw, TData>` union narrowing on `result.success`, the
 * `ListModelResponse<T>.totalCount` invariant, and the
 * `SubDocumentListResponse<S>.count` invariant. A regression to the
 * pre-ARC-14 shape (e.g. `data` non-`null` on failure) fails this compile.
 */
import {
  type FailureResult as PackageFailureResult,
  type LazyRequest as PackageLazyRequest,
  type ListModelResponse,
  type Response as PackageResponse,
  type SubDocumentListResponse,
  type SuccessResult as PackageSuccessResult,
  type WrapOptions as PackageWrapOptions,
} from '@web-ts-toolkit/access-router-client';

interface WrapOptions {
  queryParams?: Record<string, unknown>;
  pathParams?: Record<string, string | number>;
}

interface LazyRequest<T> extends Promise<T> {
  exec(): Promise<T>;
}

const documentedWrapOptions = {} as WrapOptions satisfies PackageWrapOptions;
void documentedWrapOptions;
const documentedLazyRequest = {} as LazyRequest<unknown> satisfies PackageLazyRequest<unknown>;
void documentedLazyRequest;

interface SuccessResult<TRaw, TData = TRaw> {
  success: true;
  raw: TRaw;
  data: TData;
  message: string;
  status: number;
  headers: Record<string, string>;
}

interface FailureResult<TError = unknown> {
  success: false;
  raw: TError | null;
  data: null;
  message: string;
  status: number;
  headers: Record<string, string>;
}

type Response<TRaw, TData = TRaw, TError = unknown> = SuccessResult<TRaw, TData> | FailureResult<TError>;

void (null as unknown as Response<unknown>);
void (null as unknown as Response<unknown> satisfies PackageResponse<unknown>);
void (null as unknown as SuccessResult<unknown> satisfies PackageSuccessResult<unknown>);
void (null as unknown as FailureResult satisfies PackageFailureResult);

interface Pet {
  _id?: string;
  name: string;
  age: number;
}

const res = {} as Response<Pet, Pet>;
if (res.success) {
  res satisfies SuccessResult<Pet, Pet>;
  res.raw satisfies Pet;
  res.data satisfies Pet;
} else {
  res satisfies FailureResult;
  res.data satisfies null;
  res.raw satisfies unknown;
  // @ts-expect-error Failure raw does not silently inherit the success payload.
  res.raw satisfies Pet | null;
}

type Problem = { code: string; detail?: string };
const typedError = {} as Response<Pet, Pet, Problem>;
if (!typedError.success) typedError.raw satisfies Problem | null;

const list = {} as ListModelResponse<Pet>;
list.totalCount satisfies number;
if (list.success) {
  list satisfies SuccessResult<Pet[], Pet[]>;
} else {
  list satisfies FailureResult;
  list.totalCount satisfies number;
}

const subList = {} as SubDocumentListResponse<{ label: string }>;
subList.count satisfies number;
if (subList.success) {
  subList satisfies SuccessResult<{ label: string }[], { label: string }[]>;
  subList.data satisfies { label: string }[];
} else {
  subList satisfies FailureResult;
  subList.count satisfies number;
}
