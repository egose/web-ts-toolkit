import 'reflect-metadata';
import express, { type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAccessRuntime, setGlobalOptions } from '@web-ts-toolkit/access-router';
import { EgoseFactoryStatic } from '../src/factory';
import { GlobalPermissions, Module, Option, RouteGuard, Router, RouterOptions } from '../src/decorators';
import { applyMethodDecorator } from './helpers';

const createErrorRuntime = () => {
  const routes = express.Router();
  routes.get('/client-error', (req, res, next) => {
    next(Object.assign(new Error('Bad client input'), { status: 400, secret: 'hidden-client' })); // pragma: allowlist secret
  });
  routes.get('/sensitive-error', (req, res, next) => {
    next(Object.assign(new Error('database password leaked'), { status: 500, secret: 'hidden-server' })); // pragma: allowlist secret
  });
  routes.get('/invalid-status', (req, res, next) => {
    next(Object.assign(new Error('invalid status'), { status: 200 }));
  });
  routes.get('/headers-sent', (req, res, next) => {
    res.write('partial');
    next(new Error('after headers'));
  });

  return Object.assign(() => (req: Request, res: Response, next: NextFunction) => next(), {
    setGlobalOptions: vi.fn(),
    setGlobalOption: vi.fn(),
    getGlobalOption: vi.fn(),
    setModelOptions: vi.fn(),
    setModelOption: vi.fn(),
    getModelOption: vi.fn(),
    setDefaultModelOptions: vi.fn(),
    setDefaultModelOption: vi.fn(),
    getDefaultModelOption: vi.fn(),
    registerModelInstance: vi.fn(),
    createRouter: vi.fn(() => ({ routes })),
  } as any);
};

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });
};

afterEach(() => {
  resetGlobalOptions();
  mongoose.deleteModel(/Deco.*RouteUser/);
});

describe('EgoseFactory route construction options', () => {
  it('scopes opt-in error handling to package routes and returns safe 404 payloads', async () => {
    class UserRouter {}
    Router('DecoErrorRouteUser')(UserRouter);

    class TestModule {}
    Module({ routers: [UserRouter], options: { basePath: '/api', handleErrors: true } })(TestModule);

    const app = express();
    app.get('/before', (req, res) => res.json({ route: 'before' }));
    EgoseFactoryStatic.create(createErrorRuntime()).bootstrap(TestModule, app);
    app.get('/after', (req, res) => res.json({ route: 'after' }));

    await request(app).get('/api/missing').expect(404, { message: 'Not Found' });
    await request(app).get('/before').expect(200, { route: 'before' });
    await request(app).get('/after').expect(200, { route: 'after' });
  });

  it('sanitizes opt-in package error responses and validates error status codes', async () => {
    class UserRouter {}
    Router('DecoSensitiveRouteUser')(UserRouter);

    class TestModule {}
    Module({ routers: [UserRouter], options: { basePath: '/api', handleErrors: true } })(TestModule);

    const app = express();
    EgoseFactoryStatic.create(createErrorRuntime()).bootstrap(TestModule, app);

    await request(app).get('/api/client-error').expect(400, { message: 'Bad client input' });
    await request(app).get('/api/sensitive-error').expect(500, { message: 'Internal Server Error' });
    await request(app).get('/api/invalid-status').expect(500, { message: 'Internal Server Error' });
  });

  it('delegates opt-in package errors after response headers have been sent', async () => {
    class UserRouter {}
    Router('DecoHeadersRouteUser')(UserRouter);

    class TestModule {}
    Module({ routers: [UserRouter], options: { basePath: '/api', handleErrors: true } })(TestModule);

    const app = express();
    EgoseFactoryStatic.create(createErrorRuntime()).bootstrap(TestModule, app);

    await new Promise<void>((resolve, reject) => {
      app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
        try {
          expect(err).toBeInstanceOf(Error);
          expect((err as Error).message).toBe('after headers');
          expect(res.headersSent).toBe(true);
          resolve();
        } catch (error) {
          reject(error);
        }
      });

      request(app)
        .get('/api/headers-sent')
        .end(() => undefined);
    });
  });

  it('registers exact same-name model instances from separate connections on isolated runtimes', async () => {
    const modelName = 'DecoRuntimeOwnedRouteUser';
    const connectionA = mongoose.createConnection();
    const connectionB = mongoose.createConnection();

    try {
      const modelA = connectionA.model(modelName, new mongoose.Schema({ name: String }, { bufferCommands: false }));
      const modelB = connectionB.model(modelName, new mongoose.Schema({ name: String }, { bufferCommands: false }));

      class UserRouterA {}
      Router(modelA, { basePath: '/runtime-a' })(UserRouterA);

      class UserRouterB {}
      Router(modelB, { basePath: '/runtime-b' })(UserRouterB);

      class ModuleA {}
      Module({ routers: [UserRouterA] })(ModuleA);

      class ModuleB {}
      Module({ routers: [UserRouterB] })(ModuleB);

      const resultA = EgoseFactoryStatic.create().bootstrap(ModuleA, express());
      const resultB = EgoseFactoryStatic.create().bootstrap(ModuleB, express());

      expect(resultA.runtime.getModelInstance(modelName)).toBe(modelA);
      expect(resultB.runtime.getModelInstance(modelName)).toBe(modelB);
      expect(resultA.runtime.getModelInstance(modelName)).not.toBe(resultB.runtime.getModelInstance(modelName));
      expect(resultA.runtime.getModelOptions(modelName).basePath).toBe('/runtime-a');
      expect(resultB.runtime.getModelOptions(modelName).basePath).toBe('/runtime-b');
      expect(mongoose.models[modelName]).toBeUndefined();
    } finally {
      await connectionA.close();
      await connectionB.close();
    }
  });

  it('keeps same-name model options and global permissions isolated across factories', () => {
    const modelName = 'DecoIsolatedRouteUser';
    mongoose.model(modelName, new mongoose.Schema({ name: String }, { bufferCommands: false }));

    class UserRouter {}
    Router(modelName)(UserRouter);

    class OptionsA {}
    RouterOptions(modelName, { basePath: '/runtime-a' })(OptionsA);

    class OptionsB {}
    RouterOptions(modelName, { basePath: '/runtime-b' })(OptionsB);

    class ModuleA {
      permissions() {
        return ['runtime-a'];
      }
    }
    GlobalPermissions()(
      ModuleA.prototype,
      'permissions',
      Object.getOwnPropertyDescriptor(ModuleA.prototype, 'permissions')!,
    );
    Module({ routers: [UserRouter], routerOptions: [OptionsA] })(ModuleA);

    class ModuleB {
      permissions() {
        return ['runtime-b'];
      }
    }
    GlobalPermissions()(
      ModuleB.prototype,
      'permissions',
      Object.getOwnPropertyDescriptor(ModuleB.prototype, 'permissions')!,
    );
    Module({ routers: [UserRouter], routerOptions: [OptionsB] })(ModuleB);

    const resultA = EgoseFactoryStatic.create().bootstrap(ModuleA, express());
    const resultB = EgoseFactoryStatic.create().bootstrap(ModuleB, express());

    expect(resultA.runtime).not.toBe(resultB.runtime);
    expect(resultA.runtime.getModelOptions(modelName).basePath).toBe('/runtime-a');
    expect(resultB.runtime.getModelOptions(modelName).basePath).toBe('/runtime-b');
    expect(resultA.runtime.getGlobalOption('globalPermissions')?.()).toEqual(['runtime-a']);
    expect(resultB.runtime.getGlobalOption('globalPermissions')?.()).toEqual(['runtime-b']);
  });

  it('applies default and model-specific route options before mounting routes', async () => {
    mongoose.model('DecoRouteUser', new mongoose.Schema({ name: String }, { bufferCommands: false }));

    class DefaultOptions {}
    RouterOptions({
      parentPath: '/tenant',
      idParam: 'defaultId',
      queryRouteSegment: 'query-default',
      mutationRouteSegment: 'mutate-default',
      operationAccess: true,
    })(DefaultOptions);

    class UserOptions {}
    RouterOptions('DecoRouteUser', {
      basePath: '/members',
      idParam: 'memberId',
      queryRouteSegment: 'search',
      mutationRouteSegment: 'mutate',
    })(UserOptions);

    class UserRouter {}
    Router('DecoRouteUser')(UserRouter);

    class TestModule {}
    Module({ routers: [UserRouter], routerOptions: [DefaultOptions, UserOptions] })(TestModule);

    const app = express();
    app.use(express.json());
    const result = EgoseFactoryStatic.create().bootstrap(TestModule, app);

    const options = result.runtime.getModelOptions('DecoRouteUser');
    expect(options.parentPath).toBe('/tenant');
    expect(options.basePath).toBe('/members');
    expect(options.idParam).toBe('memberId');
    expect(options.queryRouteSegment).toBe('search');
    expect(options.mutationRouteSegment).toBe('mutate');

    await request(app).get('/members/new').expect(200);
    await request(app).post('/members/search').send({}).expect(500);
    await request(app).get('/tenant/members/:memberId').expect(404);
    await request(app).get('/tenant/members/:defaultId').expect(404);
  });

  it('applies property-based build-time options before mounting routes', async () => {
    mongoose.model('DecoPropertyRouteUser', new mongoose.Schema({ name: String }, { bufferCommands: false }));

    class UserOptions {
      path = '/property-members';
      id = 'propertyId';
      querySegment = 'property-query';
      mutationSegment = 'property-mutate';
    }
    Option('basePath')(UserOptions.prototype, 'path');
    Option('idParam')(UserOptions.prototype, 'id');
    Option('queryRouteSegment')(UserOptions.prototype, 'querySegment');
    Option('mutationRouteSegment')(UserOptions.prototype, 'mutationSegment');
    RouterOptions('DecoPropertyRouteUser', { operationAccess: true })(UserOptions);

    class UserRouter {}
    Router('DecoPropertyRouteUser')(UserRouter);

    class TestModule {}
    Module({ routers: [UserRouter], routerOptions: [UserOptions] })(TestModule);

    const app = express();
    app.use(express.json());
    const result = EgoseFactoryStatic.create().bootstrap(TestModule, app);

    const options = result.runtime.getModelOptions('DecoPropertyRouteUser');
    expect(options.basePath).toBe('/property-members');
    expect(options.idParam).toBe('propertyId');
    expect(options.queryRouteSegment).toBe('property-query');
    expect(options.mutationRouteSegment).toBe('property-mutate');

    await request(app).get('/property-members/new').expect(200);
    await request(app).post('/property-members/property-query').send({}).expect(500);
    await request(app).post('/property-members/__query').send({}).expect(404);
  });

  it('applies default providers before model providers regardless of array order', async () => {
    const bootstrapPermutation = (modelName: string, modelFirst: boolean) => {
      mongoose.model(modelName, new mongoose.Schema({ name: String }, { bufferCommands: false }));

      class DefaultOptions {
        denyNew() {
          return false;
        }
      }
      applyMethodDecorator(RouteGuard('new'), DefaultOptions.prototype, 'denyNew');
      RouterOptions({
        parentPath: '/tenant',
        idParam: 'defaultId',
        queryRouteSegment: 'query-default',
        mutationRouteSegment: 'mutate-default',
        operationAccess: true,
      })(DefaultOptions);

      class UserOptions {}
      RouterOptions(modelName, {
        basePath: '/members',
        queryRouteSegment: 'search',
        mutationRouteSegment: 'mutate',
      })(UserOptions);

      class UserRouter {}
      Router(modelName, { idParam: 'routerId' })(UserRouter);

      class TestModule {}
      Module({
        routers: [UserRouter],
        routerOptions: modelFirst ? [UserOptions, DefaultOptions] : [DefaultOptions, UserOptions],
      })(TestModule);

      const runtime = createAccessRuntime();
      // Caller-supplied initial defaults that the providers must override.
      runtime.setDefaultModelOptions({
        parentPath: '/stale',
        idParam: 'staleId',
        queryRouteSegment: 'query-stale',
        mutationRouteSegment: 'mutate-stale',
        operationAccess: true,
      });
      const app = express();
      app.use(express.json());
      const result = EgoseFactoryStatic.create(runtime).bootstrap(TestModule, app);
      return { result, app, modelName };
    };

    const permutations = [
      bootstrapPermutation('DecoProviderOrderModelFirstRouteUser', true),
      bootstrapPermutation('DecoProviderOrderDefaultFirstRouteUser', false),
    ];

    const pickRouteParams = (options: Record<string, unknown>) => ({
      parentPath: options.parentPath,
      basePath: options.basePath,
      idParam: options.idParam,
      queryRouteSegment: options.queryRouteSegment,
      mutationRouteSegment: options.mutationRouteSegment,
    });

    for (const { result, app, modelName } of permutations) {
      const options = result.runtime.getModelOptions(modelName) as unknown as Record<string, unknown>;
      // Default provider wins over caller-supplied initial defaults; model
      // provider wins over the default provider; router-specific options win
      // over both providers.
      expect(options.parentPath).toBe('/tenant');
      expect(options.basePath).toBe('/members');
      expect(options.idParam).toBe('routerId');
      expect(options.queryRouteSegment).toBe('search');
      expect(options.mutationRouteSegment).toBe('mutate');

      // The default provider's denying route guard applies in both orders.
      const guard = result.runtime.getModelOption(modelName, 'operationAccess.new' as never) as unknown;
      expect(typeof guard).toBe('function');
      expect(await (guard as (this: unknown, perms: unknown) => unknown).call({}, { has: () => true })).toBe(false);

      await request(app).get('/members/new').expect(401);
    }

    // Both valid array orders compile identical configured route parameters.
    expect(
      pickRouteParams(
        permutations[0].result.runtime.getModelOptions(permutations[0].modelName) as unknown as Record<string, unknown>,
      ),
    ).toEqual(
      pickRouteParams(
        permutations[1].result.runtime.getModelOptions(permutations[1].modelName) as unknown as Record<string, unknown>,
      ),
    );
  });

  it('still rejects duplicate default and model RouterOptions providers', () => {
    const modelName = 'DecoProviderOrderDupRouteUser';
    mongoose.model(modelName, new mongoose.Schema({ name: String }, { bufferCommands: false }));

    class DefaultA {}
    RouterOptions({ operationAccess: true })(DefaultA);
    class DefaultB {}
    RouterOptions({ operationAccess: true })(DefaultB);

    class ModelA {}
    RouterOptions(modelName, { basePath: '/a' })(ModelA);
    class ModelB {}
    RouterOptions(modelName, { basePath: '/b' })(ModelB);

    class UserRouter {}
    Router(modelName)(UserRouter);

    class DupDefaultModule {}
    Module({ routers: [UserRouter], routerOptions: [DefaultA, DefaultB] })(DupDefaultModule);
    expect(() => EgoseFactoryStatic.create().bootstrap(DupDefaultModule, express())).toThrow(
      /duplicate default RouterOptions provider/,
    );

    class DupModelModule {}
    Module({ routers: [UserRouter], routerOptions: [ModelA, ModelB] })(DupModelModule);
    expect(() => EgoseFactoryStatic.create().bootstrap(DupModelModule, express())).toThrow(
      /duplicate RouterOptions provider for model/,
    );
  });

  describe('BDECO-03 scoped runtime initialization', () => {
    it('does not invoke module permissions resolver on unrelated host endpoints', async () => {
      let calls = 0;
      class HealthRouter {}
      Router({ basePath: '/health', operationAccess: true })(HealthRouter);
      class TestModule {}
      Module({
        routers: [HealthRouter],
        options: {
          basePath: '/api',
          handleErrors: true,
          globalPermissions: () => {
            calls++;
            return [];
          },
        },
      })(TestModule);

      const app = express();
      app.use(express.json());
      app.get('/before', (req, res) => res.json({ route: 'before' }));
      const result = EgoseFactoryStatic.create().bootstrap(TestModule, app);
      app.get('/after', (req, res) => res.json({ route: 'after' }));
      app.get('/outside', (req, res) => res.json({ route: 'outside' }));

      // Meaningful ownership: single host mount owns the module router with
      // init scoped inside it.
      const getStack = (a: any) => a._router?.stack ?? a.router?.stack ?? null;
      expect(getStack(app)).not.toBeNull();
      expect(result.runtime).toBeDefined();
      expect(result.router).toBeDefined();

      await request(app).get('/before').expect(200);
      expect(calls).toBe(0);
      await request(app).get('/after').expect(200);
      expect(calls).toBe(0);
      await request(app).get('/outside').expect(200);
      expect(calls).toBe(0);

      await request(app).post('/api/health').send([]);
      expect(calls).toBe(1);
    });

    it('two isolated modules on one app use only their owning runtime', async () => {
      let callsA = 0;
      let callsB = 0;
      class HealthA {}
      Router({ basePath: '/health', operationAccess: true })(HealthA);
      class ModA {}
      Module({
        routers: [HealthA],
        options: {
          basePath: '/a',
          handleErrors: true,
          globalPermissions: () => {
            callsA++;
            return [];
          },
        },
      })(ModA);

      class HealthB {}
      Router({ basePath: '/health', operationAccess: true })(HealthB);
      class ModB {}
      Module({
        routers: [HealthB],
        options: {
          basePath: '/b',
          handleErrors: true,
          globalPermissions: () => {
            callsB++;
            return [];
          },
        },
      })(ModB);

      const app = express();
      app.use(express.json());
      const factoryA = EgoseFactoryStatic.create();
      const factoryB = EgoseFactoryStatic.create();
      const retA = factoryA.bootstrap(ModA, app);
      const retB = factoryB.bootstrap(ModB, app);
      expect(retA.runtime).not.toBe(retB.runtime);
      app.get('/outside', (req, res) => res.json({ ok: true }));

      await request(app).post('/a/health').send([]);
      expect(callsA).toBe(1);
      expect(callsB).toBe(0);

      await request(app).post('/b/health').send([]);
      expect(callsA).toBe(1);
      expect(callsB).toBe(1);

      await request(app).get('/outside').expect(200);
      expect(callsA).toBe(1);
      expect(callsB).toBe(1);
    });

    it('sync init failure inside module follows its safe error boundary', async () => {
      let outerCalled = false;
      class HealthRouter {}
      Router({ basePath: '/health', operationAccess: true })(HealthRouter);
      class TestModule {}
      Module({
        routers: [HealthRouter],
        options: {
          basePath: '/api',
          handleErrors: true,
          globalPermissions: () => {
            throw Object.assign(new Error('database password leaked'), { status: 500 });
          },
        },
      })(TestModule);

      const app = express();
      app.use(express.json());
      EgoseFactoryStatic.create().bootstrap(TestModule, app);
      app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
        outerCalled = true;
        next(err);
      });

      const res = await request(app).post('/api/health').send([]);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: 'Internal Server Error' });
      expect(JSON.stringify(res.body)).not.toContain('password');
      expect(outerCalled).toBe(false);
    });

    it('async init failure inside module follows its safe error boundary and preserves 400', async () => {
      let outerCalled = false;
      class HealthRouter {}
      Router({ basePath: '/health', operationAccess: true })(HealthRouter);
      class TestModule {}
      Module({
        routers: [HealthRouter],
        options: {
          basePath: '/api',
          handleErrors: true,
          globalPermissions: async () => {
            throw Object.assign(new Error('bad client input'), { status: 400 });
          },
        },
      })(TestModule);

      const app = express();
      app.use(express.json());
      EgoseFactoryStatic.create().bootstrap(TestModule, app);
      app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
        outerCalled = true;
        next(err);
      });

      const res = await request(app).post('/api/health').send([]);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'bad client input' });
      expect(outerCalled).toBe(false);
    });

    it('handleErrors:false delegates scoped init failures to the host', async () => {
      let hostSeen: unknown = null;
      class HealthRouter {}
      Router({ basePath: '/health', operationAccess: true })(HealthRouter);
      class TestModule {}
      Module({
        routers: [HealthRouter],
        options: {
          basePath: '/api',
          globalPermissions: () => {
            throw Object.assign(new Error('scoped init boom'), { status: 500 });
          },
        },
      })(TestModule);

      const app = express();
      app.use(express.json());
      EgoseFactoryStatic.create().bootstrap(TestModule, app);
      app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
        hostSeen = err;
        res.status(500).json({ handled: 'host' });
      });

      const res = await request(app).post('/api/health').send([]);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ handled: 'host' });
      expect(hostSeen).toBeInstanceOf(Error);
      expect((hostSeen as Error).message).toBe('scoped init boom');
    });

    it('failed init requests do not duplicate initialization on retry', async () => {
      let calls = 0;
      let shouldFail = true;
      class HealthRouter {}
      Router({ basePath: '/health', operationAccess: true })(HealthRouter);
      class TestModule {}
      Module({
        routers: [HealthRouter],
        options: {
          basePath: '/api',
          handleErrors: true,
          globalPermissions: () => {
            calls++;
            if (shouldFail) throw Object.assign(new Error('flaky init'), { status: 500 });
            return [];
          },
        },
      })(TestModule);

      const app = express();
      app.use(express.json());
      const result = EgoseFactoryStatic.create().bootstrap(TestModule, app);
      const inner = (result.router as any).stack as any[];
      expect(inner.filter((l: any) => /setCore/i.test(l.handle?.name ?? l.name ?? ''))).toHaveLength(1);

      await request(app).post('/api/health').send([]).expect(500);
      expect(calls).toBe(1);
      shouldFail = false;
      await request(app).post('/api/health').send([]).expect(200);
      expect(calls).toBe(2);
      // Still exactly one init layer and one host publication.
      expect(inner.filter((l: any) => /setCore/i.test(l.handle?.name ?? l.name ?? ''))).toHaveLength(1);
    });
  });
});
