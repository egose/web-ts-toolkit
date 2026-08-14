import 'reflect-metadata';
import express, { type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setGlobalOptions } from '@web-ts-toolkit/access-router';
import { EgoseFactoryStatic } from '../src/factory';
import { GlobalPermissions, Module, Option, Router, RouterOptions } from '../src/decorators';

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

    await request(app).get('/members/new').expect(500);
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

    await request(app).get('/property-members/new').expect(500);
    await request(app).post('/property-members/property-query').send({}).expect(500);
    await request(app).post('/property-members/__query').send({}).expect(404);
  });
});
