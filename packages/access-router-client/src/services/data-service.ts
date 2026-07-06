import { AxiosRequestConfig, AxiosInstance, mergeConfig } from 'axios';
import {
  DataRequest,
  FilterQuery,
  DataResponse,
  ListDataResponse,
  Projection,
  ResolvedSelectedShape,
  ResponseCallback,
} from '../types';

import {
  DataListArgs,
  DataListOptions,
  DataListAdvancedArgs,
  DataListAdvancedOptions,
  DataReadOptions,
  DataReadAdvancedArgs,
  DataReadAdvancedOptions,
  DataDefaults,
  AdditionalReqConfig,
} from '../interface';

import { Service } from './service';
import { replaceSubQuery } from '../helpers';
import { createResponseHandler, processListResult, setDefaultObjectProp } from './shared';
import { makeRequest } from './request';

type RequestConfig = AxiosRequestConfig & AdditionalReqConfig;

interface Props {
  axios: AxiosInstance;
  dataName: string;
  basePath: string;
  queryPath: string;
  onSuccess: ResponseCallback;
  onFailure: ResponseCallback;
  throwOnError: boolean;
}

/**
 * Typed client for `access-router` in-memory data routes. Created by
 * `adapter.createDataService<T>(...)`.
 *
 * @example
 * const fruitService = adapter.createDataService<Fruit>({ dataName: 'fruit', basePath: 'fruit' });
 */
export class DataService<T> extends Service {
  private _dataName!: string;
  private _queryPath!: string;
  private _handleCallbacks!: <T extends { success: boolean }>(res: T, throwOnError?: boolean) => T;
  private _defaults!: DataDefaults;

  constructor(
    { axios, dataName, basePath, queryPath, onSuccess, onFailure, throwOnError }: Props,
    defaults?: DataDefaults,
  ) {
    super(axios, basePath);

    this._dataName = dataName;
    this._queryPath = queryPath;
    this._defaults = defaults ?? {};
    this._handleCallbacks = createResponseHandler(onSuccess, onFailure, throwOnError);

    [
      'listArgs',
      'listOptions',
      'listAdvancedArgs',
      'listAdvancedOptions',
      'readOptions',
      'readAdvancedArgs',
      'readAdvancedOptions',
    ].forEach((key) => setDefaultObjectProp(this._defaults, key, {}));
  }

  // ---------------------------------------------------------------------------
  // Collection operations
  // ---------------------------------------------------------------------------

  list<TData extends Partial<T> = T>(
    args?: DataListArgs,
    options?: DataListOptions,
    axiosRequestConfig?: RequestConfig,
  ) {
    const {
      skip = this._defaults.listArgs.skip,
      limit = this._defaults.listArgs.limit,
      page = this._defaults.listArgs.page,
      pageSize = this._defaults.listArgs.pageSize,
    } = args ?? {};

    const {
      includePermissions = this._defaults.listOptions.includePermissions ?? false,
      includeCount = this._defaults.listOptions.includeCount ?? false,
      includeExtraHeaders = this._defaults.listOptions.includeExtraHeaders ?? false,
      ignoreCache = this._defaults.listOptions.ignoreCache ?? false,
    } = options ?? {};

    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    reqConfig.headers = this.updateHeaders(reqConfig.headers, { ignoreCache });

    return makeRequest<ListDataResponse<TData>>(
      () =>
        this._axios
          .get(
            this._basePath,
            mergeConfig(reqConfig, {
              params: {
                skip,
                limit,
                page,
                page_size: pageSize,
                include_permissions: includePermissions,
                include_count: includeCount,
                include_extra_headers: includeExtraHeaders,
              },
            }),
          )
          .then(this.handleSuccess)
          .then((result: ListDataResponse<TData>) => {
            return processListResult<ListDataResponse<TData>, TData>(result, { includeCount, includeExtraHeaders });
          })
          .catch(this.handleError<ListDataResponse<TData>>)
          .then((res) => this._handleCallbacks<ListDataResponse<TData>>(res, throwOnError)),
      {
        __op: 'list',
        __query: {
          target: 'data',
          name: this._dataName,
          op: 'list',
          filter: {},
          args: { skip, limit, page, pageSize },
          options: { includePermissions, includeCount, includeExtraHeaders },
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  listAdvanced<TData extends Partial<T> | never = never, TSelect extends Projection = Projection>(
    filter: FilterQuery<T>,
    args?: DataListAdvancedArgs<TSelect>,
    options?: DataListAdvancedOptions,
    axiosRequestConfig?: RequestConfig,
  ): DataRequest<ListDataResponse<ResolvedSelectedShape<T, TSelect, TData>>> {
    const {
      sort = this._defaults.listAdvancedArgs.sort,
      skip = this._defaults.listAdvancedArgs.skip,
      limit = this._defaults.listAdvancedArgs.limit,
      page = this._defaults.listAdvancedArgs.page,
      pageSize = this._defaults.listAdvancedArgs.pageSize,
    } = args ?? {};
    const select = (args?.select ?? this._defaults.listAdvancedArgs.select) as TSelect | undefined;

    const {
      includePermissions = this._defaults.listAdvancedOptions.includePermissions ?? false,
      includeCount = this._defaults.listAdvancedOptions.includeCount ?? false,
      includeExtraHeaders = this._defaults.listAdvancedOptions.includeExtraHeaders ?? false,
      ignoreCache = this._defaults.listAdvancedOptions.ignoreCache ?? false,
    } = options ?? {};

    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    reqConfig.headers = this.updateHeaders(reqConfig.headers, { ignoreCache });

    const _filter = replaceSubQuery<T>(filter);
    return makeRequest<ListDataResponse<ResolvedSelectedShape<T, TSelect, TData>>>(
      () =>
        this._axios
          .post(
            `${this._basePath}/${this._queryPath}`,
            {
              filter: _filter,
              select,
              sort,
              skip,
              limit,
              page,
              pageSize,
              options: { includePermissions, includeCount, includeExtraHeaders },
            },
            reqConfig,
          )
          .then(this.handleSuccess)
          .then((result: ListDataResponse<ResolvedSelectedShape<T, TSelect, TData>>) => {
            return processListResult<
              ListDataResponse<ResolvedSelectedShape<T, TSelect, TData>>,
              ResolvedSelectedShape<T, TSelect, TData>
            >(result, {
              includeCount,
              includeExtraHeaders,
            });
          })
          .catch(this.handleError<ListDataResponse<ResolvedSelectedShape<T, TSelect, TData>>>)
          .then((res) =>
            this._handleCallbacks<ListDataResponse<ResolvedSelectedShape<T, TSelect, TData>>>(res, throwOnError),
          ),
      {
        __op: 'listAdvanced',
        __query: {
          target: 'data',
          name: this._dataName,
          op: 'list',
          filter: _filter,
          args: { select, sort, skip, limit, page, pageSize },
          options: { includePermissions, includeCount, includeExtraHeaders },
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Document operations
  // ---------------------------------------------------------------------------

  read<TData extends Partial<T> = T>(
    identifier: string,
    options?: DataReadOptions,
    axiosRequestConfig?: RequestConfig,
  ) {
    const {
      includePermissions = this._defaults.readOptions.includePermissions ?? true,
      ignoreCache = this._defaults.readOptions.ignoreCache ?? false,
    } = options ?? {};

    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    reqConfig.headers = this.updateHeaders(reqConfig.headers, { ignoreCache });

    return makeRequest<DataResponse<TData>>(
      () =>
        this._axios
          .get(
            `${this._basePath}/${identifier}`,
            mergeConfig(reqConfig, {
              params: { include_permissions: includePermissions },
            }),
          )
          .then(this.handleSuccess)
          .then((result: DataResponse<TData>) => {
            result.data = result.raw;
            return result;
          })
          .catch(this.handleError<DataResponse<TData>>)
          .then((res) => this._handleCallbacks<DataResponse<TData>>(res, throwOnError)),
      {
        __op: 'read',
        __query: {
          target: 'data',
          name: this._dataName,
          op: 'read',
          id: identifier,
          args: {},
          options: { includePermissions },
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  readAdvanced<TData extends Partial<T> | never = never, TSelect extends Projection = Projection>(
    identifier: string,
    args?: DataReadAdvancedArgs<TSelect>,
    options?: DataReadAdvancedOptions,
    axiosRequestConfig?: RequestConfig,
  ): DataRequest<DataResponse<ResolvedSelectedShape<T, TSelect, TData>>> {
    const { ignoreCache = this._defaults.readAdvancedArgs.ignoreCache ?? false } = args ?? {};
    const select = (args?.select ?? this._defaults.readAdvancedArgs.select) as TSelect | undefined;

    const { includePermissions = this._defaults.readAdvancedOptions.includePermissions ?? true } = options ?? {};

    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    reqConfig.headers = this.updateHeaders(reqConfig.headers, { ignoreCache });

    return makeRequest<DataResponse<ResolvedSelectedShape<T, TSelect, TData>>>(
      () =>
        this._axios
          .post(`${this._basePath}/${this._queryPath}/${identifier}`, { select }, reqConfig)
          .then(this.handleSuccess)
          .then((result: DataResponse<ResolvedSelectedShape<T, TSelect, TData>>) => {
            result.data = result.raw;
            return result;
          })
          .catch(this.handleError<DataResponse<ResolvedSelectedShape<T, TSelect, TData>>>)
          .then((res) =>
            this._handleCallbacks<DataResponse<ResolvedSelectedShape<T, TSelect, TData>>>(res, throwOnError),
          ),
      {
        __op: 'readAdvanced',
        __query: {
          target: 'data',
          name: this._dataName,
          op: 'read',
          id: identifier,
          args: { select },
          options: { includePermissions },
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  readAdvancedFilter<TData extends Partial<T> | never = never, TSelect extends Projection = Projection>(
    filter: FilterQuery<T>,
    args?: DataReadAdvancedArgs<TSelect>,
    options?: DataReadAdvancedOptions,
    axiosRequestConfig?: RequestConfig,
  ): DataRequest<DataResponse<ResolvedSelectedShape<T, TSelect, TData>>> {
    const select = (args?.select ?? this._defaults.readAdvancedArgs.select) as TSelect | undefined;
    const { ignoreCache = this._defaults.readAdvancedArgs.ignoreCache ?? false } = args ?? {};

    const { includePermissions = this._defaults.readAdvancedOptions.includePermissions ?? true } = options ?? {};

    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    reqConfig.headers = this.updateHeaders(reqConfig.headers, { ignoreCache });

    const _filter = replaceSubQuery<T>(filter);
    return makeRequest<DataResponse<ResolvedSelectedShape<T, TSelect, TData>>>(
      () =>
        this._axios
          .post(`${this._basePath}/${this._queryPath}/__filter`, { filter: _filter, select }, reqConfig)
          .then(this.handleSuccess)
          .then((result: DataResponse<ResolvedSelectedShape<T, TSelect, TData>>) => {
            result.data = result.raw;
            return result;
          })
          .catch(this.handleError<DataResponse<ResolvedSelectedShape<T, TSelect, TData>>>)
          .then((res) =>
            this._handleCallbacks<DataResponse<ResolvedSelectedShape<T, TSelect, TData>>>(res, throwOnError),
          ),
      {
        __op: 'readAdvancedFilter',
        __query: {
          target: 'data',
          name: this._dataName,
          op: 'read',
          filter: _filter,
          args: { select },
          options: { includePermissions },
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }
}
