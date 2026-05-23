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
  createCore,
  assignCore,
}: {
  req: AccessRouterBaseRequest;
  flag: symbol;
  createCore: (req: AccessRouterBaseRequest) => TCore & {
    setPermissions(): Promise<void>;
    getPermissions(): Permission;
  };
  assignCore: (core: TCore) => void;
}) {
  if (req[flag]) {
    return null;
  }

  const core = createCore(req);
  await core.setPermissions();

  assignCore(core);
  req[PERMISSIONS] = core.getPermissions();
  req[PERMISSION_KEYS] = req[PERMISSIONS].keys;
  req[flag] = true;

  return core;
}
