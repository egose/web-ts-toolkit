import { AxiosRequestConfig, AxiosInstance, mergeConfig } from 'axios';
import { set } from '@web-ts-toolkit/utils';
import {
  FilterQuery,
  Document,
  ModelRequest,
  Projection,
  ResolvedSelectedShape,
  Response,
  ModelResponse,
  ListModelResponse,
  ResponseCallback,
} from '../types';

import {
  ListArgs,
  ListOptions,
  ListAdvancedArgs,
  ListAdvancedOptions,
  ReadOptions,
  ReadAdvancedArgs,
  ReadAdvancedOptions,
  CreateOptions,
  CreateAdvancedArgs,
  CreateAdvancedOptions,
  UpdateOptions,
  UpdateAdvancedArgs,
  UpdateAdvancedOptions,
  UpsertOptions,
  UpsertAdvancedArgs,
  UpsertAdvancedOptions,
  Defaults,
  AdditionalReqConfig,
} from '../interface';

import { Model } from '../model';
import { Service } from './service';
import { replaceSubQuery } from '../helpers';
import { CACHE_HEADER } from '../constants';
import { createResponseHandler, processListResult, setDefaultObjectProp } from './shared';
import { makeRequest } from './request';
import { buildSubDocumentOps } from './sub-ops';

type RequestConfig = AxiosRequestConfig & AdditionalReqConfig;

interface Props {
  axios: AxiosInstance;
  modelName: string;
  basePath: string;
  queryPath: string;
  mutationPath: string;
  onSuccess: ResponseCallback;
  onFailure: ResponseCallback;
  throwOnError: boolean;
}

/**
 * Typed client for `access-router` model CRUD routes. Created by
 * `adapter.createModelService<T>(...)`.
 *
 * @example
 * const userService = adapter.createModelService<User>({ modelName: 'User', basePath: 'users' });
 * const user = await userService.read('user-id-1');
 */
export class ModelService<T extends Document> extends Service {
  private _modelName!: string;
  private _queryPath!: string;
  private _mutationPath!: string;
  private _handleCallbacks!: <T extends { success: boolean }>(res: T, throwOnError?: boolean) => T;
  private _defaults!: Defaults;

  constructor(
    { axios, modelName, basePath, queryPath, mutationPath, onSuccess, onFailure, throwOnError }: Props,
    defaults?: Defaults,
  ) {
    super(axios, basePath);

    this._modelName = modelName;
    this._queryPath = queryPath;
    this._mutationPath = mutationPath;
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
      'createOptions',
      'createAdvancedArgs',
      'createAdvancedOptions',
      'updateOptions',
      'updateAdvancedArgs',
      'updateAdvancedOptions',
      'upsertOptions',
      'upsertAdvancedArgs',
      'upsertAdvancedOptions',
    ].forEach((key) => setDefaultObjectProp(this._defaults, key, {}));
  }

  // ---------------------------------------------------------------------------
  // Collection operations
  // ---------------------------------------------------------------------------

  list<TData extends Partial<T> = T>(args?: ListArgs, options?: ListOptions, axiosRequestConfig?: RequestConfig) {
    const {
      skip = this._defaults.listArgs.skip,
      limit = this._defaults.listArgs.limit,
      page = this._defaults.listArgs.page,
      pageSize = this._defaults.listArgs.pageSize,
    } = args ?? {};

    const {
      skim = this._defaults.listOptions.skim ?? true,
      includePermissions = this._defaults.listOptions.includePermissions ?? false,
      includeCount = this._defaults.listOptions.includeCount ?? false,
      includeExtraHeaders = this._defaults.listOptions.includeExtraHeaders ?? false,
      ignoreCache = this._defaults.listOptions.ignoreCache ?? false,
      sq,
    } = options ?? {};

    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    reqConfig.headers = this.updateHeaders(reqConfig.headers, { ignoreCache });

    return makeRequest<ListModelResponse<T, TData>>(
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
                skim,
                include_permissions: includePermissions,
                include_count: includeCount,
                include_extra_headers: includeExtraHeaders,
              },
            }),
          )
          .then(this.handleSuccess)
          .then((result: ListModelResponse<T, TData>) => {
            return processListResult<ListModelResponse<T, TData>, TData>(
              result,
              { includeCount, includeExtraHeaders },
              (item) => Model.create<T, TData>(item, this),
            );
          })
          .catch(this.handleError<ListModelResponse<T, TData>>)
          .then((res) => this._handleCallbacks<ListModelResponse<T, TData>>(res, throwOnError)),
      {
        __op: 'list',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'list',
          filter: {},
          args: { skip, limit, page, pageSize },
          options: { skim, includePermissions, includeCount, includeExtraHeaders },
          sqOptions: sq,
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  listAdvanced<TData extends Partial<T> | never = never, TSelect extends Projection = Projection>(
    filter: FilterQuery<T>,
    args?: ListAdvancedArgs<TSelect>,
    options?: ListAdvancedOptions,
    axiosRequestConfig?: RequestConfig,
  ): ModelRequest<ListModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>> {
    const {
      populate = this._defaults.listAdvancedArgs.populate,
      include = this._defaults.listAdvancedArgs.include,
      sort = this._defaults.listAdvancedArgs.sort,
      skip = this._defaults.listAdvancedArgs.skip,
      limit = this._defaults.listAdvancedArgs.limit,
      page = this._defaults.listAdvancedArgs.page,
      pageSize = this._defaults.listAdvancedArgs.pageSize,
      tasks = this._defaults.listAdvancedArgs.tasks,
    } = args ?? {};
    const select = (args?.select ?? this._defaults.listAdvancedArgs.select) as TSelect | undefined;

    const {
      skim = this._defaults.listAdvancedOptions.skim ?? true,
      includePermissions = this._defaults.listAdvancedOptions.includePermissions ?? false,
      includeCount = this._defaults.listAdvancedOptions.includeCount ?? false,
      includeExtraHeaders = this._defaults.listAdvancedOptions.includeExtraHeaders ?? false,
      populateAccess = this._defaults.listAdvancedOptions.populateAccess,
      ignoreCache = this._defaults.listAdvancedOptions.ignoreCache ?? false,
      sq,
    } = options ?? {};

    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    reqConfig.headers = this.updateHeaders(reqConfig.headers, { ignoreCache });

    const _filter = replaceSubQuery<T>(filter);
    return makeRequest<ListModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>(
      () =>
        this._axios
          .post(
            `${this._basePath}/${this._queryPath}`,
            {
              filter: _filter,
              select,
              sort,
              populate,
              include,
              skip,
              limit,
              page,
              pageSize,
              tasks,
              options: { skim, includePermissions, includeCount, includeExtraHeaders, populateAccess },
            },
            reqConfig,
          )
          .then(this.handleSuccess)
          .then((result: ListModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>) => {
            return processListResult<
              ListModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>,
              ResolvedSelectedShape<T, TSelect, TData>
            >(result, { includeCount, includeExtraHeaders }, (item) =>
              Model.create<T, ResolvedSelectedShape<T, TSelect, TData>>(item, this),
            );
          })
          .catch(this.handleError<ListModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>)
          .then((res) =>
            this._handleCallbacks<ListModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>(res, throwOnError),
          ),
      {
        __op: 'listAdvanced',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'list',
          filter: _filter,
          args: { select, sort, populate, include, skip, limit, page, pageSize, tasks },
          options: { skim, includePermissions, includeCount, includeExtraHeaders, populateAccess },
          sqOptions: sq,
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  create<TData extends Partial<T> = T>(data: object, options?: CreateOptions, axiosRequestConfig?: RequestConfig) {
    const { includePermissions = this._defaults.createOptions.includePermissions ?? true } = options ?? {};
    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    set(reqConfig, `headers.${CACHE_HEADER}`, 'false');

    return makeRequest<ModelResponse<T, TData>>(
      () =>
        this._axios
          .post(this._basePath, data, mergeConfig(reqConfig, { params: { include_permissions: includePermissions } }))
          .then(this.handleSuccess)
          .then((result: ModelResponse<T, TData>) => {
            result.data = result.success ? Model.create<T, TData>(result.raw, this) : null;
            return result;
          })
          .catch(this.handleError<ModelResponse<T, TData>>)
          .then((res) => this._handleCallbacks<ModelResponse<T, TData>>(res, throwOnError)),
      {
        __op: 'create',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'create',
          data,
          options: { includePermissions },
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  createAdvanced<TData extends Partial<T> | never = never, TSelect extends Projection = Projection>(
    data: object,
    args?: CreateAdvancedArgs<TSelect>,
    options?: CreateAdvancedOptions,
    axiosRequestConfig?: RequestConfig,
  ): ModelRequest<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>> {
    const { populate = this._defaults.createAdvancedArgs.populate, tasks = this._defaults.createAdvancedArgs.tasks } =
      args ?? {};
    const select = (args?.select ?? this._defaults.createAdvancedArgs.select) as TSelect | undefined;

    const {
      includePermissions = this._defaults.createAdvancedOptions.includePermissions ?? true,
      populateAccess = this._defaults.createAdvancedOptions.populateAccess,
    } = options ?? {};

    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    set(reqConfig, `headers.${CACHE_HEADER}`, 'false');

    return makeRequest<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>(
      () =>
        this._axios
          .post(
            `${this._basePath}/${this._mutationPath}`,
            { data, select, populate, tasks, options: { includePermissions, populateAccess } },
            reqConfig,
          )
          .then(this.handleSuccess)
          .then((result: ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>) => {
            result.data = result.success
              ? Model.create<T, ResolvedSelectedShape<T, TSelect, TData>>(result.raw, this)
              : null;
            return result;
          })
          .catch(this.handleError<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>)
          .then((res) =>
            this._handleCallbacks<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>(res, throwOnError),
          ),
      {
        __op: 'createAdvanced',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'create',
          data,
          args: { select, populate, tasks },
          options: { includePermissions, populateAccess },
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  upsert<TData extends Partial<T> = T>(data: object, options?: UpsertOptions, axiosRequestConfig?: RequestConfig) {
    const { returningAll = this._defaults.upsertOptions.returningAll ?? true } = options ?? {};
    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    set(reqConfig, `headers.${CACHE_HEADER}`, 'false');

    return makeRequest<ModelResponse<T, TData>>(
      () =>
        this._axios
          .put(this._basePath, data, mergeConfig(reqConfig, { params: { returning_all: returningAll } }))
          .then(this.handleSuccess)
          .then((result: ModelResponse<T, TData>) => {
            result.data = result.success ? Model.create<T, TData>(result.raw, this) : null;
            return result;
          })
          .catch(this.handleError<ModelResponse<T, TData>>)
          .then((res) => this._handleCallbacks<ModelResponse<T, TData>>(res, throwOnError)),
      {
        __op: 'upsert',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'upsert',
          data,
          options: { returningAll },
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  upsertAdvanced<TData extends Partial<T> | never = never, TSelect extends Projection = Projection>(
    data: object,
    args?: UpsertAdvancedArgs<TSelect>,
    options?: UpsertAdvancedOptions,
    axiosRequestConfig?: RequestConfig,
  ): ModelRequest<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>> {
    const { populate = this._defaults.upsertAdvancedArgs.populate, tasks = this._defaults.upsertAdvancedArgs.tasks } =
      args ?? {};
    const select = (args?.select ?? this._defaults.upsertAdvancedArgs.select) as TSelect | undefined;

    const {
      returningAll = this._defaults.upsertAdvancedOptions.returningAll ?? true,
      includePermissions = this._defaults.upsertAdvancedOptions.includePermissions ?? true,
      populateAccess = this._defaults.upsertAdvancedOptions.populateAccess,
    } = options ?? {};

    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    set(reqConfig, `headers.${CACHE_HEADER}`, 'false');

    return makeRequest<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>(
      () =>
        this._axios
          .put(
            `${this._basePath}/${this._mutationPath}`,
            {
              data,
              select,
              populate,
              tasks,
              options: { returningAll, includePermissions, populateAccess },
            },
            reqConfig,
          )
          .then(this.handleSuccess)
          .then((result: ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>) => {
            result.data = result.success
              ? Model.create<T, ResolvedSelectedShape<T, TSelect, TData>>(result.raw, this)
              : null;
            return result;
          })
          .catch(this.handleError<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>)
          .then((res) =>
            this._handleCallbacks<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>(res, throwOnError),
          ),
      {
        __op: 'upsertAdvanced',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'upsert',
          data,
          args: { select, populate, tasks },
          options: { returningAll, includePermissions, populateAccess },
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  delete(identifier: string, axiosRequestConfig?: RequestConfig) {
    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    set(reqConfig, `headers.${CACHE_HEADER}`, 'false');

    return makeRequest<Response<string>>(
      () =>
        this._axios
          .delete(`${this._basePath}/${identifier}`, reqConfig)
          .then(this.handleSuccess)
          .then((result: Response<string>) => {
            result.data = result.raw;
            return result;
          })
          .catch(this.handleError<Response<string>>)
          .then((res) => this._handleCallbacks<Response<string>>(res, throwOnError)),
      {
        __op: 'delete',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'delete',
          id: identifier,
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  new<TData extends Partial<T> = T>(axiosRequestConfig?: RequestConfig) {
    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    set(reqConfig, `headers.${CACHE_HEADER}`, 'false');

    return makeRequest<ModelResponse<T, TData>>(
      () =>
        this._axios
          .get(`${this._basePath}/new`, reqConfig)
          .then(this.handleSuccess)
          .then((result: ModelResponse<T, TData>) => {
            delete result.raw._id;
            result.data = result.success ? Model.create<T, TData>(result.raw, this) : null;
            return result;
          })
          .catch(this.handleError<ModelResponse<T, TData>>)
          .then((res) => this._handleCallbacks<ModelResponse<T, TData>>(res, throwOnError)),
      {
        __op: 'new',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'new',
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  distinct(field: string, axiosRequestConfig?: RequestConfig) {
    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};

    return makeRequest<Response<string[]>>(
      () =>
        this._axios
          .get(`${this._basePath}/distinct/${field}`, reqConfig)
          .then(this.handleSuccess)
          .then((result: Response<string[]>) => {
            result.data = result.raw;
            return result;
          })
          .catch(this.handleError<Response<string[]>>)
          .then((res) => this._handleCallbacks<Response<string[]>>(res, throwOnError)),
      {
        __op: 'distinct',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'distinct',
          field,
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  distinctAdvanced(field: string, conditions: FilterQuery<T>, axiosRequestConfig?: RequestConfig) {
    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};

    return makeRequest<Response<string[]>>(
      () =>
        this._axios
          .post(`${this._basePath}/distinct/${field}`, conditions, reqConfig)
          .then(this.handleSuccess)
          .then((result: Response<string[]>) => {
            result.data = result.raw;
            return result;
          })
          .catch(this.handleError<Response<string[]>>)
          .then((res) => this._handleCallbacks<Response<string[]>>(res, throwOnError)),
      {
        __op: 'distinctAdvanced',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'distinct',
          field,
          filter: conditions,
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  count(axiosRequestConfig?: RequestConfig) {
    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};

    return makeRequest<Response<number>>(
      () =>
        this._axios
          .get(`${this._basePath}/count`, reqConfig)
          .then(this.handleSuccess)
          .then((result: Response<number>) => {
            result.data = result.raw;
            return result;
          })
          .catch(this.handleError<Response<number>>)
          .then((res) => this._handleCallbacks<Response<number>>(res, throwOnError)),
      {
        __op: 'count',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'count',
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  countAdvanced(filter: FilterQuery<T>, args?: { access?: 'list' | 'read' }, axiosRequestConfig?: RequestConfig) {
    const { access } = args ?? {};
    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};

    return makeRequest<Response<number>>(
      () =>
        this._axios
          .post(`${this._basePath}/count`, { filter, options: { access } }, reqConfig)
          .then(this.handleSuccess)
          .then((result: Response<number>) => {
            result.data = result.raw;
            return result;
          })
          .catch(this.handleError<Response<number>>)
          .then((res) => this._handleCallbacks<Response<number>>(res, throwOnError)),
      {
        __op: 'countAdvanced',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'count',
          filter,
          options: { access },
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Document operations
  // ---------------------------------------------------------------------------

  read<TData extends Partial<T> = T>(identifier: string, options?: ReadOptions, axiosRequestConfig?: RequestConfig) {
    const {
      includePermissions = this._defaults.readOptions.includePermissions ?? true,
      tryList = this._defaults.readOptions.tryList ?? true,
      ignoreCache = this._defaults.readOptions.ignoreCache ?? false,
      sq,
    } = options ?? {};

    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    reqConfig.headers = this.updateHeaders(reqConfig.headers, { ignoreCache });

    return makeRequest<ModelResponse<T, TData>>(
      () =>
        this._axios
          .get(
            `${this._basePath}/${identifier}`,
            mergeConfig(reqConfig, {
              params: { include_permissions: includePermissions, try_list: tryList },
            }),
          )
          .then(this.handleSuccess)
          .then((result: ModelResponse<T, TData>) => {
            result.data = result.success ? Model.create<T, TData>(result.raw, this) : null;
            return result;
          })
          .catch(this.handleError<ModelResponse<T, TData>>)
          .then((res) => this._handleCallbacks<ModelResponse<T, TData>>(res, throwOnError)),
      {
        __op: 'read',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'read',
          id: identifier,
          args: {},
          options: { includePermissions, tryList },
          sqOptions: sq,
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  readAdvanced<TData extends Partial<T> | never = never, TSelect extends Projection = Projection>(
    identifier: string,
    args?: ReadAdvancedArgs<TSelect>,
    options?: ReadAdvancedOptions,
    axiosRequestConfig?: RequestConfig,
  ): ModelRequest<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>> {
    const {
      populate = this._defaults.readAdvancedArgs.populate,
      include = this._defaults.readAdvancedArgs.include,
      tasks = this._defaults.readAdvancedArgs.tasks,
    } = args ?? {};
    const select = (args?.select ?? this._defaults.readAdvancedArgs.select) as TSelect | undefined;

    const {
      skim = this._defaults.readAdvancedOptions.skim ?? true,
      includePermissions = this._defaults.readAdvancedOptions.includePermissions ?? true,
      tryList = this._defaults.readAdvancedOptions.tryList ?? true,
      populateAccess = this._defaults.readAdvancedOptions.populateAccess,
      ignoreCache = this._defaults.readAdvancedOptions.ignoreCache ?? false,
      sq,
    } = options ?? {};

    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    reqConfig.headers = this.updateHeaders(reqConfig.headers, { ignoreCache });

    return makeRequest<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>(
      () =>
        this._axios
          .post(
            `${this._basePath}/${this._queryPath}/${identifier}`,
            {
              select,
              populate,
              include,
              tasks,
              options: { skim, includePermissions, tryList, populateAccess },
            },
            reqConfig,
          )
          .then(this.handleSuccess)
          .then((result: ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>) => {
            result.data = result.success
              ? Model.create<T, ResolvedSelectedShape<T, TSelect, TData>>(result.raw, this)
              : null;
            return result;
          })
          .catch(this.handleError<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>)
          .then((res) =>
            this._handleCallbacks<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>(res, throwOnError),
          ),
      {
        __op: 'readAdvanced',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'read',
          id: identifier,
          args: { select, populate, include, tasks },
          options: { skim, includePermissions, tryList, populateAccess },
          sqOptions: sq,
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  readAdvancedFilter<TData extends Partial<T> | never = never, TSelect extends Projection = Projection>(
    filter: FilterQuery<T>,
    args?: ReadAdvancedArgs<TSelect>,
    options?: ReadAdvancedOptions,
    axiosRequestConfig?: RequestConfig,
  ): ModelRequest<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>> {
    const {
      sort = this._defaults.readAdvancedArgs.sort,
      populate = this._defaults.readAdvancedArgs.populate,
      include = this._defaults.readAdvancedArgs.include,
      tasks = this._defaults.readAdvancedArgs.tasks,
    } = args ?? {};
    const select = (args?.select ?? this._defaults.readAdvancedArgs.select) as TSelect | undefined;

    const {
      skim = this._defaults.readAdvancedOptions.skim ?? true,
      includePermissions = this._defaults.readAdvancedOptions.includePermissions ?? true,
      tryList = this._defaults.readAdvancedOptions.tryList ?? true,
      populateAccess = this._defaults.readAdvancedOptions.populateAccess,
      ignoreCache = this._defaults.readAdvancedOptions.ignoreCache ?? false,
      sq,
    } = options ?? {};

    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    reqConfig.headers = this.updateHeaders(reqConfig.headers, { ignoreCache });

    const _filter = replaceSubQuery<T>(filter);
    return makeRequest<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>(
      () =>
        this._axios
          .post(
            `${this._basePath}/${this._queryPath}/__filter`,
            {
              filter: _filter,
              select,
              sort,
              populate,
              include,
              tasks,
              options: { skim, includePermissions, tryList, populateAccess },
            },
            reqConfig,
          )
          .then(this.handleSuccess)
          .then((result: ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>) => {
            result.data = result.success
              ? Model.create<T, ResolvedSelectedShape<T, TSelect, TData>>(result.raw, this)
              : null;
            return result;
          })
          .catch(this.handleError<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>)
          .then((res) =>
            this._handleCallbacks<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>(res, throwOnError),
          ),
      {
        __op: 'readAdvancedFilter',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'read',
          filter: _filter,
          args: { select, sort, populate, include, tasks },
          options: { skim, includePermissions, tryList, populateAccess },
          sqOptions: sq,
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  update<TData extends Partial<T> = T>(
    identifier: string,
    data: object,
    options?: UpdateOptions,
    axiosRequestConfig?: RequestConfig,
  ) {
    const { returningAll = this._defaults.updateOptions.returningAll ?? true } = options ?? {};
    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    set(reqConfig, `headers.${CACHE_HEADER}`, 'false');

    return makeRequest<ModelResponse<T, TData>>(
      () =>
        this._axios
          .patch(
            `${this._basePath}/${identifier}`,
            data,
            mergeConfig(reqConfig, { params: { returning_all: returningAll } }),
          )
          .then(this.handleSuccess)
          .then((result: ModelResponse<T, TData>) => {
            result.data = result.success ? Model.create<T, TData>(result.raw, this) : null;
            return result;
          })
          .catch(this.handleError<ModelResponse<T, TData>>)
          .then((res) => this._handleCallbacks<ModelResponse<T, TData>>(res, throwOnError)),
      {
        __op: 'update',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'update',
          id: identifier,
          data,
          options: { returningAll },
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  updateAdvanced<TData extends Partial<T> | never = never, TSelect extends Projection = Projection>(
    identifier: string,
    data: object,
    args?: UpdateAdvancedArgs<TSelect>,
    options?: UpdateAdvancedOptions,
    axiosRequestConfig?: RequestConfig,
  ): ModelRequest<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>> {
    const { populate = this._defaults.updateAdvancedArgs.populate, tasks = this._defaults.updateAdvancedArgs.tasks } =
      args ?? {};
    const select = (args?.select ?? this._defaults.updateAdvancedArgs.select) as TSelect | undefined;

    const {
      returningAll = this._defaults.updateAdvancedOptions.returningAll ?? true,
      includePermissions = this._defaults.updateAdvancedOptions.includePermissions ?? true,
      populateAccess = this._defaults.updateAdvancedOptions.populateAccess,
    } = options ?? {};

    const { throwOnError, ...reqConfig } = axiosRequestConfig ?? {};
    set(reqConfig, `headers.${CACHE_HEADER}`, 'false');

    return makeRequest<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>(
      () =>
        this._axios
          .patch(
            `${this._basePath}/${this._mutationPath}/${identifier}`,
            {
              data,
              select,
              populate,
              tasks,
              options: { returningAll, includePermissions, populateAccess },
            },
            reqConfig,
          )
          .then(this.handleSuccess)
          .then((result: ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>) => {
            result.data = result.success
              ? Model.create<T, ResolvedSelectedShape<T, TSelect, TData>>(result.raw, this)
              : null;
            return result;
          })
          .catch(this.handleError<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>)
          .then((res) =>
            this._handleCallbacks<ModelResponse<T, ResolvedSelectedShape<T, TSelect, TData>>>(res, throwOnError),
          ),
      {
        __op: 'updateAdvanced',
        __query: {
          target: 'model',
          name: this._modelName,
          model: this._modelName,
          op: 'update',
          id: identifier,
          data,
          args: { select, populate, tasks },
          options: { returningAll, includePermissions, populateAccess },
        },
        __requestConfig: reqConfig,
        __service: this,
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Sub-document operations
  // ---------------------------------------------------------------------------

  id(id: string) {
    return {
      subs: <S = T>(field: keyof T) => {
        const sub = String(field);
        return buildSubDocumentOps<S>(
          {
            axios: this._axios,
            basePath: this._basePath,
            modelName: this._modelName,
            queryPath: this._queryPath,
            handleSuccess: this.handleSuccess,
            handleError: this.handleError,
            _handleCallbacks: this._handleCallbacks,
            parentService: this,
          },
          id,
          sub,
        );
      },
      fetch: (args?: ReadAdvancedArgs, options?: ReadAdvancedOptions, axiosRequestConfig?: RequestConfig) => {
        return this.readAdvanced(id, args, options, axiosRequestConfig);
      },
    };
  }
}
