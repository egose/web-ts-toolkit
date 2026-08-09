/**
 * ARC-20: extracted from website typescript-and-errors.mdx "Important Response
 * Types" + index.md "Response shape". Exercises the discriminated
 * `Response<TRaw, TData>` union narrowing on `result.success`, the
 * `ListModelResponse<T>.totalCount` invariant, and the
 * `SubDocumentListResponse<S>.count` invariant. A regression to the
 * pre-ARC-14 shape (e.g. `data` non-`null` on failure) fails this compile.
 */
import {
  type FailureResult,
  type ListModelResponse,
  type Response,
  type SubDocumentListResponse,
  type SuccessResult,
} from '@web-ts-toolkit/access-router-client';

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
  res satisfies FailureResult<Pet>;
  res.data satisfies null;
  res.raw satisfies Pet | null;
}

const list = {} as ListModelResponse<Pet>;
list.totalCount satisfies number;
if (list.success) {
  list satisfies SuccessResult<Pet[], Pet[]>;
} else {
  list satisfies FailureResult<Pet[]>;
  list.totalCount satisfies number;
}

const subList = {} as SubDocumentListResponse<{ label: string }>;
subList.count satisfies number;
if (subList.success) {
  subList satisfies SuccessResult<{ label: string }[], { label: string }[]>;
  subList.data satisfies { label: string }[];
} else {
  subList satisfies FailureResult<{ label: string }[]>;
  subList.count satisfies number;
}
