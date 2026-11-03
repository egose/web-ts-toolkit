/** Private fresh-read condition consumer. No token, DTO metadata recovery or second query. */
import { types } from 'node:util';
import type { PublicService } from '../services/public-service';
import type { ErrorResult } from '../interfaces';
import type { AuthorizationBinding } from './service-authorization';
import { getAuthorizationPermissions } from './service-authorization';
import { closeDocumentStage, readDocumentStage, type DocumentStage } from './document-stage';
import { authorizationError, ServiceAuthorizationError } from './authorization-snapshot';
import { createTrustedOutputBudget, visitTrustedOutput } from './trusted-output-materialization';
import { createValidator } from '../helpers';

export type DocumentCondition = string | readonly DocumentCondition[];
type ConditionReader = (id: string, condition: DocumentCondition) => Promise<boolean | ErrorResult>;
const readers = new WeakMap<object, ConditionReader>();

/** Only real PublicService construction registers a lexical, fixed-purpose reader. */
export function registerDocumentConditionReader<T, V extends object>(
  receiver: PublicService<T, V>,
  reader: ConditionReader,
): void {
  if (readers.has(receiver)) authorizationError('condition reader already registered');
  readers.set(receiver, reader);
}

export function assertDocumentConditionReceiver(receiver: object): void {
  if (!readers.has(receiver)) authorizationError('unregistered condition receiver');
}

function captureCondition(input: unknown): DocumentCondition {
  const budget = createTrustedOutputBudget();
  const active = new Set<object>();
  const copy = (value: unknown, depth: number): DocumentCondition => {
    visitTrustedOutput(budget, depth);
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object' || types.isProxy(value) || !Array.isArray(value))
      authorizationError('document condition must contain only strings and arrays');
    if (Object.getPrototypeOf(value) !== Array.prototype || active.has(value))
      authorizationError('unsupported document condition array');
    const length = Object.getOwnPropertyDescriptor(value, 'length')!.value as number;
    if (length > 19999) authorizationError('document condition exceeds structural limits');
    if (Reflect.ownKeys(value).length !== length + 1) authorizationError('invalid document condition array keys');
    active.add(value);
    const result: DocumentCondition[] = [];
    for (let index = 0; index < length; index++) {
      const slot = Object.getOwnPropertyDescriptor(value, String(index));
      if (!slot || !('value' in slot) || !slot.enumerable) authorizationError('invalid document condition entry');
      Object.defineProperty(result, index, { value: copy(slot.value, depth + 1), enumerable: true });
    }
    active.delete(value);
    return Object.freeze(result);
  };
  return copy(input, 0);
}

/** A ready stage can terminate without entering output construction. Never exposes its facts/source. */
export function consumeDocumentCondition(
  condition: DocumentCondition,
  stage: DocumentStage,
  binding: AuthorizationBinding,
): boolean {
  try {
    const { authorization, grants } = readDocumentStage(stage, binding);
    const permissions = getAuthorizationPermissions(authorization, binding);
    const { stringHandler, arrayHandler } = createValidator((key) => permissions.has(key) || grants[key] === true);
    const decision = typeof condition === 'string' ? stringHandler(condition) : arrayHandler(condition as string[]);
    readDocumentStage(stage, binding);
    return decision;
  } finally {
    closeDocumentStage(stage);
  }
}

export async function evaluateDocumentGuard<T, V extends object>(
  service: PublicService<T, V>,
  id: string,
  condition: string | string[],
): Promise<boolean | ErrorResult> {
  const reader = readers.get(service);
  if (!reader) return false;
  try {
    return await reader(id, captureCondition(condition));
  } catch (error) {
    if (error instanceof ServiceAuthorizationError) return error.result;
    throw error;
  }
}
