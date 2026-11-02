/** Fresh named helper policy admission. No document/DTO capability overload. */
import { assertNoServerModelControls } from '../validation/public-admission';
import { authorizationError, authorizationRecord, copyAuthorizationValue } from './authorization-snapshot';
import {
  assertAuthorizationKeys,
  resolveServiceAuthorization,
  type AuthorizationBinding,
  type AuthorizationConfiguration,
  type ResolveServiceAuthorizationInput,
} from './service-authorization';

export function normalizeOutputAuthorizationOptions(
  input: Omit<ResolveServiceAuthorizationInput, 'authorization' | 'applicability' | 'binding' | 'configuration'> & {
    binding: Omit<AuthorizationBinding, 'scopePath'>;
    configuration: AuthorizationConfiguration | (() => AuthorizationConfiguration);
  },
  options: unknown,
  purpose?: 'output',
) {
  assertNoServerModelControls(options, authorizationError);
  const value = authorizationRecord(options, 'output options');
  if ('documentAuthorization' in value)
    authorizationError('documentAuthorization was removed; use fresh output policy or a normal service query');
  for (const key of Reflect.ownKeys(value)) {
    const slot = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !('value' in slot) || !slot.enumerable)
      authorizationError('invalid output option property');
  }
  assertAuthorizationKeys(value, ['authorization', 'scopePath', ...(purpose ? ['purpose'] : [])], 'output options');
  if (purpose && value.purpose !== purpose) authorizationError('genAllowedFields requires purpose: output');
  if (value.scopePath !== undefined && !Array.isArray(value.scopePath))
    authorizationError('scopePath must be an array');
  return Object.freeze({
    authorization: resolveServiceAuthorization({
      ...input,
      configuration: typeof input.configuration === 'function' ? input.configuration() : input.configuration,
      binding: {
        ...input.binding,
        scopePath: copyAuthorizationValue(value.scopePath) as readonly string[] | undefined,
      },
      authorization: value.authorization,
      applicability: 'output',
    }),
  });
}
