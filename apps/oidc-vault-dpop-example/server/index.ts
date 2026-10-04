import { randomBytes } from 'node:crypto';

import { normalizeOidcVaultBasePath, resolveOidcVaultConfigFromEnv } from '@web-ts-toolkit/express-oidc-vault';

import { startExampleServer, EXAMPLE_BASE_PATH } from './app';
import { LOCAL_CLIENT_ID, startLocalIdp } from './local-idp';

const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:4317';
const port = Number(process.env.PORT ?? 4318);
const backendOrigin = new URL(process.env.BACKEND_ORIGIN ?? `http://127.0.0.1:${port}`).origin;
const basePath = normalizeOidcVaultBasePath(process.env.VAULT_BASE_PATH ?? EXAMPLE_BASE_PATH).replace(/\/+$/g, '');
const mode = process.env.IDP_MODE ?? 'fixture';
if (mode !== 'fixture' && mode !== 'external') throw new Error('IDP_MODE must be fixture or external.');
const idp =
  mode === 'fixture'
    ? await startLocalIdp({
        port: Number(process.env.IDP_PORT ?? 4319),
        callbackUris: ['body', 'cookie'].map((transport) => `${backendOrigin}${basePath}/${transport}/callback`),
      })
    : undefined;
const config = idp ? { issuer: idp.issuer, clientId: LOCAL_CLIENT_ID } : resolveOidcVaultConfigFromEnv(process.env);
const secret = (value: string | undefined): Uint8Array => {
  if (value === undefined) return randomBytes(32);
  const bytes = Buffer.from(value, 'base64url');
  if (!/^[A-Za-z0-9_-]+$/.test(value) || bytes.byteLength < 32 || bytes.toString('base64url') !== value) {
    throw new Error('Configured example secrets must be canonical base64url of at least 32 random bytes.');
  }
  return bytes;
};
const backend = await (async () => {
  try {
    return await startExampleServer({
      frontendOrigin,
      backendOrigin,
      basePath: basePath || '/',
      port,
      config,
      localJwtSecret: secret(process.env.LOCAL_JWT_SECRET),
      nonceSecret: process.env.DPOP_NONCES === 'off' ? false : secret(process.env.DPOP_NONCE_SECRET),
      nonceLifetimeSeconds: Number(process.env.DPOP_NONCE_LIFETIME_SECONDS ?? 60),
      tokenLifetimeSeconds: Number(process.env.LOCAL_TOKEN_LIFETIME_SECONDS ?? 30),
    });
  } catch (error) {
    await idp?.close();
    throw error;
  }
})();
console.info(`OIDC vault DPoP example: ${backend.backendOrigin}; SPA: ${frontendOrigin}; IdP: ${mode}`);
let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await backend.close();
  await idp?.close();
};
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
