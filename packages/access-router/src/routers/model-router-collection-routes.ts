import {
  formatModelCreatedResponse,
  formatModelListResponse,
  unwrapServiceData,
} from '../http/response-pipelines/model-response';
import type { Filter, ModelRequest, PopulateAccess } from '../interfaces';
import {
  type AdvancedCreateBody,
  type AdvancedListBody,
  advancedCreateBodySchema,
  createBodySchema,
  listBodySchema,
  parseBodyWithSchema,
  parseNestedBodyWithSchema,
  parseQuery,
  requestSchemas,
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

export function setModelCollectionRoutes<TModel>(context: ModelRouterRouteContext<TModel>) {
  const { router, options } = context;
  const getAdvancedCreateOpenApiBody = () => {
    const advancedCreateSchema = context.getRequestSchema('requestSchemas.advancedCreate');
    const dataSchema =
      context.getRequestSchema('requestSchemas.advancedCreate.data') ??
      getNestedOpenApiSchemaDataSource(advancedCreateSchema);
    const bodySchema = unwrapNestedOpenApiSchemaSource(
      context.getRequestSchema('requestSchemas.advancedCreate.default') ?? advancedCreateSchema,
      advancedCreateBodySchema,
    );

    return dataSchema ? patchOpenApiObjectSchema(bodySchema, { data: dataSchema }) : bodySchema;
  };

  router.get('', async (req: ModelRequest) => {
    await context.assertAllowed(req, 'list');

    const { skip, limit, page, page_size, skim, include_permissions, include_count, include_extra_headers } =
      parseQuery(requestSchemas.listQuery, req.query);

    const svc = context.getPublicService(req);

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

    return formatModelListResponse(req, result, includeCount, includeExtraHeaders);
  });
  context.registerOpenApiRoute({
    method: 'get',
    path: '',
    operationId: `${context.modelName}.list`,
    summary: `List ${context.modelName} documents`,
    query: requestSchemas.listQuery,
  });

  router.post(`/${options.queryRouteSegment}`, async (req: ModelRequest) => {
    await context.assertAllowed(req, 'list');

    const body = (await parseBodyWithSchema(
      listBodySchema,
      req.body,
      context.getRequestSchema('requestSchemas.advancedList'),
    )) as AdvancedListBody;
    const { filter, select, sort, populate, include, tasks, skip, limit, page, pageSize } = body;
    const advancedOptions: NonNullable<AdvancedListBody['options']> = body.options ?? {};
    const { skim, includePermissions, includeCount, includeExtraHeaders, populateAccess } = advancedOptions;

    const svc = context.getPublicService(req);
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

    return formatModelListResponse(req, result, includeCount, includeExtraHeaders);
  });
  context.registerOpenApiRoute({
    method: 'post',
    path: `/${options.queryRouteSegment}`,
    operationId: `${context.modelName}.listAdvanced`,
    summary: `Advanced list ${context.modelName} documents`,
    body: defineOpenApiSchemaResolver(() => context.getRequestSchema('requestSchemas.advancedList') ?? listBodySchema),
  });

  router.post('', async (req: ModelRequest) => {
    await context.assertAllowed(req, 'create');

    const { include_permissions } = parseQuery(requestSchemas.createQuery, req.query);
    const data = await parseBodyWithSchema(
      createBodySchema,
      req.body,
      context.getRequestSchema('requestSchemas.create'),
    );

    const svc = context.getPublicService(req);
    const result = await svc._create(data, {}, { includePermissions: parseBooleanString(include_permissions) });

    handleResultError(result);

    return formatModelCreatedResponse(result);
  });
  context.registerOpenApiRoute({
    method: 'post',
    path: '',
    operationId: `${context.modelName}.create`,
    summary: `Create a ${context.modelName} document`,
    query: requestSchemas.createQuery,
    body: defineOpenApiSchemaResolver(() => context.getRequestSchema('requestSchemas.create') ?? createBodySchema),
  });

  router.post(`/${options.mutationRouteSegment}`, async (req: ModelRequest) => {
    await context.assertAllowed(req, 'create');

    const { include_permissions } = parseQuery(requestSchemas.createQuery, req.query);
    const body = (await parseNestedBodyWithSchema(
      advancedCreateBodySchema,
      req.body,
      'data',
      context.getRequestSchema('requestSchemas.advancedCreate.data'),
    )) as AdvancedCreateBody;
    const { data, select, populate, tasks } = body;
    const advancedOptions: NonNullable<AdvancedCreateBody['options']> = body.options ?? {};
    await parseBodyWithSchema(
      advancedCreateBodySchema,
      { data, select, populate, tasks, options: advancedOptions },
      context.getRequestSchema('requestSchemas.advancedCreate.default') ??
        context.getRequestSchema('requestSchemas.advancedCreate'),
    );
    const { includePermissions, populateAccess } = advancedOptions;

    const svc = context.getPublicService(req);
    const result = await svc._create(
      data,
      { select, populate, tasks },
      {
        includePermissions: includePermissions ?? parseBooleanString(include_permissions),
        populateAccess: populateAccess as PopulateAccess | undefined,
      },
    );

    handleResultError(result);

    return formatModelCreatedResponse(result);
  });
  context.registerOpenApiRoute({
    method: 'post',
    path: `/${options.mutationRouteSegment}`,
    operationId: `${context.modelName}.createAdvanced`,
    summary: `Advanced create a ${context.modelName} document`,
    query: requestSchemas.createQuery,
    body: defineOpenApiSchemaResolver(getAdvancedCreateOpenApiBody),
  });

  router.get('/new', async (req: ModelRequest) => {
    const svc = context.getPublicService(req);
    const result = await svc._new();

    handleResultError(result);

    return unwrapServiceData(result);
  });
  context.registerOpenApiRoute({
    method: 'get',
    path: '/new',
    operationId: `${context.modelName}.new`,
    summary: `Get a new ${context.modelName} document template`,
  });
}
