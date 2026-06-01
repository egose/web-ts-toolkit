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
import {
  defineOpenApiSchemaResolver,
  getNestedOpenApiSchemaDataSource,
  patchOpenApiObjectSchema,
  unwrapNestedOpenApiSchemaSource,
} from '../openapi/schemas';

export function setModelDocumentRoutes<TModel>(context: ModelRouterRouteContext<TModel>) {
  const { router, options, modelName } = context;
  const getAdvancedUpdateOpenApiBody = () => {
    const advancedUpdateSchema = context.getRequestSchema('requestSchemas.advancedUpdate');
    const dataSchema =
      context.getRequestSchema('requestSchemas.advancedUpdate.data') ??
      getNestedOpenApiSchemaDataSource(advancedUpdateSchema);
    const bodySchema = unwrapNestedOpenApiSchemaSource(
      context.getRequestSchema('requestSchemas.advancedUpdate.default') ?? advancedUpdateSchema,
      advancedUpdateBodySchema,
    );

    return dataSchema ? patchOpenApiObjectSchema(bodySchema, { data: dataSchema }) : bodySchema;
  };
  const getAdvancedUpsertOpenApiBody = () => {
    const advancedUpsertSchema = context.getRequestSchema('requestSchemas.advancedUpsert');
    const dataSchema =
      context.getRequestSchema('requestSchemas.advancedUpsert.data') ??
      getNestedOpenApiSchemaDataSource(advancedUpsertSchema);
    const bodySchema = unwrapNestedOpenApiSchemaSource(
      context.getRequestSchema('requestSchemas.advancedUpsert.default') ?? advancedUpsertSchema,
      advancedUpsertBodySchema,
    );

    return dataSchema ? patchOpenApiObjectSchema(bodySchema, { data: dataSchema }) : bodySchema;
  };

  router.get('/count', async (req: ModelRequest) => {
    await context.assertAllowed(req, 'count');

    const svc = context.getPublicService(req);
    const result = await svc._count({});

    handleResultError(result);

    return unwrapServiceData(result);
  });
  context.registerOpenApiRoute({
    method: 'get',
    path: '/count',
    operationId: `${modelName}.count`,
    summary: `Count ${modelName} documents`,
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
  context.registerOpenApiRoute({
    method: 'post',
    path: '/count',
    operationId: `${modelName}.countWithFilter`,
    summary: `Count ${modelName} documents with a filter`,
    body: defineOpenApiSchemaResolver(() => context.getRequestSchema('requestSchemas.count') ?? countBodySchema),
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
  context.registerOpenApiRoute({
    method: 'get',
    path: `/:${options.idParam}`,
    operationId: `${modelName}.read`,
    summary: `Read a ${modelName} document`,
    query: requestSchemas.readQuery,
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
  context.registerOpenApiRoute({
    method: 'post',
    path: `/${options.queryRouteSegment}/__filter`,
    operationId: `${modelName}.readByFilterAdvanced`,
    summary: `Read a ${modelName} document by filter`,
    body: defineOpenApiSchemaResolver(
      () => context.getRequestSchema('requestSchemas.advancedReadFilter') ?? readFilterBodySchema,
    ),
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
  context.registerOpenApiRoute({
    method: 'post',
    path: `/${options.queryRouteSegment}/:${options.idParam}`,
    operationId: `${modelName}.readAdvanced`,
    summary: `Read a ${modelName} document with advanced options`,
    body: defineOpenApiSchemaResolver(
      () => context.getRequestSchema('requestSchemas.advancedRead') ?? readByIdBodySchema,
    ),
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
  context.registerOpenApiRoute({
    method: 'patch',
    path: `/:${options.idParam}`,
    operationId: `${modelName}.update`,
    summary: `Update a ${modelName} document`,
    query: requestSchemas.updateQuery,
    body: defineOpenApiSchemaResolver(() => context.getRequestSchema('requestSchemas.update') ?? updateBodySchema),
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
  context.registerOpenApiRoute({
    method: 'patch',
    path: `/${options.mutationRouteSegment}/:${options.idParam}`,
    operationId: `${modelName}.updateAdvanced`,
    summary: `Advanced update a ${modelName} document`,
    query: requestSchemas.updateQuery,
    body: defineOpenApiSchemaResolver(getAdvancedUpdateOpenApiBody),
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
  context.registerOpenApiRoute({
    method: 'put',
    path: '/',
    operationId: `${modelName}.upsert`,
    summary: `Upsert a ${modelName} document`,
    query: requestSchemas.upsertQuery,
    body: defineOpenApiSchemaResolver(() => context.getRequestSchema('requestSchemas.upsert') ?? upsertBodySchema),
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
  context.registerOpenApiRoute({
    method: 'put',
    path: `/${options.mutationRouteSegment}`,
    operationId: `${modelName}.upsertAdvanced`,
    summary: `Advanced upsert a ${modelName} document`,
    query: requestSchemas.upsertQuery,
    body: defineOpenApiSchemaResolver(getAdvancedUpsertOpenApiBody),
  });

  router.delete(`/:${options.idParam}`, async (req: ModelRequest) => {
    await context.assertAllowed(req, 'delete');

    const id = parsePathParam(req.params[options.idParam], options.idParam);
    const svc = context.getPublicService(req);
    const result = await svc._delete(id);

    handleResultError(result);

    return unwrapServiceData(result);
  });
  context.registerOpenApiRoute({
    method: 'delete',
    path: `/:${options.idParam}`,
    operationId: `${modelName}.delete`,
    summary: `Delete a ${modelName} document`,
  });

  router.get('/distinct/:field', async (req: ModelRequest) => {
    await context.assertAllowed(req, 'distinct');

    const field = parsePathParam(req.params.field, 'field');
    const svc = context.getPublicService(req);
    const result = await svc._distinct(field);

    handleResultError(result);

    return unwrapServiceData(result);
  });
  context.registerOpenApiRoute({
    method: 'get',
    path: '/distinct/:field',
    operationId: `${modelName}.distinct`,
    summary: `Get distinct values for a ${modelName} field`,
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
  context.registerOpenApiRoute({
    method: 'post',
    path: '/distinct/:field',
    operationId: `${modelName}.distinctWithFilter`,
    summary: `Get distinct values for a ${modelName} field with a filter`,
    body: defineOpenApiSchemaResolver(() => context.getRequestSchema('requestSchemas.distinct') ?? distinctBodySchema),
  });
}
