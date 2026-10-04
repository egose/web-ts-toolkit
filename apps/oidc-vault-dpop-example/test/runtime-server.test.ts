import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { closeServer, listen } from '../server/http';
import { LOCAL_CLIENT_ID, startLocalIdp } from '../server/local-idp';

const unusedPort = async (): Promise<number> => {
  const server = createServer();
  const port = await listen(server);
  await closeServer(server);
  return port;
};

describe('DBJWT-10 plain Node built Express app', () => {
  it.each(['fixture', 'external'] as const)(
    'starts the actual .mjs entry, reads %s IdP environment, and serves the final login wire',
    async (mode) => {
      const port = await unusedPort();
      const idpPort = await unusedPort();
      const idp = mode === 'external' ? await startLocalIdp() : undefined;
      const child = spawn(process.execPath, [new URL('../dist/server/index.mjs', import.meta.url).pathname], {
        env: {
          ...process.env,
          IDP_MODE: mode,
          PORT: String(port),
          IDP_PORT: String(idpPort),
          BACKEND_ORIGIN: `http://127.0.0.1:${port}`,
          FRONTEND_ORIGIN: 'http://127.0.0.1:4317',
          VAULT_BASE_PATH: '/auth/oidc',
          DPOP_NONCES: 'on',
          LOCAL_JWT_SECRET: undefined,
          DPOP_NONCE_SECRET: undefined,
          ...(idp ? { OIDC_ISSUER: idp.issuer, OIDC_CLIENT_ID: LOCAL_CLIENT_ID } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let diagnostics = '';
      child.stderr.on('data', (chunk: Buffer) => {
        diagnostics += chunk.toString();
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Built example startup timed out.')), 10_000);
          child.stdout.on('data', (chunk: Buffer) => {
            if (chunk.toString().includes('OIDC vault DPoP example:')) {
              clearTimeout(timeout);
              resolve();
            }
          });
          child.once('exit', () => {
            clearTimeout(timeout);
            reject(new Error(`Built example startup failed: ${diagnostics}`));
          });
          child.once('error', reject);
        });
        expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
        const url = `http://127.0.0.1:${port}/auth/oidc/body/login`;
        const { privateKey, publicKey } = await generateKeyPair('ES256');
        const jwk = await exportJWK(publicKey);
        const proof = await new SignJWT({
          htm: 'POST',
          htu: url,
          iat: Math.floor(Date.now() / 1000),
          jti: crypto.randomUUID(),
        })
          .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk })
          .sign(privateKey);
        const challenged = await fetch(url, {
          method: 'POST',
          headers: { Origin: 'http://127.0.0.1:4317', 'Content-Type': 'application/json', DPoP: proof },
          body: '{}',
        });
        expect(challenged.status).toBe(400);
        expect(await challenged.json()).toEqual({
          code: 'OIDC_VAULT_USE_DPOP_NONCE',
          message: 'A fresh DPoP nonce is required.',
        });
        const nonce = challenged.headers.get('DPoP-Nonce')!;
        const retry = await new SignJWT({
          htm: 'POST',
          htu: url,
          iat: Math.floor(Date.now() / 1000),
          jti: crypto.randomUUID(),
          nonce,
        })
          .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk })
          .sign(privateKey);
        const accepted = await fetch(url, {
          method: 'POST',
          headers: { Origin: 'http://127.0.0.1:4317', 'Content-Type': 'application/json', DPoP: retry },
          body: '{}',
        });
        expect(accepted.status).toBe(200);
        expect(accepted.headers.get('Access-Control-Allow-Credentials')).toBe('true');
        expect(accepted.headers.get('Set-Cookie')).toContain('oidc_vault_transaction_body');
        const value = (await accepted.json()) as { authorizationUrl: string };
        expect(value.authorizationUrl).toContain(`${idp?.issuer ?? `http://127.0.0.1:${idpPort}/issuer`}/authorize`);
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const stopped = once(child, 'exit');
          child.kill('SIGTERM');
          await stopped;
        }
        await idp?.close();
      }
    },
    20_000,
  );
});
