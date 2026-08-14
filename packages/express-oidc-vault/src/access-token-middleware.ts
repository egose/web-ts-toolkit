import type { RequestHandler } from 'express';

import { OidcVaultHttpError } from './errors';
import type {
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

export function createOidcVaultAccessTokenMiddleware(options: OidcVaultAccessTokenMiddlewareOptions): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = extractBearerToken(req.get('authorization'));
      const validationResult = await options.validator.validate(token);

      const auth: OidcVaultAuthContext = {
        token,
        ...validationResult,
      };

      const authenticatedRequest = req as OidcVaultAuthenticatedRequest;

      authenticatedRequest.auth = auth;
      await options.onAuthContext?.({ req: authenticatedRequest, res, auth });
      next();
    } catch (error) {
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
