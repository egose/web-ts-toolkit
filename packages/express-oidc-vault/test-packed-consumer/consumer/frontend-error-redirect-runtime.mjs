import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

// Both consumer.mjs and consumer.cjs pass their actual installed entrypoints.
// Exercise HTTP responses, not source imports or middleware construction alone.
export async function verifyFrontendErrorRedirect(core, memory) {
  const backendOrigin = 'https://api.example.com';
  const frontendOrigin = 'https://app.example.com';
  const basePath = '/vault/recovery';
  const target = 'https://help.example.net/sign-in-error?locale=en&locale=fr&ERROR=old&error_description=old';
  const invalidState = { code: 'OIDC_VAULT_INVALID_STATE', message: 'OIDC state is invalid or expired.' };
  const callbackError = { code: 'OIDC_VAULT_CALLBACK_ERROR', message: 'OIDC callback failed.' };
  const now = Date.now();
  for (const sessionTransport of ['body', 'cookie']) {
    const store = memory.createMemoryOidcVaultStore({ now: () => now });
    const observed = [];
    const options = {
      backendOrigin,
      basePath,
      frontendRedirectUri: `${frontendOrigin}/callback`,
      frontendErrorRedirectUri: target,
      sessionTransport,
      storeProvider: store,
      now: () => now,
      trustedOrigins: [frontendOrigin],
      deviceBinding: {},
      config: {
        issuer: 'https://issuer.example.com',
        clientId: 'packed-client',
        authorizationEndpoint: 'https://issuer.example.com/authorize',
        tokenEndpoint: 'https://issuer.example.com/token',
        jwksUri: 'https://issuer.example.com/jwks',
      },
      hooks: {
        onError({ route, error }) {
          assert.equal(route, 'callback');
          observed.push(error);
        },
      },
    };
    // R1: repeated-slash mounts normalize to root and serve /callback, not //callback.
    for (const rootBasePath of ['//', '///', '//////']) {
      for (const loopTarget of [
        `${backendOrigin}/callback`,
        `${backendOrigin}/CALLBACK/`,
        'https://API.EXAMPLE.COM:443/child/../CaLlBaCk/?view=error',
      ]) {
        assert.throws(
          () =>
            core.createOidcVaultMiddleware({
              ...options,
              basePath: rootBasePath,
              frontendErrorRedirectUri: loopTarget,
            }),
          /frontendErrorRedirectUri/,
        );
      }
    }
    const app = express();
    app.use(core.createOidcVaultMiddleware(options));
    // Old configurations remain valid and never inherit the success destination.
    app.use(core.createOidcVaultMiddleware({ ...options, basePath: '/default', frontendErrorRedirectUri: undefined }));
    const rootTarget = `${backendOrigin}/callback-help?locale=en`;
    app.use(core.createOidcVaultMiddleware({ ...options, basePath: '///', frontendErrorRedirectUri: rootTarget }));
    app.get('/callback-help', (_req, res) => res.status(200).send('Application retry screen'));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const call = (method, path, headers = {}, body) =>
      new Promise((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: server.address().port, method, path, headers, agent: false },
          (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('error', reject);
            res.on('end', () =>
              resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }),
            );
          },
        );
        req.on('error', reject);
        req.end(body);
      });
    const expectJson = (response, payload) => {
      assert.equal(response.status, 400);
      assert.deepEqual(JSON.parse(response.text), payload);
      assert.equal(response.headers.location, undefined);
      assert.equal(response.headers['cache-control'], 'no-store');
    };
    const expectRedirect = (response, payload) => {
      assert.equal(response.status, 302);
      assert.equal(response.text, '');
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers['referrer-policy'], 'no-referrer');
      assert.equal(response.headers['www-authenticate'], undefined);
      assert.equal(response.headers['dpop-nonce'], undefined);
      const url = new URL(response.headers.location);
      assert.equal(url.origin, 'https://help.example.net');
      assert.equal(url.pathname, '/sign-in-error');
      assert.deepEqual(
        [...url.searchParams],
        [
          ['locale', 'en'],
          ['locale', 'fr'],
          ['error', payload.code],
          ['error_description', payload.message],
        ],
      );
      assert.doesNotMatch(url.href, /private-|old|returnTo|state=|code=/);
    };
    try {
      const path = `${basePath}/callback?code=private-provider-code&state=private-unknown-state&error_description=private-provider-message&returnTo=https://untrusted.example/error`;
      for (const accept of ['text/html', 'application/xhtml+xml', 'text/html, */*;q=0.8']) {
        const before = observed.length;
        expectRedirect(await call('GET', path, { Accept: accept }), invalidState);
        assert.equal(observed.length, before + 1);
        assert.equal(observed.at(-1).code, invalidState.code);
      }
      for (const accept of [
        undefined,
        '*/*',
        'text/*',
        'application/json',
        'text/html, application/json',
        'application/json, text/html',
        'text/html;q=0, */*;q=1',
        'text/html;q=0.5, */*;q=1',
        'text/html;q=bogus',
      ]) {
        expectJson(await call('GET', path, accept === undefined ? {} : { Accept: accept }), invalidState);
      }
      expectJson(
        await call('GET', '/default/callback?code=private-code&state=unknown', { Accept: 'text/html' }),
        invalidState,
      );

      // Real POST initiation + authenticated provider rejection consumes only its
      // transaction and retains the existing cookie cleanup under the empty 302.
      const started = await call(
        'POST',
        `${basePath}/login`,
        {
          Origin: frontendOrigin,
          'Content-Type': 'application/json',
        },
        '{}',
      );
      assert.equal(started.status, 200);
      const state = new URL(JSON.parse(started.text).authorizationUrl).searchParams.get('state');
      const cookie = started.headers['set-cookie'][0].split(';', 1)[0];
      assert.ok(await store.getAuthorizationTransaction(state));
      const providerPath = `${basePath}/callback?state=${state}&error=private-provider-error&error_description=private-provider-message&code=private-code`;
      const failed = await call('GET', providerPath, { Accept: 'text/html', Cookie: cookie });
      expectRedirect(failed, callbackError);
      assert.match(failed.headers['set-cookie'][0], /Max-Age=0;/);
      assert.equal(await store.getAuthorizationTransaction(state), null);
      assert.equal(observed.at(-1).message, 'private-provider-error');
      expectRedirect(await call('GET', providerPath, { Accept: 'text/html', Cookie: cookie }), invalidState);

      // The installed root mount still recovers to a non-loop page and keeps JSON policy.
      const rootPath = '/CaLlBaCk/?code=private-provider-code&state=private-unknown-state';
      const rootFailure = await call('GET', rootPath, { Accept: 'text/html' });
      const expectedRootLocation = new URL(rootTarget);
      expectedRootLocation.searchParams.set('error', invalidState.code);
      expectedRootLocation.searchParams.set('error_description', invalidState.message);
      assert.equal(rootFailure.status, 302);
      assert.equal(rootFailure.text, '');
      assert.equal(rootFailure.headers.location, expectedRootLocation.href);
      assert.equal(rootFailure.headers['cache-control'], 'no-store');
      assert.equal(rootFailure.headers['referrer-policy'], 'no-referrer');
      assert.equal(rootFailure.headers['set-cookie'], undefined);
      const page = await call('GET', expectedRootLocation.pathname + expectedRootLocation.search);
      assert.equal(page.status, 200);
      assert.equal(page.text, 'Application retry screen');
      assert.equal(page.headers.location, undefined);
      expectJson(await call('GET', rootPath, { Accept: 'application/json' }), invalidState);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  }
}
