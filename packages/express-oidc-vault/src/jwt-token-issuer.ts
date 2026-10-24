import { createPrivateKey, createSecretKey, KeyObject } from 'node:crypto';
import { types } from 'node:util';

import { SignJWT } from 'jose';

import { snapshotJkt } from './access-token-confirmation';
import type {
  IssueTokenInput,
  OidcVaultJwtAccessTokenIssuerOptions,
  OidcVaultJwtSigningAlgorithm,
  OidcVaultTokenIssuer,
  OidcVaultTokenIssueResult,
} from './types';
import { isRecord } from './utils';

const ALGORITHMS = new Set<string>([
  'HS256',
  'HS384',
  'HS512',
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
]);
const RESERVED = ['iss', 'aud', 'iat', 'exp', 'sub', 'cnf'] as const;
const CURVES: Readonly<Record<string, string>> = { ES256: 'prime256v1', ES384: 'secp384r1', ES512: 'secp521r1' };
const requireString = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${name} must be a nonblank string.`);
  return value;
};

/** Normalize mutable key material once, and fail configuration before any vault operation. */
const signingKey = (
  configured: OidcVaultJwtAccessTokenIssuerOptions['key'],
  algorithm: OidcVaultJwtSigningAlgorithm,
): KeyObject | CryptoKey => {
  const symmetric = algorithm.startsWith('HS');
  let key: KeyObject;
  let cryptoKey: CryptoKey | undefined;
  if (configured instanceof Uint8Array) {
    key = createSecretKey(Uint8Array.from(configured));
  } else if (configured instanceof KeyObject) {
    key = configured;
  } else if (types.isCryptoKey(configured)) {
    cryptoKey = configured;
    const expectedName = symmetric
      ? 'HMAC'
      : algorithm.startsWith('RS')
        ? 'RSASSA-PKCS1-v1_5'
        : algorithm.startsWith('PS')
          ? 'RSA-PSS'
          : algorithm.startsWith('ES')
            ? 'ECDSA'
            : 'Ed25519';
    const parameters = configured.algorithm as KeyAlgorithm & { hash?: KeyAlgorithm };
    if (
      !configured.usages.includes('sign') ||
      parameters.name !== expectedName ||
      ((symmetric || algorithm.startsWith('RS') || algorithm.startsWith('PS')) &&
        parameters.hash?.name !== `SHA-${algorithm.slice(2)}`)
    )
      throw new TypeError('JWT signing CryptoKey algorithm/hash/usages must match the signing algorithm.');
    key = KeyObject.from(configured);
  } else {
    if (!isRecord(configured)) throw new TypeError('JWT signing key must be a JOSE key.');
    const jwk = { ...configured, ...(configured.key_ops ? { key_ops: [...configured.key_ops] } : {}) };
    if (
      (jwk.alg !== undefined && jwk.alg !== algorithm) ||
      (jwk.use !== undefined && jwk.use !== 'sig') ||
      (jwk.key_ops !== undefined && (!Array.isArray(jwk.key_ops) || !jwk.key_ops.includes('sign')))
    )
      throw new TypeError('JWT signing JWK alg/use/key_ops must permit the signing algorithm.');
    if (jwk.kty === 'oct') {
      if (
        typeof jwk.k !== 'string' ||
        !/^[A-Za-z0-9_-]+$/.test(jwk.k) ||
        Buffer.from(jwk.k, 'base64url').toString('base64url') !== jwk.k
      )
        throw new TypeError('JWT signing JWK k must be canonical base64url secret bytes.');
      key = createSecretKey(Buffer.from(jwk.k, 'base64url'));
    } else {
      key = createPrivateKey({ key: jwk, format: 'jwk' });
    }
  }
  const bits = Number(algorithm.slice(2));
  const curve = CURVES[algorithm];
  const compatible = symmetric
    ? key.type === 'secret' && key.symmetricKeySize! * 8 >= bits
    : key.type === 'private' &&
      (curve
        ? key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === curve
        : algorithm === 'EdDSA'
          ? key.asymmetricKeyType === 'ed25519'
          : key.asymmetricKeyType === 'rsa' && (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048);
  if (!compatible) throw new TypeError('JWT signing key type/size/curve must match the signing algorithm.');
  return cryptoKey ?? key;
};

const tokenTimes = (now: () => number, lifetimeSeconds: number) => {
  const milliseconds = now();
  const lifetimeMs = lifetimeSeconds * 1000;
  const iat = Math.floor(milliseconds / 1000);
  const exp = iat + lifetimeSeconds;
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 0 ||
    !Number.isSafeInteger(lifetimeMs) ||
    !Number.isSafeInteger(milliseconds + lifetimeMs) ||
    !Number.isSafeInteger(exp) ||
    !Number.isSafeInteger(exp * 1000)
  )
    throw new TypeError('JWT clock/lifetime must produce safe nonnegative integer milliseconds and expiry.');
  return { iat, exp };
};

function assertApplicationClaims(claims: unknown): asserts claims is Record<string, unknown> {
  if (!isRecord(claims) || Array.isArray(claims)) throw new TypeError('JWT mapClaims must return a claims object.');
  for (const field of RESERVED) {
    if (field in claims) throw new TypeError(`JWT mapClaims must not supply reserved claim ${field}.`);
  }
}

/** Local signing only. The vault retains output checks/rollback; APIs independently authenticate the result. */
export function createOidcVaultJwtAccessTokenIssuer(
  options: OidcVaultJwtAccessTokenIssuerOptions,
): OidcVaultTokenIssuer {
  const {
    algorithm,
    issuer: configuredIssuer,
    audience: configuredAudience,
    lifetimeSeconds = 300,
    now = Date.now,
    mapSubject,
    mapClaims,
  } = options;
  if (!ALGORITHMS.has(algorithm)) throw new TypeError('JWT signing algorithm is unsupported.');
  const issuer = requireString(configuredIssuer, 'JWT issuer');
  const audience = Array.isArray(configuredAudience) ? [...configuredAudience] : configuredAudience;
  if (Array.isArray(audience)) {
    if (audience.length === 0) throw new TypeError('JWT audience must not be empty.');
    for (const value of audience) requireString(value, 'JWT audience');
  } else requireString(audience, 'JWT audience');
  if (!Number.isSafeInteger(lifetimeSeconds) || lifetimeSeconds < 0)
    throw new TypeError('JWT lifetimeSeconds must be a nonnegative safe integer.');
  if (
    typeof now !== 'function' ||
    (mapSubject !== undefined && typeof mapSubject !== 'function') ||
    (mapClaims !== undefined && typeof mapClaims !== 'function')
  )
    throw new TypeError('JWT clock and mappers must be functions.');
  const key = signingKey(options.key, algorithm);
  tokenTimes(now, lifetimeSeconds);
  return Object.freeze({
    async issue(input: IssueTokenInput): Promise<OidcVaultTokenIssueResult> {
      // Capture authority before any application callback/await. In particular,
      // session.deviceBinding/profile never grants signing binding authority.
      const { deviceBinding, session } = input;
      const { subject: defaultSubject, scope } = session;
      if (scope !== undefined && typeof scope !== 'string') throw new TypeError('JWT session scope must be a string.');
      if (deviceBinding !== undefined && deviceBinding.type !== 'dpop')
        throw new TypeError('JWT deviceBinding must be verified DPoP context.');
      const cnf =
        deviceBinding === undefined
          ? undefined
          : snapshotJkt({ jkt: deviceBinding.jkt }, (message) => new TypeError(message));
      const subject = requireString(mapSubject ? await mapSubject(input) : defaultSubject, 'JWT subject');
      const mapped = mapClaims ? await mapClaims(input) : {};
      assertApplicationClaims(mapped);
      // Materialize application JSON before attaching security fields: toJSON,
      // nested serializers/getters and later mutations cannot replace authority.
      const claims: unknown = JSON.parse(JSON.stringify({ ...(scope === undefined ? {} : { scope }), ...mapped }));
      assertApplicationClaims(claims);
      const { iat, exp } = tokenTimes(now, lifetimeSeconds);
      const accessToken = await new SignJWT({
        ...claims,
        iss: issuer,
        aud: audience,
        sub: subject,
        iat,
        exp,
        ...(cnf === undefined ? {} : { cnf }),
      })
        .setProtectedHeader({ alg: algorithm, typ: 'JWT' })
        .sign(key);
      return { accessToken, expiresIn: lifetimeSeconds, tokenType: cnf === undefined ? 'Bearer' : 'DPoP' };
    },
  });
}
