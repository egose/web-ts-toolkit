import { AxiosInstance, AxiosRequestConfig, mergeConfig } from 'axios';
import {
  FilterQuery,
  Document,
  ResolvedSelectedShape,
  Response,
  SubDocumentResponse,
  SubDocumentListResponse,
} from '../types';
import { cloneConfigWithCacheBypass } from './interceptors';
import { makeRequest } from './request';
import { encodePathSegment } from '../helpers';
import type { ModelService } from './model-service';

type RequestConfig = AxiosRequestConfig & { throwOnError?: boolean };

interface SubOpsContext<S> {
  axios: AxiosInstance;
  basePath: string;
  modelName: string;
  queryPath: string;
  handleSuccess: ModelService<Document>['handleSuccess'];
  handleError: ModelService<Document>['handleError'];
  _handleCallbacks: <T extends { success: boolean }>(res: T, throwOnError?: boolean) => T;
  parentService: ModelService<Document>;
}

const toArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : value == null ? [] : [value as T]);

const ensureSubdocumentListCount = <T extends { count?: number }>(result: T): T & { count: number } => {
  result.count ??= 0;
  return result as T & { count: number };
};

export function buildSubDocumentOps<S>(ctx: SubOpsContext<S>, id: string, sub: string) {
  const { axios, basePath, modelName, queryPath, handleSuccess, handleError, _handleCallbacks, parentService } = ctx;

  return {
    list: (axiosRequestConfig?: RequestConfig) => {
      const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};

      return makeRequest<SubDocumentListResponse<S>>(
        () =>
          axios
            .get(
              `${basePath}/${encodePathSegment(id)}/${encodePathSegment(sub)}`,
              mergeConfig(reqConfig, { params: {} }),
            )
            .then((res) => handleSuccess<SubDocumentListResponse<S>>(res))
            .then((result: SubDocumentListResponse<S>) => {
              const rawArray = toArray<S>(result.raw);
              result.raw = rawArray;
              result.count = rawArray.length;
              result.data = rawArray;
              return result;
            })
            .catch(handleError<SubDocumentListResponse<S>>)
            .then(ensureSubdocumentListCount)
            .then((res) => _handleCallbacks<SubDocumentListResponse<S>>(res, throwOnError)),
        {
          __throwOnError: throwOnError,
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

      return makeRequest<SubDocumentListResponse<S, ResolvedSelectedShape<S, TSelect, TData>>>(
        () =>
          axios
            .post(
              `${basePath}/${encodePathSegment(id)}/${encodePathSegment(sub)}/${queryPath}`,
              { filter, select },
              reqConfig,
            )
            .then((res) => handleSuccess<SubDocumentListResponse<S, ResolvedSelectedShape<S, TSelect, TData>>>(res))
            .then((result: SubDocumentListResponse<S, ResolvedSelectedShape<S, TSelect, TData>>) => {
              const rawArray = toArray<ResolvedSelectedShape<S, TSelect, TData>>(result.raw);
              result.raw = rawArray;
              result.count = rawArray.length;
              result.data = rawArray;
              return result;
            })
            .catch(handleError<SubDocumentListResponse<S, ResolvedSelectedShape<S, TSelect, TData>>>)
            .then(ensureSubdocumentListCount)
            .then((res) =>
              _handleCallbacks<SubDocumentListResponse<S, ResolvedSelectedShape<S, TSelect, TData>>>(res, throwOnError),
            ),
        {
          __throwOnError: throwOnError,
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

      return makeRequest<SubDocumentResponse<S>>(
        () =>
          axios
            .get(
              `${basePath}/${encodePathSegment(id)}/${encodePathSegment(sub)}/${encodePathSegment(subId)}`,
              mergeConfig(reqConfig, { params: {} }),
            )
            .then((res) => handleSuccess<SubDocumentResponse<S>>(res))
            .then((result: SubDocumentResponse<S>) => {
              result.data = result.success ? (result.raw as S) : null;
              return result;
            })
            .catch(handleError<SubDocumentResponse<S>>)
            .then((res) => _handleCallbacks<SubDocumentResponse<S>>(res, throwOnError)),
        {
          __throwOnError: throwOnError,
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

      return makeRequest<SubDocumentResponse<S, ResolvedSelectedShape<S, TSelect, TData>>>(
        () =>
          axios
            .post(
              `${basePath}/${encodePathSegment(id)}/${encodePathSegment(sub)}/${encodePathSegment(subId)}/${queryPath}`,
              { select, populate },
              reqConfig,
            )
            .then((res) => handleSuccess<SubDocumentResponse<S, ResolvedSelectedShape<S, TSelect, TData>>>(res))
            .then((result: SubDocumentResponse<S, ResolvedSelectedShape<S, TSelect, TData>>) => {
              result.data = result.success ? (result.raw as ResolvedSelectedShape<S, TSelect, TData>) : null;
              return result;
            })
            .catch(handleError<SubDocumentResponse<S, ResolvedSelectedShape<S, TSelect, TData>>>)
            .then((res) =>
              _handleCallbacks<SubDocumentResponse<S, ResolvedSelectedShape<S, TSelect, TData>>>(res, throwOnError),
            ),
        {
          __throwOnError: throwOnError,
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
      const { throwOnError, ...reqConfig } = cloneConfigWithCacheBypass(axiosRequestConfig ?? {});

      return makeRequest<SubDocumentResponse<S>>(
        () =>
          axios
            .patch(
              `${basePath}/${encodePathSegment(id)}/${encodePathSegment(sub)}/${encodePathSegment(subId)}`,
              data,
              mergeConfig(reqConfig, { params: {} }),
            )
            .then((res) => handleSuccess<SubDocumentResponse<S>>(res))
            .then((result: SubDocumentResponse<S>) => {
              result.data = result.success ? (result.raw as S) : null;
              return result;
            })
            .catch(handleError<SubDocumentResponse<S>>)
            .then((res) => _handleCallbacks<SubDocumentResponse<S>>(res, throwOnError)),
        {
          __throwOnError: throwOnError,
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
      const { throwOnError, ...reqConfig } = cloneConfigWithCacheBypass(axiosRequestConfig ?? {});

      return makeRequest<SubDocumentListResponse<S>>(
        () =>
          axios
            .patch(
              `${basePath}/${encodePathSegment(id)}/${encodePathSegment(sub)}`,
              data,
              mergeConfig(reqConfig, { params: {} }),
            )
            .then((res) => handleSuccess<SubDocumentListResponse<S>>(res))
            .then((result: SubDocumentListResponse<S>) => {
              const rawArray = toArray<S>(result.raw);
              result.raw = rawArray;
              result.count = rawArray.length;
              result.data = rawArray;
              return result;
            })
            .catch(handleError<SubDocumentListResponse<S>>)
            .then(ensureSubdocumentListCount)
            .then((res) => _handleCallbacks<SubDocumentListResponse<S>>(res, throwOnError)),
        {
          __throwOnError: throwOnError,
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

    create: (data: object | object[], axiosRequestConfig?: RequestConfig) => {
      const { throwOnError, ...reqConfig } = cloneConfigWithCacheBypass(axiosRequestConfig ?? {});

      // The sibling server's `createSub` route returns the FULL subdocument
      // list (`{ kind: 'list', data: [...], count: N }`) when `count !== 1`,
      // and a single object when `count === 1`. To expose one stable shape,
      // we always return the array form: `raw` and `data` are the post-create
      // subdocument array; callers that created the first sub on a parent
      // with no existing subs still receive `[theNewDoc]` rather than a
      // bare object.
      return makeRequest<SubDocumentListResponse<S>>(
        () =>
          axios
            .post(
              `${basePath}/${encodePathSegment(id)}/${encodePathSegment(sub)}`,
              data,
              mergeConfig(reqConfig, { params: {} }),
            )
            .then((res) => handleSuccess<SubDocumentListResponse<S>>(res))
            .then((result: SubDocumentListResponse<S>) => {
              const rawArray = toArray<S>(result.raw);
              result.raw = rawArray;
              result.count = rawArray.length;
              result.data = rawArray;
              return result;
            })
            .catch(handleError<SubDocumentListResponse<S>>)
            .then(ensureSubdocumentListCount)
            .then((res) => _handleCallbacks<SubDocumentListResponse<S>>(res, throwOnError)),
        {
          __throwOnError: throwOnError,
          __op: 'createSub',
          __query: { target: 'model', name: modelName, op: 'subCreate', id, sub, data, options: {} },
          __requestConfig: reqConfig,
          __service: parentService,
        },
      );
    },

    delete: (subId: string, axiosRequestConfig?: RequestConfig) => {
      const { throwOnError, ...reqConfig } = cloneConfigWithCacheBypass(axiosRequestConfig ?? {});

      return makeRequest<Response<string>>(
        () =>
          axios
            .delete(
              `${basePath}/${encodePathSegment(id)}/${encodePathSegment(sub)}/${encodePathSegment(subId)}`,
              reqConfig,
            )
            .then((res) => handleSuccess<Response<string>>(res))
            .then((result: Response<string>) => {
              if (result.success) result.data = result.raw;
              return result;
            })
            .catch(handleError<Response<string>>)
            .then((res) => _handleCallbacks<Response<string>>(res, throwOnError)),
        {
          __throwOnError: throwOnError,
          __op: 'deleteSub',
          __query: { target: 'model', name: modelName, op: 'subDelete', id, sub, subId },
          __requestConfig: reqConfig,
          __service: parentService,
        },
      );
    },
  };
}
