import JsonRouter from '@web-ts-toolkit/express-json-router';
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
import { formatCreatedData, formatListResponse, parseBooleanString } from './shared';
import type { ModelRouterRouteContext } from './model-router-context';

const success = JsonRouter.success;

export function setModelCollectionRoutes<TModel>(context: ModelRouterRouteContext<TModel>) {
  const { router, options } = context;

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

    return formatListResponse(req, result, includeCount, includeExtraHeaders);
  });

  router.post(`/${options.queryRouteSegment}`, async (req: ModelRequest) => {
    await context.assertAllowed(req, 'list');

    const body = parseBodyWithSchema(
      listBodySchema,
      req.body,
      context.getRequestSchema('requestSchemas.advancedList'),
    ) as AdvancedListBody;
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

    return formatListResponse(req, result, includeCount, includeExtraHeaders);
  });

  router.post('', async (req: ModelRequest) => {
    await context.assertAllowed(req, 'create');

    const { include_permissions } = parseQuery(requestSchemas.createQuery, req.query);
    const data = parseBodyWithSchema(createBodySchema, req.body, context.getRequestSchema('requestSchemas.create'));

    const svc = context.getPublicService(req);
    const result = await svc._create(data, {}, { includePermissions: parseBooleanString(include_permissions) });

    handleResultError(result);

    return new success.Created(formatCreatedData(result));
  });

  router.post(`/${options.mutationRouteSegment}`, async (req: ModelRequest) => {
    await context.assertAllowed(req, 'create');

    const { include_permissions } = parseQuery(requestSchemas.createQuery, req.query);
    const body = parseNestedBodyWithSchema(
      advancedCreateBodySchema,
      req.body,
      'data',
      context.getRequestSchema('requestSchemas.advancedCreate.data'),
    ) as AdvancedCreateBody;
    const { data, select, populate, tasks } = body;
    const advancedOptions: NonNullable<AdvancedCreateBody['options']> = body.options ?? {};
    parseBodyWithSchema(
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

    return new success.Created(formatCreatedData(result));
  });

  router.get('/new', async (req: ModelRequest) => {
    const svc = context.getPublicService(req);
    const result = await svc._new();

    handleResultError(result);

    return result.data;
  });
}
