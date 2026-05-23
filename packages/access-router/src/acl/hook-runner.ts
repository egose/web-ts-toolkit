import { callHookChain } from '../core-shared';
import type {
  AccessRouterBaseRequest,
  DataHookContext,
  DecorateAccess,
  DecorateAllAccess,
  ModelHookContext,
} from '../interfaces';
import type { Permissions } from '../permission';

export async function runDecorateHook<TDoc>({
  req,
  hook,
  doc,
  permissions,
  context,
}: {
  req: AccessRouterBaseRequest;
  hook: Function | Function[];
  doc: TDoc;
  permissions: Permissions;
  context: ModelHookContext | DataHookContext;
}) {
  return callHookChain(req, hook, doc, permissions, context);
}

export async function runDecorateAllHook<TDoc>({
  req,
  hook,
  docs,
  permissions,
  context,
}: {
  req: AccessRouterBaseRequest;
  hook: Function | Function[];
  docs: TDoc[];
  permissions: Permissions;
  context: ModelHookContext | DataHookContext;
}) {
  return callHookChain(req, hook, docs, permissions, context);
}
