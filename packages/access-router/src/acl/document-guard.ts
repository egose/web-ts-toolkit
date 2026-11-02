/** Private fresh-read condition consumer. No token, DTO metadata recovery or second query. */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PublicService } from '../services/public-service';
import type { ErrorResult } from '../interfaces';
import type { ServiceExecutionContext } from './service-execution';
import type { AuthorizationBinding } from './service-authorization';
import { getAuthorizationPermissions } from './service-authorization';
import { readDocumentStage, type DocumentStage } from './document-stage';
import { createValidator } from '../helpers';

interface GuardRead {
  receiver: object;
  condition: string | string[];
  bound: boolean;
  decision?: boolean;
}
const reads = new AsyncLocalStorage<GuardRead>();
const executions = new WeakMap<ServiceExecutionContext, GuardRead>();

export function bindReadGuardExecution(receiver: object, execution: ServiceExecutionContext): void {
  const record = reads.getStore();
  if (!record || record.receiver !== receiver || record.bound) return;
  record.bound = true;
  executions.set(execution, record);
}

export function inheritReadGuardExecution(
  receiver: object,
  parent: ServiceExecutionContext,
  child: ServiceExecutionContext,
): void {
  const record = executions.get(parent);
  if (record?.receiver === receiver) executions.set(child, record);
}

export async function consumeReadGuardStage(
  receiver: object,
  execution: ServiceExecutionContext,
  stage: DocumentStage,
  binding: AuthorizationBinding,
): Promise<void> {
  const record = executions.get(execution);
  if (!record || record.receiver !== receiver) return;
  const { authorization, grants } = readDocumentStage(stage, binding);
  const permissions = getAuthorizationPermissions(authorization, binding);
  const { stringHandler, arrayHandler } = createValidator((key) => permissions.has(key) || grants[key] === true);
  record.decision =
    typeof record.condition === 'string' ? stringHandler(record.condition) : arrayHandler(record.condition);
  readDocumentStage(stage, binding);
}

export async function evaluateDocumentGuard(
  service: PublicService,
  id: string,
  condition: string | string[],
): Promise<boolean | ErrorResult> {
  const record: GuardRead = {
    receiver: service,
    condition: Array.isArray(condition) ? [...condition] : condition,
    bound: false,
    decision: undefined,
  };
  const result = await reads.run(record, () =>
    service._read(id, undefined, { includePermissions: false, includeFieldPermissions: false }),
  );
  if (result.kind === 'error') return result;
  return record.bound && record.decision === true;
}
