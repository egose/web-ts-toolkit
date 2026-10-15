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
  startBrowserFixture,
} from './harness';

describe.each(browserNames)('DPH-06 real %s scoped key recovery', (name) => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launchBrowser(name);
  });
  afterAll(async () => {
    await browser?.close();
  });

  it.each(['body', 'cookie'] as const)(
    'explicit reset repairs a corrupt key through real login and preserves an unrelated scope (%s)',
    async (transport) => {
      const fixture = await startBrowserFixture(browser);
      try {
        const page = await openApp(fixture, transport);
        await loginApp(page);
        const scope = {
          name: 'recover',
          transport,
          backendOrigin: fixture.backend.backendOrigin,
          basePath: `${EXAMPLE_BASE_PATH}/${transport}`,
          captureNavigation: true,
        };
        const oldKey = await readBrowserKey(page, scope.backendOrigin, scope.basePath);
        const otherScope = {
          backendOrigin: scope.backendOrigin,
          basePath: `${EXAMPLE_BASE_PATH}/${transport === 'body' ? 'cookie' : 'body'}`,
        };
        const otherKey = await callBrowser(page, 'inspectKey', { ...otherScope, create: true });
        await callBrowser(page, 'seedCookieVersion', {
          ...otherScope,
          version: { jkt: otherKey.jkt, generation: 'unrelated-generation', active: true },
        });
        const unrelated = await callBrowser(page, 'inspectScopeRecords', otherScope);
        const { scopeId } = await callBrowser(page, 'createSession', scope);
        await callBrowser(page, 'refresh', { name: scope.name });
        const oldSessionId =
          transport === 'body'
            ? await page.evaluate(
                (id) =>
                  (JSON.parse(sessionStorage.getItem(`oidc-vault-dpop:handle:${id}`)!) as { sessionId: string })
                    .sessionId,
                scopeId,
              )
            : (await fixture.context.cookies(scope.backendOrigin)).find(
                (cookie) => cookie.name === 'oidc_vault_session_cookie',
              )!.value;
        const requests = fixture.backend.requests.length;
        expect(await callBrowser(page, 'corruptKey', scope)).toBe(oldKey.jkt);
        for (const operation of ['refresh', 'getKey', 'login', 'logout'] as const) {
          await callBrowser(page, 'beginSessionOperation', { name: scope.name, id: operation, operation });
          expect(await callBrowser(page, 'finishSessionOperation', { id: operation })).toEqual({
            ok: false,
            code: 'DPOP_KEY_LOST',
          });
        }
        expect(await callBrowser(page, 'navigationCount', { name: scope.name })).toBe(0);
        expect(fixture.backend.requests.length).toBe(requests);
        expect(await callBrowser(page, 'inspectScopeRecords', scope)).toMatchObject({
          keyPresent: true,
          keyJkt: oldKey.jkt,
        });

        for (let attempt = 0; attempt < 2; attempt++) {
          await callBrowser(page, 'beginSessionOperation', { name: scope.name, id: 'reset', operation: 'resetKey' });
          expect(await callBrowser(page, 'finishSessionOperation', { id: 'reset' })).toEqual({ ok: true });
          expect(await callBrowser(page, 'inspectScopeRecords', scope)).toEqual({
            keyPresent: false,
            keyJkt: undefined,
            cookieVersion: undefined,
            version: 1,
            stores: ['cookieSessions', 'keys'],
          });
        }
        expect(await callBrowser(page, 'inspectScopeRecords', otherScope)).toEqual(unrelated);
        expect(fixture.backend.requests.length).toBe(requests);
        // Local deletion is not server revocation and cannot remove HttpOnly cookies.
        expect(await fixture.backend.store.getSession(oldSessionId)).not.toBeNull();
        if (transport === 'cookie')
          expect(
            (await fixture.context.cookies(scope.backendOrigin)).find(
              (cookie) => cookie.name === 'oidc_vault_session_cookie',
            )?.value,
          ).toBe(oldSessionId);

        // The real UI initiates login, follows the IdP redirect and exchanges the
        // one-time code. Reset itself has neither created a key nor sent a request.
        await loginApp(page);
        const replacement = await readBrowserKey(page, scope.backendOrigin, scope.basePath);
        expect(replacement.jkt).not.toBe(oldKey.jkt);
        expect(replacement).toMatchObject({
          extractable: false,
          type: 'private',
          usages: ['sign'],
          exportFailed: true,
        });
        expect(replacement.jwk).not.toHaveProperty('d');
        await page.reload();
        await page.waitForFunction(() => document.querySelector('#status')?.getAttribute('data-state') === 'signed-in');
        expect((await readBrowserKey(page, scope.backendOrigin, scope.basePath)).jkt).toBe(replacement.jkt);
        await page.locator('#api').click();
        await page.waitForFunction(() => document.querySelector('#result')?.textContent?.includes('fixture-user'));
        expect((await readBrowserKey(page, otherScope.backendOrigin, otherScope.basePath)).jkt).toBe(otherKey.jkt);
        expect(await callBrowser(page, 'inspectScopeRecords', otherScope)).toEqual(unrelated);
        expect(fixture.idp.stats.authorizations).toBe(2);
      } finally {
        await fixture.close();
      }
    },
  );

  it('disposal during a native key delete rolls back both records and prevents reset publication', async () => {
    const fixture = await startBrowserFixture(browser);
    try {
      const page = await openApp(fixture, 'cookie');
      await loginApp(page);
      const scope = {
        name: 'delete-authority',
        transport: 'cookie' as const,
        backendOrigin: fixture.backend.backendOrigin,
        basePath: `${EXAMPLE_BASE_PATH}/cookie`,
      };
      await callBrowser(page, 'createSession', scope);
      await callBrowser(page, 'refresh', { name: scope.name });
      const previous = await callBrowser(page, 'inspectScopeRecords', scope);
      const requests = fixture.backend.requests.length;
      await callBrowser(page, 'disposeDuringKeyDelete', { name: scope.name, id: 'delete' });
      await callBrowser(page, 'beginSessionOperation', { name: scope.name, id: 'reset', operation: 'resetKey' });
      expect(await callBrowser(page, 'finishSessionOperation', { id: 'reset' })).toEqual({
        ok: false,
        code: 'DPOP_SESSION_DISPOSED',
      });
      expect(await callBrowser(page, 'cookieWriteEvidence', { id: 'delete' })).toEqual({
        started: true,
        clearedImmediately: true,
        requestSucceeded: false,
        requestError: 'AbortError',
      });
      expect(await callBrowser(page, 'inspectScopeRecords', scope)).toEqual(previous);
      expect(fixture.backend.requests.length).toBe(requests);
    } finally {
      await fixture.close();
    }
  });
});
