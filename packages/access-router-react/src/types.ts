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
  axiosRequestConfig?: RequestConfig;
}

// ── Read ──

export interface UseReadModelOptions<T extends Document> extends UseBaseOptions {
  id?: string;
  advanced?: boolean;
  select?: Projection;
  populate?: ReadAdvancedArgs['populate'];
  sort?: ReadAdvancedArgs['sort'];
  include?: ReadAdvancedArgs['include'];
  tasks?: ReadAdvancedArgs['tasks'];
  options?: ReadOptions;
  advancedOptions?: ReadAdvancedOptions;
  enabled?: boolean;
  initialData?: (Model<T> & T) | null;
  onCompleted?: (result: ModelResponse<T>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ModelResponse<T> | null, error: ServiceError | null) => void;
}

export interface UseReadModelResult<T extends Document> {
  data: (Model<T> & T) | null;
  isLoading: boolean;
  isFetching: boolean;
  error: ServiceError | null;
  readModel: (id: string) => Promise<ModelResponse<T>>;
  refetch: () => void;
  reset: () => void;
}

// ── List ──

export interface UseListModelOptions<T extends Document> extends UseBaseOptions {
  listParams?: ListArgs;
  filter?: FilterQuery<T>;
  advanced?: boolean;
  sort?: ListAdvancedArgs['sort'];
  select?: Projection;
  populate?: ListAdvancedArgs['populate'];
  include?: ListAdvancedArgs['include'];
  tasks?: ListAdvancedArgs['tasks'];
  options?: ListOptions;
  advancedOptions?: ListAdvancedOptions;
  enabled?: boolean;
  keepPreviousData?: boolean;
  initialData?: (Model<T> & T)[];
  onCompleted?: (result: ListModelResponse<T>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ListModelResponse<T> | null, error: ServiceError | null) => void;
}

export interface UseListModelResult<T extends Document> {
  data: (Model<T> & T)[];
  previousData: (Model<T> & T)[] | undefined;
  totalCount: number;
  isLoading: boolean;
  isFetching: boolean;
  error: ServiceError | null;
  listModel: (args?: ListArgs) => Promise<ListModelResponse<T>>;
  refetch: () => void;
  reset: () => void;
}

// ── Create ──

export interface UseCreateModelOptions<T extends Document> extends UseBaseOptions {
  advanced?: boolean;
  select?: Projection;
  populate?: CreateAdvancedArgs['populate'];
  tasks?: CreateAdvancedArgs['tasks'];
  options?: CreateOptions;
  advancedOptions?: CreateAdvancedOptions;
  onCreated?: (result: ModelResponse<T>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ModelResponse<T> | null, error: ServiceError | null) => void;
}

export interface UseCreateModelResult<T extends Document> {
  data: (Model<T> & T) | null;
  isPending: boolean;
  error: ServiceError | null;
  createModel: (data: object) => Promise<ModelResponse<T>>;
  reset: () => void;
}

// ── Update ──

export interface UseUpdateModelOptions<T extends Document> extends UseBaseOptions {
  advanced?: boolean;
  select?: Projection;
  populate?: UpdateAdvancedArgs['populate'];
  tasks?: UpdateAdvancedArgs['tasks'];
  options?: UpdateOptions;
  advancedOptions?: UpdateAdvancedOptions;
  onUpdated?: (result: ModelResponse<T>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ModelResponse<T> | null, error: ServiceError | null) => void;
}

export interface UseUpdateModelResult<T extends Document> {
  data: (Model<T> & T) | null;
  isPending: boolean;
  error: ServiceError | null;
  updateModel: (id: string, data: object) => Promise<ModelResponse<T>>;
  reset: () => void;
}

// ── Upsert ──

export interface UseUpsertModelOptions<T extends Document> extends UseBaseOptions {
  advanced?: boolean;
  select?: Projection;
  populate?: UpsertAdvancedArgs['populate'];
  tasks?: UpsertAdvancedArgs['tasks'];
  options?: UpsertOptions;
  advancedOptions?: UpsertAdvancedOptions;
  onUpserted?: (result: ModelResponse<T>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: ModelResponse<T> | null, error: ServiceError | null) => void;
}

export interface UseUpsertModelResult<T extends Document> {
  data: (Model<T> & T) | null;
  isPending: boolean;
  error: ServiceError | null;
  upsertModel: (data: object) => Promise<ModelResponse<T>>;
  reset: () => void;
}

// ── Delete ──

export interface UseDeleteModelOptions extends UseBaseOptions {
  onDeleted?: (result: Response<string>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: Response<string> | null, error: ServiceError | null) => void;
}

export interface UseDeleteModelResult {
  isPending: boolean;
  error: ServiceError | null;
  deleteModel: (id: string) => Promise<Response<string>>;
  reset: () => void;
}

// ── Count ──

export interface UseCountModelOptions<T extends Document> extends UseBaseOptions {
  advanced?: boolean;
  filter?: FilterQuery<T>;
  enabled?: boolean;
  onCompleted?: (result: Response<number>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: Response<number> | null, error: ServiceError | null) => void;
}

export interface UseCountModelResult {
  data: number | null;
  isLoading: boolean;
  error: ServiceError | null;
  countModel: () => Promise<Response<number>>;
  refetch: () => void;
  reset: () => void;
}

// ── Distinct ──

export interface UseDistinctModelOptions<T extends Document> extends UseBaseOptions {
  field: string;
  conditions?: FilterQuery<T>;
  enabled?: boolean;
  onCompleted?: (result: Response<string[]>) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: Response<string[]> | null, error: ServiceError | null) => void;
}

export interface UseDistinctModelResult {
  data: string[] | null;
  isLoading: boolean;
  error: ServiceError | null;
  distinctModel: () => Promise<Response<string[]>>;
  refetch: () => void;
  reset: () => void;
}
