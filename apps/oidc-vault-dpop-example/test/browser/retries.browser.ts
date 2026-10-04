import { decodeJwt } from 'jose';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXAMPLE_BASE_PATH } from '../../server/app';
import { browserNames, callBrowser, launchBrowser, loginApp, openApp, startBrowserFixture } from './harness';

describe.each(browserNames)('DBJWT-10 real %s nonce/expiry/retry/recognition', (name) => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchBrowser(name);
  });
  afterAll(async () => {
    await browser?.close();
  });

  it.each(['body', 'cookie'] as const)(
    'refreshes an actually expired JWT with no ath, then API regenerates proof after nonce expiry (%s)',
    async (transport) => {
      const fixture = await startBrowserFixture(browser, { tokenLifetimeSeconds: 2, nonceLifetimeSeconds: 1 });
      try {
        const page = await openApp(fixture, transport);
        await loginApp(page);
        const scope = {
          name: 'expiry',
          transport,
          backendOrigin: fixture.backend.backendOrigin,
          basePath: `${EXAMPLE_BASE_PATH}/${transport}`,
        };
        await callBrowser(page, 'createSession', scope);
        const first = (await callBrowser(page, 'refresh', { name: 'expiry', count: 5 })).tokens[0];
        const result = await callBrowser(page, 'apiFetch', scope);
        expect(result.status).toBe(200);
        const oldProofs = fixture.backend.requests.filter((request) => request.path === '/api/profile');
        expect(oldProofs.map((request) => request.status)).toEqual([401, 200]);
        await page.waitForFunction((expiry) => Date.now() > expiry, Math.max(first.expiresAt, Date.now() + 1100));
        const before = fixture.idp.stats.refreshes;
        const refreshed = (await callBrowser(page, 'refresh', { name: 'expiry', count: 5 })).tokens[0];
        expect(fixture.idp.stats.refreshes - before).toBe(1);
        expect(refreshed.accessToken).not.toBe(first.accessToken);
        const refreshRequests = fixture.backend.requests.filter((request) => request.path.endsWith('/refresh'));
        const lastRefresh = refreshRequests.slice(-2);
        expect(lastRefresh.map((request) => request.status)).toEqual([400, 200]);
        for (const request of refreshRequests) {
          expect(request.authorization).toBeUndefined();
          expect(decodeJwt(request.proof!)).not.toHaveProperty('ath');
        }
        const api = await callBrowser(page, 'apiFetch', scope);
        expect(api.status).toBe(200);
        const newProofs = fixture.backend.requests.filter((request) => request.path === '/api/profile').slice(-2);
        expect(newProofs.map((request) => request.status)).toEqual([401, 200]);
        expect(decodeJwt(newProofs[0].proof!).nonce).toBe(decodeJwt(oldProofs[1].proof!).nonce); // expired cached nonce
        expect(decodeJwt(newProofs[1].proof!).nonce).not.toBe(decodeJwt(newProofs[0].proof!).nonce);
        expect(
          new Set(fixture.backend.requests.flatMap((request) => (request.proof ? [decodeJwt(request.proof).jti] : [])))
            .size,
        ).toBe(fixture.backend.requests.filter((request) => request.proof).length);
      } finally {
        await fixture.close();
      }
    },
  );

  it('reads exposed CORS challenges, retries nonce/invalid token once, rejects redirects, and has no implicit POST retry', async () => {
    const fixture = await startBrowserFixture(browser);
    try {
      const page = await openApp(fixture, 'body');
      await loginApp(page);
      const scope = {
        name: 'retry',
        transport: 'body' as const,
        backendOrigin: fixture.backend.backendOrigin,
        basePath: `${EXAMPLE_BASE_PATH}/body`,
      };
      await callBrowser(page, 'createSession', scope);
      await callBrowser(page, 'refresh', { name: 'retry' });
      const before = fixture.idp.stats.refreshes;
      const response = await callBrowser(page, 'apiFetch', { ...scope, path: '/api/reject-once' });
      expect(response.status).toBe(200);
      expect(fixture.idp.stats.refreshes - before).toBe(1);
      const retry = fixture.backend.requests.filter((request) => request.path === '/api/reject-once');
      expect(retry.map((request) => request.status)).toEqual([401, 401, 200]); // invalid token, nonce, success
      expect(new Set(retry.map((request) => decodeJwt(request.proof!).jti)).size).toBe(3);
      // A real fetch redirect:error fails rather than forwarding an auth header.
      const redirectTargets: string[] = [];
      page.on('request', (request) => {
        if (request.url().endsWith('/unexpected-redirect')) redirectTargets.push(request.url());
      });
      await expect(callBrowser(page, 'apiFetch', { ...scope, path: '/api/redirect' })).rejects.toThrow();
      expect(fixture.backend.requests.filter((request) => request.path === '/api/redirect')).toHaveLength(1);
      expect(redirectTargets).toEqual([]);
      fixture.backend.denyApiTokens(true);
      const refreshes = fixture.idp.stats.refreshes;
      expect(
        (
          await callBrowser(page, 'apiFetch', {
            ...scope,
            path: '/api/mutate',
            options: { method: 'POST', body: 'payload' },
          })
        ).status,
      ).toBe(401);
      expect(fixture.idp.stats.refreshes).toBe(refreshes);
      expect(fixture.backend.requests.filter((request) => request.path === '/api/mutate')).toHaveLength(1);
      expect((await callBrowser(page, 'apiFetch', { ...scope, path: '/api/profile' })).status).toBe(401);
      expect(fixture.idp.stats.refreshes - refreshes).toBe(1); // at most once, repeated invalid_token stops
    } finally {
      await fixture.close();
    }
  });

  it.each(['body', 'cookie'] as const)(
    'uses the preserved current fingerprint adapter from enrollment through refresh and rejects omission/mismatch without upstream work (%s)',
    async (transport) => {
      const fixture = await startBrowserFixture(browser);
      try {
        const page = await openApp(fixture, transport);
        const initialSignal = await page.locator('#signal').inputValue();
        await loginApp(page, true);
        const scope = {
          name: 'recognition',
          transport,
          backendOrigin: fixture.backend.backendOrigin,
          basePath: `${EXAMPLE_BASE_PATH}/${transport}`,
          signal: initialSignal,
        };
        await callBrowser(page, 'createSession', scope);
        await callBrowser(page, 'refresh', { name: scope.name });
        const before = fixture.idp.stats.refreshes;
        await callBrowser(page, 'setSignal', { name: scope.name });
        await expect(callBrowser(page, 'refresh', { name: scope.name })).rejects.toThrow('Browser recognition changed');
        expect(fixture.idp.stats.refreshes).toBe(before);
        expect(await callBrowser(page, 'memoryToken', { name: scope.name })).toBeUndefined();
        // Existing backend session is not re-enrolled; the UI starts a fresh POST login.
        await page.evaluate(() => {
          Object.defineProperty(navigator, 'language', { configurable: true, value: 'changed-language' });
        });
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'language', { configurable: true, value: 'changed-language' });
        });
        await page.locator('#login').click();
        await page.waitForURL(/\/issuer\/authorize\?/);
        await page.locator('#continue').click();
        await page.waitForURL(/\/callback\?transport=/);
        await page.waitForFunction(() => Boolean(document.querySelector('#status')?.getAttribute('data-state')));
        expect(
          await page.locator('#status').getAttribute('data-state'),
          (await page.locator('#status').textContent()) ?? '',
        ).toBe('signed-in');
        expect(fixture.idp.stats.authorizations).toBe(2);
        const enrollment = fixture.backend.requests.filter(
          (request) => request.path.endsWith('/login') && request.status === 200,
        );
        expect(enrollment.map((request) => request.fingerprint)).toEqual([
          initialSignal,
          await page.locator('#signal').inputValue(),
        ]);
        const all = fixture.backend.requests.filter((request) => request.proof);
        expect(all.every((request) => request.authorization === undefined)).toBe(true);
      } finally {
        await fixture.close();
      }
    },
  );

  it('explicitly authorized idempotent PUT replays its original body through invalid-token and nonce retries with fresh proofs', async () => {
    const fixture = await startBrowserFixture(browser);
    try {
      const page = await openApp(fixture, 'body');
      await loginApp(page);
      const scope = {
        name: 'resource',
        transport: 'body' as const,
        backendOrigin: fixture.backend.backendOrigin,
        basePath: `${EXAMPLE_BASE_PATH}/body`,
      };
      await callBrowser(page, 'createSession', scope);
      await callBrowser(page, 'refresh', { name: scope.name });
      const bodies: Array<string | null> = [];
      page.on('request', (request) => {
        if (request.url().endsWith('/api/resource') && request.method() === 'PUT') bodies.push(request.postData());
      });
      const before = fixture.idp.stats.refreshes;
      const response = await callBrowser(page, 'apiFetch', {
        ...scope,
        path: '/api/resource',
        options: { method: 'PUT', retry: 'idempotent', body: 'original-resource-data' },
      });
      expect(response).toEqual({ status: 200, body: { resource: 'original-resource-data' } });
      expect(bodies).toEqual(['original-resource-data', 'original-resource-data', 'original-resource-data']);
      const requests = fixture.backend.requests.filter((request) => request.path === '/api/resource');
      expect(requests.map((request) => request.status)).toEqual([401, 401, 200]);
      expect(new Set(requests.map((request) => decodeJwt(request.proof!).jti)).size).toBe(3);
      expect(fixture.idp.stats.refreshes - before).toBe(1);
      expect(fixture.backend.stats.resourceAssignments).toBe(1);
    } finally {
      await fixture.close();
    }
  });

  it.each(['missing', 'changed'] as const)(
    'a cookie tab with a %s fingerprint cannot bypass recognition by borrowing the live winner token',
    async (choice) => {
      const fixture = await startBrowserFixture(browser);
      try {
        const first = await openApp(fixture, 'cookie');
        await loginApp(first, true);
        const before = fixture.idp.stats.refreshes;
        if (choice === 'changed')
          await fixture.context.addInitScript(() => {
            Object.defineProperty(navigator, 'language', { configurable: true, value: 'other-language' });
          });
        const second = await fixture.context.newPage();
        await second.goto(`${fixture.frontendOrigin}/?transport=cookie${choice === 'changed' ? '&recognition=1' : ''}`);
        await second.waitForFunction(() => Boolean(document.querySelector('#status')?.getAttribute('data-state')));
        expect(await second.locator('#status').getAttribute('data-state')).toBe('login-required');
        expect(await second.locator('#status').textContent()).toBe('Browser recognition changed; sign in again.');
        expect(fixture.idp.stats.refreshes).toBe(before);
        const lastRefresh = fixture.backend.requests.filter((request) => request.path.endsWith('/refresh'));
        expect(lastRefresh.map((request) => request.status)).toEqual([403]);
        expect((await fixture.context.cookies()).some((cookie) => cookie.name === 'oidc_vault_session_cookie')).toBe(
          true,
        );
      } finally {
        await fixture.close();
      }
    },
  );
});
