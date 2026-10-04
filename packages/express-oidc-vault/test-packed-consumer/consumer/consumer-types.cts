import express, { type RequestHandler } from 'express';
import {
  DEFAULT_OIDC_SCOPES,
  OIDC_VAULT_ROUTE_PATHS,
  OidcVaultStoreConflictError,
  OidcVaultDpopReplayCapacityError,
  type AuthorizationTransactionInput,
  type ConsumeAuthorizationTransactionIfMatchesInput,
  type ConsumeExchangeCodeIfMatchesInput,
  type ExchangeCodeRecordInput,
  type IssueTokenInput,
  type OidcVaultAccessTokenMiddlewareOptions,
  type OidcVaultAccessTokenConfirmation,
  type OidcVaultAccessTokenRequestInput,
  type OidcVaultAccessTokenValidator,
  type OidcVaultAuthContext,
  type OidcVaultApiDeviceBindingOptions,
  type OidcVaultConfig,
  type OidcVaultDeviceBindingMode,
  type OidcVaultDeviceBindingOptions,
  type OidcVaultDeviceBindingStoreProvider,
  type OidcVaultDpopAlgorithm,
  type OidcVaultDpopBinding,
  type OidcVaultDpopNonceOptions,
  type OidcVaultDpopProofOptions,
  type OidcVaultDpopReplayStore,
  type OidcVaultExchangeResult,
  type OidcVaultFingerprintRecognitionOptions,
  type OidcVaultLoginInitiationInput,
  type OidcVaultLoginInitiationResult,
  type OidcVaultOptions,
  type OidcVaultRecordBindingMatch,
  type OidcVaultRequestAwareAccessTokenValidator,
  type OidcVaultRequestAwareAccessTokenValidationResult,
  type OidcVaultResolvedConfig,
  type OidcVaultSession,
  type OidcVaultSessionRevocationContext,
  type OidcVaultStoreProvider,
  type OidcVaultTokenIssueResult,
  type OidcVaultTokenIssuer,
  type OidcVaultTransactionCookieOptions,
  type OidcVaultVerifiedDpopBinding,
  type ReserveDpopProofInput,
  createOidcVaultAccessTokenMiddleware,
  createOidcVaultJwtAccessTokenValidator,
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

// @ts-expect-error Local issuer tokenType uses exact Bearer/DPoP literals.
const invalidTokenType: OidcVaultTokenIssueResult = { accessToken: 'token', expiresIn: 60, tokenType: 'bearer' };
void invalidTokenType;
// @ts-expect-error Local issuer expiry is numeric seconds, not a duration string.
const invalidTokenExpiry: OidcVaultTokenIssueResult = { accessToken: 'token', expiresIn: '15m' };
void invalidTokenExpiry;

const conflictError = new OidcVaultStoreConflictError('conflict');
conflictError satisfies OidcVaultStoreConflictError;
conflictError satisfies Error;
const replayCapacityError = new OidcVaultDpopReplayCapacityError();
replayCapacityError satisfies Error;
replayCapacityError satisfies OidcVaultDpopReplayCapacityError;

// @ts-expect-error req.auth is readonly typed as an OIDC auth context, not an arbitrary shape.
const invalidAuth: OidcVaultAuthContext = { token: 'token' };
void invalidAuth;

// DBJWT-03 root declaration contract. Type-only examples; proof-aware handler
// and built-in guarded-store behavior is verified by their integration tasks.
const dpopAlgorithm: OidcVaultDpopAlgorithm = 'ES256';
const bindingMode: OidcVaultDeviceBindingMode = 'optional';
const nonceOptions: OidcVaultDpopNonceOptions = { secret: new Uint8Array(32), lifetimeSeconds: 60 };
const proofOptions: OidcVaultDpopProofOptions = {
  algorithms: Object.freeze(['ES256', 'PS256', 'RS256'] as const),
  proofMaxAgeSeconds: 60,
  clockSkewSeconds: 5,
  nonce: nonceOptions,
};
const bindingOptions: OidcVaultDeviceBindingOptions = { ...proofOptions, mode: bindingMode };
const binding: OidcVaultDpopBinding = { type: 'dpop', jkt: 'A'.repeat(43) };
const verifiedBinding: Readonly<OidcVaultVerifiedDpopBinding> = { ...binding, alg: dpopAlgorithm };
// @ts-expect-error Verified issuer context is readonly.
verifiedBinding.jkt = 'changed';
// @ts-expect-error HS256 access-token signing does not enable symmetric DPoP proofs.
const invalidProofOptions: OidcVaultDpopProofOptions = { algorithms: ['HS256'] };
void invalidProofOptions;

const boundSession: OidcVaultSession = { ...session, deviceBinding: binding };
const transaction: AuthorizationTransactionInput = {
  state: 'state', nonce: 'nonce', pkceVerifier: 'verifier', codeChallenge: 'challenge',
  createdAt: Date.now(), expiresAt: Date.now() + 60_000,
  deviceBinding: binding, browserBindingHash: 'A'.repeat(43),
};
const exchangeCode: ExchangeCodeRecordInput = {
  code: 'code', sessionId: boundSession.sessionId, createdAt: Date.now(), expiresAt: Date.now() + 30_000,
  deviceBinding: binding, browserBindingHash: transaction.browserBindingHash,
};
const guardedMatch: OidcVaultRecordBindingMatch = { deviceBinding: binding, browserBindingHash: 'A'.repeat(43) };
const legacyMatch: OidcVaultRecordBindingMatch = { deviceBinding: null, browserBindingHash: null };
const transactionConsume: ConsumeAuthorizationTransactionIfMatchesInput = { state: transaction.state, match: guardedMatch };
const exchangeConsume: ConsumeExchangeCodeIfMatchesInput = {
  code: exchangeCode.code, expectedSessionId: boundSession.sessionId, match: guardedMatch,
};
// @ts-expect-error Exchange atomic consume requires the preflight session ID.
const missingExpectedSession: ConsumeExchangeCodeIfMatchesInput = { code: 'code', match: guardedMatch };
// @ts-expect-error Revocation context cannot return upstream credentials.
const credentialContext: OidcVaultSessionRevocationContext = { logicalSessionId: 'logical', refreshToken: 'secret' };
void [missingExpectedSession, credentialContext];
const reservation: ReserveDpopProofInput = { replayKey: 'opaque', expiresAt: Date.now() + 60_000 };
const replayStore: OidcVaultDpopReplayStore = {
  async reserveDpopProof(input) { input satisfies ReserveDpopProofInput; return false; },
};
const revocationContext: OidcVaultSessionRevocationContext = {
  logicalSessionId: boundSession.logicalSessionId ?? boundSession.sessionId,
  provider: boundSession.provider, deviceBinding: binding,
};
const guardedStore: OidcVaultDeviceBindingStoreProvider = {
  ...storeProvider,
  async getAuthorizationTransaction() { return transaction; },
  async consumeAuthorizationTransactionIfMatches(input) {
    input satisfies ConsumeAuthorizationTransactionIfMatchesInput; return null;
  },
  async getExchangeCode() { return exchangeCode; },
  async consumeExchangeCodeIfMatches(input) { input satisfies ConsumeExchangeCodeIfMatchesInput; return null; },
  async getSessionRevocationContext() { return revocationContext; },
  reserveDpopProof: replayStore.reserveDpopProof,
};
// @ts-expect-error Opt-in store interface requires the guarded/replay capabilities.
const invalidGuardedStore: OidcVaultDeviceBindingStoreProvider = storeProvider;
void invalidGuardedStore;
const boundIssuer: OidcVaultTokenIssuer = {
  async issue(input) {
    input satisfies IssueTokenInput;
    input.deviceBinding satisfies Readonly<OidcVaultVerifiedDpopBinding> | undefined;
    // Type fixture only; a real bound issuer returns a signed matching cnf.jkt JWT.
    return { accessToken: 'type-fixture', expiresIn: 60, tokenType: input.deviceBinding ? 'DPoP' : 'Bearer' };
  },
};
const optInOptions: OidcVaultOptions = {
  ...options, storeProvider: guardedStore, deviceBinding: bindingOptions, tokenIssuer: boundIssuer,
};
const dpopResult = { accessToken: 'type-fixture', expiresIn: 60, tokenType: 'DPoP' } satisfies OidcVaultTokenIssueResult;
dpopResult satisfies OidcVaultExchangeResult;
void [verifiedBinding, legacyMatch, transactionConsume, exchangeConsume, reservation, optInOptions, dpopResult];

// DBJWT-06 installed request-aware API surface: root named imports only.
const confirmation: OidcVaultAccessTokenConfirmation = { jkt: binding.jkt };
const awareResult: OidcVaultRequestAwareAccessTokenValidationResult = { subject: 'verified-user', confirmation };
const verifiedUnbound: OidcVaultRequestAwareAccessTokenValidationResult = { subject: 'verified-user', confirmation: null };
// @ts-expect-error Request-aware results cannot omit original verified confirmation.
const missingConfirmation: OidcVaultRequestAwareAccessTokenValidationResult = { subject: 'user' };
// @ts-expect-error Confirmation is a thumbprint, not a proof or public JWK.
const invalidConfirmation: OidcVaultAccessTokenConfirmation = { jwk: {} };
const awareValidator: OidcVaultRequestAwareAccessTokenValidator = {
  async validate(token) { return { subject: token }; },
  async validateWithRequest(input) {
    input satisfies OidcVaultAccessTokenRequestInput;
    input.token satisfies string;
    input.scheme satisfies 'Bearer' | 'DPoP';
    input.req satisfies express.Request;
    return verifiedUnbound;
  },
};
// @ts-expect-error The stronger adapter requires validateWithRequest.
const legacyCannotBeAware: OidcVaultRequestAwareAccessTokenValidator = validator;
const apiPolicy: OidcVaultApiDeviceBindingOptions = {
  ...bindingOptions, publicOrigin: 'https://api.example.com', publicPathPrefix: '/public',
  replayNamespace: 'app-api-v1', replayStore: guardedStore, now: Date.now,
};
const jwtValidator = createOidcVaultJwtAccessTokenValidator({
  key: new Uint8Array(32), issuer: 'https://api.example.com', audience: ['api-audience'], algorithms: ['HS256'],
  mapClaims(claims) { return { subject: String(claims.sub), claims }; },
});
jwtValidator satisfies OidcVaultRequestAwareAccessTokenValidator;
const apiMiddleware = createOidcVaultAccessTokenMiddleware({
  validator: jwtValidator, deviceBinding: apiPolicy,
  onAuthContext({ req, auth }) {
    req.auth satisfies OidcVaultAuthContext | undefined;
    auth.confirmation satisfies OidcVaultAccessTokenConfirmation | null | undefined;
    auth.deviceBinding satisfies Readonly<OidcVaultVerifiedDpopBinding> | undefined;
    if (auth.deviceBinding) {
      // @ts-expect-error Verified proof context is readonly.
      auth.deviceBinding.jkt = 'changed';
    }
  },
});
apiMiddleware satisfies RequestHandler;
const acceptResult = async (input: OidcVaultAccessTokenRequestInput): Promise<void> => {
  const result = await jwtValidator.validateWithRequest(input);
  result.confirmation satisfies OidcVaultAccessTokenConfirmation | null;
};
// @ts-expect-error API policy requires an explicit shared replay service.
const missingReplayStore: OidcVaultApiDeviceBindingOptions = { publicOrigin: 'https://api.example.com', replayNamespace: 'api' };
// @ts-expect-error Request input permits only the normalized Bearer/DPoP scheme.
const invalidScheme: OidcVaultAccessTokenRequestInput = { token: 'token', scheme: 'bearer', req: {} as express.Request };
void [awareResult, missingConfirmation, invalidConfirmation, legacyCannotBeAware, awareValidator, acceptResult, missingReplayStore, invalidScheme];

// Installed root-only POST login/cookie declarations; the runtime consumer also
// exercises guarded exchange/refresh/logout with the original proof key.
const transactionCookie: OidcVaultTransactionCookieOptions = { name: '__Host-app_login', sameSite: 'none' };
const loginOptions: OidcVaultOptions = { ...optInOptions, transactionCookie, trustedOrigins: ['https://app.example.com'] };
createOidcVaultMiddleware(loginOptions) satisfies express.Router;
const loginInput: OidcVaultLoginInitiationInput = { returnTo: '/signed-in' };
const initiateLogin = async (freshDpopProof: string): Promise<OidcVaultLoginInitiationResult> => {
  const response = await fetch('https://api.example.com/auth/oidc/login', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', DPoP: freshDpopProof },
    body: JSON.stringify(loginInput),
  });
  if (!response.ok) throw new Error('Login initiation failed.');
  const value: unknown = await response.json();
  if (typeof value !== 'object' || value === null || !('authorizationUrl' in value) || typeof value.authorizationUrl !== 'string') {
    throw new Error('Invalid login initiation response.');
  }
  return { authorizationUrl: value.authorizationUrl };
};
// @ts-expect-error Only lax or explicit HTTPS none is supported.
const strictTransactionCookie: OidcVaultTransactionCookieOptions = { sameSite: 'strict' };
// @ts-expect-error The temporary cookie always uses Path=/.
const pathTransactionCookie: OidcVaultTransactionCookieOptions = { path: '/login' };
// @ts-expect-error Secure is automatic for HTTPS, with no opt-out.
const insecureTransactionCookie: OidcVaultTransactionCookieOptions = { secure: false };
// @ts-expect-error Key material must be in a verified DPoP proof, not the login body.
const bodyKeyLogin: OidcVaultLoginInitiationInput = { jwk: {} };
// @ts-expect-error Successful login JSON requires authorizationUrl.
const missingLoginUrl: OidcVaultLoginInitiationResult = {};
void [initiateLogin, strictTransactionCookie, pathTransactionCookie, insecureTransactionCookie, bodyKeyLogin, missingLoginUrl];

// DBJWT-05 shipped exchange snippet: a configured local issuer is expected.
const exchangeBoundCode = async (code: string, freshDpopProof: string): Promise<OidcVaultExchangeResult> => {
  const response = await fetch('https://api.example.com/auth/oidc/exchange', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', DPoP: freshDpopProof },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw new Error('Code exchange failed.');
  const value: unknown = await response.json();
  if (typeof value !== 'object' || value === null ||
      !('accessToken' in value) || typeof value.accessToken !== 'string' ||
      !('tokenType' in value) || value.tokenType !== 'DPoP' ||
      !('expiresIn' in value) || typeof value.expiresIn !== 'number' ||
      !Number.isSafeInteger(value.expiresIn) || value.expiresIn < 0 ||
      ('sessionId' in value && typeof value.sessionId !== 'string')) throw new Error('Invalid bound credential response.');
  return { accessToken: value.accessToken, tokenType: value.tokenType, expiresIn: value.expiresIn,
    ...('sessionId' in value ? { sessionId: value.sessionId as string } : {}) };
};
void exchangeBoundCode;

// DBJWT-09 root-only CJS declaration discovery and independent recognition option.
const fingerprintRecognition: OidcVaultFingerprintRecognitionOptions = Object.freeze({ headerName: 'X-App-Browser' });
const recognitionOptions: OidcVaultOptions = {
  ...options, storeProvider: guardedStore, fingerprintRecognition, deviceBinding: undefined,
  transactionCookie: { sameSite: 'lax' }, trustedOrigins: ['https://app.example.com'],
};
createOidcVaultMiddleware(recognitionOptions) satisfies express.Router;
// @ts-expect-error Recognition is an options object, never a boolean.
const booleanRecognition: OidcVaultOptions = { ...recognitionOptions, fingerprintRecognition: true };
// @ts-expect-error Header names are strings.
const invalidRecognitionHeader: OidcVaultFingerprintRecognitionOptions = { headerName: 123 };
// @ts-expect-error Fingerprint recognition has no PoP mode.
const recognitionMode: OidcVaultFingerprintRecognitionOptions = { mode: 'required' };
// @ts-expect-error No fingerprint enrollment through body fields.
const bodyFingerprint: OidcVaultLoginInitiationInput = { fingerprint: 'browser-signal' };
// @ts-expect-error No API restriction is configured by vault recognition.
const apiRecognition: OidcVaultAccessTokenMiddlewareOptions = { validator, fingerprintRecognition };
void [booleanRecognition, invalidRecognitionHeader, recognitionMode, bodyFingerprint, apiRecognition];

async function recognitionHeaders(getSignal: () => Promise<string | undefined>): Promise<Record<string, string>> {
  let signal: string | undefined;
  try { signal = await getSignal(); } catch { throw new Error('Browser recognition is unavailable.'); }
  if (signal === undefined) return {};
  if (signal.length === 0 || signal.length > 256 ||
      Array.from(signal).some((character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) > 0x7e)) {
    throw new Error('Fingerprint signal is invalid.');
  }
  return { 'X-Device-Fingerprint': signal };
}
async function initiateRecognizedLogin(getSignal: () => Promise<string | undefined>): Promise<string> {
  const response = await fetch('https://api.example.com/auth/oidc/login', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...await recognitionHeaders(getSignal) }, body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error('Login initiation failed.');
  const value: unknown = await response.json();
  if (typeof value !== 'object' || value === null || !('authorizationUrl' in value) || typeof value.authorizationUrl !== 'string') {
    throw new Error('Invalid login initiation response.');
  }
  return value.authorizationUrl;
}
void initiateRecognizedLogin;

export { app, route };
