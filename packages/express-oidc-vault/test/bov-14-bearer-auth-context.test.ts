import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createOidcVaultAccessTokenMiddleware } from '../src/access-token-middleware';
import { OidcVaultHttpError } from '../src/errors';
import type { OidcVaultAuthenticatedRequest } from '../src/types';

const buildValidator = () => ({
  async validate(token: string) {
    return { subject: 'user_1', sessionId: 'sess_1', scope: 'read:profile', claims: { token } };
  },
});

describe('BOV-14 bearer validation vs auth-context hook failures', () => {
  it('maps a failing onAuthContext to sanitized 500 without invalid-token 401 semantics', async () => {
    const hookError = new Error('hook secret: db-conn-string');
    const onError = vi.fn();
    const downstream = vi.fn((_req, res) => {
      res.json({ ok: true });
    });
    let capturedReq: OidcVaultAuthenticatedRequest | undefined;

    const app = express();

    app.get(
      '/protected',
      createOidcVaultAccessTokenMiddleware({
        validator: buildValidator(),
        async onAuthContext({ req }) {
          capturedReq = req as OidcVaultAuthenticatedRequest;
          throw hookError;
        },
        onError,
      }),
      downstream,
    );

    const response = await request(app).get('/protected').set('Authorization', 'Bearer valid_token_1');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'OIDC_VAULT_AUTH_CONTEXT_FAILED',
      message: 'Auth context hook failed.',
    });
    expect(response.text).not.toContain('db-conn-string');
    expect(response.text).not.toContain('valid_token_1');
    expect(response.headers['www-authenticate']).toBeUndefined();
    expect(downstream).not.toHaveBeenCalled();
    expect(capturedReq?.auth).toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].error).toBe(hookError);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      token: 'valid_token_1',
      auth: expect.objectContaining({ subject: 'user_1', token: 'valid_token_1' }),
    });
  });

  it('preserves OidcVaultHttpError vetoes from onAuthContext without a Bearer challenge', async () => {
    const veto = new OidcVaultHttpError(403, 'OIDC_VAULT_FORBIDDEN', 'Forbidden for this subject.');
    const onError = vi.fn();
    const downstream = vi.fn((_req, res) => {
      res.json({ ok: true });
    });

    const app = express();

    app.get(
      '/protected',
      createOidcVaultAccessTokenMiddleware({
        validator: buildValidator(),
        async onAuthContext() {
          throw veto;
        },
        onError,
      }),
      downstream,
    );

    const response = await request(app).get('/protected').set('Authorization', 'Bearer valid_token_2');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ code: 'OIDC_VAULT_FORBIDDEN', message: 'Forbidden for this subject.' });
    expect(response.headers['www-authenticate']).toBeUndefined();
    expect(downstream).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].error).toBe(veto);
  });

  it('keeps sanitized validator 401 responses with Bearer challenge and original-error observation', async () => {
    const validatorError = new Error('upstream secret: raw-token-value');
    const onError = vi.fn();
    const downstream = vi.fn((_req, res) => {
      res.json({ ok: true });
    });

    const app = express();

    app.get(
      '/protected',
      createOidcVaultAccessTokenMiddleware({
        validator: {
          async validate() {
            throw validatorError;
          },
        },
        onAuthContext: () => {
          throw new Error('must not run when validation fails');
        },
        onError,
      }),
      downstream,
    );

    const response = await request(app).get('/protected').set('Authorization', 'Bearer expired_token');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(response.body).toEqual({
      code: 'OIDC_VAULT_INVALID_ACCESS_TOKEN',
      message: 'Access token validation failed.',
    });
    expect(response.text).not.toContain('raw-token-value');
    expect(response.text).not.toContain('upstream secret');
    expect(downstream).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0].error).toBe(validatorError);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ token: 'expired_token' });
  });

  it('attaches auth and runs downstream on success without calling onError', async () => {
    const onError = vi.fn();
    const downstream = vi.fn((req, res) => {
      res.json(req.auth ?? null);
    });
    const onAuthContext = vi.fn();

    const app = express();

    app.get(
      '/protected',
      createOidcVaultAccessTokenMiddleware({
        validator: buildValidator(),
        onAuthContext,
        onError,
      }),
      downstream,
    );

    const response = await request(app).get('/protected').set('Authorization', 'Bearer good_token');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      token: 'good_token',
      subject: 'user_1',
      sessionId: 'sess_1',
    });
    expect(downstream).toHaveBeenCalledTimes(1);
    expect(onAuthContext).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});
