import { formatModelUpsertResponse, unwrapServiceData } from '../http/response-pipelines/model-response';
import type { BaseFilterAccess, Filter, ModelRequest, PopulateAccess } from '../interfaces';
import {
  type AdvancedReadBody,
  type AdvancedReadFilterBody,
  type AdvancedUpdateBody,
  type AdvancedUpsertBody,
  type CountBody,
  type DistinctBody,
  advancedUpdateBodySchema,
  advancedUpsertBodySchema,
  countBodySchema,
  distinctBodySchema,
  parseBodyWithSchema,
  parseNestedBodyWithSchema,
  parsePathParam,
  parseQuery,
  readByIdBodySchema,
  readFilterBodySchema,
  requestSchemas,
  updateBodySchema,
  upsertBodySchema,
} from './validation';
import { handleResultError } from '../helpers';
import { parseBooleanString } from './shared';
import type { ModelRouterRouteContext } from './model-router-route-context';

export function setModelDocumentRoutes<TModel>(context: ModelRouterRouteContext<TModel>) {
  const { router, options, modelName } = context;

  router.get('/count', async (req: ModelRequest) => {
    await context.assertAllowed(req, 'count');

    const svc = context.getPublicService(req);
    const result = await svc._count({});

    handleResultError(result);

    return unwrapServiceData(result);
  });

  router.post('/count', async (req: ModelRequest) => {
    await context.assertAllowed(req, 'count');

    const { filter, options: countOptions = {} }: CountBody = await parseBodyWithSchema(
      countBodySchema,
      req.body,
      context.getRequestSchema('requestSchemas.count'),
    );
    const svc = context.getPublicService(req);
    const result = await svc._count(
      (filter ?? {}) as Filter<TModel>,
      countOptions.access as BaseFilterAccess | undefined,
    );

    handleResultError(result);

    return unwrapServiceData(result);
  });

  router.get(`/:${options.idParam}`, async (req: ModelRequest) => {
    await context.assertAllowed(req, 'read');

    const id = parsePathParam(req.params[options.idParam], options.idParam);
    const { include_permissions, try_list } = parseQuery(requestSchemas.readQuery, req.query);
    const svc = context.getPublicService(req);
    const result = await svc._read(
      id,
      {},
      {
        includePermissions: parseBooleanString(include_permissions),
        tryList: parseBooleanString(try_list),
      },
    );

    handleResultError(result);

    return unwrapServiceData(result);
  });

  router.post(`/${options.queryRouteSegment}/__filter`, async (req: ModelRequest) => {
    await context.assertAllowed(req, 'read');

    const body = (await parseBodyWithSchema(
      readFilterBodySchema,
      req.body,
      context.getRequestSchema('requestSchemas.advancedReadFilter'),
    )) as AdvancedReadFilterBody;
    const { filter, select, sort, populate, include, tasks } = body;
    const advancedOptions: NonNullable<AdvancedReadFilterBody['options']> = body.options ?? {};
    const { skim, includePermissions, tryList, populateAccess } = advancedOptions;

    const svc = context.getPublicService(req);
    const result = await svc._readFilter(
      (filter ?? {}) as Filter<TModel>,
      { select, sort, populate, include, tasks },
      { skim, includePermissions, tryList, populateAccess: populateAccess as PopulateAccess | undefined },
    );

    handleResultError(result);

    return unwrapServiceData(result);
  });

  router.post(`/${options.queryRouteSegment}/:${options.idParam}`, async (req: ModelRequest) => {
    await context.assertAllowed(req, 'read');

    const id = parsePathParam(req.params[options.idParam], options.idParam);
    const body = (await parseBodyWithSchema(
      readByIdBodySchema,
      req.body,
      context.getRequestSchema('requestSchemas.advancedRead'),
    )) as AdvancedReadBody;
    const { select, populate, include, tasks } = body;
    const advancedOptions: NonNullable<AdvancedReadBody['options']> = body.options ?? {};
    const { skim, includePermissions, tryList, populateAccess } = advancedOptions;

    const svc = context.getPublicService(req);
    const result = await svc._read(
      id,
      { select, populate, include, tasks },
      { skim, includePermissions, tryList, populateAccess: populateAccess as PopulateAccess | undefined },
    );

    handleResultError(result);

    return unwrapServiceData(result);
  });

  router.patch(`/:${options.idParam}`, async (req: ModelRequest) => {
    await context.assertAllowed(req, 'update');

    const id = parsePathParam(req.params[options.idParam], options.idParam);
    const { returning_all, include_permissions } = parseQuery(requestSchemas.updateQuery, req.query);
    const data = await parseBodyWithSchema(
      updateBodySchema,
      req.body,
      context.getRequestSchema('requestSchemas.update'),
    );

    const svc = context.getPublicService(req);
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

    return unwrapServiceData(result);
  });

  router.patch(`/${options.mutationRouteSegment}/:${options.idParam}`, async (req: ModelRequest) => {
    await context.assertAllowed(req, 'update');

    const id = parsePathParam(req.params[options.idParam], options.idParam);
    const { returning_all, include_permissions } = parseQuery(requestSchemas.updateQuery, req.query);
    const body = (await parseNestedBodyWithSchema(
      advancedUpdateBodySchema,
      req.body,
      'data',
      context.getRequestSchema('requestSchemas.advancedUpdate.data'),
    )) as AdvancedUpdateBody;
    const { data, select, populate, tasks } = body;
    const advancedOptions: NonNullable<AdvancedUpdateBody['options']> = body.options ?? {};
    await parseBodyWithSchema(
      advancedUpdateBodySchema,
      { data, select, populate, tasks, options: advancedOptions },
      context.getRequestSchema('requestSchemas.advancedUpdate.default') ??
        context.getRequestSchema('requestSchemas.advancedUpdate'),
    );
    const { returningAll, includePermissions, populateAccess } = advancedOptions;

    const svc = context.getPublicService(req);
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

    return unwrapServiceData(result);
  });

  router.put(`/`, async (req: ModelRequest) => {
    await context.assertAllowed(req, 'upsert');

    const svc = context.getPublicService(req);
    const { returning_all, include_permissions } = parseQuery(requestSchemas.upsertQuery, req.query);
    const body = await parseBodyWithSchema(
      upsertBodySchema,
      req.body,
      context.getRequestSchema('requestSchemas.upsert'),
    );
    const result = await svc._upsert(
      body,
      {},
      {
        returningAll: parseBooleanString(returning_all),
        includePermissions: parseBooleanString(include_permissions),
      },
    );

    handleResultError(result);

    return formatModelUpsertResponse(result);
  });

  router.put(`/${options.mutationRouteSegment}`, async (req: ModelRequest) => {
    await context.assertAllowed(req, 'upsert');

    const svc = context.getPublicService(req);
    const { returning_all, include_permissions } = parseQuery(requestSchemas.upsertQuery, req.query);
    const body = (await parseNestedBodyWithSchema(
      advancedUpsertBodySchema,
      req.body,
      'data',
      context.getRequestSchema('requestSchemas.advancedUpsert.data'),
    )) as AdvancedUpsertBody;
    const { data, select, populate, tasks } = body;
    const advancedOptions: NonNullable<AdvancedUpsertBody['options']> = body.options ?? {};
    await parseBodyWithSchema(
      advancedUpsertBodySchema,
      { data, select, populate, tasks, options: advancedOptions },
      context.getRequestSchema('requestSchemas.advancedUpsert.default') ??
        context.getRequestSchema('requestSchemas.advancedUpsert'),
    );
    const { returningAll, includePermissions, populateAccess } = advancedOptions;
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
    return formatModelUpsertResponse(result);
  });

  router.delete(`/:${options.idParam}`, async (req: ModelRequest) => {
    await context.assertAllowed(req, 'delete');

    const id = parsePathParam(req.params[options.idParam], options.idParam);
    const svc = context.getPublicService(req);
    const result = await svc._delete(id);

    handleResultError(result);

    return unwrapServiceData(result);
  });

  router.get('/distinct/:field', async (req: ModelRequest) => {
    await context.assertAllowed(req, 'distinct');

    const field = parsePathParam(req.params.field, 'field');
    const svc = context.getPublicService(req);
    const result = await svc._distinct(field);

    handleResultError(result);

    return unwrapServiceData(result);
  });

  router.post('/distinct/:field', async (req: ModelRequest) => {
    await context.assertAllowed(req, 'distinct');

    const field = parsePathParam(req.params.field, 'field');
    const { filter }: DistinctBody = await parseBodyWithSchema(
      distinctBodySchema,
      req.body,
      context.getRequestSchema('requestSchemas.distinct'),
    );

    const svc = req.macl.getPublicService(modelName);
    const result = await svc._distinct(field, { filter: (filter ?? {}) as Filter });

    handleResultError(result);

    return unwrapServiceData(result);
  });
}
