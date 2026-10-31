/** Private capture brand. Frozen containers alone are not evidence of package ownership. */
import type { AuthorizationConfiguration } from './service-authorization';
import { copyAuthorizationValue } from './authorization-snapshot';

const captures = new WeakSet<AuthorizationConfiguration>();

export function captureAuthorizationConfiguration(value: AuthorizationConfiguration): AuthorizationConfiguration {
  const capture = copyAuthorizationValue(value, true);
  captures.add(capture);
  return capture;
}

/** Used only after authenticating an active query origin/edge, never by raw helpers. */
export function ownedAuthorizationConfiguration(value: AuthorizationConfiguration): AuthorizationConfiguration {
  return captures.has(value) ? value : captureAuthorizationConfiguration(value);
}
