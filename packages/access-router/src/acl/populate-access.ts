import JsonRouter from '@web-ts-toolkit/express-json-router';
import { Codes } from '../enums';
import type { ErrorResult } from '../interfaces';
import { isRouteVariantAccess } from '../operation-access';

/** Controlled Core error, also carried as an ErrorResult by service entrypoints. */
export class PopulateAccessError extends JsonRouter.clientErrors.BadRequestError {
  readonly result: ErrorResult<{ detail: string }>;

  constructor(access: string) {
    const errors = [{ detail: `Route-only access ${access} cannot be used for populate` }];
    super('Bad Request', { errors });
    this.result = { success: false, kind: 'error', code: Codes.BadRequest, errors };
  }
}

/** Trusted custom data-policy accesses retain their behavior except reserved route identifiers. */
export function assertPopulateAccess(access: unknown): void {
  if (isRouteVariantAccess(access)) throw new PopulateAccessError(access);
}
