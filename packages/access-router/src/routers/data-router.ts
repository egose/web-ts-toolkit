import JsonRouter from '@web-ts-toolkit/express-json-router';
import type { Router } from 'express';
import { isPlainObject, isString, isUndefined } from '@web-ts-toolkit/utils';
import { setDataCore } from '../core-data';
import { setDataOption, setDataOptions, getDataOptions, getExactDataOption } from '../options';
import { processUrl } from '../lib';
import { handleResultError } from '../helpers';
import { DataRouterOptions, ExtendedDataRouterOptions, Request, Filter } from '../interfaces';
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

type SetTargetOption = {
  (option: unknown): DataRouter;
  (key: string, option: unknown): DataRouter;
};

function setOption(this: DataRouter, parentKey: string, optionKey: unknown, option?: unknown) {
  const key = isUndefined(option) ? parentKey : `${parentKey}.${optionKey}`;
  const value = isUndefined(option) ? optionKey : option;

  setDataOption(this.dataName, key as keyof DataRouterOptions, value);
  return this;
}

export class DataRouter {
  readonly dataName: string;
  readonly router: JsonRouter;
  readonly options: DataRouterOptions;
  readonly fullBasePath: string;

  constructor(dataName: string, initialOptions: DataRouterOptions) {
    setDataOptions(dataName, initialOptions);
    this.options = getDataOptions(dataName);
    this.fullBasePath = processUrl(this.options.parentPath + this.options.basePath);
    this.dataName = dataName;
    this.router = new JsonRouter(this.options.basePath, setDataCore, accessRouterResponseHandler);

    this.setCollectionRoutes();
    this.setDocumentRoutes();
  }

  private getRequestSchema(key: string) {
    return getExactDataOption(this.dataName, key as keyof ExtendedDataRouterOptions);
  }

  private async assertAllowed(req: Request, access: string) {
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
    this.router.get('', async (req: Request) => {
      await this.assertAllowed(req, 'list');

      const { skip, limit, page, page_size, include_count, include_extra_headers } = parseQuery(
        requestSchemas.listQuery,
        req.query,
      );

      const svc = req.dacl.getService(this.dataName);

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

      return formatListResponse(req, result, includeCount, includeExtraHeaders);
    });

    /////////////////////
    // LIST - Advanced //
    /////////////////////
    this.router.post(`/${this.options.queryPath}`, async (req: Request) => {
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

      const svc = req.dacl.getService(this.dataName);

      const result = await svc.find(
        (filter ?? {}) as Filter,
        { select, sort: typeof sort === 'string' ? sort : undefined, skip, limit, page, pageSize },
        { includeCount },
      );

      handleResultError(result);

      return formatListResponse(req, result, includeCount, includeExtraHeaders);
    });
  }

  /////////////////////
  // Document Routes //
  /////////////////////
  private setDocumentRoutes() {
    //////////
    // READ //
    //////////
    this.router.get(`/:${this.options.idParam}`, async (req: Request) => {
      await this.assertAllowed(req, 'read');

      const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
      const svc = req.dacl.getService(this.dataName);
      const result = await svc.findById(id, {}, {});

      handleResultError(result);

      return result.data;
    });

    //////////////////////////////
    // READ - Advanced - Filter //
    //////////////////////////////
    this.router.post(`/${this.options.queryPath}/__filter`, async (req: Request) => {
      await this.assertAllowed(req, 'read');

      let { filter, select } = parseBodyWithSchema(
        dataReadFilterBodySchema,
        req.body,
        this.getRequestSchema('requestSchemas.advancedReadFilter'),
      );

      const svc = req.dacl.getService(this.dataName);
      const result = await svc.findOne((filter ?? {}) as Filter, { select }, {});

      handleResultError(result);

      return result.data;
    });

    /////////////////////
    // READ - Advanced //
    /////////////////////
    this.router.post(`/${this.options.queryPath}/:${this.options.idParam}`, async (req: Request) => {
      await this.assertAllowed(req, 'read');

      const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
      let { select } = parseBodyWithSchema(
        dataReadByIdBodySchema,
        req.body,
        this.getRequestSchema('requestSchemas.advancedRead'),
      );

      const svc = req.dacl.getService(this.dataName);
      const result = await svc.findById(id, { select }, {});

      handleResultError(result);

      return result.data;
    });
  }

  set<K extends keyof DataRouterOptions>(keyOrOptions: K | DataRouterOptions, value?: unknown) {
    if (arguments.length === 2 && isString(keyOrOptions)) {
      setDataOption(this.dataName, keyOrOptions as K, value as DataRouterOptions[K]);
    }

    if (arguments.length === 1 && isPlainObject(keyOrOptions)) {
      setDataOptions(this.dataName, keyOrOptions as DataRouterOptions);
    }

    return this;
  }

  setOption<K extends keyof DataRouterOptions>(key: K, option: DataRouterOptions[K]) {
    setDataOption(this.dataName, key, option);
    return this;
  }

  setOptions(options: DataRouterOptions) {
    setDataOptions(this.dataName, options);
    return this;
  }

  public data: SetTargetOption = setOption.bind(this, 'data');
  public listHardLimit: SetTargetOption = setOption.bind(this, 'listHardLimit');
  public permissionSchema: SetTargetOption = setOption.bind(this, 'permissionSchema');
  public routeGuard: SetTargetOption = setOption.bind(this, 'routeGuard');
  public baseFilter: SetTargetOption = setOption.bind(this, 'baseFilter');
  public overrideFilter: SetTargetOption = setOption.bind(this, 'overrideFilter');
  public decorate: SetTargetOption = setOption.bind(this, 'decorate');
  public decorateAll: SetTargetOption = setOption.bind(this, 'decorateAll');
  public identifier: SetTargetOption = setOption.bind(this, 'identifier');

  get routes(): Router {
    return this.router.original;
  }
}
