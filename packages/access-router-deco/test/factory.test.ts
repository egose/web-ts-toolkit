import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@web-ts-toolkit/access-router', () => {
  const mockAcl = vi.fn(() => (req: any, res: any, next: any) => next());
  mockAcl.setGlobalOptions = vi.fn();
  mockAcl.setGlobalOption = vi.fn();
  mockAcl.getGlobalOption = vi.fn(() => undefined);
  mockAcl.setModelOptions = vi.fn();
  mockAcl.setModelOption = vi.fn();
  mockAcl.getModelOption = vi.fn(() => undefined);
  mockAcl.setDefaultModelOptions = vi.fn();
  mockAcl.setDefaultModelOption = vi.fn();
  mockAcl.getDefaultModelOption = vi.fn(() => undefined);
  mockAcl.registerModelInstance = vi.fn();
  mockAcl.createRouter = vi.fn(() => ({ routes: vi.fn() }));
  return { default: mockAcl, createAccessRuntime: vi.fn(() => mockAcl) };
});

import acl, { createAccessRuntime } from '@web-ts-toolkit/access-router';
import { EgoseFactory, EgoseFactoryStatic } from '../src/factory';
import {
  Module,
  Router,
  RouterOptions,
  GlobalPermissions,
  DocPermissions,
  BaseFilter,
  OverrideFilter,
  Validate,
  Prepare,
  Transform,
  AfterPersist,
  Decorate,
  DecorateAll,
  RouteGuard,
  Identifier,
  BeforeDelete,
  AfterDelete,
  Option,
  Request,
  Document,
  Permissions,
  Context,
  Filter,
} from '../src/decorators';
import { ARGS_METADATA, HookParamtypes } from '../src/constants';
import { applyMethodDecorator, applyParameterDecorator } from './helpers';

const mockAcl = vi.mocked(acl);
const mockCreateAccessRuntime = vi.mocked(createAccessRuntime);

function createMockExpressApp() {
  return { use: vi.fn() } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EgoseFactory', () => {
  describe('bootstrap', () => {
    it('should call acl.setGlobalOptions without decorator-only module options', () => {
      const TestModule = class {};
      Module({ routers: [], options: { basePath: '/api', handleErrors: false, requestPermissionField: 'perms' } })(
        TestModule,
      );

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setGlobalOptions).toHaveBeenCalledWith({ requestPermissionField: 'perms' });
    });

    it('should mount acl() middleware on the express app', () => {
      const TestModule = class {};
      Module({ routers: [] })(TestModule);

      const app = createMockExpressApp();
      EgoseFactory.bootstrap(TestModule, app);
      expect(mockAcl).toHaveBeenCalled();
      expect(app.use).toHaveBeenCalled();
    });

    it('should return the bound runtime and mounted router', () => {
      const TestModule = class {};
      Module({ routers: [] })(TestModule);

      const result = EgoseFactory.bootstrap(TestModule, createMockExpressApp());

      expect(result.runtime).toBe(mockAcl);
      expect(result.router).toBeDefined();
    });

    it('should reject duplicate bootstrap for the same module and app', () => {
      const TestModule = class {};
      Module({ routers: [] })(TestModule);
      const app = createMockExpressApp();
      const factory = EgoseFactoryStatic.create();

      factory.bootstrap(TestModule, app);

      expect(() => factory.bootstrap(TestModule, app)).toThrow(/already called/);
    });

    it('should allow retrying the same module and app after validation fails before mounting', () => {
      class UserRouter {
        handler(value: any) {
          return value;
        }
      }
      applyMethodDecorator(DocPermissions('read'), UserRouter.prototype, 'handler');
      applyParameterDecorator(Filter(), UserRouter.prototype, 'handler', 0);
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);
      const app = createMockExpressApp();
      const factory = EgoseFactoryStatic.create();

      expect(() => factory.bootstrap(TestModule, app)).toThrow(/unsupported parameter type FILTER/);
      expect(app.use).not.toHaveBeenCalled();

      Reflect.defineMetadata(ARGS_METADATA, [{ index: 0, type: HookParamtypes.DOCUMENT }], UserRouter, 'handler');

      expect(() => factory.bootstrap(TestModule, app)).not.toThrow();
      expect(app.use).toHaveBeenCalled();
    });

    it('should instantiate decorated module, router options, and model routers once per bootstrap', () => {
      const constructorCalls: string[] = [];

      class UserRouter {
        constructor() {
          constructorCalls.push('router');
        }
      }
      Router('User')(UserRouter);

      class DefaultOptions {
        constructor() {
          constructorCalls.push('default-options');
        }
      }
      RouterOptions({})(DefaultOptions);

      class UserOptions {
        constructor() {
          constructorCalls.push('model-options');
        }
      }
      RouterOptions('User', {})(UserOptions);

      class TestModule {
        constructor() {
          constructorCalls.push('module');
        }
      }
      Module({ routers: [UserRouter], routerOptions: [DefaultOptions, UserOptions] })(TestModule);

      EgoseFactoryStatic.create().bootstrap(TestModule, createMockExpressApp());

      expect(constructorCalls).toEqual(['module', 'default-options', 'model-options', 'router']);
    });

    it('should create model router for @Router decorated classes', () => {
      const UserRouter = class {};
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOptions).toHaveBeenCalledWith('User', {});
      expect(mockAcl.createRouter).toHaveBeenCalledWith('User', {});
    });

    it('should reject inherited or generic string metadata as router identity before construction', () => {
      let childCtorCalled = false;
      class BaseRouter {}
      Router('Base')(BaseRouter);
      class ChildRouter extends BaseRouter {
        constructor() {
          super();
          childCtorCalled = true;
        }
      }
      Reflect.defineMetadata('__router__', true, ChildRouter);
      Reflect.defineMetadata('__router_model__', 'Wrong', ChildRouter);
      Reflect.defineMetadata('__router_options__', { basePath: '/wrong' }, ChildRouter);

      class TestModule {}
      Module({ routers: [ChildRouter] })(TestModule);

      const app = createMockExpressApp();
      expect(() => EgoseFactoryStatic.create().bootstrap(TestModule, app)).toThrow(
        /Invalid module "TestModule": class "ChildRouter" in "routers" array.*inherited.*expected own @Router/,
      );
      expect(childCtorCalled).toBe(false);
      expect(mockAcl.setModelOptions).not.toHaveBeenCalled();
      expect(mockAcl.createRouter).not.toHaveBeenCalled();
      expect(mockAcl.setGlobalOptions).not.toHaveBeenCalled();
      expect(app.use).not.toHaveBeenCalled();
    });

    it('should create model router with exact Mongoose model instances', () => {
      const model = Object.assign(vi.fn(), { modelName: 'User', schema: {} }) as any;
      const UserRouter = class {};
      Router(model)(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOptions).toHaveBeenCalledWith('User', {});
      expect(mockAcl.createRouter).toHaveBeenCalledWith(model, {});
    });

    it('should create root router for @Router with options', () => {
      const HealthRouter = class {};
      Router({ basePath: '/health' })(HealthRouter);

      const TestModule = class {};
      Module({ routers: [HealthRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.createRouter).toHaveBeenCalledWith({ basePath: '/health' });
    });

    it('should call setDefaultModelOptions for @RouterOptions', () => {
      const DefaultOpts = class {};
      RouterOptions({ listHardLimit: 50 })(DefaultOpts);

      const TestModule = class {};
      Module({ routers: [], routerOptions: [DefaultOpts] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setDefaultModelOptions).toHaveBeenCalledWith({ listHardLimit: 50 });
    });

    it('should call setModelOptions for @RouterOptions with model name', () => {
      const UserOpts = class {};
      RouterOptions('User', { basePath: '/users' })(UserOpts);

      const TestModule = class {};
      Module({ routers: [], routerOptions: [UserOpts] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOptions).toHaveBeenCalledWith('User', { basePath: '/users' });
    });

    it('should resolve @RouterOptions model instances by deterministic model name', () => {
      const model = Object.assign(vi.fn(), { modelName: 'User', schema: {} }) as any;
      const UserOpts = class {};
      RouterOptions(model, { basePath: '/users' })(UserOpts);

      const TestModule = class {};
      Module({ routers: [], routerOptions: [UserOpts] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOptions).toHaveBeenCalledWith('User', { basePath: '/users' });
    });

    it('should apply default and model router options before creating model routers', () => {
      class DefaultOpts {}
      RouterOptions({ parentPath: '/tenant', queryRouteSegment: 'search' })(DefaultOpts);

      class UserOpts {
        id = 'userId';
      }
      Option('idParam')(UserOpts.prototype, 'id');
      RouterOptions('User', { basePath: '/members' })(UserOpts);

      const UserRouter = class {};
      Router('User', { mutationRouteSegment: 'mutate' })(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter], routerOptions: [DefaultOpts, UserOpts] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());

      const setDefaultOrder = mockAcl.setDefaultModelOptions.mock.invocationCallOrder[0];
      const setModelOptionsOrders = mockAcl.setModelOptions.mock.invocationCallOrder;
      const setModelOptionOrder = mockAcl.setModelOption.mock.invocationCallOrder[0];
      const createOrder = mockAcl.createRouter.mock.invocationCallOrder[0];

      expect(setDefaultOrder).toBeLessThan(createOrder);
      expect(setModelOptionsOrders[0]).toBeLessThan(createOrder);
      expect(setModelOptionOrder).toBeLessThan(createOrder);
      expect(setModelOptionsOrders[1]).toBeLessThan(createOrder);
      expect(mockAcl.setDefaultModelOptions).toHaveBeenCalledWith({
        parentPath: '/tenant',
        queryRouteSegment: 'search',
      });
      expect(mockAcl.setModelOptions).toHaveBeenNthCalledWith(1, 'User', { basePath: '/members' });
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'idParam', 'userId');
      expect(mockAcl.setModelOptions).toHaveBeenNthCalledWith(2, 'User', { mutationRouteSegment: 'mutate' });
      expect(mockAcl.createRouter).toHaveBeenCalledWith('User', {});
    });

    it('should register @Option property values via setModelOption', () => {
      class UserOpts {
        limit = 100;
      }
      Option('listHardLimit')(UserOpts.prototype, 'limit');
      RouterOptions('User')(UserOpts);

      const TestModule = class {};
      Module({ routers: [], routerOptions: [UserOpts] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'listHardLimit', 100);
    });

    it('should inherit @Option properties and allow child replacement', () => {
      class BaseOpts {
        baseLimit = 100;
        overriddenLimit = 200;
      }
      Option('baseLimit')(BaseOpts.prototype, 'baseLimit');
      Option('limit')(BaseOpts.prototype, 'overriddenLimit');

      class UserOpts extends BaseOpts {
        childLimit = 300;
      }
      Option('limit')(UserOpts.prototype, 'childLimit');
      RouterOptions('User')(UserOpts);

      const TestModule = class {};
      Module({ routers: [], routerOptions: [UserOpts] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'baseLimit', 100);
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'limit', 300);
      expect(mockAcl.setModelOption).not.toHaveBeenCalledWith('User', 'limit', 200);
    });

    it('should register @Option property values via setGlobalOption', () => {
      class TestModule {
        permField = '_perms';
      }
      Option('requestPermissionField')(TestModule.prototype, 'permField');
      Module({ routers: [] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setGlobalOption).toHaveBeenCalledWith('requestPermissionField', '_perms');
    });

    it('should handle handleErrors option', () => {
      const TestModule = class {};
      Module({ routers: [], options: { handleErrors: true } })(TestModule);

      const app = createMockExpressApp();
      EgoseFactory.bootstrap(TestModule, app);
      expect(app.use).toHaveBeenCalled();
    });
  });

  describe('hook registration', () => {
    it('should register globalPermissions via @GlobalPermissions', () => {
      class TestModule {
        getPermissions() {
          return {};
        }
      }
      applyMethodDecorator(GlobalPermissions(), TestModule.prototype, 'getPermissions');
      Module({ routers: [] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setGlobalOption).toHaveBeenCalledWith('globalPermissions', expect.any(Function));
    });

    it('should register docPermissions via @DocPermissions', () => {
      class UserRouter {
        checkCreate() {
          return {};
        }
      }
      applyMethodDecorator(DocPermissions('create'), UserRouter.prototype, 'checkCreate');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'docPermissions.create', expect.any(Function));
    });

    it('should ignore prefix-neighbor and symbol metadata on decorated methods', () => {
      class UserRouter {
        validate() {
          return true;
        }
      }
      applyMethodDecorator(Validate('create'), UserRouter.prototype, 'validate');
      Reflect.defineMetadata('validateExtra', true, UserRouter.prototype.validate);
      Reflect.defineMetadata(Symbol('validate.symbol'), true, UserRouter.prototype.validate);
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'validate.create', expect.any(Function));
      expect(mockAcl.setModelOption).not.toHaveBeenCalledWith('User', 'validateExtra', expect.any(Function));
    });

    it('should register baseFilter via @BaseFilter', () => {
      class UserRouter {
        filter() {
          return {};
        }
      }
      applyMethodDecorator(BaseFilter('list'), UserRouter.prototype, 'filter');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'baseFilter.list', expect.any(Function));
    });

    it('should register overrideFilter via @OverrideFilter', () => {
      class UserRouter {
        override() {
          return {};
        }
      }
      applyMethodDecorator(OverrideFilter('read'), UserRouter.prototype, 'override');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'overrideFilter.read', expect.any(Function));
    });

    it('should register validate via @Validate as a callable validator', () => {
      class UserRouter {
        validate() {
          return true;
        }
      }
      applyMethodDecorator(Validate('create'), UserRouter.prototype, 'validate');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'validate.create', expect.any(Function));
    });

    it('should register prepare via @Prepare as array', () => {
      class UserRouter {
        prepare() {
          return {};
        }
      }
      applyMethodDecorator(Prepare('update'), UserRouter.prototype, 'prepare');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'prepare.update', expect.any(Array));
    });

    it('should register transform via @Transform as array', () => {
      class UserRouter {
        transform() {
          return {};
        }
      }
      applyMethodDecorator(Transform('update'), UserRouter.prototype, 'transform');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'transform.update', expect.any(Array));
    });

    it('should register afterPersist via @AfterPersist as array', () => {
      class UserRouter {
        afterPersist() {
          return {};
        }
      }
      applyMethodDecorator(AfterPersist('create'), UserRouter.prototype, 'afterPersist');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'afterPersist.create', expect.any(Array));
    });

    it('should register decorate via @Decorate as array', () => {
      class UserRouter {
        decorate() {
          return {};
        }
      }
      applyMethodDecorator(Decorate('read'), UserRouter.prototype, 'decorate');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'decorate.read', expect.any(Array));
    });

    it('should register decorateAll via @DecorateAll as array', () => {
      class UserRouter {
        decorateAll() {
          return [];
        }
      }
      applyMethodDecorator(DecorateAll('list'), UserRouter.prototype, 'decorateAll');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'decorateAll.list', expect.any(Array));
    });

    it('should register routeGuard via @RouteGuard as operationAccess', () => {
      class UserRouter {
        guard() {
          return true;
        }
      }
      applyMethodDecorator(RouteGuard('delete'), UserRouter.prototype, 'guard');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'operationAccess.delete', expect.any(Function));
    });

    it('should register newer scalar routeGuard operations via @RouteGuard as operationAccess', () => {
      class UserRouter {
        guard() {
          return true;
        }
      }
      applyMethodDecorator(RouteGuard('upsert'), UserRouter.prototype, 'guard');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'operationAccess.upsert', expect.any(Function));
    });

    it('should register identifier via @Identifier as resolveIdFilter', () => {
      class UserRouter {
        resolveId() {
          return {};
        }
      }
      applyMethodDecorator(Identifier(), UserRouter.prototype, 'resolveId');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'resolveIdFilter', expect.any(Function));
    });

    it('should register beforeDelete via @BeforeDelete', () => {
      class UserRouter {
        beforeDel() {}
      }
      applyMethodDecorator(BeforeDelete(), UserRouter.prototype, 'beforeDel');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'beforeDelete', expect.any(Function));
    });

    it('should register afterDelete via @AfterDelete', () => {
      class UserRouter {
        afterDel() {}
      }
      applyMethodDecorator(AfterDelete(), UserRouter.prototype, 'afterDel');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'afterDelete', expect.any(Function));
    });
  });

  describe('wrapMethod', () => {
    it('should reorder arguments based on parameter decorators', () => {
      class UserRouter {
        handler(perms: any, doc: any, ctx: any, req: any) {
          return { perms, doc, ctx, req };
        }
      }
      applyMethodDecorator(DocPermissions('create'), UserRouter.prototype, 'handler');
      applyParameterDecorator(Permissions(), UserRouter.prototype, 'handler', 0);
      applyParameterDecorator(Document(), UserRouter.prototype, 'handler', 1);
      applyParameterDecorator(Context(), UserRouter.prototype, 'handler', 2);
      applyParameterDecorator(Request(), UserRouter.prototype, 'handler', 3);
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());

      const registeredFn = mockAcl.setModelOption.mock.calls.find(
        (call) => call[0] === 'User' && call[1] === 'docPermissions.create',
      )?.[2] as Function;

      expect(registeredFn).toBeDefined();

      const mockThis = { id: 'request-context' };
      const mockDoc = { name: 'test-doc' };
      const mockPerms = { admin: true };
      const mockCtx = { operation: 'create' };
      const result = registeredFn.call(mockThis, mockDoc, mockPerms, mockCtx);

      expect(result.perms).toBe(mockPerms);
      expect(result.doc).toBe(mockDoc);
      expect(result.ctx).toBe(mockCtx);
      expect(result.req).toBe(mockThis);
    });

    it('should work with no parameter decorators', () => {
      class UserRouter {
        handler() {
          return 'ok';
        }
      }
      applyMethodDecorator(DocPermissions('read'), UserRouter.prototype, 'handler');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      expect(() => EgoseFactory.bootstrap(TestModule, createMockExpressApp())).not.toThrow();

      const registeredFn = mockAcl.setModelOption.mock.calls.find(
        (call) => call[0] === 'User' && call[1] === 'docPermissions.read',
      )?.[2] as Function;

      expect(registeredFn).toBeDefined();
      const result = registeredFn.call({});
      expect(result).toBe('ok');
    });

    it('should reorder arguments for @GlobalPermissions with @Request', () => {
      class TestModule {
        handler(req: any) {
          return { req };
        }
      }
      applyMethodDecorator(GlobalPermissions(), TestModule.prototype, 'handler');
      applyParameterDecorator(Request(), TestModule.prototype, 'handler', 0);
      Module({ routers: [] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());

      const registeredFn = mockAcl.setGlobalOption.mock.calls.find(
        (call) => call[0] === 'globalPermissions',
      )?.[1] as Function;

      expect(registeredFn).toBeDefined();
      const mockThis = { id: 'request-context' };
      const result = registeredFn.call(mockThis);
      expect(result.req).toBe(mockThis);
    });

    it('should inherit decorated methods with their declaring parameter metadata', () => {
      class BaseRouter {
        handler(doc: any, perms: any) {
          return { doc, perms };
        }
      }
      applyMethodDecorator(DocPermissions('read'), BaseRouter.prototype, 'handler');
      applyParameterDecorator(Document(), BaseRouter.prototype, 'handler', 0);
      applyParameterDecorator(Permissions(), BaseRouter.prototype, 'handler', 1);

      class ChildRouter extends BaseRouter {}
      Router('User')(ChildRouter);

      const TestModule = class {};
      Module({ routers: [ChildRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());

      const registeredFn = mockAcl.setModelOption.mock.calls.find(
        (call) => call[0] === 'User' && call[1] === 'docPermissions.read',
      )?.[2] as Function;

      const mockDoc = { id: 'doc' };
      const mockPerms = { read: true };
      expect(registeredFn.call({}, mockDoc, mockPerms)).toEqual({ doc: mockDoc, perms: mockPerms });
    });

    it('should not reuse base method metadata when a child overrides the method', () => {
      class BaseRouter {
        handler(doc: any) {
          return { doc };
        }
      }
      applyMethodDecorator(DocPermissions('read'), BaseRouter.prototype, 'handler');
      applyParameterDecorator(Document(), BaseRouter.prototype, 'handler', 0);

      class ChildRouter extends BaseRouter {
        handler(doc: any) {
          return { child: doc };
        }
      }
      Router('User')(ChildRouter);

      const TestModule = class {};
      Module({ routers: [ChildRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());

      expect(mockAcl.setModelOption).not.toHaveBeenCalledWith('User', 'docPermissions.read', expect.any(Function));
    });

    it('should reorder arguments for @BeforeDelete with @Document/@Permissions/@Context', () => {
      class UserRouter {
        handler(doc: any, perms: any, ctx: any) {
          return { doc, perms, ctx };
        }
      }
      applyMethodDecorator(BeforeDelete(), UserRouter.prototype, 'handler');
      applyParameterDecorator(Document(), UserRouter.prototype, 'handler', 0);
      applyParameterDecorator(Permissions(), UserRouter.prototype, 'handler', 1);
      applyParameterDecorator(Context(), UserRouter.prototype, 'handler', 2);
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());

      const registeredFn = mockAcl.setModelOption.mock.calls.find(
        (call) => call[0] === 'User' && call[1] === 'beforeDelete',
      )?.[2] as Function;

      expect(registeredFn).toBeDefined();
      const mockDoc = { name: 'test' };
      const mockPerms = { admin: true };
      const mockCtx = { operation: 'delete' };
      const result = registeredFn.call({}, mockDoc, mockPerms, mockCtx);

      expect(result.doc).toBe(mockDoc);
      expect(result.perms).toBe(mockPerms);
      expect(result.ctx).toBe(mockCtx);
    });

    it('should reorder arguments for @AfterDelete with @Document/@Permissions/@Context', () => {
      class UserRouter {
        handler(doc: any, perms: any, ctx: any) {
          return { doc, perms, ctx };
        }
      }
      applyMethodDecorator(AfterDelete(), UserRouter.prototype, 'handler');
      applyParameterDecorator(Document(), UserRouter.prototype, 'handler', 0);
      applyParameterDecorator(Permissions(), UserRouter.prototype, 'handler', 1);
      applyParameterDecorator(Context(), UserRouter.prototype, 'handler', 2);
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());

      const registeredFn = mockAcl.setModelOption.mock.calls.find(
        (call) => call[0] === 'User' && call[1] === 'afterDelete',
      )?.[2] as Function;

      expect(registeredFn).toBeDefined();
      const mockDoc = { name: 'test' };
      const mockPerms = { admin: true };
      const mockCtx = { operation: 'delete' };
      const result = registeredFn.call({}, mockDoc, mockPerms, mockCtx);

      expect(result.doc).toBe(mockDoc);
      expect(result.perms).toBe(mockPerms);
      expect(result.ctx).toBe(mockCtx);
    });
  });

  describe('edge cases', () => {
    it('should handle module with empty routers array', () => {
      const TestModule = class {};
      Module({ routers: [] })(TestModule);

      expect(() => EgoseFactory.bootstrap(TestModule, createMockExpressApp())).not.toThrow();
    });

    it('should handle multiple routers in one module', () => {
      const UserRouter = class {};
      Router('User')(UserRouter);
      const PostRouter = class {};
      Router('Post')(PostRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter, PostRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.createRouter).toHaveBeenCalledTimes(2);
    });

    it('should register routeGuard on default model options via @RouteGuard', () => {
      class DefaultOpts {
        guard() {
          return true;
        }
      }
      applyMethodDecorator(RouteGuard('list'), DefaultOpts.prototype, 'guard');
      RouterOptions({ listHardLimit: 100 })(DefaultOpts);

      const TestModule = class {};
      Module({ routers: [], routerOptions: [DefaultOpts] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setDefaultModelOption).toHaveBeenCalledWith('operationAccess.list', expect.any(Function));
    });

    it('should register identifier on default model options via @Identifier', () => {
      class DefaultOpts {
        resolveId() {
          return {};
        }
      }
      applyMethodDecorator(Identifier(), DefaultOpts.prototype, 'resolveId');
      RouterOptions({ idField: '_id' })(DefaultOpts);

      const TestModule = class {};
      Module({ routers: [], routerOptions: [DefaultOpts] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setDefaultModelOption).toHaveBeenCalledWith('resolveIdFilter', expect.any(Function));
    });

    it('should register @Option on default RouterOptions via setDefaultModelOption', () => {
      class DefaultOpts {
        limit = 500;
      }
      Option('listHardLimit')(DefaultOpts.prototype, 'limit');
      RouterOptions({ listHardLimit: 100 })(DefaultOpts);

      const TestModule = class {};
      Module({ routers: [], routerOptions: [DefaultOpts] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setDefaultModelOption).toHaveBeenCalledWith('listHardLimit', 500);
    });

    it('should handle mixed routers and routerOptions in one module', () => {
      const UserRouter = class {};
      Router('User')(UserRouter);

      class UserOpts {
        limit = 200;
      }
      Option('listHardLimit')(UserOpts.prototype, 'limit');
      RouterOptions('User')(UserOpts);

      const TestModule = class {};
      Module({ routers: [UserRouter], routerOptions: [UserOpts] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.createRouter).toHaveBeenCalledWith('User', {});
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'listHardLimit', 200);
    });

    it('should reject multiple hook decorators on one method before mounting', () => {
      class UserRouter {
        handler() {
          return {};
        }
      }
      applyMethodDecorator(DocPermissions('create'), UserRouter.prototype, 'handler');
      applyMethodDecorator(Validate('create'), UserRouter.prototype, 'handler');
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);
      const app = createMockExpressApp();

      expect(() => EgoseFactory.bootstrap(TestModule, app)).toThrow(
        /Invalid decorator configuration on UserRouter\.handler: multiple hook decorators \(@docPermissions, @validate\) are not supported; split each hook onto its own method/,
      );
      expect(mockAcl.setGlobalOptions).not.toHaveBeenCalled();
      expect(mockAcl.setModelOption).not.toHaveBeenCalled();
      expect(app.use).not.toHaveBeenCalled();
    });

    it('should reject unsupported parameter decorators for a hook before mounting', () => {
      class UserRouter {
        handler(filter: any) {
          return filter;
        }
      }
      applyMethodDecorator(DocPermissions('read'), UserRouter.prototype, 'handler');
      applyParameterDecorator(Filter(), UserRouter.prototype, 'handler', 0);
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);
      const app = createMockExpressApp();

      expect(() => EgoseFactory.bootstrap(TestModule, app)).toThrow(
        /Invalid decorator configuration on UserRouter\.handler: parameter index 0 uses unsupported parameter type FILTER for @docPermissions; use a parameter decorator supported by this hook/,
      );
      expect(mockAcl.setGlobalOptions).not.toHaveBeenCalled();
      expect(mockAcl.setModelOption).not.toHaveBeenCalled();
      expect(app.use).not.toHaveBeenCalled();
    });

    it('should reject duplicate parameter metadata for one method', () => {
      class UserRouter {
        handler(doc: any) {
          return doc;
        }
      }
      applyMethodDecorator(DocPermissions('read'), UserRouter.prototype, 'handler');
      Reflect.defineMetadata(
        ARGS_METADATA,
        [
          { index: 0, type: HookParamtypes.DOCUMENT },
          { index: 0, type: HookParamtypes.PERMISSIONS },
        ],
        UserRouter,
        'handler',
      );
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      expect(() => EgoseFactory.bootstrap(TestModule, createMockExpressApp())).toThrow(
        /Invalid decorator configuration on UserRouter\.handler: duplicate parameter decorator at index 0 for @docPermissions; keep only one parameter decorator per argument/,
      );
    });
  });

  describe('EgoseFactoryStatic.create', () => {
    it('should create independent instances', () => {
      const a = EgoseFactoryStatic.create();
      const b = EgoseFactoryStatic.create();
      expect(a).not.toBe(b);
    });

    it('should create an isolated runtime by default', () => {
      mockCreateAccessRuntime.mockClear();

      const factory = EgoseFactoryStatic.create();

      expect(mockCreateAccessRuntime).toHaveBeenCalledTimes(1);
      expect(factory.runtime).toBe(mockAcl);
    });

    it('should use an explicitly supplied runtime', () => {
      const runtime = vi.fn(() => (req: any, res: any, next: any) => next()) as any;
      runtime.setGlobalOptions = vi.fn();
      runtime.setGlobalOption = vi.fn();
      runtime.getGlobalOption = vi.fn();
      runtime.setModelOptions = vi.fn();
      runtime.setModelOption = vi.fn();
      runtime.getModelOption = vi.fn();
      runtime.setDefaultModelOptions = vi.fn();
      runtime.setDefaultModelOption = vi.fn();
      runtime.getDefaultModelOption = vi.fn();
      runtime.registerModelInstance = vi.fn();
      runtime.createRouter = vi.fn(() => ({ routes: vi.fn() }));

      const UserRouter = class {};
      Router('User')(UserRouter);
      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactoryStatic.create(runtime).bootstrap(TestModule, createMockExpressApp());

      expect(runtime.setModelOptions).toHaveBeenCalledWith('User', {});
      expect(runtime.createRouter).toHaveBeenCalledWith('User', {});
      expect(mockAcl.setModelOptions).not.toHaveBeenCalled();
    });
  });
});
