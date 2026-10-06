import type {
  PairedRouteAccess,
  RouteGuardAccess,
  RouteVariant,
  RouteVariantAccess,
  Validation,
} from './interfaces/access';

/** Server-owned route keys. This is also the reserved-identifier source for data-policy boundaries. */
export const OPERATION_ACCESS_VARIANTS = {
  list: { basic: 'basicList', advanced: 'advancedList' },
  read: { basic: 'basicRead', advanced: 'advancedRead' },
  create: { basic: 'basicCreate', advanced: 'advancedCreate' },
  update: { basic: 'basicUpdate', advanced: 'advancedUpdate' },
  upsert: { basic: 'basicUpsert', advanced: 'advancedUpsert' },
  count: { basic: 'basicCount', advanced: 'advancedCount' },
  distinct: { basic: 'basicDistinct', advanced: 'advancedDistinct' },
} as const satisfies { [TAccess in PairedRouteAccess]: Record<RouteVariant, RouteVariantAccess<TAccess>> };

const reservedVariantAccesses = new Set<string>(
  Object.values(OPERATION_ACCESS_VARIANTS).flatMap(({ basic, advanced }) => [basic, advanced]),
);

/** Exact route-only identifiers; trusted custom access strings are not reinterpreted. */
export const isRouteVariantAccess = (access: unknown): access is RouteVariantAccess =>
  typeof access === 'string' && reservedVariantAccesses.has(access);

const isPairedRouteAccess = (access: string): access is PairedRouteAccess =>
  Object.hasOwn(OPERATION_ACCESS_VARIANTS, access);

type RouteOperationAccessOptions = {
  baseAccess: RouteGuardAccess | string;
  variant: RouteVariant;
  getExactOption(key: string): unknown;
  isAllowedBase(access: string): Promise<boolean>;
  canActivate(guard: Validation): Promise<boolean>;
  subdocuments?: boolean;
};

/**
 * Select one live route guard, or delegate to the core's existing base resolution.
 * Exact getters keep their owning runtime's model-default/data semantics. Only
 * undefined inherits; other values go through canActivate, including invalid
 * defined values/closed field objects that the existing evaluator denies.
 */
export async function resolveRouteOperationAccess({
  baseAccess,
  variant,
  getExactOption,
  isAllowedBase,
  canActivate,
  subdocuments = false,
}: RouteOperationAccessOptions): Promise<boolean> {
  let access = baseAccess;

  if (subdocuments) {
    const keys = access.split('.');
    const operation = keys[2];
    // Only supported field list/read paths participate. Longer/custom accesses
    // retain ordinary core behavior; neither .default nor subs umbrellas are new fallbacks.
    if (keys.length === 3 && keys[0] === 'subs' && keys[1] !== '' && (operation === 'list' || operation === 'read')) {
      const field = keys[1];
      const fieldKey = `operationAccess.subs.${field}`;
      const variantGuard = getExactOption(`${fieldKey}.${OPERATION_ACCESS_VARIANTS[operation][variant]}`);
      if (variantGuard !== undefined) return canActivate(variantGuard as Validation);

      const baseGuard = getExactOption(`${fieldKey}.${operation}`);
      if (baseGuard !== undefined) return canActivate(baseGuard as Validation);

      const fieldGuard = getExactOption(fieldKey);
      if (fieldGuard !== undefined) return canActivate(fieldGuard as Validation);

      // General route rules apply only to an absent field. Base resolution below
      // uses the top-level operation, matching the legacy subdocument fallback.
      access = operation;
    }
  }

  if (!isPairedRouteAccess(access)) return isAllowedBase(access);

  const variantGuard = getExactOption(`operationAccess.${OPERATION_ACCESS_VARIANTS[access][variant]}`);
  if (variantGuard !== undefined) return canActivate(variantGuard as Validation);

  return isAllowedBase(access);
}
