import { AxiosRequestConfig, mergeConfig } from 'axios';
import { FilterQuery, Document, ResolvedSelectedShape, Response, ModelResponse, ListModelResponse } from '../types';
import { Model } from '../model';
import { makeRequest } from './request';
import type { ModelService } from './model-service';

type RequestConfig = AxiosRequestConfig & { throwOnError?: boolean };

interface SubOpsContext<S> {
  axios: ModelService<S>['_axios'];
  basePath: string;
  modelName: string;
  queryPath: string;
  handleSuccess: ModelService<Document>['handleSuccess'];
  handleError: ModelService<Document>['handleError'];
  _handleCallbacks: <T extends { success: boolean }>(res: T, throwOnError?: boolean) => T;
  parentService: ModelService<Document>;
}

export function buildSubDocumentOps<S>(ctx: SubOpsContext<S>, id: string, sub: string) {
  const { axios, basePath, modelName, queryPath, handleSuccess, handleError, _handleCallbacks, parentService } = ctx;
  // Single cast: parentService manages parent type T, but sub-document ops need ModelService<S>.
  // This is safe because Model.create only uses the service reference for save/update calls.
  const asS = parentService as ModelService<S>;

  return {
    list: (axiosRequestConfig?: RequestConfig) => {
      const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};

      return makeRequest<ListModelResponse<S>>(
        () =>
          axios
            .get(`${basePath}/${id}/${sub}`, mergeConfig(reqConfig, { params: {} }))
            .then(handleSuccess)
            .then((result: ListModelResponse<S>) => {
              result.totalCount = Array.isArray(result.raw) ? result.raw.length : 0;
              result.data = Array.isArray(result.raw) ? result.raw.map((item) => Model.create<S>(item, asS)) : [];
              return result;
            })
            .catch(handleError<ListModelResponse<S>>)
            .then((res) => _handleCallbacks<ListModelResponse<S>>(res, throwOnError)),
        {
          __op: 'listSub',
          __query: {
            target: 'model',
            name: modelName,
            model: modelName,
            op: 'subList',
            id,
            sub,
            filter: {},
            args: {},
            options: {},
          },
          __requestConfig: reqConfig,
          __service: parentService,
        },
      );
    },

    listAdvanced: <TData extends Partial<S> | never = never, TSelect extends readonly string[] = readonly string[]>(
      filter?: FilterQuery<S>,
      args?: { select?: TSelect },
      axiosRequestConfig?: RequestConfig,
    ) => {
      const select = args?.select;
      const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};

      return makeRequest<ListModelResponse<S, ResolvedSelectedShape<S, TSelect, TData>>>(
        () =>
          axios
            .post(`${basePath}/${id}/${sub}/${queryPath}`, { filter, select }, reqConfig)
            .then(handleSuccess)
            .then((result: ListModelResponse<S, ResolvedSelectedShape<S, TSelect, TData>>) => {
              result.totalCount = Array.isArray(result.raw) ? result.raw.length : 0;
              result.data = Array.isArray(result.raw)
                ? result.raw.map((item) => Model.create<S, ResolvedSelectedShape<S, TSelect, TData>>(item, asS))
                : [];
              return result;
            })
            .catch(handleError<ListModelResponse<S, ResolvedSelectedShape<S, TSelect, TData>>>)
            .then((res) =>
              _handleCallbacks<ListModelResponse<S, ResolvedSelectedShape<S, TSelect, TData>>>(res, throwOnError),
            ),
        {
          __op: 'listAdvancedSub',
          __query: {
            target: 'model',
            name: modelName,
            model: modelName,
            op: 'subList',
            id,
            sub,
            filter,
            args: { select },
            options: {},
          },
          __requestConfig: reqConfig,
          __service: parentService,
        },
      );
    },

    read: (subId: string, axiosRequestConfig?: RequestConfig) => {
      const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};

      return makeRequest<ModelResponse<S>>(
        () =>
          axios
            .get(`${basePath}/${id}/${sub}/${subId}`, mergeConfig(reqConfig, { params: {} }))
            .then(handleSuccess)
            .then((result: ModelResponse<S>) => {
              result.data = result.success ? Model.create<S>(result.raw, asS) : null;
              return result;
            })
            .catch(handleError<ModelResponse<S>>)
            .then((res) => _handleCallbacks<ModelResponse<S>>(res, throwOnError)),
        {
          __op: 'readSub',
          __query: {
            target: 'model',
            name: modelName,
            model: modelName,
            op: 'subRead',
            id,
            sub,
            subId,
            args: {},
            options: {},
          },
          __requestConfig: reqConfig,
          __service: parentService,
        },
      );
    },

    readAdvanced: <TData extends Partial<S> | never = never, TSelect extends readonly string[] = readonly string[]>(
      subId: string,
      args?: { select?: TSelect; populate?: unknown },
      axiosRequestConfig?: RequestConfig,
    ) => {
      const { select, populate } = args ?? {};
      const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};

      return makeRequest<ModelResponse<S, ResolvedSelectedShape<S, TSelect, TData>>>(
        () =>
          axios
            .post(`${basePath}/${id}/${sub}/${subId}/${queryPath}`, { select, populate }, reqConfig)
            .then(handleSuccess)
            .then((result: ModelResponse<S, ResolvedSelectedShape<S, TSelect, TData>>) => {
              result.data = result.success
                ? Model.create<S, ResolvedSelectedShape<S, TSelect, TData>>(result.raw, asS)
                : null;
              return result;
            })
            .catch(handleError<ModelResponse<S, ResolvedSelectedShape<S, TSelect, TData>>>)
            .then((res) =>
              _handleCallbacks<ModelResponse<S, ResolvedSelectedShape<S, TSelect, TData>>>(res, throwOnError),
            ),
        {
          __op: 'readAdvancedSub',
          __query: {
            target: 'model',
            name: modelName,
            model: modelName,
            op: 'subRead',
            id,
            sub,
            subId,
            args: { select, populate },
            options: {},
          },
          __requestConfig: reqConfig,
          __service: parentService,
        },
      );
    },

    update: (subId: string, data: object, axiosRequestConfig?: RequestConfig) => {
      const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};

      return makeRequest<ModelResponse<S>>(
        () =>
          axios
            .patch(`${basePath}/${id}/${sub}/${subId}`, data, mergeConfig(reqConfig, { params: {} }))
            .then(handleSuccess)
            .then((result: ModelResponse<S>) => {
              result.data = result.success ? Model.create<S>(result.raw, asS) : null;
              return result;
            })
            .catch(handleError<ModelResponse<S>>)
            .then((res) => _handleCallbacks<ModelResponse<S>>(res, throwOnError)),
        {
          __op: 'updateSub',
          __query: {
            target: 'model',
            name: modelName,
            model: modelName,
            op: 'subUpdate',
            id,
            sub,
            subId,
            data,
            options: {},
          },
          __requestConfig: reqConfig,
          __service: parentService,
        },
      );
    },

    bulkUpdate: (data: object[], axiosRequestConfig?: RequestConfig) => {
      const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};

      return makeRequest<ListModelResponse<S>>(
        () =>
          axios
            .patch(`${basePath}/${id}/${sub}`, data, mergeConfig(reqConfig, { params: {} }))
            .then(handleSuccess)
            .then((result: ListModelResponse<S>) => {
              result.data = Array.isArray(result.raw) ? result.raw.map((item) => Model.create<S>(item, asS)) : [];
              return result;
            })
            .catch(handleError<ListModelResponse<S>>)
            .then((res) => _handleCallbacks<ListModelResponse<S>>(res, throwOnError)),
        {
          __op: 'bulkUpdateSub',
          __query: {
            target: 'model',
            name: modelName,
            model: modelName,
            op: 'subBulkUpdate',
            id,
            sub,
            data,
            options: {},
          },
          __requestConfig: reqConfig,
          __service: parentService,
        },
      );
    },

    create: (data: object, axiosRequestConfig?: RequestConfig) => {
      const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};

      return makeRequest<ModelResponse<S>>(
        () =>
          axios
            .post(`${basePath}/${id}/${sub}`, data, mergeConfig(reqConfig, { params: {} }))
            .then(handleSuccess)
            .then((result: ModelResponse<S>) => {
              result.data = result.success ? Model.create<S>(result.raw, asS) : null;
              return result;
            })
            .catch(handleError<ModelResponse<S>>)
            .then((res) => _handleCallbacks<ModelResponse<S>>(res, throwOnError)),
        {
          __op: 'createSub',
          __query: { target: 'model', name: modelName, model: modelName, op: 'subCreate', id, sub, data, options: {} },
          __requestConfig: reqConfig,
          __service: parentService,
        },
      );
    },

    delete: (subId: string, axiosRequestConfig?: RequestConfig) => {
      const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};

      return makeRequest<Response<string>>(
        () =>
          axios
            .delete(`${basePath}/${id}/${sub}/${subId}`, reqConfig)
            .then(handleSuccess)
            .then((result: Response<string>) => {
              result.data = result.raw;
              return result;
            })
            .catch(handleError<Response<string>>)
            .then((res) => _handleCallbacks<Response<string>>(res, throwOnError)),
        {
          __op: 'deleteSub',
          __query: { target: 'model', name: modelName, model: modelName, op: 'subDelete', id, sub, subId },
          __requestConfig: reqConfig,
          __service: parentService,
        },
      );
    },
  };
}
