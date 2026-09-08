import type { RequestHandler } from 'express';

import { OidcVaultHttpError } from './errors';
import type {
  OidcVaultAccessTokenMiddlewareErrorContext,
  OidcVaultAccessTokenMiddlewareOptions,
  OidcVaultAuthContext,
  OidcVaultAuthenticatedRequest,
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

const setBearerChallengeHeader = (res: Parameters<RequestHandler>[1]): void => {
  res.setHeader('WWW-Authenticate', 'Bearer');
};

const notifyBearerMiddlewareError = async (
  options: OidcVaultAccessTokenMiddlewareOptions,
  context: OidcVaultAccessTokenMiddlewareErrorContext,
): Promise<void> => {
  try {
    await options.onError?.(context);
  } catch {
    // Prefer surfacing the original bearer failure.
  }
};

export function createOidcVaultAccessTokenMiddleware(options: OidcVaultAccessTokenMiddlewareOptions): RequestHandler {
  return async (req, res, next) => {
    let token: string | undefined;

    try {
      token = extractBearerToken(req.get('authorization'));
      const validationResult = await options.validator.validate(token);

      const auth: OidcVaultAuthContext = {
        token,
        ...validationResult,
      };

      const authenticatedRequest = req as OidcVaultAuthenticatedRequest;

      authenticatedRequest.auth = auth;

      try {
        await options.onAuthContext?.({ req: authenticatedRequest, res, auth });
      } catch (hookError) {
        delete authenticatedRequest.auth;
        await notifyBearerMiddlewareError(options, { error: hookError, req, res, token, auth });

        if (res.headersSent) {
          next(hookError);
          return;
        }

        if (hookError instanceof OidcVaultHttpError) {
          if (hookError.status === 401) {
            setBearerChallengeHeader(res);
          }
          res.status(hookError.status).json({
            code: hookError.code,
            message: hookError.clientMessage,
          });
          return;
        }

        res.status(500).json({
          code: 'OIDC_VAULT_AUTH_CONTEXT_FAILED',
          message: 'Auth context hook failed.',
        });
        return;
      }

      next();
    } catch (error) {
      await notifyBearerMiddlewareError(options, { error, req, res, ...(token ? { token } : {}) });

      if (res.headersSent) {
        next(error);
        return;
      }

      if (error instanceof OidcVaultHttpError) {
        setBearerChallengeHeader(res);
        res.status(error.status).json({
          code: error.code,
          message: error.clientMessage,
        });
        return;
      }

      setBearerChallengeHeader(res);
      res.status(401).json({
        code: 'OIDC_VAULT_INVALID_ACCESS_TOKEN',
        message: 'Access token validation failed.',
      });
    }
  };
}
