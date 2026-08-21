import {
  // Adapter factory — the primary entry point.
  createAdapter,
  // Service classes. `ModelService` and `DataService` are what
  // `createAdapter(...)` constructs; `Service` is an advanced base class
  // for callers that need a bespoke service shape.
  ModelService,
  DataService,
  Service,
  // Dirty-tracking model wrapper.
  Model,
  // Thrown when `throwOnError` is enabled and a request resolves to a
  // `{ success: false }` result.
  ServiceError,
  // Thrown instead of creating a duplicate when an existing projected model
  // has no recoverable persistence identity.
  MissingPersistenceIdentityError,
  // Lazy-promise wrapper with non-enumerable metadata and a single
  // shared execution. Used internally by service methods; exported so
  // consumers can build compatible lazy promises for custom batches.
  wrapLazyPromise,
  // Normalized response-count / pagination header names.
  CustomHeaders,
  // Generic list helpers used internally by model list methods; useful for
  // callers that manipulate `Model<T>[]` directly.
  replaceItemById,
  removeItemById,
} from '@web-ts-toolkit/access-router-client';

import type {
  // Adapter and per-factory option types.
  AdapterOptions,
  ModelServiceOptions,
  DataServiceOptions,
  // Cache policy types referenced by `AdapterOptions`.
  CacheController,
  CachePartitioner,
  // Discriminated response union and success/failure members.
  Response,
  SuccessResult,
  FailureResult,
  // Model and data response aliases.
  ModelResponse,
  ArrayModelResponse,
  ListModelResponse,
  DataResponse,
  ArrayDataResponse,
  ListDataResponse,
  SubDocumentResponse,
  SubDocumentListResponse,
  // Per-method args and options for both `ModelService<T>` and `DataService<T>`.
  // (See the "TypeScript And Errors" doc page for the full list.)
  Defaults,
  DataDefaults,
  // Filter, projection, populate, sort, and request-meta primitives.
  FilterQuery,
  ModelMutationInput,
  SubDocumentMutationInput,
  DottedPathFilter,
  ServerSideCast,
  Projection,
  Populate,
  Sort,
  Document,
} from '@web-ts-toolkit/access-router-client';

void [
  createAdapter,
  ModelService,
  DataService,
  Service,
  Model,
  ServiceError,
  MissingPersistenceIdentityError,
  wrapLazyPromise,
  CustomHeaders,
  replaceItemById,
  removeItemById,
];

type StablePublicTypes = [
  AdapterOptions,
  ModelServiceOptions,
  DataServiceOptions,
  CacheController,
  CachePartitioner,
  Response<unknown>,
  SuccessResult<unknown>,
  FailureResult,
  ModelResponse<Document>,
  ArrayModelResponse<Document>,
  ListModelResponse<Document>,
  DataResponse<unknown>,
  ArrayDataResponse<unknown>,
  ListDataResponse<unknown>,
  SubDocumentResponse<unknown>,
  SubDocumentListResponse<unknown>,
  Defaults,
  DataDefaults,
  FilterQuery<Document>,
  ModelMutationInput<Document>,
  SubDocumentMutationInput<{ label: string }>,
  DottedPathFilter<Document>,
  ServerSideCast<Document>,
  Projection,
  Populate,
  Sort,
  Document,
];
void (null as unknown as StablePublicTypes);
