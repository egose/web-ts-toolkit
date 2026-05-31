import type {
  Document,
  Model,
  ServiceError,
  FilterQuery,
  Projection,
  ListArgs,
  ListAdvancedArgs,
  ReadAdvancedArgs,
  CreateAdvancedArgs,
  UpdateAdvancedArgs,
  Response,
  ModelResponse,
  ListModelResponse,
} from '@web-ts-toolkit/access-router-client';

// ── Read ──

export interface UseReadModelOptions<T extends Document> {
  id?: string;
  advanced?: boolean;
  select?: Projection;
  populate?: ReadAdvancedArgs['populate'];
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
}

// ── List ──

export interface UseListModelOptions<T extends Document> {
  listParams?: ListArgs;
  filter?: FilterQuery<T>;
  advanced?: boolean;
  sort?: ListAdvancedArgs['sort'];
  select?: Projection;
  populate?: ListAdvancedArgs['populate'];
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
}

// ── Create ──

export interface UseCreateModelOptions<T extends Document> {
  advanced?: boolean;
  select?: Projection;
  populate?: CreateAdvancedArgs['populate'];
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

export interface UseUpdateModelOptions<T extends Document> {
  advanced?: boolean;
  select?: Projection;
  populate?: UpdateAdvancedArgs['populate'];
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

// ── Delete ──

export interface UseDeleteModelOptions {
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

export interface UseCountModelOptions<T extends Document> {
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
}
