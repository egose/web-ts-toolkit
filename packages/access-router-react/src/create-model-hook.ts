import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  Document,
  Model,
  ModelService,
  ServiceError,
  FilterQuery,
  Projection,
  ListArgs,
  ListAdvancedArgs,
  ReadAdvancedArgs,
  CreateAdvancedArgs,
  UpdateAdvancedArgs,
  UpsertAdvancedArgs,
  Response,
  ModelResponse,
  ListModelResponse,
} from '@web-ts-toolkit/access-router-client';
import type {
  UseReadQueryOptions,
  UseReadQueryResult,
  UseListQueryOptions,
  UseListQueryResult,
  UseCreateMutateOptions,
  UseCreateMutateResult,
  UseUpdateMutateOptions,
  UseUpdateMutateResult,
  UseUpsertMutateOptions,
  UseUpsertMutateResult,
  UseDeleteMutateOptions,
  UseDeleteMutateResult,
  UseCountQueryOptions,
  UseCountQueryResult,
  UseDistinctQueryOptions,
  UseDistinctQueryResult,
} from './types';
import { isAbortError, useAbortManager, stableStringify, useMountRef } from './fetch';

// ── Internal helpers ──

interface AutoQueryConfig<R> {
  doFetch: (signal?: AbortSignal) => Promise<R>;
  applyResult: (res: R) => void;
  shouldFetch: boolean;
  deps: unknown[];
  onSuccess?: (result: R) => void;
  onError?: (error: ServiceError) => void;
  onSettled?: (result: R | null, error: ServiceError | null) => void;
}

function useAutoQuery<R>({
  doFetch,
  applyResult,
  shouldFetch,
  deps,
  onSuccess,
  onError,
  onSettled,
}: AutoQueryConfig<R>) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<ServiceError | null>(null);
  const manager = useAbortManager();
  const mountRef = useMountRef();

  const fetchAndSet = useCallback(
    async (signal?: AbortSignal): Promise<R> => {
      setIsFetching(true);
      setError(null);
      try {
        return await doFetch(signal);
      } catch (err) {
        if (!isAbortError(err)) setError(err as ServiceError);
        throw err;
      } finally {
        if (!signal?.aborted) setIsFetching(false);
      }
    },
    [doFetch],
  );

  const doFetchWithCallbacks = useCallback(
    async (signal?: AbortSignal): Promise<R> => {
      const res = await fetchAndSet(signal);
      if (!signal?.aborted) {
        applyResult(res);
        onSuccess?.(res);
        onSettled?.(res, null);
      }
      return res;
    },
    [fetchAndSet, applyResult, onSuccess, onSettled],
  );

  useEffect(() => {
    if (!shouldFetch) return;
    mountRef.current = true;
    setIsLoading(true);
    const controller = new AbortController();
    manager.replace(controller);

    doFetchWithCallbacks(controller.signal)
      .catch((err) => {
        if (!mountRef.current || controller.signal.aborted) return;
        onError?.(err as ServiceError);
        onSettled?.(null, err as ServiceError);
      })
      .finally(() => {
        if (mountRef.current && !controller.signal.aborted) setIsLoading(false);
      });

    return () => {
      mountRef.current = false;
      controller.abort();
    };
  }, deps);

  const refetch = useCallback(() => {
    setIsLoading(true);
    const controller = new AbortController();
    manager.replace(controller);
    doFetchWithCallbacks(controller.signal)
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
  }, [doFetchWithCallbacks, manager]);

  return { isLoading, isFetching, error, setError, refetch, manager, mountRef };
}

function useMutation<A extends unknown[], R>(
  execute: (...args: A) => Promise<R>,
  options?: { onSuccess?: (result: R) => void; onSettled?: (result: R | null, error: ServiceError | null) => void },
) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<ServiceError | null>(null);
  const mountRef = useMountRef();
  const { onSuccess, onSettled } = options ?? {};

  const executeMutate = useCallback(
    async (...args: A): Promise<R> => {
      setIsPending(true);
      setError(null);
      try {
        const result = await execute(...args);
        if (mountRef.current) {
          onSuccess?.(result);
          onSettled?.(result, null);
        }
        return result;
      } catch (err) {
        const svcErr = err as ServiceError;
        if (mountRef.current) {
          setError(svcErr);
          onSettled?.(null, svcErr);
        }
        throw svcErr;
      } finally {
        if (mountRef.current) setIsPending(false);
      }
    },
    [execute, mountRef, onSuccess, onSettled],
  );

  const reset = useCallback(() => setError(null), []);

  return { isPending, error, executeMutate, reset };
}

// ── Factory ──

/**
 * Creates query and mutation hooks bound to one `ModelService<T>`.
 *
 * @example
 * const { useList, useCreate } = createModelHooks({ modelService });
 */
export function createModelHooks<T extends Document>(config: { modelService: ModelService<T> }) {
  const { modelService } = config;

  // ── Query hooks ──

  function useRead(options: UseReadQueryOptions<T> = {}): UseReadQueryResult<T> {
    const {
      id,
      advanced,
      select,
      populate,
      sort,
      include,
      tasks,
      basicOptions,
      advancedOptions,
      enabled = true,
      initialData = null,
      requestConfig,
      onSuccess,
      onError,
      onSettled,
    } = options;
    const [data, setData] = useState<(Model<T> & T) | null>(initialData);

    const applyResult = useCallback((res: ModelResponse<T>) => {
      setData(res.data as Model<T> & T);
    }, []);

    const doFetchById = useCallback(
      async (targetId: string, signal?: AbortSignal): Promise<ModelResponse<T>> => {
        if (advanced) {
          return (await modelService
            .readAdvanced(
              targetId,
              { select, populate, sort, include, tasks } as ReadAdvancedArgs<Projection>,
              advancedOptions,
              { ...requestConfig, signal },
            )
            .exec()) as unknown as ModelResponse<T>;
        }
        return (await modelService
          .read(targetId, basicOptions, { ...requestConfig, signal })
          .exec()) as unknown as ModelResponse<T>;
      },
      [modelService, advanced, select, populate, sort, include, tasks, basicOptions, advancedOptions, requestConfig],
    );

    const doFetch = useCallback(
      (signal?: AbortSignal) => {
        if (!id) throw new Error('useRead: id is required');
        return doFetchById(id, signal);
      },
      [doFetchById, id],
    );

    const shouldFetch = Boolean(id && enabled);

    const { isLoading, isFetching, error, refetch } = useAutoQuery({
      doFetch,
      applyResult,
      shouldFetch,
      deps: [id, enabled, advanced, select, populate, sort, include, tasks, basicOptions, advancedOptions],
      onSuccess,
      onError,
      onSettled,
    });

    const query = useCallback(
      async (readId: string): Promise<ModelResponse<T>> => {
        const res = await doFetchById(readId);
        applyResult(res);
        onSuccess?.(res);
        onSettled?.(res, null);
        return res;
      },
      [doFetchById, applyResult, onSuccess, onSettled],
    );

    const reset = useCallback(() => {
      setData(initialData);
    }, [initialData]);

    return { data, isLoading, isFetching, error, query, refetch, reset };
  }

  function useList(options: UseListQueryOptions<T> = {}): UseListQueryResult<T> {
    const {
      listParams,
      filter,
      advanced,
      sort,
      select,
      populate,
      include,
      tasks,
      basicOptions,
      advancedOptions,
      enabled = true,
      keepPreviousData = false,
      initialData,
      requestConfig,
      onSuccess,
      onError,
      onSettled,
    } = options;
    const [data, setData] = useState<(Model<T> & T)[]>(initialData ?? []);
    const [previousData, setPreviousData] = useState<(Model<T> & T)[] | undefined>(undefined);
    const [totalCount, setTotalCount] = useState(0);
    const latestDataRef = useRef(data);
    latestDataRef.current = data;

    const applyResult = useCallback((res: ListModelResponse<T>) => {
      setData(res.data as (Model<T> & T)[]);
      setTotalCount(res.totalCount);
      setPreviousData(undefined);
    }, []);

    const baseFetch = useCallback(
      async (args: ListArgs | undefined, signal?: AbortSignal): Promise<ListModelResponse<T>> => {
        if (keepPreviousData) {
          setPreviousData(latestDataRef.current);
        }
        if (advanced) {
          return (await modelService
            .listAdvanced(
              (filter ?? {}) as FilterQuery<T>,
              { sort, select, populate, include, tasks, ...args } as ListAdvancedArgs<Projection>,
              advancedOptions,
              { ...requestConfig, signal },
            )
            .exec()) as unknown as ListModelResponse<T>;
        }
        return (await modelService
          .list(args ?? listParams, basicOptions, { ...requestConfig, signal })
          .exec()) as unknown as ListModelResponse<T>;
      },
      [
        modelService,
        advanced,
        filter,
        sort,
        select,
        populate,
        include,
        tasks,
        listParams,
        basicOptions,
        advancedOptions,
        requestConfig,
        keepPreviousData,
        latestDataRef,
      ],
    );

    const doFetch = useCallback((signal?: AbortSignal) => baseFetch(listParams, signal), [baseFetch, listParams]);

    const listParamsKey = stableStringify(listParams);
    const filterKey = stableStringify(filter);
    const sortKey = stableStringify(sort);

    const shouldFetch = Boolean((listParams || advanced) && enabled);

    const { isLoading, isFetching, error, refetch } = useAutoQuery({
      doFetch,
      applyResult,
      shouldFetch,
      deps: [
        listParamsKey,
        filterKey,
        advanced,
        enabled,
        select,
        populate,
        sortKey,
        include,
        tasks,
        basicOptions,
        advancedOptions,
      ],
      onSuccess,
      onError,
      onSettled,
    });

    const query = useCallback(
      async (args?: ListArgs): Promise<ListModelResponse<T>> => {
        const res = await baseFetch(args);
        applyResult(res);
        onSuccess?.(res);
        onSettled?.(res, null);
        return res;
      },
      [baseFetch, applyResult, onSuccess, onSettled],
    );

    const reset = useCallback(() => {
      setData(initialData ?? []);
      setPreviousData(undefined);
      setTotalCount(0);
    }, [initialData]);

    return { data, previousData, totalCount, isLoading, isFetching, error, query, refetch, reset };
  }

  // ── Mutation hooks ──

  function useCreate(options: UseCreateMutateOptions<T> = {}): UseCreateMutateResult<T> {
    const {
      advanced,
      select,
      populate,
      tasks,
      basicOptions,
      advancedOptions,
      requestConfig,
      onSuccess,
      onError,
      onSettled,
    } = options;
    const [data, setData] = useState<(Model<T> & T) | null>(null);
    const mountRef = useMountRef();

    const execute = useCallback(
      async (createData: object): Promise<ModelResponse<T>> => {
        let res: ModelResponse<T>;
        if (advanced) {
          res = (await modelService
            .createAdvanced(
              createData,
              { select, populate, tasks } as CreateAdvancedArgs<Projection>,
              advancedOptions,
              requestConfig,
            )
            .exec()) as unknown as ModelResponse<T>;
        } else {
          res = (await modelService
            .create(createData, basicOptions, requestConfig)
            .exec()) as unknown as ModelResponse<T>;
        }
        if (mountRef.current) setData(res.data as Model<T> & T);
        return res;
      },
      [modelService, advanced, select, populate, tasks, basicOptions, advancedOptions, requestConfig, mountRef],
    );

    const { isPending, error, executeMutate, reset: resetError } = useMutation(execute, { onSuccess, onSettled });

    const mutate = useCallback(
      async (createData: object): Promise<ModelResponse<T>> => {
        try {
          return await executeMutate(createData);
        } catch (err) {
          onError?.(err as ServiceError);
          throw err;
        }
      },
      [executeMutate, onError],
    );

    const reset = useCallback(() => {
      setData(null);
      resetError();
    }, [resetError]);

    return { data, isPending, error, mutate, reset };
  }

  function useUpdate(options: UseUpdateMutateOptions<T> = {}): UseUpdateMutateResult<T> {
    const {
      advanced,
      select,
      populate,
      tasks,
      basicOptions,
      advancedOptions,
      requestConfig,
      onSuccess,
      onError,
      onSettled,
    } = options;
    const [data, setData] = useState<(Model<T> & T) | null>(null);
    const mountRef = useMountRef();

    const execute = useCallback(
      async (updateId: string, updateData: object): Promise<ModelResponse<T>> => {
        let res: ModelResponse<T>;
        if (advanced) {
          res = (await modelService
            .updateAdvanced(
              updateId,
              updateData,
              { select, populate, tasks } as UpdateAdvancedArgs<Projection>,
              advancedOptions,
              requestConfig,
            )
            .exec()) as unknown as ModelResponse<T>;
        } else {
          res = (await modelService
            .update(updateId, updateData, basicOptions, requestConfig)
            .exec()) as unknown as ModelResponse<T>;
        }
        if (mountRef.current) setData(res.data as Model<T> & T);
        return res;
      },
      [modelService, advanced, select, populate, tasks, basicOptions, advancedOptions, requestConfig, mountRef],
    );

    const { isPending, error, executeMutate, reset: resetError } = useMutation(execute, { onSuccess, onSettled });

    const mutate = useCallback(
      async (updateId: string, updateData: object): Promise<ModelResponse<T>> => {
        try {
          return await executeMutate(updateId, updateData);
        } catch (err) {
          onError?.(err as ServiceError);
          throw err;
        }
      },
      [executeMutate, onError],
    );

    const reset = useCallback(() => {
      setData(null);
      resetError();
    }, [resetError]);

    return { data, isPending, error, mutate, reset };
  }

  function useUpsert(options: UseUpsertMutateOptions<T> = {}): UseUpsertMutateResult<T> {
    const {
      advanced,
      select,
      populate,
      tasks,
      basicOptions,
      advancedOptions,
      requestConfig,
      onSuccess,
      onError,
      onSettled,
    } = options;
    const [data, setData] = useState<(Model<T> & T) | null>(null);
    const mountRef = useMountRef();

    const execute = useCallback(
      async (upsertData: object): Promise<ModelResponse<T>> => {
        let res: ModelResponse<T>;
        if (advanced) {
          res = (await modelService
            .upsertAdvanced(
              upsertData,
              { select, populate, tasks } as UpsertAdvancedArgs<Projection>,
              advancedOptions,
              requestConfig,
            )
            .exec()) as unknown as ModelResponse<T>;
        } else {
          res = (await modelService
            .upsert(upsertData, basicOptions, requestConfig)
            .exec()) as unknown as ModelResponse<T>;
        }
        if (mountRef.current) setData(res.data as Model<T> & T);
        return res;
      },
      [modelService, advanced, select, populate, tasks, basicOptions, advancedOptions, requestConfig, mountRef],
    );

    const { isPending, error, executeMutate, reset: resetError } = useMutation(execute, { onSuccess, onSettled });

    const mutate = useCallback(
      async (upsertData: object): Promise<ModelResponse<T>> => {
        try {
          return await executeMutate(upsertData);
        } catch (err) {
          onError?.(err as ServiceError);
          throw err;
        }
      },
      [executeMutate, onError],
    );

    const reset = useCallback(() => {
      setData(null);
      resetError();
    }, [resetError]);

    return { data, isPending, error, mutate, reset };
  }

  function useDelete(options: UseDeleteMutateOptions = {}): UseDeleteMutateResult {
    const { requestConfig, onSuccess, onError, onSettled } = options;

    const execute = useCallback(
      async (deleteId: string): Promise<Response<string>> => {
        const res = await modelService.delete(deleteId, requestConfig).exec();
        return res as Response<string>;
      },
      [modelService, requestConfig],
    );

    const { isPending, error, executeMutate, reset } = useMutation(execute, { onSuccess, onSettled });

    const mutate = useCallback(
      async (deleteId: string): Promise<Response<string>> => {
        try {
          return await executeMutate(deleteId);
        } catch (err) {
          onError?.(err as ServiceError);
          throw err;
        }
      },
      [executeMutate, onError],
    );

    return { isPending, error, mutate, reset };
  }

  // ── Count ──

  function useCount(options: UseCountQueryOptions<T> = {}): UseCountQueryResult {
    const { advanced, filter, enabled = true, requestConfig, onSuccess, onError, onSettled } = options;
    const [data, setData] = useState<number | null>(null);

    const applyResult = useCallback((res: Response<number>) => {
      setData(res.data as number);
    }, []);

    const doFetch = useCallback(
      async (signal?: AbortSignal): Promise<Response<number>> => {
        if (advanced) {
          return (await modelService
            .countAdvanced((filter ?? {}) as FilterQuery<T>, undefined, { ...requestConfig, signal })
            .exec()) as unknown as Response<number>;
        }
        return (await modelService.count({ ...requestConfig, signal }).exec()) as unknown as Response<number>;
      },
      [modelService, advanced, filter, requestConfig],
    );

    const filterKey = stableStringify(filter);

    const { isLoading, error, refetch } = useAutoQuery({
      doFetch,
      applyResult,
      shouldFetch: enabled,
      deps: [enabled, advanced, filterKey],
      onSuccess,
      onError,
      onSettled,
    });

    const query = useCallback(async (): Promise<Response<number>> => {
      const res = await doFetch();
      applyResult(res);
      onSuccess?.(res);
      onSettled?.(res, null);
      return res;
    }, [doFetch, applyResult, onSuccess, onSettled]);

    const reset = useCallback(() => {
      setData(null);
    }, []);

    return { data, isLoading, error, query, refetch, reset };
  }

  // ── Distinct ──

  function useDistinct(options: UseDistinctQueryOptions<T>): UseDistinctQueryResult {
    const { field, conditions, enabled = true, requestConfig, onSuccess, onError, onSettled } = options;
    const [data, setData] = useState<string[] | null>(null);

    const applyResult = useCallback((res: Response<string[]>) => {
      setData(res.data as string[]);
    }, []);

    const doFetch = useCallback(
      async (signal?: AbortSignal): Promise<Response<string[]>> => {
        if (conditions && Object.keys(conditions).length > 0) {
          return (await modelService
            .distinctAdvanced(field, conditions as FilterQuery<T>, { ...requestConfig, signal })
            .exec()) as unknown as Response<string[]>;
        }
        return (await modelService.distinct(field, { ...requestConfig, signal }).exec()) as unknown as Response<
          string[]
        >;
      },
      [modelService, field, conditions, requestConfig],
    );

    const conditionsKey = stableStringify(conditions);

    const { isLoading, error, refetch } = useAutoQuery({
      doFetch,
      applyResult,
      shouldFetch: enabled,
      deps: [enabled, field, conditionsKey],
      onSuccess,
      onError,
      onSettled,
    });

    const query = useCallback(async (): Promise<Response<string[]>> => {
      const res = await doFetch();
      applyResult(res);
      onSuccess?.(res);
      onSettled?.(res, null);
      return res;
    }, [doFetch, applyResult, onSuccess, onSettled]);

    const reset = useCallback(() => {
      setData(null);
    }, []);

    return { data, isLoading, error, query, refetch, reset };
  }

  return {
    useRead,
    useList,
    useCreate,
    useUpdate,
    useUpsert,
    useDelete,
    useCount,
    useDistinct,
  };
}
