import 'reflect-metadata';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { EgoseFactoryStatic, Module, Router, RouterOptions } from '../src';

describe('OpenAPI module registration scope', () => {
  it('composes nested synchronous prefix scopes and restores the outer scope after a throw', () => {
    const runtime = EgoseFactoryStatic.create().runtime.runtime;
    runtime.withOpenApiPathPrefix('/outer', () => {
      expect(() =>
        runtime.withOpenApiPathPrefix('/inner/', () => {
          runtime.registerOpenApiRoute({ method: 'get', path: '/one' });
          throw new Error('construction failed');
        }),
      ).toThrow('construction failed');
      runtime.registerOpenApiRoute({ method: 'get', path: '/two' });
    });
    runtime.registerOpenApiRoute({ method: 'get', path: '/three' });
    expect(runtime.getOpenApiRoutes().map((route) => route.path)).toEqual(['/outer/inner/one', '/outer/two', '/three']);
  });

  it('composes shared-runtime roots without touching prior routes or direct registrations', async () => {
    const factory = EgoseFactoryStatic.create();
    const runtime = factory.runtime.runtime;
    runtime.registerOpenApiRoute({ method: 'get', path: '/prior' });
    const prior = runtime.getOpenApiRoutes()[0];
    const app = express();
    app.use(express.json());
    for (const basePath of ['/api', '/internal']) {
      class Root {}
      Router({ basePath: '/batch', operationAccess: true })(Root);
      class Mod {}
      Module({ routers: [Root], options: { basePath } })(Mod);
      factory.bootstrap(Mod, app);
      await request(app).post(`${basePath}/batch`).send([]).expect(200);
    }
    runtime.registerOpenApiRoute({ method: 'get', path: '/after' });
    expect(runtime.getOpenApiRoutes().map((route) => route.path)).toEqual([
      '/prior',
      '/api/batch',
      '/internal/batch',
      '/after',
    ]);
    expect(runtime.getOpenApiRoutes()[0]).toBe(prior);
    expect(prior.path).toBe('/prior');
  });

  it('checks collisions at the final prefixed path and restores the registration scope on failure', () => {
    const factory = EgoseFactoryStatic.create();
    const runtime = factory.runtime.runtime;
    runtime.registerOpenApiRoute({ method: 'post', path: '/api/batch', summary: 'different' });
    const before = runtime.createBootstrapSnapshot();
    class Root {}
    Router({ basePath: '/batch' })(Root);
    class Mod {}
    Module({ routers: [Root], options: { basePath: '/api' } })(Mod);
    const app = express();
    expect(() => factory.bootstrap(Mod, app)).toThrow(/OpenAPI route collision/);
    expect(runtime.createBootstrapSnapshot()).toEqual(before);
    expect(app.router.stack).toHaveLength(0);
    runtime.registerOpenApiRoute({ method: 'get', path: '/after' });
    expect(runtime.getOpenApiRoutes().at(-1)?.path).toBe('/after');
  });

  it.each(['/api', '/api/', '/api/tenant'])(
    'rejects a default-provider parentPath workaround %s with rollback',
    (parentPath) => {
      const factory = EgoseFactoryStatic.create();
      const before = factory.runtime.runtime.createBootstrapSnapshot();
      const model = new mongoose.Mongoose().model('MountItem', new mongoose.Schema({ name: String }));
      class Defaults {}
      RouterOptions({ parentPath })(Defaults);
      class Items {}
      Router(model, { basePath: '/items' })(Items);
      class Mod {}
      Module({ routers: [Items], routerOptions: [Defaults], options: { basePath: '/api/' } })(Mod);
      expect(() => factory.bootstrap(Mod, express())).toThrow(/parentPath repeats module mount/);
      expect(factory.runtime.runtime.createBootstrapSnapshot()).toEqual(before);
    },
  );

  it('compares complete mount segments and emits proxy servers separately', () => {
    const factory = EgoseFactoryStatic.create();
    const model = new mongoose.Mongoose().model('ApiaryItem', new mongoose.Schema({ name: String }));
    class Items {}
    Router(model, { basePath: '/items', parentPath: '/apiary' })(Items);
    class Mod {}
    Module({ routers: [Items], options: { basePath: '/api/' } })(Mod);
    factory.bootstrap(Mod, express());
    const spec = factory.runtime.runtime.getOpenApiSpec({ title: 'test', version: '1', servers: [{ url: '/ext' }] });
    expect(spec.paths).toHaveProperty('/api/apiary/items');
    expect(spec.servers).toEqual([{ url: '/ext' }]);
  });
});
