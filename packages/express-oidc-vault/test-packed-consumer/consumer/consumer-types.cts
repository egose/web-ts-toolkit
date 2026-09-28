import express, { type RequestHandler } from 'express';
import {
  DEFAULT_OIDC_SCOPES,
  OIDC_VAULT_ROUTE_PATHS,
  OidcVaultStoreConflictError,
  type OidcVaultAccessTokenMiddlewareOptions,
  type OidcVaultAccessTokenValidator,
  type OidcVaultAuthContext,
  type OidcVaultConfig,
  type OidcVaultExchangeResult,
  type OidcVaultOptions,
  type OidcVaultResolvedConfig,
  type OidcVaultSession,
  type OidcVaultStoreProvider,
  type OidcVaultTokenIssueResult,
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultMiddleware,
  normalizeOidcVaultBasePath,
  resolveOidcVaultConfig,
} from '@web-ts-toolkit/express-oidc-vault';

const config: OidcVaultConfig = {
  issuer: 'https://issuer.example.com',
  clientId: 'client-id',
  clientSecret: 'client-secret', // pragma: allowlist secret
};

const resolved = resolveOidcVaultConfig(config);
resolved satisfies OidcVaultResolvedConfig;
DEFAULT_OIDC_SCOPES satisfies string;
OIDC_VAULT_ROUTE_PATHS.callback satisfies string;
normalizeOidcVaultBasePath('/auth/') satisfies string;

const session: OidcVaultSession = {
  sessionId: 'session-id',
  subject: 'subject',
  refreshToken: 'refresh-token',
  idToken: 'id-token',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const storeProvider: OidcVaultStoreProvider = {
  async createAuthorizationTransaction() {},
  async consumeAuthorizationTransaction() {
    return null;
  },
  async createExchangeCode() {},
  async consumeExchangeCode() {
    return null;
  },
  async createSession() {
    return session;
  },
  async getSession() {
    return session;
  },
  async rotateSession(input) {
    return input.nextSession;
  },
  async deleteSession() {},
  async deleteSessionsByLogicalSessionId() {
    return 1;
  },
  async consumeBackchannelLogoutTokenJti() {
    return true;
  },
  async deleteSessionsBySubject() {
    return 1;
  },
  async deleteSessionsByProviderSessionId() {
    return 1;
  },
};

const options: OidcVaultOptions = {
  backendOrigin: 'https://api.example.com',
  config,
  frontendRedirectUri: 'https://app.example.com/callback',
  storeProvider,
  sessionTtlMs: 8 * 60 * 60 * 1000,
  hooks: {
    onBeforeSessionCreate({ session }) {
      if (session?.expiresAt !== undefined) {
        session.expiresAt = Math.min(session.expiresAt, session.createdAt + 60 * 60 * 1000);
      }
    },
    onError({ error }) {
      if (error instanceof Error && 'cause' in error) {
        const diagnostic: unknown = error.cause;
        void diagnostic;
      }
    },
  },
  tokenIssuer: {
    async issue({ session }) {
      session.provider?.issuer satisfies string | undefined;
      session.provider?.clientId satisfies string | undefined;
      // Type fixture only; a real issuer signs/creates its application token.
      return { accessToken: 'local-token', expiresIn: 900, tokenType: 'Bearer' } satisfies OidcVaultTokenIssueResult;
    },
  },
};

options.sessionTtlMs satisfies number | undefined;
// @ts-expect-error Session lifetime uses numeric milliseconds, not duration strings.
const invalidLifetime: OidcVaultOptions = { ...options, sessionTtlMs: '8h' };
void invalidLifetime;

const router = createOidcVaultMiddleware(options);
router satisfies express.Router;

const validator: OidcVaultAccessTokenValidator = {
  async validate(token) {
    return { subject: token };
  },
};

const middlewareOptions: OidcVaultAccessTokenMiddlewareOptions = {
  validator,
  onAuthContext({ req, auth }) {
    req.auth satisfies OidcVaultAuthContext | undefined;
    auth satisfies OidcVaultAuthContext;
  },
};

const accessTokenMiddleware = createOidcVaultAccessTokenMiddleware(middlewareOptions);
accessTokenMiddleware satisfies RequestHandler;

const route: RequestHandler = (req, res) => {
  if (req.auth) {
    req.auth.subject satisfies string;
    req.auth.token satisfies string;
    req.auth.claims satisfies Record<string, unknown> | undefined;
  }
  res.json({ ok: true });
};

const app = express();
app.get('/me', accessTokenMiddleware, route);

const exchange = { accessToken: 'token', expiresIn: 60 } satisfies OidcVaultExchangeResult;
void exchange;

// @ts-expect-error Local issuer tokenType is the exact Bearer literal.
const invalidTokenType: OidcVaultTokenIssueResult = { accessToken: 'token', expiresIn: 60, tokenType: 'bearer' };
void invalidTokenType;
// @ts-expect-error Local issuer expiry is numeric seconds, not a duration string.
const invalidTokenExpiry: OidcVaultTokenIssueResult = { accessToken: 'token', expiresIn: '15m' };
void invalidTokenExpiry;

const conflictError = new OidcVaultStoreConflictError('conflict');
conflictError satisfies OidcVaultStoreConflictError;
conflictError satisfies Error;

// @ts-expect-error req.auth is readonly typed as an OIDC auth context, not an arbitrary shape.
const invalidAuth: OidcVaultAuthContext = { token: 'token' };
void invalidAuth;

export { app, route };
