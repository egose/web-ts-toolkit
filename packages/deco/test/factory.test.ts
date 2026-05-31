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
  mockAcl.createRouter = vi.fn(() => ({ routes: vi.fn() }));
  return { default: mockAcl };
});

import acl from '@web-ts-toolkit/access-router';
import { EgoseFactory } from '../src/factory';
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
} from '../src/decorators';
import { applyMethodDecorator, applyParameterDecorator } from './helpers';

const mockAcl = vi.mocked(acl);

function createMockExpressApp() {
  return { use: vi.fn() } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EgoseFactory', () => {
  describe('bootstrap', () => {
    it('should call acl.setGlobalOptions with module options', () => {
      const TestModule = class {};
      Module({ routers: [], options: { basePath: '/api', handleErrors: false } })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.setGlobalOptions).toHaveBeenCalledWith({ basePath: '/api', handleErrors: false });
    });

    it('should mount acl() middleware on the express app', () => {
      const TestModule = class {};
      Module({ routers: [] })(TestModule);

      const app = createMockExpressApp();
      EgoseFactory.bootstrap(TestModule, app);
      expect(mockAcl).toHaveBeenCalled();
      expect(app.use).toHaveBeenCalled();
    });

    it('should create model router for @Router decorated classes', () => {
      const UserRouter = class {};
      Router('User')(UserRouter);

      const TestModule = class {};
      Module({ routers: [UserRouter] })(TestModule);

      EgoseFactory.bootstrap(TestModule, createMockExpressApp());
      expect(mockAcl.createRouter).toHaveBeenCalledWith('User', {});
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

    it('should register validate via @Validate as array', () => {
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
      expect(mockAcl.setModelOption).toHaveBeenCalledWith('User', 'validate.create', expect.any(Array));
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
  });
});
