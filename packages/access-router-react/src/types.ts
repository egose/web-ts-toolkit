import type {
  Document,
  Model,
  ServiceError,
  FilterQuery,
  Projection,
  ListArgs,
  ListAdvancedArgs,
  ListOptions,
  ListAdvancedOptions,
  ReadAdvancedArgs,
  ReadOptions,
  ReadAdvancedOptions,
  CreateAdvancedArgs,
  CreateOptions,
  CreateAdvancedOptions,
  UpdateAdvancedArgs,
  UpdateOptions,
  UpdateAdvancedOptions,
  UpsertAdvancedArgs,
  UpsertOptions,
  UpsertAdvancedOptions,
  Response,
  ModelResponse,
  ListModelResponse,
} from '@web-ts-toolkit/access-router-client';

export interface RequestConfig {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  [key: string]: unknown;
}

// ── Shared ──

export interface UseBaseOptions {
  requestConfig?: RequestConfig;
}

// ── Read ──

export interface UseReadQueryOptions<T extends Document> extends UseBaseOptions {
  id?: string;
  advanced?: boolean;
  select?: Projection;
  populate?: ReadAdvancedArgs['populate'];
  sort?: ReadAdvancedArgs['sort'];
  include?: ReadAdvancedArgs['include'];
  tasks?: ReadAdvancedArgs['tasks'];
  basicOptions?: ReadOptions;
  advancedOptions?: ReadAdvancedOptions;
  enabled?: boolean;
  initialData?: (Model<T> & T) | null;
  onSuccess?: (result: ModelResponse<T>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ModelResponse<T> | null, error: ServiceError | null) => void;
}

export interface UseReadQueryResult<T extends Document> {
  data: (Model<T> & T) | null;
  isLoading: boolean;
  isFetching: boolean;
  error: ServiceError | null;
  query: (id: string) => Promise<ModelResponse<T>>;
  refetch: () => void;
  reset: () => void;
}

// ── List ──

export interface UseListQueryOptions<T extends Document> extends UseBaseOptions {
  listParams?: ListArgs;
  filter?: FilterQuery<T>;
  advanced?: boolean;
  sort?: ListAdvancedArgs['sort'];
  select?: Projection;
  populate?: ListAdvancedArgs['populate'];
  include?: ListAdvancedArgs['include'];
  tasks?: ListAdvancedArgs['tasks'];
  basicOptions?: ListOptions;
  advancedOptions?: ListAdvancedOptions;
  enabled?: boolean;
  keepPreviousData?: boolean;
  initialData?: (Model<T> & T)[];
  onSuccess?: (result: ListModelResponse<T>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ListModelResponse<T> | null, error: ServiceError | null) => void;
}

export interface UseListQueryResult<T extends Document> {
  data: (Model<T> & T)[];
  previousData: (Model<T> & T)[] | undefined;
  totalCount: number;
  isLoading: boolean;
  isFetching: boolean;
  error: ServiceError | null;
  query: (args?: ListArgs) => Promise<ListModelResponse<T>>;
  refetch: () => void;
  reset: () => void;
}

// ── Create ──

export interface UseCreateMutateOptions<T extends Document> extends UseBaseOptions {
  advanced?: boolean;
  select?: Projection;
  populate?: CreateAdvancedArgs['populate'];
  tasks?: CreateAdvancedArgs['tasks'];
  basicOptions?: CreateOptions;
  advancedOptions?: CreateAdvancedOptions;
  onSuccess?: (result: ModelResponse<T>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ModelResponse<T> | null, error: ServiceError | null) => void;
}

export interface UseCreateMutateResult<T extends Document> {
  data: (Model<T> & T) | null;
  isPending: boolean;
  error: ServiceError | null;
  mutate: (data: object) => Promise<ModelResponse<T>>;
  reset: () => void;
}

// ── Update ──

export interface UseUpdateMutateOptions<T extends Document> extends UseBaseOptions {
  advanced?: boolean;
  select?: Projection;
  populate?: UpdateAdvancedArgs['populate'];
  tasks?: UpdateAdvancedArgs['tasks'];
  basicOptions?: UpdateOptions;
  advancedOptions?: UpdateAdvancedOptions;
  onSuccess?: (result: ModelResponse<T>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ModelResponse<T> | null, error: ServiceError | null) => void;
}

export interface UseUpdateMutateResult<T extends Document> {
  data: (Model<T> & T) | null;
  isPending: boolean;
  error: ServiceError | null;
  mutate: (id: string, data: object) => Promise<ModelResponse<T>>;
  reset: () => void;
}

// ── Upsert ──

export interface UseUpsertMutateOptions<T extends Document> extends UseBaseOptions {
  advanced?: boolean;
  select?: Projection;
  populate?: UpsertAdvancedArgs['populate'];
  tasks?: UpsertAdvancedArgs['tasks'];
  basicOptions?: UpsertOptions;
  advancedOptions?: UpsertAdvancedOptions;
  onSuccess?: (result: ModelResponse<T>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ModelResponse<T> | null, error: ServiceError | null) => void;
}

export interface UseUpsertMutateResult<T extends Document> {
  data: (Model<T> & T) | null;
  isPending: boolean;
  error: ServiceError | null;
  mutate: (data: object) => Promise<ModelResponse<T>>;
  reset: () => void;
}

// ── Delete ──

export interface UseDeleteMutateOptions extends UseBaseOptions {
  onSuccess?: (result: Response<string>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: Response<string> | null, error: ServiceError | null) => void;
}

export interface UseDeleteMutateResult {
  isPending: boolean;
  error: ServiceError | null;
  mutate: (id: string) => Promise<Response<string>>;
  reset: () => void;
}

// ── Count ──

export interface UseCountQueryOptions<T extends Document> extends UseBaseOptions {
  advanced?: boolean;
  filter?: FilterQuery<T>;
  enabled?: boolean;
  onSuccess?: (result: Response<number>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: Response<number> | null, error: ServiceError | null) => void;
}

export interface UseCountQueryResult {
  data: number | null;
  isLoading: boolean;
  error: ServiceError | null;
  query: () => Promise<Response<number>>;
  refetch: () => void;
  reset: () => void;
}

// ── Distinct ──

export interface UseDistinctQueryOptions<T extends Document> extends UseBaseOptions {
  field: string;
  conditions?: FilterQuery<T>;
  enabled?: boolean;
  onSuccess?: (result: Response<string[]>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: Response<string[]> | null, error: ServiceError | null) => void;
}

export interface UseDistinctQueryResult {
  data: string[] | null;
  isLoading: boolean;
  error: ServiceError | null;
  query: () => Promise<Response<string[]>>;
  refetch: () => void;
  reset: () => void;
}
