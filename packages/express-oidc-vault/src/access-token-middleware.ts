import type { Request, RequestHandler, Response } from 'express';

import { invalidAccessToken, snapshotAccessTokenConfirmation } from './access-token-confirmation';
import { isAccessTokenRejected } from './access-token-errors';
import { resolveDeviceBindingOptions, resolveDeviceBindingOrigin } from './device-binding-policy';
import { createDpopDiagnosticFactory, diagnosticCorrelation, diagnosticPreflightReason } from './diagnostics';
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
  OidcVaultAuthenticator,
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

  if (scheme?.toLowerCase() !== 'bearer' || !token || extra || !/^[\x21-\x7e]+$/.test(token) || token.includes(',')) {
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

interface RequestAuthentication {
  readonly owner: object;
  readonly res: Response;
  status: 'pending' | 'missing' | 'invalid' | 'authenticated' | 'challenged' | 'failed';
  auth?: OidcVaultAuthContext;
  snapshot?: OidcVaultAuthContext;
}

// Shared only inside this module; the owner identity pins the captured policy.
// An incompatible/reentrant handler must invalidate pending work too.
const evidence = new WeakMap<Request, RequestAuthentication>();

const authFields = ['subject', 'sessionId', 'scope', 'claims', 'token', 'confirmation', 'deviceBinding'] as const;

const credentialRejectionCodes = new Set([
  'OIDC_VAULT_MISSING_BEARER_TOKEN',
  'OIDC_VAULT_MISSING_ACCESS_TOKEN',
  'OIDC_VAULT_INVALID_AUTHORIZATION_HEADER',
  'OIDC_VAULT_INVALID_ACCESS_TOKEN',
  'OIDC_VAULT_DPOP_REQUIRED',
  'OIDC_VAULT_DEVICE_BINDING_REQUIRED',
  'OIDC_VAULT_INVALID_DPOP_PROOF',
]);

const clearChallenge = (res: Response): void => {
  res.removeHeader('WWW-Authenticate');
  res.removeHeader('DPoP-Nonce');
  res.setHeader('Cache-Control', 'no-store');
};

const sendError = (res: Response, response: DpopPolicyResponse): void => {
  clearChallenge(res);
  for (const [name, value] of Object.entries(response.headers)) res.setHeader(name, value);
  res.status(response.status).json(response.body);
};

/** The handler-only API; defaults remain strict. Use the authenticator factory to compose reusable guards. */
export function createOidcVaultAccessTokenMiddleware(options: OidcVaultAccessTokenMiddlewareOptions): RequestHandler {
  return createOidcVaultAuthenticator(options).authenticate;
}

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
export function createOidcVaultAuthenticator(options: OidcVaultAccessTokenMiddlewareOptions): OidcVaultAuthenticator {
  const { validator, deviceBinding: configuredBinding, onAuthContext, onError, onDpopDiagnostic } = options;
  const createDiagnostic = createDpopDiagnosticFactory(onDpopDiagnostic);
  const { authentication = 'required', invalidCredentials = 'reject' } = options;
  if (authentication !== 'required' && authentication !== 'optional')
    throw new TypeError('authentication must be required or optional.');
  if (invalidCredentials !== 'reject' && invalidCredentials !== 'anonymous')
    throw new TypeError('invalidCredentials must be reject or anonymous.');
  if (invalidCredentials === 'anonymous' && authentication !== 'optional')
    throw new TypeError('Anonymous invalid credentials require optional authentication.');
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
  const owner = Object.freeze({});

  const prepareError = (
    error: unknown,
    scheme?: 'Bearer' | 'DPoP',
    nonceResponse?: DpopPolicyResponse,
    hookFailure = false,
  ): DpopPolicyResponse => {
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
            : code === 'OIDC_VAULT_MISSING_ACCESS_TOKEN' || code === 'OIDC_VAULT_AUTHENTICATION_REQUIRED'
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

  const reentryError = (): OidcVaultHttpError =>
    new OidcVaultHttpError(500, 'OIDC_VAULT_AUTHENTICATION_REENTRY', 'Authentication is already running or completed.');

  const rejectGuard: RequestHandler = async (req, res, next) => {
    const state = evidence.get(req);
    const error =
      state?.status === 'pending'
        ? reentryError()
        : new OidcVaultHttpError(401, 'OIDC_VAULT_AUTHENTICATION_REQUIRED', 'Authentication is required.');
    if (state) state.status = 'failed';
    else evidence.set(req, { owner, res, status: 'failed' });
    delete req.auth;
    const response = prepareError(error);
    await notifyMiddlewareError(onError, { error, req, res });
    delete req.auth;
    if (res.headersSent) next(error);
    else sendError(res, response);
  };

  const guard =
    (bound: boolean): RequestHandler =>
    async (req, res, next) => {
      const state = evidence.get(req);
      const current = Object.getOwnPropertyDescriptor(req, 'auth');
      const intact =
        state?.auth &&
        state.snapshot &&
        current &&
        'value' in current &&
        current.value === state.auth &&
        authFields.every((key) => {
          const field = Object.getOwnPropertyDescriptor(state.auth!, key);
          return Object.hasOwn(state.snapshot!, key)
            ? field && 'value' in field && field.value === state.snapshot![key]
            : field === undefined;
        });
      if (state?.status !== 'authenticated' || state.owner !== owner || state.res !== res || !intact) {
        await rejectGuard(req, res, next);
        return;
      }
      if (bound && !state.snapshot!.deviceBinding) {
        const error = new OidcVaultHttpError(
          401,
          'OIDC_VAULT_DEVICE_BINDING_REQUIRED',
          'A device-bound login is required.',
        );
        state.status = 'failed';
        delete req.auth;
        const response = prepareError(error);
        await notifyMiddlewareError(onError, { error, req, res });
        delete req.auth;
        if (res.headersSent) next(error);
        else sendError(res, response);
        return;
      }
      if (!res.headersSent) res.setHeader('Cache-Control', 'no-store');
      next();
    };

  const authenticate: RequestHandler = async (req, res, next) => {
    if (evidence.has(req)) {
      // Poison pending work before yielding to observers, so it cannot later
      // restore auth, enrich, reserve again or run downstream after this denial.
      const state = evidence.get(req)!;
      state.status = 'failed';
      delete req.auth;
      const error = reentryError();
      const response = prepareError(error);
      await notifyMiddlewareError(onError, { error, req, res });
      delete req.auth;
      if (res.headersSent) next(error);
      else sendError(res, response);
      return;
    }
    const state: RequestAuthentication = { owner, res, status: 'pending' };
    const diagnostic = createDiagnostic('api');
    evidence.set(req, state);
    let token: string | undefined;
    let scheme: 'Bearer' | 'DPoP' | undefined;
    let nonceResponse: DpopPolicyResponse | undefined;
    let stage: 'credential' | 'validator' | 'result' | 'proof' = 'credential';
    const authenticatedRequest = req as OidcVaultAuthenticatedRequest;
    delete authenticatedRequest.auth;
    if (!res.headersSent) res.setHeader('Cache-Control', 'no-store');
    const stillPending = (): boolean => {
      if (state.status === 'pending') return true;
      delete authenticatedRequest.auth;
      return false;
    };

    try {
      const authorization = readDpopRawHeader(req, 'authorization');
      const proofHeader = readDpopRawHeader(req, 'dpop');
      if (authentication === 'optional' && authorization.count === 0 && proofHeader.count === 0) {
        diagnostic.emit('presentation', 'ignored', policy ? 'proof-absent' : 'policy-disabled');
        state.status = 'missing';
        clearChallenge(res);
        next();
        return;
      }
      let result: OidcVaultAccessTokenValidationResult;
      let confirmation: Readonly<OidcVaultAccessTokenConfirmation> | null | undefined;
      let deviceBinding: Readonly<OidcVaultVerifiedDpopBinding> | undefined;
      if (!policy) {
        if (authorization.count > 1 || (authorization.count === 1 && !authorization.value?.trim()))
          throw new OidcVaultHttpError(
            401,
            'OIDC_VAULT_INVALID_AUTHORIZATION_HEADER',
            'Authorization header must use the Bearer scheme.',
          );
        token = extractBearerToken(req.get('authorization'));
        scheme = 'Bearer';
        stage = 'validator';
        result = await validate(token);
        if (!stillPending()) return;
        delete authenticatedRequest.auth;
        stage = 'result';
        const reported = result?.confirmation;
        confirmation = reported === undefined ? undefined : snapshotAccessTokenConfirmation(reported);
        result = mappedFields(result);
        diagnostic.associate(diagnosticCorrelation('verified-token', result.subject, result.sessionId));
        delete authenticatedRequest.auth;
        stage = 'proof';
        if (confirmation)
          throw new OidcVaultHttpError(401, 'OIDC_VAULT_DPOP_REQUIRED', 'DPoP authentication is required.');
        diagnostic.emit('presentation', 'ignored', 'policy-disabled');
      } else {
        scheme = schemeOf(authorization.value);
        if (authorization.count === 0) {
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
        const { method, originalUrl } = req;
        stage = 'validator';
        result = await validateWithRequest!(Object.freeze({ token, scheme, req }));
        if (!stillPending()) return;
        delete authenticatedRequest.auth;
        stage = 'result';
        confirmation = snapshotAccessTokenConfirmation(result?.confirmation);
        result = mappedFields(result);
        diagnostic.associate(diagnosticCorrelation('verified-token', result.subject, result.sessionId));
        delete authenticatedRequest.auth;
        stage = 'proof';
        if (confirmation && scheme !== 'DPoP')
          throw new OidcVaultHttpError(401, 'OIDC_VAULT_DPOP_REQUIRED', 'DPoP authentication is required.');
        if (!confirmation && scheme === 'DPoP')
          throw invalidAccessToken('DPoP presentation of a verified unbound token is invalid.');
        if (!confirmation && policy.mode === 'required') {
          throw new OidcVaultHttpError(401, 'OIDC_VAULT_DEVICE_BINDING_REQUIRED', 'A device-bound login is required.');
        }
        const proof = extractDpopProof(proofHeader, diagnostic);
        if (!proof && confirmation)
          throw new OidcVaultHttpError(401, 'OIDC_VAULT_DPOP_REQUIRED', 'DPoP authentication is required.');
        if (proof) {
          const admission = await replay!.verifyAndReserve(
            () =>
              verifyDpopProof({
                proof,
                method,
                targetUrl: () => targetFor!(originalUrl),
                proofOptions: policy,
                accessToken: token!,
                expectedJkt: confirmation?.jkt,
                diagnostic,
              }),
            diagnostic,
          );
          if (!stillPending()) return;
          if (admission.type === 'nonce-challenge') {
            nonceResponse = toDpopNonceChallengeResponse(admission, 'api', policy.algorithms);
            throw new OidcVaultHttpError(401, 'OIDC_VAULT_USE_DPOP_NONCE', 'A fresh DPoP nonce is required.');
          }
          if (confirmation) deviceBinding = admission.binding;
        } else diagnostic.emit('presentation', 'ignored', 'proof-absent');
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
        if (!stillPending()) return;
        authenticatedRequest.auth = restoreAuth();
      } catch (hookError) {
        if (!stillPending()) return;
        state.status = 'failed';
        const response = prepareError(hookError, scheme, undefined, true);
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

        sendError(res, response);
        return;
      }
      state.auth = authenticatedRequest.auth;
      state.snapshot = { ...authenticatedRequest.auth };
      state.status = 'authenticated';
      if (!res.headersSent) res.setHeader('Cache-Control', 'no-store');
      next();
    } catch (error) {
      if (!stillPending()) return;
      diagnostic.emit(
        'preflight',
        'rejected',
        stage === 'proof'
          ? diagnosticPreflightReason(error instanceof OidcVaultHttpError ? error.code : undefined)
          : 'credential-rejected',
      );
      const response = prepareError(error, scheme, nonceResponse);
      // Stage matters: an adapter throwing an arbitrary 401/package-shaped
      // error or returning malformed evidence is not a credential rejection.
      const rejected =
        stage === 'validator'
          ? isAccessTokenRejected(error)
          : (stage === 'credential' || stage === 'proof') &&
            error instanceof OidcVaultHttpError &&
            credentialRejectionCodes.has(error.code);
      const anonymous =
        authentication === 'optional' && invalidCredentials === 'anonymous' && rejected && !nonceResponse;
      state.status = anonymous ? 'invalid' : nonceResponse ? 'challenged' : 'failed';
      delete authenticatedRequest.auth;
      await notifyMiddlewareError(onError, { error, req, res, ...(token ? { token } : {}) });
      delete authenticatedRequest.auth;
      if (res.headersSent) {
        next(error);
        return;
      }

      if (anonymous && state.status === 'invalid') {
        clearChallenge(res);
        res.status(200);
        next();
      } else sendError(res, response);
    }
  };
  return Object.freeze({ authenticate, requireAuth: guard(false), requireDeviceBinding: guard(true) });
}
