import type { OidcVaultConfig } from './types';

export const DEFAULT_OIDC_SCOPES = 'openid email profile';

export type OidcVaultConfigMode = 'issuer' | 'manual';

export interface OidcVaultResolvedConfig extends Omit<OidcVaultConfig, 'scopes'> {
  mode: OidcVaultConfigMode;
  scopes: string;
}

export interface OidcVaultEnv {
  OIDC_ISSUER?: string;
  OIDC_AUTHORIZATION_ENDPOINT?: string;
  OIDC_TOKEN_ENDPOINT?: string;
  OIDC_USERINFO_ENDPOINT?: string;
  OIDC_JWKS_URI?: string;
  OIDC_END_SESSION_ENDPOINT?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_SCOPES?: string;
}

const MANUAL_CONFIG_REQUIREMENTS: Array<
  keyof Pick<OidcVaultConfig, 'issuer' | 'authorizationEndpoint' | 'tokenEndpoint' | 'jwksUri'>
> = ['issuer', 'authorizationEndpoint', 'tokenEndpoint', 'jwksUri'];

const normalizeOptionalString = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeHttpUrl = (value: string | undefined, optionName: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${optionName} must be an absolute HTTP(S) URL.`);
  }

  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin === 'null') {
    throw new Error(`${optionName} must use http or https.`);
  }

  return url.toString();
};

const withOptionalValue = <Key extends keyof OidcVaultResolvedConfig>(
  target: Partial<OidcVaultResolvedConfig>,
  key: Key,
  value: OidcVaultResolvedConfig[Key] | undefined,
): void => {
  if (value !== undefined) {
    target[key] = value;
  }
};

/**
 * Resolve OIDC configuration from application input. If an issuer URL is
 * present, explicit endpoint fields are ignored and discovery mode wins.
 */
export function resolveOidcVaultConfig(config: OidcVaultConfig = {}): OidcVaultResolvedConfig {
  const issuer = normalizeHttpUrl(normalizeOptionalString(config.issuer), 'config.issuer');
  const clientId = normalizeOptionalString(config.clientId);
  const clientSecret = normalizeOptionalString(config.clientSecret);
  const scopes = normalizeOptionalString(config.scopes) ?? DEFAULT_OIDC_SCOPES;
  const hasManualEndpoints = MANUAL_CONFIG_REQUIREMENTS.some(
    (key) => key !== 'issuer' && normalizeOptionalString(config[key]),
  );

  if (!clientId) {
    throw new Error('OIDC clientId is required.');
  }

  if (issuer && !hasManualEndpoints) {
    const resolved: Partial<OidcVaultResolvedConfig> = {
      mode: 'issuer',
      issuer,
      scopes,
    };

    withOptionalValue(resolved, 'clientId', clientId);
    withOptionalValue(resolved, 'clientSecret', clientSecret);

    return resolved as OidcVaultResolvedConfig;
  }

  const resolved: Partial<OidcVaultResolvedConfig> = {
    mode: 'manual',
    scopes,
  };

  withOptionalValue(resolved, 'issuer', issuer);
  withOptionalValue(
    resolved,
    'authorizationEndpoint',
    normalizeHttpUrl(normalizeOptionalString(config.authorizationEndpoint), 'config.authorizationEndpoint'),
  );
  withOptionalValue(
    resolved,
    'tokenEndpoint',
    normalizeHttpUrl(normalizeOptionalString(config.tokenEndpoint), 'config.tokenEndpoint'),
  );
  withOptionalValue(
    resolved,
    'userInfoEndpoint',
    normalizeHttpUrl(normalizeOptionalString(config.userInfoEndpoint), 'config.userInfoEndpoint'),
  );
  withOptionalValue(resolved, 'jwksUri', normalizeHttpUrl(normalizeOptionalString(config.jwksUri), 'config.jwksUri'));
  withOptionalValue(
    resolved,
    'endSessionEndpoint',
    normalizeHttpUrl(normalizeOptionalString(config.endSessionEndpoint), 'config.endSessionEndpoint'),
  );
  withOptionalValue(resolved, 'clientId', clientId);
  withOptionalValue(resolved, 'clientSecret', clientSecret);

  const missing = MANUAL_CONFIG_REQUIREMENTS.filter((key) => !resolved[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required OIDC configuration for manual mode: ${missing.join(', ')}`);
  }

  return resolved as OidcVaultResolvedConfig;
}

/**
 * Resolve OIDC configuration from the documented environment variables.
 */
export function resolveOidcVaultConfigFromEnv(env: OidcVaultEnv = process.env): OidcVaultResolvedConfig {
  return resolveOidcVaultConfig({
    issuer: env.OIDC_ISSUER,
    authorizationEndpoint: env.OIDC_AUTHORIZATION_ENDPOINT,
    tokenEndpoint: env.OIDC_TOKEN_ENDPOINT,
    userInfoEndpoint: env.OIDC_USERINFO_ENDPOINT,
    jwksUri: env.OIDC_JWKS_URI,
    endSessionEndpoint: env.OIDC_END_SESSION_ENDPOINT,
    clientId: env.OIDC_CLIENT_ID,
    clientSecret: env.OIDC_CLIENT_SECRET,
    scopes: env.OIDC_SCOPES,
  });
}
