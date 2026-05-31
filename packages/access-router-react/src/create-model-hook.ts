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
  UseReadModelOptions,
  UseReadModelResult,
  UseListModelOptions,
  UseListModelResult,
  UseCreateModelOptions,
  UseCreateModelResult,
  UseUpdateModelOptions,
  UseUpdateModelResult,
  UseUpsertModelOptions,
  UseUpsertModelResult,
  UseDeleteModelOptions,
  UseDeleteModelResult,
  UseCountModelOptions,
  UseCountModelResult,
  UseDistinctModelOptions,
  UseDistinctModelResult,
} from './types';
import { isAbortError, useAbortManager, stableStringify, useMountRef } from './fetch';

export function createModelHooks<T extends Document>(config: { modelService: ModelService<T> }) {
  const { modelService } = config;

  // ── Query hooks ──

  function useReadModel(options: UseReadModelOptions<T> = {}): UseReadModelResult<T> {
    const {
      id,
      advanced,
      select,
      populate,
      sort,
      include,
      tasks,
      options: readOptions,
      advancedOptions,
      enabled = true,
      initialData = null,
      axiosRequestConfig,
      onCompleted,
      onError,
      onSettled,
    } = options;
    const [data, setData] = useState<(Model<T> & T) | null>(initialData);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [error, setError] = useState<ServiceError | null>(null);
    const manager = useAbortManager();
    const mountRef = useMountRef();

    const applyResult = useCallback((res: ModelResponse<T>) => {
      setData(res.data as Model<T> & T);
    }, []);

    const doFetch = useCallback(
      async (targetId: string, signal?: AbortSignal): Promise<ModelResponse<T>> => {
        setIsFetching(true);
        setError(null);
        try {
          let res: ModelResponse<T>;
          if (advanced) {
            res = (await modelService
              .readAdvanced(
                targetId,
                { select, populate, sort, include, tasks } as ReadAdvancedArgs<Projection>,
                advancedOptions,
                { ...axiosRequestConfig, signal },
              )
              .exec()) as unknown as ModelResponse<T>;
          } else {
            res = (await modelService
              .read(targetId, readOptions, { ...axiosRequestConfig, signal })
              .exec()) as unknown as ModelResponse<T>;
          }
          return res;
        } catch (err) {
          if (!isAbortError(err)) setError(err as ServiceError);
          throw err;
        } finally {
          if (!signal?.aborted) setIsFetching(false);
        }
      },
      [
        modelService,
        advanced,
        select,
        populate,
        sort,
        include,
        tasks,
        readOptions,
        advancedOptions,
        axiosRequestConfig,
      ],
    );

    useEffect(() => {
      if (!id || !enabled) return;
      mountRef.current = true;
      setIsLoading(true);
      const controller = new AbortController();
      manager.replace(controller);

      doFetch(id, controller.signal)
        .then((res) => {
          if (!mountRef.current || controller.signal.aborted) return;
          applyResult(res);
          onCompleted?.(res);
          onSettled?.(res, null);
        })
        .catch((err) => {
          if (!mountRef.current || controller.signal.aborted) return;
          const svcErr = err as ServiceError;
          onError?.(svcErr);
          onSettled?.(null, svcErr);
        })
        .finally(() => {
          if (mountRef.current && !controller.signal.aborted) setIsLoading(false);
        });

      return () => {
        mountRef.current = false;
        controller.abort();
      };
    }, [id, enabled, advanced, select, populate, sort, include, tasks, readOptions, advancedOptions]);

    const readModel = useCallback(
      async (readId: string): Promise<ModelResponse<T>> => {
        const res = await doFetch(readId);
        applyResult(res);
        onCompleted?.(res);
        onSettled?.(res, null);
        return res;
      },
      [doFetch, applyResult, onCompleted, onSettled],
    );

    const refetch = useCallback(() => {
      if (!id || !enabled) return;
      setIsLoading(true);
      const controller = new AbortController();
      manager.replace(controller);
      doFetch(id, controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return;
          applyResult(res);
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, [id, enabled, doFetch, applyResult, manager]);

    const reset = useCallback(() => {
      setData(initialData);
      setError(null);
      setIsLoading(false);
      setIsFetching(false);
    }, [initialData]);

    return { data, isLoading, isFetching, error, readModel, refetch, reset };
  }

  function useListModel(options: UseListModelOptions<T> = {}): UseListModelResult<T> {
    const {
      listParams,
      filter,
      advanced,
      sort,
      select,
      populate,
      include,
      tasks,
      options: listOptions,
      advancedOptions,
      enabled = true,
      keepPreviousData = false,
      initialData,
      axiosRequestConfig,
      onCompleted,
      onError,
      onSettled,
    } = options;
    const [data, setData] = useState<(Model<T> & T)[]>(initialData ?? []);
    const [previousData, setPreviousData] = useState<(Model<T> & T)[] | undefined>(undefined);
    const [totalCount, setTotalCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [error, setError] = useState<ServiceError | null>(null);
    const manager = useAbortManager();
    const mountRef = useMountRef();
    const latestDataRef = useRef(data);
    latestDataRef.current = data;

    const applyResult = useCallback((res: ListModelResponse<T>) => {
      setData(res.data as (Model<T> & T)[]);
      setTotalCount(res.totalCount);
      setPreviousData(undefined);
    }, []);

    const doFetch = useCallback(
      async (args?: ListArgs, signal?: AbortSignal): Promise<ListModelResponse<T>> => {
        setIsFetching(true);
        setError(null);
        if (keepPreviousData) {
          setPreviousData(latestDataRef.current);
        }
        try {
          let res: ListModelResponse<T>;
          if (advanced) {
            res = (await modelService
              .listAdvanced(
                (filter ?? {}) as FilterQuery<T>,
                { sort, select, populate, include, tasks, ...args } as ListAdvancedArgs<Projection>,
                advancedOptions,
                { ...axiosRequestConfig, signal },
              )
              .exec()) as unknown as ListModelResponse<T>;
          } else {
            res = (await modelService
              .list(args ?? listParams, listOptions, { ...axiosRequestConfig, signal })
              .exec()) as unknown as ListModelResponse<T>;
          }
          return res;
        } catch (err) {
          if (!isAbortError(err)) setError(err as ServiceError);
          throw err;
        } finally {
          if (!signal?.aborted) setIsFetching(false);
        }
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
        listOptions,
        advancedOptions,
        axiosRequestConfig,
        keepPreviousData,
        latestDataRef,
      ],
    );

    const listParamsKey = stableStringify(listParams);
    const filterKey = stableStringify(filter);
    const sortKey = stableStringify(sort);

    useEffect(() => {
      if ((!listParams && !advanced) || !enabled) return;
      mountRef.current = true;
      setIsLoading(true);
      const controller = new AbortController();
      manager.replace(controller);

      doFetch(listParams, controller.signal)
        .then((res) => {
          if (!mountRef.current || controller.signal.aborted) return;
          applyResult(res);
          onCompleted?.(res);
          onSettled?.(res, null);
        })
        .catch((err) => {
          if (!mountRef.current || controller.signal.aborted) return;
          const svcErr = err as ServiceError;
          onError?.(svcErr);
          onSettled?.(null, svcErr);
        })
        .finally(() => {
          if (mountRef.current && !controller.signal.aborted) setIsLoading(false);
        });

      return () => {
        mountRef.current = false;
        controller.abort();
      };
    }, [
      listParamsKey,
      filterKey,
      advanced,
      enabled,
      select,
      populate,
      sortKey,
      include,
      tasks,
      listOptions,
      advancedOptions,
    ]);

    const listModel = useCallback(
      async (args?: ListArgs): Promise<ListModelResponse<T>> => {
        const res = await doFetch(args);
        applyResult(res);
        onCompleted?.(res);
        onSettled?.(res, null);
        return res;
      },
      [doFetch, applyResult, onCompleted, onSettled],
    );

    const refetch = useCallback(() => {
      setIsLoading(true);
      const controller = new AbortController();
      manager.replace(controller);
      doFetch(listParams, controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return;
          applyResult(res);
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, [listParams, doFetch, applyResult, manager]);

    const reset = useCallback(() => {
      setData(initialData ?? []);
      setPreviousData(undefined);
      setTotalCount(0);
      setError(null);
      setIsLoading(false);
      setIsFetching(false);
    }, [initialData]);

    return { data, previousData, totalCount, isLoading, isFetching, error, listModel, refetch, reset };
  }

  // ── Mutation hooks ──

  function useCreateModel(options: UseCreateModelOptions<T> = {}): UseCreateModelResult<T> {
    const {
      advanced,
      select,
      populate,
      tasks,
      options: createOptions,
      advancedOptions,
      axiosRequestConfig,
      onCreated,
      onError,
      onSettled,
    } = options;
    const [data, setData] = useState<(Model<T> & T) | null>(null);
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<ServiceError | null>(null);
    const mountRef = useMountRef();

    const createModel = useCallback(
      async (createData: object): Promise<ModelResponse<T>> => {
        setIsPending(true);
        setError(null);
        try {
          let res: ModelResponse<T>;
          if (advanced) {
            res = (await modelService
              .createAdvanced(
                createData,
                { select, populate, tasks } as CreateAdvancedArgs<Projection>,
                advancedOptions,
                axiosRequestConfig,
              )
              .exec()) as unknown as ModelResponse<T>;
          } else {
            res = (await modelService
              .create(createData, createOptions, axiosRequestConfig)
              .exec()) as unknown as ModelResponse<T>;
          }
          if (mountRef.current) {
            setData(res.data as Model<T> & T);
            onCreated?.(res);
            onSettled?.(res, null);
          }
          return res;
        } catch (err) {
          const svcErr = err as ServiceError;
          if (mountRef.current) {
            setError(svcErr);
            onError?.(svcErr);
            onSettled?.(null, svcErr);
          }
          throw svcErr;
        } finally {
          if (mountRef.current) setIsPending(false);
        }
      },
      [
        modelService,
        advanced,
        select,
        populate,
        tasks,
        createOptions,
        advancedOptions,
        axiosRequestConfig,
        onCreated,
        onError,
        onSettled,
      ],
    );

    const reset = useCallback(() => {
      setData(null);
      setError(null);
    }, []);

    return { data, isPending, error, createModel, reset };
  }

  function useUpdateModel(options: UseUpdateModelOptions<T> = {}): UseUpdateModelResult<T> {
    const {
      advanced,
      select,
      populate,
      tasks,
      options: updateOptions,
      advancedOptions,
      axiosRequestConfig,
      onUpdated,
      onError,
      onSettled,
    } = options;
    const [data, setData] = useState<(Model<T> & T) | null>(null);
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<ServiceError | null>(null);
    const mountRef = useMountRef();

    const updateModel = useCallback(
      async (updateId: string, updateData: object): Promise<ModelResponse<T>> => {
        setIsPending(true);
        setError(null);
        try {
          let res: ModelResponse<T>;
          if (advanced) {
            res = (await modelService
              .updateAdvanced(
                updateId,
                updateData,
                { select, populate, tasks } as UpdateAdvancedArgs<Projection>,
                advancedOptions,
                axiosRequestConfig,
              )
              .exec()) as unknown as ModelResponse<T>;
          } else {
            res = (await modelService
              .update(updateId, updateData, updateOptions, axiosRequestConfig)
              .exec()) as unknown as ModelResponse<T>;
          }
          if (mountRef.current) {
            setData(res.data as Model<T> & T);
            onUpdated?.(res);
            onSettled?.(res, null);
          }
          return res;
        } catch (err) {
          const svcErr = err as ServiceError;
          if (mountRef.current) {
            setError(svcErr);
            onError?.(svcErr);
            onSettled?.(null, svcErr);
          }
          throw svcErr;
        } finally {
          if (mountRef.current) setIsPending(false);
        }
      },
      [
        modelService,
        advanced,
        select,
        populate,
        tasks,
        updateOptions,
        advancedOptions,
        axiosRequestConfig,
        onUpdated,
        onError,
        onSettled,
      ],
    );

    const reset = useCallback(() => {
      setData(null);
      setError(null);
    }, []);

    return { data, isPending, error, updateModel, reset };
  }

  function useUpsertModel(options: UseUpsertModelOptions<T> = {}): UseUpsertModelResult<T> {
    const {
      advanced,
      select,
      populate,
      tasks,
      options: upsertOptions,
      advancedOptions,
      axiosRequestConfig,
      onUpserted,
      onError,
      onSettled,
    } = options;
    const [data, setData] = useState<(Model<T> & T) | null>(null);
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<ServiceError | null>(null);
    const mountRef = useMountRef();

    const upsertModel = useCallback(
      async (upsertData: object): Promise<ModelResponse<T>> => {
        setIsPending(true);
        setError(null);
        try {
          let res: ModelResponse<T>;
          if (advanced) {
            res = (await modelService
              .upsertAdvanced(
                upsertData,
                { select, populate, tasks } as UpsertAdvancedArgs<Projection>,
                advancedOptions,
                axiosRequestConfig,
              )
              .exec()) as unknown as ModelResponse<T>;
          } else {
            res = (await modelService
              .upsert(upsertData, upsertOptions, axiosRequestConfig)
              .exec()) as unknown as ModelResponse<T>;
          }
          if (mountRef.current) {
            setData(res.data as Model<T> & T);
            onUpserted?.(res);
            onSettled?.(res, null);
          }
          return res;
        } catch (err) {
          const svcErr = err as ServiceError;
          if (mountRef.current) {
            setError(svcErr);
            onError?.(svcErr);
            onSettled?.(null, svcErr);
          }
          throw svcErr;
        } finally {
          if (mountRef.current) setIsPending(false);
        }
      },
      [
        modelService,
        advanced,
        select,
        populate,
        tasks,
        upsertOptions,
        advancedOptions,
        axiosRequestConfig,
        onUpserted,
        onError,
        onSettled,
      ],
    );

    const reset = useCallback(() => {
      setData(null);
      setError(null);
    }, []);

    return { data, isPending, error, upsertModel, reset };
  }

  function useDeleteModel(options: UseDeleteModelOptions = {}): UseDeleteModelResult {
    const { axiosRequestConfig, onDeleted, onError, onSettled } = options;
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<ServiceError | null>(null);
    const mountRef = useMountRef();

    const deleteModel = useCallback(
      async (deleteId: string): Promise<Response<string>> => {
        setIsPending(true);
        setError(null);
        try {
          const res = await modelService.delete(deleteId, axiosRequestConfig).exec();
          const result = res as Response<string>;
          if (mountRef.current) {
            onDeleted?.(result);
            onSettled?.(result, null);
          }
          return result;
        } catch (err) {
          const svcErr = err as ServiceError;
          if (mountRef.current) {
            setError(svcErr);
            onError?.(svcErr);
            onSettled?.(null, svcErr);
          }
          throw svcErr;
        } finally {
          if (mountRef.current) setIsPending(false);
        }
      },
      [modelService, axiosRequestConfig, onDeleted, onError, onSettled],
    );

    const reset = useCallback(() => {
      setError(null);
    }, []);

    return { isPending, error, deleteModel, reset };
  }

  // ── Query hooks (count, distinct) ──

  function useCountModel(options: UseCountModelOptions<T> = {}): UseCountModelResult {
    const { advanced, filter, enabled = true, axiosRequestConfig, onCompleted, onError, onSettled } = options;
    const [data, setData] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<ServiceError | null>(null);
    const manager = useAbortManager();
    const mountRef = useMountRef();

    const doFetch = useCallback(
      async (signal?: AbortSignal): Promise<Response<number>> => {
        setIsLoading(true);
        setError(null);
        try {
          let res: Response<number>;
          if (advanced) {
            res = (await modelService
              .countAdvanced((filter ?? {}) as FilterQuery<T>, undefined, { ...axiosRequestConfig, signal })
              .exec()) as unknown as Response<number>;
          } else {
            res = (await modelService.count({ ...axiosRequestConfig, signal }).exec()) as unknown as Response<number>;
          }
          return res;
        } catch (err) {
          if (!isAbortError(err)) setError(err as ServiceError);
          throw err;
        } finally {
          if (!signal?.aborted) setIsLoading(false);
        }
      },
      [modelService, advanced, filter, axiosRequestConfig],
    );

    const filterKey = stableStringify(filter);

    useEffect(() => {
      if (!enabled) return;
      mountRef.current = true;
      const controller = new AbortController();
      manager.replace(controller);

      doFetch(controller.signal)
        .then((res) => {
          if (!mountRef.current || controller.signal.aborted) return;
          setData(res.data as number);
          onCompleted?.(res);
          onSettled?.(res, null);
        })
        .catch((err) => {
          if (!mountRef.current || controller.signal.aborted) return;
          const svcErr = err as ServiceError;
          onError?.(svcErr);
          onSettled?.(null, svcErr);
        })
        .finally(() => {
          if (mountRef.current && !controller.signal.aborted) setIsLoading(false);
        });

      return () => {
        mountRef.current = false;
        controller.abort();
      };
    }, [enabled, advanced, filterKey]);

    const countModel = useCallback(async (): Promise<Response<number>> => {
      const res = await doFetch();
      setData(res.data as number);
      return res;
    }, [doFetch]);

    const refetch = useCallback(() => {
      setIsLoading(true);
      const controller = new AbortController();
      manager.replace(controller);
      doFetch(controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return;
          setData(res.data as number);
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, [doFetch, manager]);

    const reset = useCallback(() => {
      setData(null);
      setError(null);
      setIsLoading(false);
    }, []);

    return { data, isLoading, error, countModel, refetch, reset };
  }

  function useDistinctModel(options: UseDistinctModelOptions<T>): UseDistinctModelResult {
    const { field, conditions, enabled = true, axiosRequestConfig, onCompleted, onError, onSettled } = options;
    const [data, setData] = useState<string[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<ServiceError | null>(null);
    const manager = useAbortManager();
    const mountRef = useMountRef();

    const doFetch = useCallback(
      async (signal?: AbortSignal): Promise<Response<string[]>> => {
        setIsLoading(true);
        setError(null);
        try {
          const res = (await modelService
            .distinctAdvanced(field, (conditions ?? {}) as FilterQuery<T>, { ...axiosRequestConfig, signal })
            .exec()) as unknown as Response<string[]>;
          return res;
        } catch (err) {
          if (!isAbortError(err)) setError(err as ServiceError);
          throw err;
        } finally {
          if (!signal?.aborted) setIsLoading(false);
        }
      },
      [modelService, field, conditions, axiosRequestConfig],
    );

    const conditionsKey = stableStringify(conditions);

    useEffect(() => {
      if (!enabled) return;
      mountRef.current = true;
      const controller = new AbortController();
      manager.replace(controller);

      doFetch(controller.signal)
        .then((res) => {
          if (!mountRef.current || controller.signal.aborted) return;
          setData(res.data as string[]);
          onCompleted?.(res);
          onSettled?.(res, null);
        })
        .catch((err) => {
          if (!mountRef.current || controller.signal.aborted) return;
          const svcErr = err as ServiceError;
          onError?.(svcErr);
          onSettled?.(null, svcErr);
        })
        .finally(() => {
          if (mountRef.current && !controller.signal.aborted) setIsLoading(false);
        });

      return () => {
        mountRef.current = false;
        controller.abort();
      };
    }, [enabled, field, conditionsKey]);

    const distinctModel = useCallback(async (): Promise<Response<string[]>> => {
      const res = await doFetch();
      setData(res.data as string[]);
      return res;
    }, [doFetch]);

    const refetch = useCallback(() => {
      setIsLoading(true);
      const controller = new AbortController();
      manager.replace(controller);
      doFetch(controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return;
          setData(res.data as string[]);
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, [doFetch, manager]);

    const reset = useCallback(() => {
      setData(null);
      setError(null);
      setIsLoading(false);
    }, []);

    return { data, isLoading, error, distinctModel, refetch, reset };
  }

  return {
    useReadModel,
    useListModel,
    useCreateModel,
    useUpdateModel,
    useUpsertModel,
    useDeleteModel,
    useCountModel,
    useDistinctModel,
  };
}
