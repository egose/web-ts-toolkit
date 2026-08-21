import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createAccessRuntime,
  createOpenApiRouter,
  defaultRuntime,
  OpenApiCollisionError,
  OpenApiRegistry,
  permissionsPlugin,
  setGlobalOptions,
} from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

let modelCounter = 0;

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => ({}),
  });
};

afterEach(() => {
  resetGlobalOptions();
  defaultRuntime.clearOpenApiRoutes();
  mongoose.deleteModel(/OpenApiCollision.*/);
});

describe('AR-20 OpenAPI collision and edge-case behavior', () => {
  describe('OpenApiRegistry strict mode (rejectConflicts)', () => {
    it('throws OpenApiCollisionError on conflicting method/path when strict mode is enabled', () => {
      const api = createAccessRuntime();
      api.runtime.enableOpenApiCollisionDetection();

      api.runtime.registerOpenApiRoute({
        method: 'get',
        path: '/users',
        operationId: 'users.list',
        summary: 'List users',
      });

      const second = {
        method: 'get' as const,
        path: '/users',
        operationId: 'different.users.list',
        summary: 'List users differently',
      };
      expect(() => api.runtime.registerOpenApiRoute(second)).toThrow(OpenApiCollisionError);

      const expected =
        /OpenAPI route collision: GET \/users is already registered as operationId="users\.list"; new registration uses operationId="different\.users\.list"/;
      expect(() =>
        api.runtime.registerOpenApiRoute({
          method: 'get',
          path: '/users',
          operationId: 'different.users.list',
        }),
      ).toThrow(expected);
    });

    it('collision error carries method/path/existing/incoming metadata', () => {
      const api = createAccessRuntime();
      api.runtime.enableOpenApiCollisionDetection();

      const first = { method: 'get' as const, path: '/items', operationId: 'items.list' };
      api.runtime.registerOpenApiRoute(first);

      const second = { method: 'get' as const, path: '/items', operationId: 'other.list' };
      try {
        api.runtime.registerOpenApiRoute(second);
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(OpenApiCollisionError);
        const collisionErr = err as OpenApiCollisionError;
        expect(collisionErr.collisionKind).toBe('path');
        expect(collisionErr.method).toBe('get');
        expect(collisionErr.path).toBe('/items');
        expect(collisionErr.existing).toEqual(first);
        expect(collisionErr.incoming).toEqual(second);
      }
    });

    it('allows equivalent idempotent re-registration without throwing in strict mode', () => {
      const api = createAccessRuntime();
      api.runtime.enableOpenApiCollisionDetection();

      const descriptor = {
        method: 'get' as const,
        path: '/users',
        operationId: 'users.list',
        summary: 'List users',
        idempotent: true,
      };
      api.runtime.registerOpenApiRoute(descriptor);
      expect(() => api.runtime.registerOpenApiRoute(descriptor)).not.toThrow();
    });

    it('honors allowReplace:true in strict mode to override an existing descriptor', () => {
      const api = createAccessRuntime();
      api.runtime.enableOpenApiCollisionDetection();

      api.runtime.registerOpenApiRoute({
        method: 'post',
        path: '/items',
        operationId: 'items.create',
      });

      expect(() =>
        api.runtime.registerOpenApiRoute({
          method: 'post',
          path: '/items',
          operationId: 'items.create.v2',
          allowReplace: true,
        }),
      ).not.toThrow();
    });

    it('rejects allowReplace:true that reuses an operationId owned by another route (ARF-08)', () => {
      const api = createAccessRuntime();
      api.runtime.enableOpenApiCollisionDetection();

      const first = { method: 'post' as const, path: '/items', operationId: 'items.create' };
      api.runtime.registerOpenApiRoute(first);

      // A second route on a different path owns operationId="items.lookup"
      api.runtime.registerOpenApiRoute({ method: 'get', path: '/items/{id}', operationId: 'items.lookup' });

      // Replacing the /items POST must not be allowed to steal the foreign operationId.
      try {
        api.runtime.registerOpenApiRoute({
          method: 'post',
          path: '/items',
          operationId: 'items.lookup',
          allowReplace: true,
        });
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(OpenApiCollisionError);
        const collisionErr = err as OpenApiCollisionError;
        expect(collisionErr.collisionKind).toBe('operationId');
        expect(collisionErr.operationId).toBe('items.lookup');
        expect(collisionErr.existing).toEqual({ method: 'get', path: '/items/{id}', operationId: 'items.lookup' });
      }
    });

    it('throws OpenApiCollisionError on duplicate operationId bound to a different path in strict mode', () => {
      const api = createAccessRuntime();
      api.runtime.enableOpenApiCollisionDetection();

      api.runtime.registerOpenApiRoute({
        method: 'get',
        path: '/users',
        operationId: 'shared.list',
      });

      const second = { method: 'get' as const, path: '/admin/users', operationId: 'shared.list' };
      expect(() => api.runtime.registerOpenApiRoute(second)).toThrow(OpenApiCollisionError);

      try {
        api.runtime.registerOpenApiRoute({
          method: 'get',
          path: '/admin/users',
          operationId: 'shared.list',
        });
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(OpenApiCollisionError);
        const collisionErr = err as OpenApiCollisionError;
        expect(collisionErr.collisionKind).toBe('operationId');
        expect(collisionErr.operationId).toBe('shared.list');
      }
    });

    it('throws by default for conflicting method/path registrations (strict-by-default)', () => {
      const api = createAccessRuntime();

      api.runtime.registerOpenApiRoute({
        method: 'get',
        path: '/users',
        operationId: 'users.list.1',
      });

      expect(() =>
        api.runtime.registerOpenApiRoute({
          method: 'get',
          path: '/users',
          operationId: 'users.list.2',
        }),
      ).toThrow(OpenApiCollisionError);
    });

    it('allows conflicting re-registration when OpenApiRegistry is constructed in legacy lenient mode', () => {
      const registry = new OpenApiRegistry({
        rejectConflicts: false,
        rejectDuplicateOperationIds: false,
      });

      registry.register({ method: 'get', path: '/users', operationId: 'users.list.1' });
      expect(() => registry.register({ method: 'get', path: '/users', operationId: 'users.list.2' })).not.toThrow();
    });
  });

  describe('clearOpenApiRoutes', () => {
    it('removes all previously registered routes from the runtime', () => {
      const api = createAccessRuntime();
      api.runtime.registerOpenApiRoute({ method: 'get', path: '/x', operationId: 'x.list' });
      expect(api.runtime.getOpenApiRoutes()).toHaveLength(1);
      api.runtime.clearOpenApiRoutes();
      expect(api.runtime.getOpenApiRoutes()).toHaveLength(0);
    });
  });

  describe('Model/model, data/data, and model/data route collisions in strict mode', () => {
    useMongoTestDatabase();

    const makeModelRouter = (api: ReturnType<typeof createAccessRuntime>, name: string, basePath: string) => {
      const Schema = new mongoose.Schema({ name: String });
      Schema.plugin(permissionsPlugin, { modelName: name });
      const Model = mongoose.model(name, Schema);
      return api.createRouter(Model, {
        basePath,
        operationAccess: false,
        permissionSchema: { name: true },
      });
    };

    it('detects model/model collision on the same basePath in strict mode', () => {
      const api = createAccessRuntime();
      api.runtime.enableOpenApiCollisionDetection();

      makeModelRouter(api, `OpenApiCollisionModelA${++modelCounter}`, '/shared');
      expect(() => makeModelRouter(api, `OpenApiCollisionModelB${++modelCounter}`, '/shared')).toThrow(
        OpenApiCollisionError,
      );
    });

    it('detects data/data collision on the same basePath in strict mode', () => {
      const api = createAccessRuntime();
      api.runtime.enableOpenApiCollisionDetection();

      api.createDataRouter(`OpenApiCollisionDataA${++modelCounter}`, {
        basePath: '/data-shared',
        idField: 'id',
        operationAccess: { list: true, read: true },
        data: [{ id: '1' }],
        permissionSchema: { id: true },
      });

      expect(() =>
        api.createDataRouter(`OpenApiCollisionDataB${++modelCounter}`, {
          basePath: '/data-shared',
          idField: 'id',
          operationAccess: { list: true, read: true },
          data: [{ id: '1' }],
          permissionSchema: { id: true },
        }),
      ).toThrow(OpenApiCollisionError);
    });

    it('detects model/data collision on the same basePath in strict mode', () => {
      const api = createAccessRuntime();
      api.runtime.enableOpenApiCollisionDetection();

      makeModelRouter(api, `OpenApiCollisionMixModel${++modelCounter}`, '/mix');
      expect(() =>
        api.createDataRouter(`OpenApiCollisionMixData${++modelCounter}`, {
          basePath: '/mix',
          idField: 'id',
          operationAccess: { list: true, read: true },
          data: [{ id: '1' }],
          permissionSchema: { id: true },
        }),
      ).toThrow(OpenApiCollisionError);
    });
  });

  describe('swagger UI HTML embedding safety', () => {
    it('escapes user-controlled title, css url, and bundle url in the docs HTML', async () => {
      const api = createAccessRuntime();
      const app = express();
      const malicious = `<script>alert('xss')</script>"'`;
      app.use(
        createOpenApiRouter(api.runtime, {
          title: malicious,
          swaggerUiCssUrl: `javascript:alert(1)`,
          swaggerUiBundleUrl: `https://evil.example/x.js" onload="alert(2)`,
          docsPath: '/docs',
        }),
      );

      const response = await request(app).get('/docs').expect(200);
      const html = response.text;

      // The <script> tags in the title are escaped (no raw open tag from injection)
      expect(html).not.toMatch(/<title><script>alert/);
      // css href javascript: scheme is escaped into harmless href="javascript:alert(1)"
      // since escapeHtml escapes quotes, the URL becomes a literal string attribute value.
      expect(html).toContain('href="javascript:alert(1)"');
      // bundle URL with embedded quotes is broken (quotes escaped) so no onload handler invokes.
      // The injected `onload="alert(2)"` portion is escaped into entity form, not parseable.
      expect(html).not.toMatch(/<script[^>]*onload="alert\(2\)"/);
    });

    it('renders docs at the relative path derived from jsonPath and docsPath', async () => {
      const api = createAccessRuntime();
      const app = express();
      app.use(
        createOpenApiRouter(api.runtime, {
          jsonPath: '/api/openapi.json',
          docsPath: '/api/docs',
          title: 'Relative Test',
        }),
      );

      const response = await request(app).get('/api/docs').expect(200);
      // The docs HTML must refer to the spec at relative path 'openapi.json'
      // (JSON.stringify inserts double quotes around the string value).
      expect(response.text).toMatch(/url:\s*"openapi\.json"/);
    });

    it('safely embeds servers data in the OpenAPI JSON spec', async () => {
      const api = createAccessRuntime();
      api.runtime.registerOpenApiRoute({
        method: 'get',
        path: '/items',
        operationId: 'items.list',
      });

      const app = express();
      app.use(
        createOpenApiRouter(api.runtime, {
          title: 'Servers Test',
          version: '1.0.0',
          servers: [
            {
              url: 'https://api.example.com</script>',
              description: 'Production <b>server</b>',
            },
          ],
        }),
      );

      const response = await request(app).get('/openapi.json').expect(200);
      // JSON spec preserves server data verbatim (it's JSON, not HTML)
      expect(response.body.servers[0].url).toContain('</script>');
      expect(response.body.servers[0].description).toContain('<b>server</b>');
      // Make sure the JSON itself is well-formed (parsing succeeded via supertest json()).
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('escapes </script>, quotes, ampersands, and Unicode separators in jsonPath inline script (ARF-08)', async () => {
      const api = createAccessRuntime();
      const app = express();
      // Construct a jsonPath containing characters that would terminate or
      // otherwise break an inline <script>: a literal </script> sequence,
      // double quotes, an ampersand, and the U+2028 / U+2029 line/paragraph
      // separator characters that are valid in JSON but terminate string
      // literals in JavaScript pre-ES2019. We use `alert_1_` rather than
      // `alert(1)` because Express' path-to-regexp rejects parentheses.
      const maliciousPath = `/evil</script>alert_1_</script>&q="X"\u2028\u2029.json`;
      app.use(
        createOpenApiRouter(api.runtime, {
          jsonPath: maliciousPath,
          docsPath: '/docs',
          title: 'Inline Script Test',
        }),
      );

      const response = await request(app).get('/docs').expect(200);
      const html = response.text;

      // The inline script section must not contain a literal </script>
      // sequence other than the legitimate closing tags of the two script
      // elements emitted by the template (the bundle src script and the
      // inline config script).
      const scriptCloseCount = (html.match(/<\/script>/g) ?? []).length;
      expect(scriptCloseCount).toBe(2);

      // The inline `url:` payload must not inline a raw `</script` that
      // could close the script element early.
      expect(html).not.toMatch(/url:\s*"\/evil<\/script/);
      // The literal U+2028 / U+2029 characters must not be embedded raw;
      // they should be replaced by JS string escape sequences.
      expect(html).not.toMatch(/\u2028|\u2029/);
      // The escape helper should have produced the JSON string with JS escape
      // sequences replacing the dangerous characters.
      expect(html).toContain('\\u003c');
      expect(html).toContain('\\u003e');
      expect(html).toContain('\\u0026');
      // The original dangerous path value must round-trip back to its raw
      // form when the script is parsed as JSON. The `/` inside `</script>`
      // should have been escaped to `\\/` so the inline script stays
      // intact, while the leading path chars survive verbatim after the
      // opening quote. `getRelativeSpecPath` strips the leading `/`, so the
      // embedded JSON begins right at `evil`.
      expect(html).toContain('"evil\\u003c');
      expect(html).toContain('\\/script');
    });
  });
});
