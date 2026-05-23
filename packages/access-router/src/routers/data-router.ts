import JsonRouter from '@web-ts-toolkit/express-json-router';
import type { Router } from 'express';
import type { z } from 'zod';
import { isPlainObject, isString, isUndefined } from '@web-ts-toolkit/utils';
import { createSetDataCore } from '../core-data';
import { decorateDataListResult, decorateDataSingleResult } from '../http/response-pipelines/data-response';
import type { AccessRuntime } from '../runtime';
import { defaultRuntime } from '../runtime';
import { processUrl } from '../lib';
import { handleResultError } from '../helpers';
import { DataRouterOptions, ExtendedDataRouterOptions, DataRequest, Filter } from '../interfaces';
import { DataService } from '../services';
import { assertMutableRouterOption, assertMutableRouterOptions } from './router-mutation';
import { formatListResponse, parseBooleanString } from './shared';
import { accessRouterResponseHandler } from './index';
import {
  dataListBodySchema,
  dataReadByIdBodySchema,
  dataReadFilterBodySchema,
  parseBodyWithSchema,
  parsePathParam,
  parseQuery,
  requestSchemas,
} from './validation';

const clientErrors = JsonRouter.clientErrors;

type SetTargetOption<TRouter, TOption> = {
  (option: TOption): TRouter;
  (key: string, option: unknown): TRouter;
};

function setOption<TData>(this: DataRouter<TData>, parentKey: string, optionKey: unknown, option?: unknown) {
  const key = isUndefined(option) ? parentKey : `${parentKey}.${optionKey}`;
  const value = isUndefined(option) ? optionKey : option;

  assertMutableRouterOption('data', key);
  this.runtime.setDataOption(this.dataName, key as keyof DataRouterOptions<TData>, value);
  return this;
}

export class DataRouter<TData = unknown> {
  readonly runtime: AccessRuntime;
  readonly dataName: string;
  readonly router: JsonRouter;
  readonly options: DataRouterOptions<TData>;
  readonly fullBasePath: string;

  constructor(dataName: string, initialOptions: DataRouterOptions<TData>, runtime: AccessRuntime = defaultRuntime) {
    this.runtime = runtime;
    this.runtime.setDataOptions(dataName, initialOptions);
    this.options = this.runtime.getDataOptions<TData>(dataName);
    this.fullBasePath = processUrl(this.options.parentPath + this.options.basePath);
    this.dataName = dataName;
    this.router = new JsonRouter(this.options.basePath, createSetDataCore(this.runtime), accessRouterResponseHandler);

    this.setCollectionRoutes();
    this.setDocumentRoutes();
  }

  private getRequestSchema(key: string) {
    return this.runtime.getExactDataOption<keyof ExtendedDataRouterOptions<TData>, TData>(
      this.dataName,
      key as keyof ExtendedDataRouterOptions<TData>,
    ) as z.ZodTypeAny | undefined;
  }

  getService(req: DataRequest): DataService<TData> {
    return req.dacl.getService<TData>(this.dataName);
  }

  private async assertAllowed(req: DataRequest, access: string) {
    const allowed = await req.dacl.isAllowed(this.dataName, access);
    if (!allowed) throw new clientErrors.UnauthorizedError();
  }

  ///////////////////////
  // Collection Routes //
  ///////////////////////
  private setCollectionRoutes() {
    //////////
    // LIST //
    //////////
    this.router.get('', async (req: DataRequest) => {
      await this.assertAllowed(req, 'list');

      const { skip, limit, page, page_size, include_count, include_extra_headers } = parseQuery(
        requestSchemas.listQuery,
        req.query,
      );

      const svc = this.getService(req);

      const includeCount = parseBooleanString(include_count);
      const includeExtraHeaders = parseBooleanString(include_extra_headers);

      const result = await svc.find(
        {},
        { skip, limit, page, pageSize: page_size },
        {
          includeCount,
        },
      );

      handleResultError(result);

      const decoratedResult = await decorateDataListResult(svc, result);

      return formatListResponse(req, decoratedResult, includeCount, includeExtraHeaders);
    });

    /////////////////////
    // LIST - Advanced //
    /////////////////////
    this.router.post(`/${this.options.queryRouteSegment}`, async (req: DataRequest) => {
      await this.assertAllowed(req, 'list');

      let {
        filter,
        select,
        sort,
        skip,
        limit,
        page,
        pageSize,
        options = {},
      } = parseBodyWithSchema(dataListBodySchema, req.body, this.getRequestSchema('requestSchemas.advancedList'));
      const { includeCount, includeExtraHeaders } = options;

      const svc = this.getService(req);

      const result = await svc.find(
        (filter ?? {}) as Filter<TData>,
        { select, sort: typeof sort === 'string' ? sort : undefined, skip, limit, page, pageSize },
        { includeCount },
      );

      handleResultError(result);

      const decoratedResult = await decorateDataListResult(svc, result);

      return formatListResponse(req, decoratedResult, includeCount, includeExtraHeaders);
    });
  }

  /////////////////////
  // Document Routes //
  /////////////////////
  private setDocumentRoutes() {
    //////////
    // READ //
    //////////
    this.router.get(`/:${this.options.idParam}`, async (req: DataRequest) => {
      await this.assertAllowed(req, 'read');

      const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
      const svc = this.getService(req);
      const result = await svc.findById(id, {}, {});

      handleResultError(result);

      const decoratedResult = await decorateDataSingleResult(svc, result);

      return decoratedResult.data;
    });

    //////////////////////////////
    // READ - Advanced - Filter //
    //////////////////////////////
    this.router.post(`/${this.options.queryRouteSegment}/__filter`, async (req: DataRequest) => {
      await this.assertAllowed(req, 'read');

      let { filter, select } = parseBodyWithSchema(
        dataReadFilterBodySchema,
        req.body,
        this.getRequestSchema('requestSchemas.advancedReadFilter'),
      );

      const svc = this.getService(req);
      const result = await svc.findOne((filter ?? {}) as Filter<TData>, { select }, {});

      handleResultError(result);

      const decoratedResult = await decorateDataSingleResult(svc, result);

      return decoratedResult.data;
    });

    /////////////////////
    // READ - Advanced //
    /////////////////////
    this.router.post(`/${this.options.queryRouteSegment}/:${this.options.idParam}`, async (req: DataRequest) => {
      await this.assertAllowed(req, 'read');

      const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
      let { select } = parseBodyWithSchema(
        dataReadByIdBodySchema,
        req.body,
        this.getRequestSchema('requestSchemas.advancedRead'),
      );

      const svc = this.getService(req);
      const result = await svc.findById(id, { select }, {});

      handleResultError(result);

      const decoratedResult = await decorateDataSingleResult(svc, result);

      return decoratedResult.data;
    });
  }

  set<K extends keyof DataRouterOptions<TData>>(key: K, value: DataRouterOptions<TData>[K]): this;
  set(options: DataRouterOptions<TData>): this;
  set<K extends keyof DataRouterOptions<TData>>(keyOrOptions: K | DataRouterOptions<TData>, value?: unknown) {
    if (arguments.length === 2 && isString(keyOrOptions)) {
      assertMutableRouterOption('data', keyOrOptions as string);
      this.runtime.setDataOption<K, TData>(this.dataName, keyOrOptions as K, value as DataRouterOptions<TData>[K]);
    }

    if (arguments.length === 1 && isPlainObject(keyOrOptions)) {
      assertMutableRouterOptions('data', keyOrOptions as Record<string, unknown>);
      this.runtime.setDataOptions<TData>(this.dataName, keyOrOptions as DataRouterOptions<TData>);
    }

    return this;
  }

  setOption<K extends keyof DataRouterOptions<TData>>(key: K, option: DataRouterOptions<TData>[K]) {
    assertMutableRouterOption('data', key as string);
    this.runtime.setDataOption<K, TData>(this.dataName, key, option);
    return this;
  }

  setOptions(options: DataRouterOptions<TData>) {
    assertMutableRouterOptions('data', options as Record<string, unknown>);
    this.runtime.setDataOptions<TData>(this.dataName, options);
    return this;
  }

  public data: SetTargetOption<DataRouter<TData>, DataRouterOptions<TData>['data']> = setOption.bind(this, 'data');
  public listHardLimit: SetTargetOption<DataRouter<TData>, DataRouterOptions<TData>['listHardLimit']> = setOption.bind(
    this,
    'listHardLimit',
  );
  public permissionSchema: SetTargetOption<DataRouter<TData>, DataRouterOptions<TData>['permissionSchema']> =
    setOption.bind(this, 'permissionSchema');
  public operationAccess: SetTargetOption<DataRouter<TData>, DataRouterOptions<TData>['operationAccess']> =
    setOption.bind(this, 'operationAccess');
  public baseFilter: SetTargetOption<DataRouter<TData>, DataRouterOptions<TData>['baseFilter']> = setOption.bind(
    this,
    'baseFilter',
  );
  public overrideFilter: SetTargetOption<DataRouter<TData>, DataRouterOptions<TData>['overrideFilter']> =
    setOption.bind(this, 'overrideFilter');
  public decorate: SetTargetOption<DataRouter<TData>, DataRouterOptions<TData>['decorate']> = setOption.bind(
    this,
    'decorate',
  );
  public decorateAll: SetTargetOption<DataRouter<TData>, DataRouterOptions<TData>['decorateAll']> = setOption.bind(
    this,
    'decorateAll',
  );
  public idField: SetTargetOption<DataRouter<TData>, DataRouterOptions<TData>['idField']> = setOption.bind(
    this,
    'idField',
  );
  public resolveIdFilter: SetTargetOption<DataRouter<TData>, DataRouterOptions<TData>['resolveIdFilter']> =
    setOption.bind(this, 'resolveIdFilter');
  public queryRouteSegment: SetTargetOption<DataRouter<TData>, DataRouterOptions<TData>['queryRouteSegment']> =
    setOption.bind(this, 'queryRouteSegment');

  get routes(): Router {
    return this.router.original;
  }
}
