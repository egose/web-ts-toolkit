import JsonRouter from '@web-ts-toolkit/express-json-router';
import { isString } from '@web-ts-toolkit/utils';
import { getModelSub } from '../meta';
import type { ModelRequest, SubPopulate } from '../interfaces';
import {
  type SubListBody,
  type SubReadBody,
  parseBodyWithSchema,
  parsePathParam,
  subListBodySchema,
  subMutationBodySchema,
  subReadBodySchema,
} from './validation';
import { handleResultError } from '../helpers';
import type { ModelRouterRouteContext } from './model-router-context';

const success = JsonRouter.success;

export function setModelSubDocumentRoutes<TModel>(context: ModelRouterRouteContext<TModel>) {
  const subs = getModelSub(context.modelName);

  for (let x = 0; x < subs.length; x++) {
    const sub = subs[x];

    context.router.get(`/:${context.options.idParam}/${sub}`, async (req: ModelRequest) => {
      await context.assertAllowed(req, `subs.${sub}.list`);

      const id = parsePathParam(req.params[context.options.idParam], context.options.idParam);
      const svc = context.getPublicService(req);
      const result = await svc.listSub(id, sub);

      handleResultError(result);
      return result.data;
    });

    context.router.post(
      `/:${context.options.idParam}/${sub}/${context.options.queryRouteSegment}`,
      async (req: ModelRequest) => {
        await context.assertAllowed(req, `subs.${sub}.list`);

        const id = parsePathParam(req.params[context.options.idParam], context.options.idParam);
        const body = parseBodyWithSchema(
          subListBodySchema,
          req.body,
          context.getRequestSchema('requestSchemas.subList'),
        ) as SubListBody;
        const svc = context.getPublicService(req);
        const result = await svc.listSub(id, sub, { filter: body.filter ?? {}, select: body.select ?? [] });

        handleResultError(result);
        return result.data;
      },
    );

    context.router.patch(`/:${context.options.idParam}/${sub}`, async (req: ModelRequest) => {
      await context.assertAllowed(req, `subs.${sub}.update`);

      const id = parsePathParam(req.params[context.options.idParam], context.options.idParam);
      const data = parseBodyWithSchema(
        subMutationBodySchema,
        req.body,
        context.getRequestSchema('requestSchemas.subBulkUpdate'),
      );
      const svc = context.getPublicService(req);
      const result = await svc.bulkUpdateSub(id, sub, data);

      handleResultError(result);
      return result.data;
    });

    context.router.get(`/:${context.options.idParam}/${sub}/:subId`, async (req: ModelRequest) => {
      await context.assertAllowed(req, `subs.${sub}.read`);

      const id = parsePathParam(req.params[context.options.idParam], context.options.idParam);
      const subId = parsePathParam(req.params.subId, 'subId');
      const svc = context.getPublicService(req);
      const result = await svc.readSub(id, sub, subId);

      handleResultError(result);
      return result.data;
    });

    context.router.post(
      `/:${context.options.idParam}/${sub}/:subId/${context.options.queryRouteSegment}`,
      async (req: ModelRequest) => {
        await context.assertAllowed(req, `subs.${sub}.read`);

        const id = parsePathParam(req.params[context.options.idParam], context.options.idParam);
        const subId = parsePathParam(req.params.subId, 'subId');
        const body = parseBodyWithSchema(
          subReadBodySchema,
          req.body,
          context.getRequestSchema('requestSchemas.subRead'),
        ) as SubReadBody;
        const populate = body.populate;
        const normalizedPopulate: SubPopulate | SubPopulate[] = Array.isArray(populate)
          ? populate.map((item) => (isString(item) ? { path: item } : item))
          : isString(populate)
            ? { path: populate }
            : (populate ?? []);
        const svc = context.getPublicService(req);
        const result = await svc.readSub(id, sub, subId, { select: body.select ?? [], populate: normalizedPopulate });

        handleResultError(result);
        return result.data;
      },
    );

    context.router.patch(`/:${context.options.idParam}/${sub}/:subId`, async (req: ModelRequest) => {
      await context.assertAllowed(req, `subs.${sub}.update`);

      const id = parsePathParam(req.params[context.options.idParam], context.options.idParam);
      const subId = parsePathParam(req.params.subId, 'subId');
      const data = parseBodyWithSchema(
        subMutationBodySchema,
        req.body,
        context.getRequestSchema('requestSchemas.subUpdate'),
      );
      const svc = context.getPublicService(req);
      const result = await svc.updateSub(id, sub, subId, data);

      handleResultError(result);
      return result.data;
    });

    context.router.post(`/:${context.options.idParam}/${sub}`, async (req: ModelRequest) => {
      await context.assertAllowed(req, `subs.${sub}.create`);

      const id = parsePathParam(req.params[context.options.idParam], context.options.idParam);
      const data = parseBodyWithSchema(
        subMutationBodySchema,
        req.body,
        context.getRequestSchema('requestSchemas.subCreate'),
      );
      const svc = context.getPublicService(req);
      const result = await svc.createSub(id, sub, data);

      handleResultError(result);

      return new success.Created(result.data);
    });

    context.router.delete(`/:${context.options.idParam}/${sub}/:subId`, async (req: ModelRequest) => {
      await context.assertAllowed(req, `subs.${sub}.delete`);

      const id = parsePathParam(req.params[context.options.idParam], context.options.idParam);
      const subId = parsePathParam(req.params.subId, 'subId');
      const svc = context.getPublicService(req);
      const result = await svc.deleteSub(id, sub, subId);

      handleResultError(result);
      return result.data;
    });
  }
}
