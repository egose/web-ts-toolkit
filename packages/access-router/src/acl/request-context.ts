import type { AccessRouterBaseRequest, Validation } from '../interfaces';
import Permission from '../permission';
import { evaluateRouteGuard, getRequestPermissions, setRequestPermissions } from '../core-shared';
import { PERMISSIONS, PERMISSION_KEYS } from '../symbols';

export function getGlobalPermissions(req: AccessRouterBaseRequest) {
  return req[PERMISSIONS] as Permission;
}

export function getResolvedRequestPermissions(req: AccessRouterBaseRequest) {
  return getRequestPermissions(req);
}

export async function setResolvedRequestPermissions(req: AccessRouterBaseRequest) {
  await setRequestPermissions(req);
}

export async function canActivateRequest(req: AccessRouterBaseRequest, routeGuard: Validation) {
  const permissions = getGlobalPermissions(req);
  return evaluateRouteGuard(req, permissions, routeGuard);
}

export async function initializeAclRequest<TCore>({
  req,
  flag,
  runtime,
  createCore,
  assignCore,
}: {
  req: AccessRouterBaseRequest;
  flag: symbol;
  runtime: unknown;
  createCore: (req: AccessRouterBaseRequest) => TCore & {
    setPermissions(): Promise<void>;
    getPermissions(): Permission;
  };
  assignCore: (core: TCore) => void;
}) {
  // Runtime-owned initialization: same-runtime repeats reuse the existing core
  // (and its base-filter cache) without rerunning resolvers. A different
  // runtime on the same request gets independent state instead of silently
  // reusing another runtime's core and credentials.
  if (req[flag] === runtime) {
    return null;
  }

  const core = createCore(req);
  await core.setPermissions();

  assignCore(core);
  req[PERMISSIONS] = core.getPermissions();
  req[PERMISSION_KEYS] = [...req[PERMISSIONS].keys];
  req[flag] = runtime;

  return core;
}
