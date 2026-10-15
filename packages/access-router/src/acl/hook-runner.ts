import { callHookChain } from '../core-shared';
import type {
  AccessRouterBaseRequest,
  DataHookContext,
  DecorateAccess,
  DecorateAllAccess,
  ModelHookContext,
} from '../interfaces';
import type { Permissions } from '../permission';
import type { AccessRuntime } from '../runtime';
import { getRequestWorkState } from '../helpers/request-work';
import type { SharedHookGate } from '../helpers/concurrency';

export async function runDecorateHook<TDoc>({
  req,
  runtime,
  hook,
  doc,
  permissions,
  context,
}: {
  req: AccessRouterBaseRequest;
  runtime: AccessRuntime;
  hook: Function | Function[];
  doc: TDoc;
  permissions: Permissions;
  context: ModelHookContext | DataHookContext;
}) {
  return getRequestWorkState(req, runtime).hookGate.run(() => callHookChain(req, hook, doc, permissions, context));
}

export async function runDecorateAllHook<TDoc>({
  req,
  runtime,
  hook,
  docs,
  permissions,
  context,
}: {
  req: AccessRouterBaseRequest;
  runtime: AccessRuntime;
  hook: Function | Function[];
  docs: TDoc[];
  permissions: Permissions;
  context: ModelHookContext | DataHookContext;
}) {
  return getRequestWorkState(req, runtime).hookGate.run(() => callHookChain(req, hook, docs, permissions, context));
}

export interface VirtualGetterLogMeta {
  modelName: string;
  scope: string;
  field: string;
  virtualAccess: string;
  outputAccess: string;
  operation?: string;
}

/**
 * Invoke a single virtual getter with VIRT-00A calling convention
 * (`this` = request, `(view, permissions, context)`).
 * Failures are fail-closed: this helper logs with allowlisted structural
 * metadata only (model/scope/field/access/operation + fixed category) and
 * returns `{ ok: false }` so the caller omits the field. Getter input, return
 * values, free-form exception messages/stacks, and raw dependencies are never
 * logged (an error message may contain secret values).
 */
export async function runVirtualGetter({
  req,
  gate,
  getter,
  view,
  permissions,
  context,
  logMeta,
}: {
  req: AccessRouterBaseRequest;
  gate: SharedHookGate;
  getter: Function;
  view: unknown;
  permissions: Permissions;
  context: unknown;
  logMeta: VirtualGetterLogMeta;
}): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    const value = await gate.run(() => (getter as Function).call(req, view, permissions, context));
    return { ok: true, value };
  } catch {
    try {
      const { warn } = await import('../logger-helpers');
      warn('virtual getter failed; omitting field', {
        modelName: logMeta.modelName,
        scope: logMeta.scope,
        field: logMeta.field,
        virtualAccess: logMeta.virtualAccess,
        outputAccess: logMeta.outputAccess,
        operation: logMeta.operation ?? '',
        category: 'virtualGetterFailed',
      });
    } catch {
      // Logging must never break finalization.
    }
    return { ok: false };
  }
}
