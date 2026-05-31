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
  UseDeleteModelOptions,
  UseDeleteModelResult,
  UseCountModelOptions,
  UseCountModelResult,
} from './types';

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function useAbortController(): [React.MutableRefObject<AbortController | null>, (controller: AbortController) => void] {
  const ref = useRef<AbortController | null>(null);
  const set = useCallback((c: AbortController) => {
    ref.current?.abort();
    ref.current = c;
  }, []);
  return [ref, set];
}

function stableStringify(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

export function createModelHooks<T extends Document>(config: { modelService: ModelService<T> }) {
  const { modelService } = config;

  function useReadModel(options: UseReadModelOptions<T> = {}): UseReadModelResult<T> {
    const {
      id,
      advanced,
      select,
      populate,
      enabled = true,
      initialData = null,
      onCompleted,
      onError,
      onSettled,
    } = options;
    const [data, setData] = useState<(Model<T> & T) | null>(initialData);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [error, setError] = useState<ServiceError | null>(null);
    const [controllerRef, setController] = useAbortController();
    const mountRef = useRef(true);
    const initialDataRef = useRef(initialData);
    initialDataRef.current = initialData;

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
              .readAdvanced(targetId, { select, populate } as ReadAdvancedArgs<Projection>, undefined, { signal })
              .exec()) as unknown as ModelResponse<T>;
          } else {
            res = (await modelService.read(targetId, undefined, { signal }).exec()) as unknown as ModelResponse<T>;
          }
          return res;
        } catch (err) {
          if (!isAbortError(err)) setError(err as ServiceError);
          throw err;
        } finally {
          if (!signal?.aborted) setIsFetching(false);
        }
      },
      [modelService, advanced, select, populate],
    );

    // Auto-fetch on mount / id change
    useEffect(() => {
      if (!id || !enabled) return;
      mountRef.current = true;
      setIsLoading(true);
      const controller = new AbortController();
      setController(controller);

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
    }, [id, enabled, advanced, select, populate]);

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
      setController(controller);
      doFetch(id, controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return;
          applyResult(res);
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, [id, enabled, doFetch, applyResult, setController]);

    return { data, isLoading, isFetching, error, readModel, refetch };
  }

  function useListModel(options: UseListModelOptions<T> = {}): UseListModelResult<T> {
    const {
      listParams,
      filter,
      advanced,
      sort,
      select,
      populate,
      enabled = true,
      keepPreviousData = false,
      initialData,
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
    const [controllerRef, setController] = useAbortController();
    const mountRef = useRef(true);
    const initialDataRef = useRef(initialData);
    initialDataRef.current = initialData;

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
          setPreviousData(data);
        }
        try {
          let res: ListModelResponse<T>;
          if (advanced) {
            res = (await modelService
              .listAdvanced(
                (filter ?? {}) as FilterQuery<T>,
                { sort, select, populate, ...args } as ListAdvancedArgs<Projection>,
                undefined,
                { signal },
              )
              .exec()) as unknown as ListModelResponse<T>;
          } else {
            res = (await modelService
              .list(args ?? listParams, undefined, { signal })
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
      [modelService, advanced, filter, sort, select, populate, listParams, keepPreviousData, data],
    );

    // Auto-fetch on mount / param change
    useEffect(() => {
      if ((!listParams && !advanced) || !enabled) return;
      mountRef.current = true;
      setIsLoading(true);
      const controller = new AbortController();
      setController(controller);

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
      stableStringify(listParams),
      stableStringify(filter),
      advanced,
      enabled,
      select,
      populate,
      stableStringify(sort),
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
      setController(controller);
      doFetch(listParams, controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return;
          applyResult(res);
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, [listParams, doFetch, applyResult, setController]);

    return { data, previousData, totalCount, isLoading, isFetching, error, listModel, refetch };
  }

  function useCreateModel(options: UseCreateModelOptions<T> = {}): UseCreateModelResult<T> {
    const { advanced, select, populate, onCreated, onError, onSettled } = options;
    const [data, setData] = useState<(Model<T> & T) | null>(null);
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<ServiceError | null>(null);
    const mountRef = useRef(true);

    useEffect(() => {
      mountRef.current = true;
      return () => {
        mountRef.current = false;
      };
    }, []);

    const createModel = useCallback(
      async (createData: object): Promise<ModelResponse<T>> => {
        setIsPending(true);
        setError(null);
        try {
          let res: ModelResponse<T>;
          if (advanced) {
            res = (await modelService
              .createAdvanced(createData, { select, populate }, undefined)
              .exec()) as unknown as ModelResponse<T>;
          } else {
            res = (await modelService.create(createData).exec()) as unknown as ModelResponse<T>;
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
      [modelService, advanced, select, populate, onCreated, onError, onSettled],
    );

    const reset = useCallback(() => {
      setData(null);
      setError(null);
    }, []);

    return { data, isPending, error, createModel, reset };
  }

  function useUpdateModel(options: UseUpdateModelOptions<T> = {}): UseUpdateModelResult<T> {
    const { advanced, select, populate, onUpdated, onError, onSettled } = options;
    const [data, setData] = useState<(Model<T> & T) | null>(null);
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<ServiceError | null>(null);
    const mountRef = useRef(true);

    useEffect(() => {
      mountRef.current = true;
      return () => {
        mountRef.current = false;
      };
    }, []);

    const updateModel = useCallback(
      async (updateId: string, updateData: object): Promise<ModelResponse<T>> => {
        setIsPending(true);
        setError(null);
        try {
          let res: ModelResponse<T>;
          if (advanced) {
            res = (await modelService
              .updateAdvanced(updateId, updateData, { select, populate }, undefined)
              .exec()) as unknown as ModelResponse<T>;
          } else {
            res = (await modelService.update(updateId, updateData).exec()) as unknown as ModelResponse<T>;
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
      [modelService, advanced, select, populate, onUpdated, onError, onSettled],
    );

    const reset = useCallback(() => {
      setData(null);
      setError(null);
    }, []);

    return { data, isPending, error, updateModel, reset };
  }

  function useDeleteModel(options: UseDeleteModelOptions<T> = {}): UseDeleteModelResult<T> {
    const { onDeleted, onError, onSettled } = options;
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<ServiceError | null>(null);
    const mountRef = useRef(true);

    useEffect(() => {
      mountRef.current = true;
      return () => {
        mountRef.current = false;
      };
    }, []);

    const deleteModel = useCallback(
      async (deleteId: string): Promise<Response<string>> => {
        setIsPending(true);
        setError(null);
        try {
          const res = await modelService.delete(deleteId).exec();
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
      [modelService, onDeleted, onError, onSettled],
    );

    const reset = useCallback(() => {
      setError(null);
    }, []);

    return { isPending, error, deleteModel, reset };
  }

  function useCountModel(options: UseCountModelOptions<T> = {}): UseCountModelResult<T> {
    const { advanced, filter, enabled = true, onCompleted, onError, onSettled } = options;
    const [data, setData] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<ServiceError | null>(null);
    const [controllerRef, setController] = useAbortController();
    const mountRef = useRef(true);

    const doFetch = useCallback(
      async (signal?: AbortSignal): Promise<Response<number>> => {
        setIsLoading(true);
        setError(null);
        try {
          let res: Response<number>;
          if (advanced) {
            res = (await modelService
              .countAdvanced((filter ?? {}) as FilterQuery<T>, undefined, { signal })
              .exec()) as unknown as Response<number>;
          } else {
            res = (await modelService.count({ signal }).exec()) as unknown as Response<number>;
          }
          return res;
        } catch (err) {
          if (!isAbortError(err)) setError(err as ServiceError);
          throw err;
        } finally {
          if (!signal?.aborted) setIsLoading(false);
        }
      },
      [modelService, advanced, filter],
    );

    useEffect(() => {
      if (!enabled) return;
      mountRef.current = true;
      const controller = new AbortController();
      setController(controller);

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
    }, [enabled, advanced, stableStringify(filter)]);

    const countModel = useCallback(async (): Promise<Response<number>> => {
      const res = await doFetch();
      setData(res.data as number);
      return res;
    }, [doFetch]);

    const refetch = useCallback(() => {
      setIsLoading(true);
      const controller = new AbortController();
      setController(controller);
      doFetch(controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return;
          setData(res.data as number);
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, [doFetch, setController]);

    return { data, isLoading, error, countModel, refetch };
  }

  return {
    useReadModel,
    useListModel,
    useCreateModel,
    useUpdateModel,
    useDeleteModel,
    useCountModel,
  };
}
