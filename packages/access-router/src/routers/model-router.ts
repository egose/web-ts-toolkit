import JsonRouter from '@web-ts-toolkit/express-json-router';
import type { Router } from 'express';
import type { z } from 'zod';
import { forEach, isPlainObject, isString, isUndefined, padEnd } from '@web-ts-toolkit/utils';
import Model from '../model';
import { getModelSub } from '../meta';
import { setCore } from '../core';
import { setModelOptions, setModelOption, getModelOptions, getExactModelOption } from '../options';
import { processUrl } from '../lib';
import { handleResultError } from '../helpers';
import {
  ModelRouterOptions,
  ExtendedModelRouterOptions,
  ModelRequest,
  Filter,
  BaseFilterAccess,
  SubPopulate,
  PopulateAccess,
} from '../interfaces';
import { logger } from '../logger';
import { PublicService, Service } from '../services';
import { formatCreatedData, formatListResponse, formatUpsertCreatedData, parseBooleanString } from './shared';
import { accessRouterResponseHandler } from './index';
import {
  type AdvancedCreateBody,
  type AdvancedListBody,
  type AdvancedReadBody,
  type AdvancedReadFilterBody,
  type AdvancedUpdateBody,
  type AdvancedUpsertBody,
  type CountBody,
  type DistinctBody,
  type SubListBody,
  type SubReadBody,
  advancedCreateBodySchema,
  advancedUpdateBodySchema,
  advancedUpsertBodySchema,
  countBodySchema,
  createBodySchema,
  distinctBodySchema,
  parseBodyWithSchema,
  parseNestedBodyWithSchema,
  parsePathParam,
  parseQuery,
  readByIdBodySchema,
  readFilterBodySchema,
  requestSchemas,
  subListBodySchema,
  subReadBodySchema,
  subMutationBodySchema,
  updateBodySchema,
  upsertBodySchema,
  listBodySchema,
} from './validation';

const clientErrors = JsonRouter.clientErrors;
const success = JsonRouter.success;

type SetTargetOption<TRouter, TOption> = {
  (option: TOption): TRouter;
  (key: string, option: unknown): TRouter;
};

function setOption<TModel>(this: ModelRouter<TModel>, parentKey: string, optionKey: unknown, option?: unknown) {
  const key = isUndefined(option) ? parentKey : `${parentKey}.${optionKey}`;
  const value = isUndefined(option) ? optionKey : option;

  setModelOption(this.modelName, key as keyof ExtendedModelRouterOptions<TModel>, value);
  return this;
}

export class ModelRouter<TModel = unknown> {
  readonly modelName: string;
  readonly router: JsonRouter;
  readonly model: Model;
  readonly options: ModelRouterOptions<TModel>;
  readonly fullBasePath: string;

  constructor(modelName: string, initialOptions: ModelRouterOptions<TModel>) {
    setModelOptions(modelName, initialOptions);
    this.options = getModelOptions<TModel>(modelName);
    this.fullBasePath = processUrl(this.options.parentPath + this.options.basePath);
    this.modelName = modelName;
    this.router = new JsonRouter(this.options.basePath, setCore, accessRouterResponseHandler);
    this.model = new Model(modelName);

    this.setCollectionRoutes();
    this.setDocumentRoutes();
    this.setSubDocumentRoutes();
    this.logEndpoints();
  }

  private getRequestSchema(key: string) {
    return getExactModelOption<keyof ExtendedModelRouterOptions<TModel>, TModel>(
      this.modelName,
      key as keyof ExtendedModelRouterOptions<TModel>,
    ) as z.ZodTypeAny | undefined;
  }

  getService(req: ModelRequest): Service<TModel> {
    return req.macl.getService<TModel>(this.modelName);
  }

  getPublicService(req: ModelRequest): PublicService<TModel> {
    return req.macl.getPublicService<TModel>(this.modelName);
  }

  private async assertAllowed(req: ModelRequest, access: string) {
    const allowed = await req.macl.isAllowed(this.modelName, access);
    if (!allowed) throw new clientErrors.UnauthorizedError();
  }

  ///////////////////////
  // Collection Routes //
  ///////////////////////
  private setCollectionRoutes() {
    //////////
    // LIST //
    //////////
    this.router.get('', async (req: ModelRequest) => {
      await this.assertAllowed(req, 'list');

      const { skip, limit, page, page_size, skim, include_permissions, include_count, include_extra_headers } =
        parseQuery(requestSchemas.listQuery, req.query);

      const svc = this.getPublicService(req);

      const includeCount = parseBooleanString(include_count);
      const includeExtraHeaders = parseBooleanString(include_extra_headers);

      const result = await svc._list(
        {},
        { skip, limit, page, pageSize: page_size },
        {
          skim: parseBooleanString(skim),
          includePermissions: parseBooleanString(include_permissions),
          includeCount,
        },
      );

      handleResultError(result);

      return formatListResponse(req, result, includeCount, includeExtraHeaders);
    });

    /////////////////////
    // LIST - Advanced //
    /////////////////////
    this.router.post(`/${this.options.queryRouteSegment}`, async (req: ModelRequest) => {
      await this.assertAllowed(req, 'list');

      const body = parseBodyWithSchema(
        listBodySchema,
        req.body,
        this.getRequestSchema('requestSchemas.advancedList'),
      ) as AdvancedListBody;
      let { filter, select, sort, populate, include, tasks, skip, limit, page, pageSize } = body;
      const options: NonNullable<AdvancedListBody['options']> = body.options ?? {};
      const { skim, includePermissions, includeCount, includeExtraHeaders, populateAccess } = options;

      const svc = this.getPublicService(req);
      const listFilter = (filter ?? {}) as Filter<TModel>;

      const result = await svc._list(
        listFilter,
        { select, sort, populate, include, tasks, skip, limit, page, pageSize },
        {
          skim,
          includePermissions,
          includeCount,
          populateAccess: populateAccess as PopulateAccess | undefined,
        },
      );

      handleResultError(result);

      return formatListResponse(req, result, includeCount, includeExtraHeaders);
    });

    ////////////
    // CREATE //
    ////////////
    this.router.post('', async (req: ModelRequest, res) => {
      await this.assertAllowed(req, 'create');

      const { include_permissions } = parseQuery(requestSchemas.createQuery, req.query);
      const data = parseBodyWithSchema(createBodySchema, req.body, this.getRequestSchema('requestSchemas.create'));

      const svc = this.getPublicService(req);
      const result = await svc._create(data, {}, { includePermissions: parseBooleanString(include_permissions) });

      handleResultError(result);

      return new success.Created(formatCreatedData(result));
    });

    ///////////////////////
    // CREATE - Advanced //
    ///////////////////////
    this.router.post(`/${this.options.mutationRouteSegment}`, async (req: ModelRequest, res) => {
      await this.assertAllowed(req, 'create');

      const { include_permissions } = parseQuery(requestSchemas.createQuery, req.query);
      const body = parseNestedBodyWithSchema(
        advancedCreateBodySchema,
        req.body,
        'data',
        this.getRequestSchema('requestSchemas.advancedCreate.data'),
      ) as AdvancedCreateBody;
      const { data, select, populate, tasks } = body;
      const options: NonNullable<AdvancedCreateBody['options']> = body.options ?? {};
      parseBodyWithSchema(
        advancedCreateBodySchema,
        { data, select, populate, tasks, options },
        this.getRequestSchema('requestSchemas.advancedCreate.default') ??
          this.getRequestSchema('requestSchemas.advancedCreate'),
      );
      const { includePermissions, populateAccess } = options;

      const svc = this.getPublicService(req);
      const result = await svc._create(
        data,
        { select, populate, tasks },
        {
          includePermissions: includePermissions ?? parseBooleanString(include_permissions),
          populateAccess: populateAccess as PopulateAccess | undefined,
        },
      );

      handleResultError(result);

      return new success.Created(formatCreatedData(result));
    });

    /////////////////
    // NEW - EMPTY //
    /////////////////
    this.router.get('/new', async (req: ModelRequest) => {
      const svc = this.getPublicService(req);
      const result = await svc._new();

      handleResultError(result);

      return result.data;
    });
  }

  /////////////////////
  // Document Routes //
  /////////////////////
  private setDocumentRoutes() {
    ///////////
    // COUNT //
    ///////////
    this.router.get('/count', async (req: ModelRequest) => {
      await this.assertAllowed(req, 'count');

      const svc = this.getPublicService(req);
      const result = await svc._count({});

      handleResultError(result);

      return result.data;
    });

    this.router.post('/count', async (req: ModelRequest) => {
      await this.assertAllowed(req, 'count');

      const { filter, options = {} }: CountBody = parseBodyWithSchema(
        countBodySchema,
        req.body,
        this.getRequestSchema('requestSchemas.count'),
      );
      const svc = this.getPublicService(req);
      const result = await svc._count((filter ?? {}) as Filter<TModel>, options.access as BaseFilterAccess | undefined);

      handleResultError(result);

      return result.data;
    });

    //////////
    // READ //
    //////////
    this.router.get(`/:${this.options.idParam}`, async (req: ModelRequest) => {
      await this.assertAllowed(req, 'read');

      const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
      const { include_permissions, try_list } = parseQuery(requestSchemas.readQuery, req.query);
      const svc = this.getPublicService(req);
      const result = await svc._read(
        id,
        {},
        {
          includePermissions: parseBooleanString(include_permissions),
          tryList: parseBooleanString(try_list),
        },
      );

      handleResultError(result);

      return result.data;
    });

    //////////////////////////////
    // READ - Advanced - Filter //
    //////////////////////////////
    this.router.post(`/${this.options.queryRouteSegment}/__filter`, async (req: ModelRequest) => {
      await this.assertAllowed(req, 'read');

      const body = parseBodyWithSchema(
        readFilterBodySchema,
        req.body,
        this.getRequestSchema('requestSchemas.advancedReadFilter'),
      ) as AdvancedReadFilterBody;
      let { filter, select, sort, populate, include, tasks } = body;
      const options: NonNullable<AdvancedReadFilterBody['options']> = body.options ?? {};
      const { skim, includePermissions, tryList, populateAccess } = options;

      const svc = this.getPublicService(req);
      const result = await svc._readFilter(
        (filter ?? {}) as Filter<TModel>,
        {
          select,
          sort,
          populate,
          include,
          tasks,
        },
        { skim, includePermissions, tryList, populateAccess: populateAccess as PopulateAccess | undefined },
      );

      handleResultError(result);

      return result.data;
    });

    /////////////////////
    // READ - Advanced //
    /////////////////////
    this.router.post(`/${this.options.queryRouteSegment}/:${this.options.idParam}`, async (req: ModelRequest) => {
      await this.assertAllowed(req, 'read');

      const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
      const body = parseBodyWithSchema(
        readByIdBodySchema,
        req.body,
        this.getRequestSchema('requestSchemas.advancedRead'),
      ) as AdvancedReadBody;
      let { select, populate, include, tasks } = body;
      const options: NonNullable<AdvancedReadBody['options']> = body.options ?? {};
      const { skim, includePermissions, tryList, populateAccess } = options;

      const svc = this.getPublicService(req);
      const result = await svc._read(
        id,
        {
          select,
          populate,
          include,
          tasks,
        },
        { skim, includePermissions, tryList, populateAccess: populateAccess as PopulateAccess | undefined },
      );

      handleResultError(result);

      return result.data;
    });

    ////////////
    // UPDATE //
    ////////////
    this.router.patch(`/:${this.options.idParam}`, async (req: ModelRequest) => {
      await this.assertAllowed(req, 'update');

      const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
      const { returning_all, include_permissions } = parseQuery(requestSchemas.updateQuery, req.query);
      const data = parseBodyWithSchema(updateBodySchema, req.body, this.getRequestSchema('requestSchemas.update'));

      const svc = this.getPublicService(req);
      const result = await svc._update(
        id,
        data,
        {},
        {
          returningAll: parseBooleanString(returning_all),
          includePermissions: parseBooleanString(include_permissions),
        },
      );

      handleResultError(result);

      return result.data;
    });

    ///////////////////////
    // UPDATE - Advanced //
    ///////////////////////
    this.router.patch(`/${this.options.mutationRouteSegment}/:${this.options.idParam}`, async (req: ModelRequest) => {
      await this.assertAllowed(req, 'update');

      const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
      const { returning_all, include_permissions } = parseQuery(requestSchemas.updateQuery, req.query);
      const body = parseNestedBodyWithSchema(
        advancedUpdateBodySchema,
        req.body,
        'data',
        this.getRequestSchema('requestSchemas.advancedUpdate.data'),
      ) as AdvancedUpdateBody;
      const { data, select, populate, tasks } = body;
      const options: NonNullable<AdvancedUpdateBody['options']> = body.options ?? {};
      parseBodyWithSchema(
        advancedUpdateBodySchema,
        { data, select, populate, tasks, options },
        this.getRequestSchema('requestSchemas.advancedUpdate.default') ??
          this.getRequestSchema('requestSchemas.advancedUpdate'),
      );
      const { returningAll, includePermissions, populateAccess } = options;

      const svc = this.getPublicService(req);
      const result = await svc._update(
        id,
        data,
        { select, populate, tasks },
        {
          returningAll: returningAll ?? parseBooleanString(returning_all),
          includePermissions: includePermissions ?? parseBooleanString(include_permissions),
          populateAccess: populateAccess as PopulateAccess | undefined,
        },
      );

      handleResultError(result);

      return result.data;
    });

    ////////////
    // UPSERT //
    ////////////
    this.router.put(`/`, async (req: ModelRequest) => {
      await this.assertAllowed(req, 'upsert');

      const svc = this.getPublicService(req);
      const { returning_all, include_permissions } = parseQuery(requestSchemas.upsertQuery, req.query);
      const body = parseBodyWithSchema(upsertBodySchema, req.body, this.getRequestSchema('requestSchemas.upsert'));
      const result = await svc._upsert(
        body,
        {},
        {
          returningAll: parseBooleanString(returning_all),
          includePermissions: parseBooleanString(include_permissions),
        },
      );

      handleResultError(result);

      return result.kind === 'list' ? new success.Created(formatUpsertCreatedData(result)) : result.data;
    });

    ///////////////////////
    // UPSERT - Advanced //
    ///////////////////////
    this.router.put(`/${this.options.mutationRouteSegment}`, async (req: ModelRequest) => {
      await this.assertAllowed(req, 'upsert');

      const svc = this.getPublicService(req);
      const { returning_all, include_permissions } = parseQuery(requestSchemas.upsertQuery, req.query);
      const body = parseNestedBodyWithSchema(
        advancedUpsertBodySchema,
        req.body,
        'data',
        this.getRequestSchema('requestSchemas.advancedUpsert.data'),
      ) as AdvancedUpsertBody;
      const { data, select, populate, tasks } = body;
      const options: NonNullable<AdvancedUpsertBody['options']> = body.options ?? {};
      parseBodyWithSchema(
        advancedUpsertBodySchema,
        { data, select, populate, tasks, options },
        this.getRequestSchema('requestSchemas.advancedUpsert.default') ??
          this.getRequestSchema('requestSchemas.advancedUpsert'),
      );
      const { returningAll, includePermissions, populateAccess } = options;
      const result = await svc._upsert(
        data,
        { select, populate, tasks },
        {
          returningAll: returningAll ?? parseBooleanString(returning_all),
          includePermissions: includePermissions ?? parseBooleanString(include_permissions),
          populateAccess: populateAccess as PopulateAccess | undefined,
        },
      );

      handleResultError(result);
      return result.kind === 'list' ? new success.Created(formatUpsertCreatedData(result)) : result.data;
    });

    ////////////
    // DELETE //
    ////////////
    this.router.delete(`/:${this.options.idParam}`, async (req: ModelRequest) => {
      await this.assertAllowed(req, 'delete');

      const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
      const svc = this.getPublicService(req);
      const result = await svc._delete(id);

      handleResultError(result);

      return result.data;
    });

    //////////////
    // DISTINCT //
    //////////////
    this.router.get('/distinct/:field', async (req: ModelRequest) => {
      await this.assertAllowed(req, 'distinct');

      const field = parsePathParam(req.params.field, 'field');
      const svc = this.getPublicService(req);
      const result = await svc._distinct(field);

      handleResultError(result);

      return result.data;
    });

    this.router.post('/distinct/:field', async (req: ModelRequest) => {
      await this.assertAllowed(req, 'distinct');

      const field = parsePathParam(req.params.field, 'field');
      const { filter }: DistinctBody = parseBodyWithSchema(
        distinctBodySchema,
        req.body,
        this.getRequestSchema('requestSchemas.distinct'),
      );

      const svc = req.macl.getPublicService(this.modelName);
      const result = await svc._distinct(field, { filter: (filter ?? {}) as Filter });

      handleResultError(result);

      return result.data;
    });
  }

  /////////////////////////
  // Sub-Document Routes //
  /////////////////////////
  private setSubDocumentRoutes() {
    const subs = getModelSub(this.modelName);

    for (let x = 0; x < subs.length; x++) {
      const sub = subs[x];

      //////////
      // LIST //
      //////////
      this.router.get(`/:${this.options.idParam}/${sub}`, async (req: ModelRequest) => {
        await this.assertAllowed(req, `subs.${sub}.list`);

        const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
        const svc = this.getPublicService(req);
        const result = await svc.listSub(id, sub);

        handleResultError(result);
        return result.data;
      });

      /////////////////////
      // LIST - Advanced //
      /////////////////////
      this.router.post(
        `/:${this.options.idParam}/${sub}/${this.options.queryRouteSegment}`,
        async (req: ModelRequest) => {
          await this.assertAllowed(req, `subs.${sub}.list`);

          const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
          const body = parseBodyWithSchema(
            subListBodySchema,
            req.body,
            this.getRequestSchema('requestSchemas.subList'),
          ) as SubListBody;
          const svc = this.getPublicService(req);
          const result = await svc.listSub(id, sub, { filter: body.filter ?? {}, select: body.select ?? [] });

          handleResultError(result);
          return result.data;
        },
      );

      /////////////////
      // BULK UPDATE //
      /////////////////
      this.router.patch(`/:${this.options.idParam}/${sub}`, async (req: ModelRequest) => {
        await this.assertAllowed(req, `subs.${sub}.update`);

        const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
        const data = parseBodyWithSchema(
          subMutationBodySchema,
          req.body,
          this.getRequestSchema('requestSchemas.subBulkUpdate'),
        );
        const svc = this.getPublicService(req);
        const result = await svc.bulkUpdateSub(id, sub, data);

        handleResultError(result);
        return result.data;
      });

      //////////
      // READ //
      //////////
      this.router.get(`/:${this.options.idParam}/${sub}/:subId`, async (req: ModelRequest) => {
        await this.assertAllowed(req, `subs.${sub}.read`);

        const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
        const subId = parsePathParam(req.params.subId, 'subId');
        const svc = this.getPublicService(req);
        const result = await svc.readSub(id, sub, subId);

        handleResultError(result);
        return result.data;
      });

      /////////////////////
      // READ - Advanced //
      /////////////////////
      this.router.post(
        `/:${this.options.idParam}/${sub}/:subId/${this.options.queryRouteSegment}`,
        async (req: ModelRequest) => {
          await this.assertAllowed(req, `subs.${sub}.read`);

          const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
          const subId = parsePathParam(req.params.subId, 'subId');
          const body = parseBodyWithSchema(
            subReadBodySchema,
            req.body,
            this.getRequestSchema('requestSchemas.subRead'),
          ) as SubReadBody;
          const populate = body.populate;
          const normalizedPopulate: SubPopulate | SubPopulate[] = Array.isArray(populate)
            ? populate.map((item) => (isString(item) ? { path: item } : item))
            : isString(populate)
              ? { path: populate }
              : (populate ?? []);
          const svc = this.getPublicService(req);
          const result = await svc.readSub(id, sub, subId, { select: body.select ?? [], populate: normalizedPopulate });

          handleResultError(result);
          return result.data;
        },
      );

      ////////////
      // UPDATE //
      ////////////
      this.router.patch(`/:${this.options.idParam}/${sub}/:subId`, async (req: ModelRequest) => {
        await this.assertAllowed(req, `subs.${sub}.update`);

        const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
        const subId = parsePathParam(req.params.subId, 'subId');
        const data = parseBodyWithSchema(
          subMutationBodySchema,
          req.body,
          this.getRequestSchema('requestSchemas.subUpdate'),
        );
        const svc = this.getPublicService(req);
        const result = await svc.updateSub(id, sub, subId, data);

        handleResultError(result);
        return result.data;
      });

      ////////////
      // CREATE //
      ////////////
      this.router.post(`/:${this.options.idParam}/${sub}`, async (req: ModelRequest) => {
        await this.assertAllowed(req, `subs.${sub}.create`);

        const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
        const data = parseBodyWithSchema(
          subMutationBodySchema,
          req.body,
          this.getRequestSchema('requestSchemas.subCreate'),
        );
        const svc = this.getPublicService(req);
        const result = await svc.createSub(id, sub, data);

        handleResultError(result);

        return new success.Created(result.data);
      });

      ////////////
      // DELETE //
      ////////////
      this.router.delete(`/:${this.options.idParam}/${sub}/:subId`, async (req: ModelRequest) => {
        await this.assertAllowed(req, `subs.${sub}.delete`);

        const id = parsePathParam(req.params[this.options.idParam], this.options.idParam);
        const subId = parsePathParam(req.params.subId, 'subId');
        const svc = this.getPublicService(req);
        const result = await svc.deleteSub(id, sub, subId);

        handleResultError(result);
        return result.data;
      });
    }
  }

  private logEndpoints() {
    forEach(this.router.endpoints, ({ method, path }) => {
      logger.info(`${padEnd(method, 6)} ${processUrl(this.options.parentPath + path)}`);
    });
  }

  set<K extends keyof ExtendedModelRouterOptions<TModel>>(key: K, value: ExtendedModelRouterOptions<TModel>[K]): this;
  set(options: ModelRouterOptions<TModel>): this;
  set<K extends keyof ExtendedModelRouterOptions<TModel>>(
    keyOrOptions: K | ModelRouterOptions<TModel>,
    value?: unknown,
  ) {
    if (arguments.length === 2 && isString(keyOrOptions)) {
      setModelOption<K, TModel>(this.modelName, keyOrOptions as K, value as ExtendedModelRouterOptions<TModel>[K]);
    }

    if (arguments.length === 1 && isPlainObject(keyOrOptions)) {
      setModelOptions<TModel>(this.modelName, keyOrOptions as ModelRouterOptions<TModel>);
    }

    return this;
  }

  setOption<K extends keyof ExtendedModelRouterOptions<TModel>>(key: K, option: ExtendedModelRouterOptions<TModel>[K]) {
    setModelOption<K, TModel>(this.modelName, key, option);
    return this;
  }

  setOptions(options: ModelRouterOptions<TModel>) {
    setModelOptions<TModel>(this.modelName, options);
    return this;
  }

  /**
   * The maximum limit of the number of documents returned from the `list` operation.
   */
  public listHardLimit: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['listHardLimit']> =
    setOption.bind(this, 'listHardLimit');

  /**
   * The object schema to define the access control policy for each model field.
   */
  public permissionSchema: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['permissionSchema']> =
    setOption.bind(this, 'permissionSchema');

  /**
   * The object field to store the document permissions.
   */
  public documentPermissionField: SetTargetOption<
    ModelRouter<TModel>,
    ModelRouterOptions<TModel>['documentPermissionField']
  > = setOption.bind(this, 'documentPermissionField');

  /**
   * The model fields always selected for ACL and response shaping.
   */
  public alwaysSelectFields: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['alwaysSelectFields']> =
    setOption.bind(this, 'alwaysSelectFields');

  /**
   * The function called in the process of generating document permissions.
   */
  public docPermissions: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['docPermissions']> =
    setOption.bind(this, 'docPermissions');

  /**
   * The access control policy for router operations.
   * @operation `create`, `list`, `read`, `update`, `delete`
   */
  public operationAccess: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['operationAccess']> =
    setOption.bind(this, 'operationAccess');

  /**
   * The base filter definitions applied in every query transaction.
   * @operation `list`, `read`, `update`, `delete`
   */
  public baseFilter: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['baseFilter']> = setOption.bind(
    this,
    'baseFilter',
  );

  /**
   * The override filter definitions applied in every query transaction.
   * @operation `list`, `read`, `update`, `delete`
   */
  public overrideFilter: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['overrideFilter']> =
    setOption.bind(this, 'overrideFilter');

  /**
   * Hook
   *
   * The function called before a new/update document data is processed in `prepare` hooks. This method is used to validate `write data` and throw an error if not valid.
   * @operation `create`, `update`
   */
  public validate: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['validate']> = setOption.bind(
    this,
    'validate',
  );

  /**
   * Hook
   *
   * The function called before a new document is created or an existing document is updated. This method is used to process raw data passed into the API endpoints.
   * @operation `create`, `update`
   */
  public prepare: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['prepare']> = setOption.bind(
    this,
    'prepare',
  );

  /**
   * Hook
   *
   * The function called before an updated document is saved.
   * @operation `update`
   */
  public transform: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['transform']> = setOption.bind(
    this,
    'transform',
  );

  /**
   * Hook
   *
   * The function called after a new document is created or an updated document is saved.
   * @operation `create`, `update`
   */
  public afterPersist: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['afterPersist']> =
    setOption.bind(this, 'afterPersist');

  /**
   * Hook
   *
   * The function called after an updated document changes have been finalized.
   * @operation `update`
   */
  public onChange: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['onChange']> = setOption.bind(
    this,
    'onChange',
  );

  /**
   * Hook
   *
   * The function called before a document is deleted.
   * @operation `delete`
   */
  public beforeDelete: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['beforeDelete']> =
    setOption.bind(this, 'beforeDelete');

  /**
   * Hook
   *
   * The function called after a document is deleted.
   * @operation `delete`
   */
  public afterDelete: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['afterDelete']> = setOption.bind(
    this,
    'afterDelete',
  );

  /**
   * Hook
   *
   * The function called before response data is sent. This method is used to process raw data to apply custom logic before sending the result.
   * @operation `list`, `read`, `create`, `update`
   */
  public decorate: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['decorate']> = setOption.bind(
    this,
    'decorate',
  );

  /**
   * Hook
   *
   * The functions are called before response data is sent and after `decorate` hooks run. This method is used to process and filter multiple document objects before sending the result.
   * @operation `list`
   */
  public decorateAll: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['decorateAll']> = setOption.bind(
    this,
    'decorateAll',
  );

  /**
   * The field matched against the `id` route param.
   * @operation `read`, `update`, `delete`
   */
  public idField: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['idField']> = setOption.bind(
    this,
    'idField',
  );

  /**
   * The function used to resolve the `id` route param into a document filter.
   * @operation `read`, `update`, `delete`
   */
  public resolveIdFilter: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['resolveIdFilter']> =
    setOption.bind(this, 'resolveIdFilter');

  /**
   * The route segment used for advanced query endpoints.
   */
  public queryRouteSegment: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['queryRouteSegment']> =
    setOption.bind(this, 'queryRouteSegment');

  /**
   * The route segment used for advanced mutation endpoints.
   */
  public mutationRouteSegment: SetTargetOption<
    ModelRouter<TModel>,
    ModelRouterOptions<TModel>['mutationRouteSegment']
  > = setOption.bind(this, 'mutationRouteSegment');

  /**
   * The default values used when missing in the operations.
   */
  public defaults: SetTargetOption<ModelRouter<TModel>, ModelRouterOptions<TModel>['defaults']> = setOption.bind(
    this,
    'defaults',
  );

  get routes(): Router {
    return this.router.original;
  }
}
