import type { RequestHandler } from 'express';

import { invalidAccessToken, snapshotAccessTokenConfirmation } from './access-token-confirmation';
import { resolveDeviceBindingOptions, resolveDeviceBindingOrigin } from './device-binding-policy';
import { extractDpopProof, readDpopRawHeader, verifyDpopProof } from './dpop-proof';
import {
  createDpopReplayPolicy,
  toDpopNonceChallengeResponse,
  toDpopReplayErrorResponse,
  type DpopPolicyResponse,
} from './dpop-replay';
import { createDpopRequestTargetResolver } from './dpop-target';
import { OidcVaultHttpError } from './errors';
import type {
  OidcVaultAccessTokenMiddlewareErrorContext,
  OidcVaultAccessTokenMiddlewareOptions,
  OidcVaultAuthContext,
  OidcVaultAuthenticatedRequest,
  OidcVaultAccessTokenValidationResult,
  OidcVaultAccessTokenConfirmation,
  OidcVaultVerifiedDpopBinding,
} from './types';

export const extractBearerToken = (authorizationHeader: string | undefined): string => {
  if (!authorizationHeader) {
    throw new OidcVaultHttpError(401, 'OIDC_VAULT_MISSING_BEARER_TOKEN', 'Missing bearer token.');
  }

  const [scheme, token, extra] = authorizationHeader.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== 'bearer' || !token || extra) {
    throw new OidcVaultHttpError(
      401,
      'OIDC_VAULT_INVALID_AUTHORIZATION_HEADER',
      'Authorization header must use the Bearer scheme.',
    );
  }

  return token;
};

const notifyMiddlewareError = async (
  onError: OidcVaultAccessTokenMiddlewareOptions['onError'],
  context: OidcVaultAccessTokenMiddlewareErrorContext,
): Promise<void> => {
  try {
    await onError?.(context);
  } catch {
    // Preserve the original private diagnostic and sanitized response.
  }
};

const schemeOf = (value: string | undefined): 'Bearer' | 'DPoP' | undefined => {
  const scheme = value?.trim().split(/\s+/, 1)[0]?.toLowerCase();
  return scheme === 'bearer' ? 'Bearer' : scheme === 'dpop' ? 'DPoP' : undefined;
};

const mappedFields = (result: OidcVaultAccessTokenValidationResult): OidcVaultAccessTokenValidationResult => {
  if (typeof result !== 'object' || result === null || Array.isArray(result))
    throw invalidAccessToken('Access token validator result is invalid.');
  const { subject, sessionId, scope, claims } = result;
  if (typeof subject !== 'string' || subject.length === 0)
    throw invalidAccessToken('Access token validator result is missing subject.');
  return { subject, sessionId, scope, claims };
};

/**
 * API authentication from package-root named imports. With deviceBinding
 * enabled, requires validateWithRequest at construction for BOTH schemes and
 * verifies a single raw DPoP proof, pinned method/URL, original confirmation,
 * API ath, nonce and shared replay BEFORE attaching req.auth or invoking hooks.
 * Bound tokens require Authorization: DPoP; unbound DPoP presentation is invalid.
 * Omitted binding retains exactly validate(token) for legacy Bearer adapters,
 * but refuses any known bound credential. Construction snapshots configuration,
 * callbacks/validator methods, URLs, algorithms and secret bytes; the replay
 * store remains the shared atomic service. Responses carry no-store and fixed
 * errors; onError privately observes originals and cannot override failures.
 * The independent OIDC_VAULT_DPOP_IGNORE_TARGET_FAILURE,
 * OIDC_VAULT_DPOP_IGNORE_FRESHNESS_FAILURE and OIDC_VAULT_DPOP_IGNORE_REPLAY_FAILURE
 * environment defaults are captured at construction; ignored failures log to
 * console.warn. Explicit deviceBinding booleans override those defaults.
 */
export function createOidcVaultAccessTokenMiddleware(options: OidcVaultAccessTokenMiddlewareOptions): RequestHandler {
  const { validator, deviceBinding: configuredBinding, onAuthContext, onError } = options;
  const policy = resolveDeviceBindingOptions(configuredBinding);
  const validate = validator.validate.bind(validator);
  const requestAware = policy ? validator.validateWithRequest : undefined;
  if (policy && typeof requestAware !== 'function')
    throw new TypeError('deviceBinding requires validator.validateWithRequest.');
  const validateWithRequest = requestAware?.bind(validator);
  const apiOptions = policy
    ? (() => {
        const { publicOrigin, publicPathPrefix, replayNamespace, replayStore, now } = configuredBinding!;
        return {
          publicOrigin: resolveDeviceBindingOrigin(publicOrigin, 'publicOrigin'),
          publicPathPrefix,
          replayNamespace,
          replayStore,
          now,
        };
      })()
    : undefined;
  const targetFor = apiOptions ? createDpopRequestTargetResolver(apiOptions) : undefined;
  const replay = policy
    ? createDpopReplayPolicy({
        protectionSpace: {
          type: 'api',
          publicOrigin: apiOptions!.publicOrigin,
          replayNamespace: apiOptions!.replayNamespace,
        },
        proofOptions: policy,
        replayStore: apiOptions!.replayStore,
        now: apiOptions!.now,
      })
    : undefined;
  const algorithms = policy?.algorithms ?? ['ES256'];
  const algs = algorithms.join(' ');
  const dpopChallenge = (error?: string): string => `DPoP${error ? ` error="${error}",` : ''} algs="${algs}"`;
  const proofChallenge = dpopChallenge('invalid_dpop_proof');

  return async (req, res, next) => {
    let token: string | undefined;
    let scheme: 'Bearer' | 'DPoP' | undefined;
    let nonceResponse: DpopPolicyResponse | undefined;
    const authenticatedRequest = req as OidcVaultAuthenticatedRequest;
    delete authenticatedRequest.auth;
    if (!res.headersSent) res.setHeader('Cache-Control', 'no-store');

    const prepareError = (error: unknown, hookFailure = false): DpopPolicyResponse => {
      const response =
        nonceResponse ??
        (error instanceof OidcVaultHttpError
          ? toDpopReplayErrorResponse(error, algorithms)
          : {
              status: hookFailure ? 500 : 401,
              body: hookFailure
                ? { code: 'OIDC_VAULT_AUTH_CONTEXT_FAILED', message: 'Auth context hook failed.' }
                : { code: 'OIDC_VAULT_INVALID_ACCESS_TOKEN', message: 'Access token validation failed.' },
              headers: { 'Cache-Control': 'no-store' },
            });
      const headers: Record<string, string> = { ...response.headers };
      if (response.status === 401 && headers['WWW-Authenticate'] === undefined) {
        const code = response.body.code;
        const challenge =
          code === 'OIDC_VAULT_DPOP_REQUIRED' || code === 'OIDC_VAULT_INVALID_DPOP_PROOF'
            ? proofChallenge
            : !policy
              ? 'Bearer'
              : code === 'OIDC_VAULT_MISSING_ACCESS_TOKEN'
                ? policy.mode === 'required'
                  ? dpopChallenge()
                  : `Bearer, ${dpopChallenge()}`
                : scheme === 'DPoP' || (!scheme && policy.mode === 'required')
                  ? dpopChallenge('invalid_token')
                  : 'Bearer error="invalid_token"';
        headers['WWW-Authenticate'] = challenge;
      }
      return Object.freeze({
        status: response.status,
        body: Object.freeze({ ...response.body }),
        headers: Object.freeze(headers),
      });
    };
    const sendError = (response: DpopPolicyResponse): void => {
      res.removeHeader('WWW-Authenticate');
      res.removeHeader('DPoP-Nonce');
      for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
      res.status(response.status).json(response.body);
    };

    try {
      let result: OidcVaultAccessTokenValidationResult;
      let confirmation: Readonly<OidcVaultAccessTokenConfirmation> | null | undefined;
      let deviceBinding: Readonly<OidcVaultVerifiedDpopBinding> | undefined;
      if (!policy) {
        token = extractBearerToken(req.get('authorization'));
        scheme = 'Bearer';
        result = await validate(token);
        delete authenticatedRequest.auth;
        const reported = result?.confirmation;
        confirmation = reported === undefined ? undefined : snapshotAccessTokenConfirmation(reported);
        result = mappedFields(result);
        delete authenticatedRequest.auth;
        if (confirmation)
          throw new OidcVaultHttpError(401, 'OIDC_VAULT_DPOP_REQUIRED', 'DPoP authentication is required.');
      } else {
        const authorization = readDpopRawHeader(req, 'authorization');
        scheme = schemeOf(authorization.value);
        if (authorization.count === 0 || (authorization.count === 1 && !authorization.value?.trim())) {
          throw new OidcVaultHttpError(401, 'OIDC_VAULT_MISSING_ACCESS_TOKEN', 'Missing access token.');
        }
        const credential = authorization.value?.trim().split(/\s+/);
        if (
          authorization.count !== 1 ||
          !scheme ||
          credential?.length !== 2 ||
          !credential[1] ||
          !/^[\x21-\x7e]+$/.test(credential[1]) ||
          credential[1].includes(',')
        ) {
          throw new OidcVaultHttpError(
            401,
            'OIDC_VAULT_INVALID_AUTHORIZATION_HEADER',
            'Authorization header must use one Bearer or DPoP credential.',
          );
        }
        token = credential[1];
        // Async trusted adapters receive the real request, but cannot rewrite
        // this request's already captured credential/target/proof authority.
        const proofHeader = readDpopRawHeader(req, 'dpop');
        const { method, originalUrl } = req;
        result = await validateWithRequest!(Object.freeze({ token, scheme, req }));
        delete authenticatedRequest.auth;
        confirmation = snapshotAccessTokenConfirmation(result?.confirmation);
        result = mappedFields(result);
        delete authenticatedRequest.auth;
        if (confirmation && scheme !== 'DPoP')
          throw new OidcVaultHttpError(401, 'OIDC_VAULT_DPOP_REQUIRED', 'DPoP authentication is required.');
        if (!confirmation && scheme === 'DPoP')
          throw invalidAccessToken('DPoP presentation of a verified unbound token is invalid.');
        if (!confirmation && policy.mode === 'required') {
          throw new OidcVaultHttpError(401, 'OIDC_VAULT_DEVICE_BINDING_REQUIRED', 'A device-bound login is required.');
        }
        const proof = extractDpopProof(proofHeader);
        if (!proof && confirmation)
          throw new OidcVaultHttpError(401, 'OIDC_VAULT_DPOP_REQUIRED', 'DPoP authentication is required.');
        if (proof) {
          const admission = await replay!.verifyAndReserve(() =>
            verifyDpopProof({
              proof,
              method,
              targetUrl: () => targetFor!(originalUrl),
              proofOptions: policy,
              accessToken: token!,
              expectedJkt: confirmation?.jkt,
            }),
          );
          if (admission.type === 'nonce-challenge') {
            nonceResponse = toDpopNonceChallengeResponse(admission, 'api', policy.algorithms);
            throw new OidcVaultHttpError(401, 'OIDC_VAULT_USE_DPOP_NONCE', 'A fresh DPoP nonce is required.');
          }
          if (confirmation) deviceBinding = admission.binding;
        }
      }
      const authenticatedToken = token;
      const auth: OidcVaultAuthContext = {
        ...result,
        token: authenticatedToken,
        ...(confirmation === undefined ? {} : { confirmation }),
        ...(deviceBinding ? { deviceBinding } : {}),
      };
      const restoreAuth = (): OidcVaultAuthContext => {
        // Hooks own mapped context fields, not the credential/proof authority.
        // Avoid even evaluating replacement security-property getters.
        const { subject, sessionId, scope, claims } = auth;
        return {
          subject,
          sessionId,
          scope,
          claims,
          token: authenticatedToken,
          ...(confirmation === undefined ? {} : { confirmation }),
          ...(deviceBinding ? { deviceBinding } : {}),
        };
      };
      authenticatedRequest.auth = auth;

      try {
        await onAuthContext?.({ req: authenticatedRequest, res, auth });
        authenticatedRequest.auth = restoreAuth();
      } catch (hookError) {
        const response = prepareError(hookError, true);
        delete authenticatedRequest.auth;
        let errorAuth: OidcVaultAuthContext;
        try {
          errorAuth = restoreAuth();
        } catch {
          // A hook may install throwing getters on mapping-owned fields too.
          // Observability must never replace its original veto with that error.
          errorAuth = {
            ...result,
            token: authenticatedToken,
            ...(confirmation === undefined ? {} : { confirmation }),
            ...(deviceBinding ? { deviceBinding } : {}),
          };
        }
        await notifyMiddlewareError(onError, { error: hookError, req, res, token, auth: errorAuth });
        delete authenticatedRequest.auth;
        if (res.headersSent) {
          next(hookError);
          return;
        }

        sendError(response);
        return;
      }
      if (!res.headersSent) res.setHeader('Cache-Control', 'no-store');
      next();
    } catch (error) {
      const response = prepareError(error);
      delete authenticatedRequest.auth;
      await notifyMiddlewareError(onError, { error, req, res, ...(token ? { token } : {}) });
      delete authenticatedRequest.auth;
      if (res.headersSent) {
        next(error);
        return;
      }

      sendError(response);
    }
  };
}
