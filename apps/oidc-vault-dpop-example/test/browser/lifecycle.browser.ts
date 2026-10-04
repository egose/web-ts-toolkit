import { createHash } from 'node:crypto';

import { decodeJwt, decodeProtectedHeader, calculateJwkThumbprint, importJWK, jwtVerify } from 'jose';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EXAMPLE_BASE_PATH } from '../../server/app';
import {
  browserNames,
  callBrowser,
  launchBrowser,
  loginApp,
  openApp,
  readBrowserKey,
  removeBrowserKey,
  startBrowserFixture,
} from './harness';

describe.each(browserNames)('DBJWT-10 real %s OIDC + IndexedDB + CORS lifecycle', (name) => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchBrowser(name);
  });
  afterAll(async () => {
    await browser?.close();
  });

  it.each(['body', 'cookie'] as const)(
    'persists a non-extractable key through IdP navigation, callback, refresh reload, API and logout (%s)',
    async (transport) => {
      const fixture = await startBrowserFixture(browser);
      try {
        const page = await openApp(fixture, transport);
        const navigations: string[] = [];
        const navigationRequests: string[] = [];
        page.on('framenavigated', (frame) => {
          if (frame === page.mainFrame()) navigations.push(frame.url());
        });
        page.on('request', (request) => {
          if (request.isNavigationRequest()) navigationRequests.push(request.url());
        });
        await loginApp(page);
        expect(navigations.some((url) => url.startsWith(`${fixture.idp.issuer}/authorize`))).toBe(true);
        expect(
          navigationRequests.some((url) =>
            url.startsWith(`${fixture.backend.backendOrigin}${EXAMPLE_BASE_PATH}/${transport}/callback`),
          ),
        ).toBe(true);
        const key = await readBrowserKey(page, fixture.backend.backendOrigin, `${EXAMPLE_BASE_PATH}/${transport}`);
        expect(key).toMatchObject({
          extractable: false,
          type: 'private',
          usages: ['sign'],
          algorithm: { name: 'ECDSA', namedCurve: 'P-256' },
          exportFailed: true,
        });
        expect(key.jwk).not.toHaveProperty('d');
        const before = fixture.backend.requests.filter((request) => request.proof);
        expect(before.filter((request) => request.path.endsWith('/login')).map((request) => request.status)).toEqual([
          400, 200,
        ]);
        expect(before.filter((request) => request.path.endsWith('/exchange')).map((request) => request.status)).toEqual(
          [400, 200],
        );
        for (const request of before)
          expect(await calculateJwkThumbprint(decodeProtectedHeader(request.proof!).jwk!)).toBe(key.jkt);
        const cookies = await fixture.context.cookies(fixture.backend.backendOrigin);
        expect(cookies.some((cookie) => cookie.name.startsWith('oidc_vault_transaction'))).toBe(false);
        const sessionCookie = cookies.find((cookie) => cookie.name === `oidc_vault_session_${transport}`);
        if (transport === 'cookie') expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
        else expect(sessionCookie).toBeUndefined();
        const storage = await page.evaluate(() => ({
          local: { ...localStorage },
          session: { ...sessionStorage },
          cookie: document.cookie,
        }));
        expect(JSON.stringify(storage)).not.toContain('accessToken');
        expect(JSON.stringify(storage.local)).toBe('{}');
        expect(storage.cookie).not.toContain('oidc_vault_session');
        if (transport === 'body') expect(JSON.stringify(storage.session)).toContain('sessionId');
        else expect(JSON.stringify(storage.session)).not.toContain('sessionId');
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#status')?.getAttribute('data-state') === 'signed-in');
        expect(
          (await readBrowserKey(page, fixture.backend.backendOrigin, `${EXAMPLE_BASE_PATH}/${transport}`)).jkt,
        ).toBe(key.jkt);
        expect(fixture.idp.stats.refreshes).toBe(1);
        await page.locator('#api').click();
        await page.waitForFunction(() => document.querySelector('#result')?.textContent?.includes('fixture-user'));
        const api = fixture.backend.requests.filter((request) => request.path === '/api/profile');
        expect(api.map((request) => request.status)).toEqual([401, 200]);
        for (const request of api) {
          const token = request.authorization!.slice('DPoP '.length);
          expect(decodeJwt(token)).not.toHaveProperty('sid');
          if (sessionCookie) expect(JSON.stringify(decodeJwt(token))).not.toContain(sessionCookie.value);
          const proof = decodeJwt(request.proof!);
          expect(proof.ath).toBe(createHash('sha256').update(token, 'ascii').digest('base64url'));
          expect(proof.htu).toBe(`${fixture.backend.backendOrigin}/api/profile`);
          expect(request.authorization).toMatch(/^DPoP /);
          await jwtVerify(request.proof!, await importJWK(key.jwk, 'ES256'), { algorithms: ['ES256'] });
        }
        const proofs = fixture.backend.requests.flatMap((request) => (request.proof ? [decodeJwt(request.proof)] : []));
        expect(new Set(proofs.map((proof) => proof.jti)).size).toBe(proofs.length);
        for (const request of fixture.backend.requests.filter((request) => request.path.includes('/auth/'))) {
          expect(request.authorization).toBeUndefined();
          if (request.proof) expect(decodeJwt(request.proof)).not.toHaveProperty('ath');
        }
        expect(fixture.idp.stats).toMatchObject({
          authorizations: 1,
          callbacks: 1,
          pkceChecks: 1,
          upstreamDpopHeaders: 0,
        });
        await page.locator('#logout').click();
        await page.waitForFunction(
          () => document.querySelector('#status')?.getAttribute('data-state') === 'login-required',
        );
        expect(
          (await fixture.context.cookies()).some((cookie) => cookie.name === `oidc_vault_session_${transport}`),
        ).toBe(false);
        expect(JSON.stringify(await page.evaluate(() => ({ ...sessionStorage })))).not.toContain('sessionId');
      } finally {
        await fixture.close();
      }
    },
  );

  it.each(['body', 'cookie'] as const)(
    'key loss stops before refresh/API credentials and a fresh login creates a new binding (%s)',
    async (transport) => {
      const fixture = await startBrowserFixture(browser);
      try {
        const page = await openApp(fixture, transport);
        await loginApp(page);
        const first = await readBrowserKey(page, fixture.backend.backendOrigin, `${EXAMPLE_BASE_PATH}/${transport}`);
        const requests = fixture.backend.requests.length;
        if (transport === 'cookie') await callBrowser(page, 'dropDatabase', {});
        else await removeBrowserKey(page, fixture.backend.backendOrigin, `${EXAMPLE_BASE_PATH}/${transport}`);
        await page.locator('#api').click();
        await page.waitForFunction(
          () => document.querySelector('#status')?.getAttribute('data-state') === 'login-required',
        );
        expect(fixture.backend.requests.length).toBe(requests);
        await page.reload();
        await page.waitForFunction(
          () => document.querySelector('#status')?.getAttribute('data-state') === 'login-required',
        );
        expect(fixture.idp.stats.refreshes).toBe(0);
        await loginApp(page);
        const next = await readBrowserKey(page, fixture.backend.backendOrigin, `${EXAMPLE_BASE_PATH}/${transport}`);
        expect(next.jkt).not.toBe(first.jkt);
        expect(next.extractable).toBe(false);
        expect(fixture.idp.stats.authorizations).toBe(2);
      } finally {
        await fixture.close();
      }
    },
  );

  it.each(['body', 'cookie'] as const)(
    'a replaced persisted key cannot silently rebind an existing session (%s)',
    async (transport) => {
      const fixture = await startBrowserFixture(browser);
      try {
        const page = await openApp(fixture, transport);
        await loginApp(page);
        const old = await readBrowserKey(page, fixture.backend.backendOrigin, `${EXAMPLE_BASE_PATH}/${transport}`);
        const requests = fixture.backend.requests.length;
        const replacement = await callBrowser(page, 'replaceKey', {
          backendOrigin: fixture.backend.backendOrigin,
          basePath: `${EXAMPLE_BASE_PATH}/${transport}`,
        });
        expect(replacement).not.toBe(old.jkt);
        await page.locator('#refresh').click();
        await page.waitForFunction(
          () => document.querySelector('#status')?.getAttribute('data-state') === 'login-required',
        );
        expect(fixture.backend.requests.length).toBe(requests);
        expect(fixture.idp.stats.refreshes).toBe(0);
        await loginApp(page);
        expect(
          (await readBrowserKey(page, fixture.backend.backendOrigin, `${EXAMPLE_BASE_PATH}/${transport}`)).jkt,
        ).toBe(replacement);
      } finally {
        await fixture.close();
      }
    },
  );
});
