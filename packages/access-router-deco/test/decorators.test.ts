import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
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
} from '../src';
import { applyMethodDecorator, applyParameterDecorator } from './helpers';
import {
  ROOT_ROUTER_WATERMARK,
  ROUTER_WATERMARK,
  DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK,
  MODEL_ROUTER_OPTIONS_WATERMARK,
  ROUTER_MODEL,
  ROUTER_OPTIONS,
  OPTIONS_METADATA,
  ARGS_METADATA,
  HookParamtypes,
  GLOBAL_PERMISSIONS_WATERMARK,
  DOC_PERMISSIONS_WATERMARK,
  BASE_FILTER_WATERMARK,
  OVERRIDE_FILTER_WATERMARK,
  VALIDATE_WATERMARK,
  PREPARE_WATERMARK,
  TRANSFORM_WATERMARK,
  AFTER_PERSIST_WATERMARK,
  DECORATE_WATERMARK,
  DECORATE_ALL_WATERMARK,
  ROUTE_GUARD_WATERMARK,
  IDENTIFIER_WATERMARK,
  BEFORE_DELETE_WATERMARK,
  AFTER_DELETE_WATERMARK,
} from '../src/constants';

describe('Class Decorators', () => {
  describe('@Module', () => {
    it('should set routers metadata', () => {
      class FakeRouter {}
      const TestModule = class {};
      Module({ routers: [FakeRouter] })(TestModule);
      expect(Reflect.getMetadata('routers', TestModule)).toEqual([FakeRouter]);
    });

    it('should set routerOptions metadata', () => {
      class FakeOptions {}
      const TestModule = class {};
      Module({ routers: [], routerOptions: [FakeOptions] })(TestModule);
      expect(Reflect.getMetadata('routerOptions', TestModule)).toEqual([FakeOptions]);
    });

    it('should set options metadata', () => {
      const TestModule = class {};
      Module({ routers: [], options: { basePath: '/api', handleErrors: true } })(TestModule);
      const opts = Reflect.getMetadata('options', TestModule);
      expect(opts.basePath).toBe('/api');
      expect(opts.handleErrors).toBe(true);
    });
  });

  describe('@Router', () => {
    it('should set model router watermark and model name', () => {
      const UserRouter = class {};
      Router('User')(UserRouter);
      expect(Reflect.getMetadata(ROUTER_WATERMARK, UserRouter)).toBe(true);
      expect(Reflect.getMetadata(ROUTER_MODEL, UserRouter)).toBe('User');
    });

    it('should set model router options', () => {
      const UserRouter = class {};
      Router('User', { basePath: '/users' })(UserRouter);
      expect(Reflect.getMetadata(ROUTER_OPTIONS, UserRouter)).toEqual({ basePath: '/users' });
    });

    it('should set root router watermark when given options object', () => {
      const HealthRouter = class {};
      Router({ basePath: '/health' })(HealthRouter);
      expect(Reflect.getMetadata(ROOT_ROUTER_WATERMARK, HealthRouter)).toBe(true);
      expect(Reflect.getMetadata(ROUTER_OPTIONS, HealthRouter)).toEqual({ basePath: '/health' });
    });

    it('should default options to empty object', () => {
      const UserRouter = class {};
      Router('User')(UserRouter);
      expect(Reflect.getMetadata(ROUTER_OPTIONS, UserRouter)).toEqual({});
    });

    it('should throw for invalid arguments', () => {
      expect(() => (Router as any)(null)).toThrow(TypeError);
      expect(() => (Router as any)(42)).toThrow(TypeError);
    });
  });

  describe('@RouterOptions', () => {
    it('should set default model router options watermark', () => {
      const DefaultOpts = class {};
      RouterOptions({ listHardLimit: 50 })(DefaultOpts);
      expect(Reflect.getMetadata(DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK, DefaultOpts)).toBe(true);
      expect(Reflect.getMetadata(ROUTER_OPTIONS, DefaultOpts)).toEqual({ listHardLimit: 50 });
    });

    it('should set model-specific router options watermark', () => {
      const UserOpts = class {};
      RouterOptions('User', { basePath: '/users' })(UserOpts);
      expect(Reflect.getMetadata(MODEL_ROUTER_OPTIONS_WATERMARK, UserOpts)).toBe(true);
      expect(Reflect.getMetadata(ROUTER_MODEL, UserOpts)).toBe('User');
      expect(Reflect.getMetadata(ROUTER_OPTIONS, UserOpts)).toEqual({ basePath: '/users' });
    });

    it('should throw for invalid arguments', () => {
      expect(() => (RouterOptions as any)(null)).toThrow(TypeError);
      expect(() => (RouterOptions as any)(42)).toThrow(TypeError);
    });
  });
});

describe('Method Decorators', () => {
  const methodDecorators: Array<{
    name: string;
    decorator: () => MethodDecorator;
    watermark: string;
    compositeKey?: string;
  }> = [
    { name: '@GlobalPermissions', decorator: GlobalPermissions, watermark: GLOBAL_PERMISSIONS_WATERMARK },
    {
      name: '@DocPermissions("create")',
      decorator: () => DocPermissions('create'),
      watermark: DOC_PERMISSIONS_WATERMARK,
      compositeKey: 'docPermissions.create',
    },
    {
      name: '@BaseFilter("list")',
      decorator: () => BaseFilter('list'),
      watermark: BASE_FILTER_WATERMARK,
      compositeKey: 'baseFilter.list',
    },
    {
      name: '@OverrideFilter("read")',
      decorator: () => OverrideFilter('read'),
      watermark: OVERRIDE_FILTER_WATERMARK,
      compositeKey: 'overrideFilter.read',
    },
    {
      name: '@Validate("update")',
      decorator: () => Validate('update'),
      watermark: VALIDATE_WATERMARK,
      compositeKey: 'validate.update',
    },
    {
      name: '@Prepare("create")',
      decorator: () => Prepare('create'),
      watermark: PREPARE_WATERMARK,
      compositeKey: 'prepare.create',
    },
    {
      name: '@Transform("update")',
      decorator: () => Transform('update'),
      watermark: TRANSFORM_WATERMARK,
      compositeKey: 'transform.update',
    },
    {
      name: '@AfterPersist("create")',
      decorator: () => AfterPersist('create'),
      watermark: AFTER_PERSIST_WATERMARK,
      compositeKey: 'afterPersist.create',
    },
    {
      name: '@Decorate("read")',
      decorator: () => Decorate('read'),
      watermark: DECORATE_WATERMARK,
      compositeKey: 'decorate.read',
    },
    {
      name: '@DecorateAll("list")',
      decorator: () => DecorateAll('list'),
      watermark: DECORATE_ALL_WATERMARK,
      compositeKey: 'decorateAll.list',
    },
    {
      name: '@RouteGuard("delete")',
      decorator: () => RouteGuard('delete'),
      watermark: ROUTE_GUARD_WATERMARK,
      compositeKey: 'routeGuard.delete',
    },
    { name: '@Identifier()', decorator: Identifier, watermark: IDENTIFIER_WATERMARK, compositeKey: 'identifier' },
    {
      name: '@BeforeDelete()',
      decorator: BeforeDelete,
      watermark: BEFORE_DELETE_WATERMARK,
      compositeKey: 'beforeDelete',
    },
    { name: '@AfterDelete()', decorator: AfterDelete, watermark: AFTER_DELETE_WATERMARK, compositeKey: 'afterDelete' },
  ];

  for (const { name, decorator, watermark, compositeKey } of methodDecorators) {
    describe(name, () => {
      it('should set watermark', () => {
        class TestRouter {
          handler() {}
        }
        applyMethodDecorator(decorator(), TestRouter.prototype, 'handler');
        expect(Reflect.getMetadata(watermark, TestRouter.prototype.handler)).toBe(true);
      });

      if (compositeKey) {
        it('should set composite key', () => {
          class TestRouter {
            handler() {}
          }
          applyMethodDecorator(decorator(), TestRouter.prototype, 'handler');
          expect(Reflect.getMetadata(compositeKey, TestRouter.prototype.handler)).toBe(true);
        });
      }
    });
  }
});

describe('Property Decorators', () => {
  describe('@Option', () => {
    it('should store optionKey and propertyKey', () => {
      class TestOptions {
        limit = 100;
      }
      Option('listHardLimit')(TestOptions.prototype, 'limit');
      const metadata = Reflect.getMetadata(OPTIONS_METADATA, TestOptions.prototype);
      expect(metadata).toEqual([{ optionKey: 'listHardLimit', propertyKey: 'limit' }]);
    });

    it('should use property name as optionKey when not provided', () => {
      class TestOptions {
        listHardLimit = 100;
      }
      Option()(TestOptions.prototype, 'listHardLimit');
      const metadata = Reflect.getMetadata(OPTIONS_METADATA, TestOptions.prototype);
      expect(metadata).toEqual([{ optionKey: 'listHardLimit', propertyKey: 'listHardLimit' }]);
    });

    it('should accumulate multiple options', () => {
      class TestOptions {
        propA = 1;
        propB = 2;
      }
      Option('a')(TestOptions.prototype, 'propA');
      Option('b')(TestOptions.prototype, 'propB');
      const metadata = Reflect.getMetadata(OPTIONS_METADATA, TestOptions.prototype);
      expect(metadata).toHaveLength(2);
      expect(metadata[0].optionKey).toBe('a');
      expect(metadata[1].optionKey).toBe('b');
    });
  });
});

describe('Parameter Decorators', () => {
  it('should set HookParamtypes.REQUEST metadata', () => {
    class TestRouter {
      handler(req: any) {}
    }
    applyParameterDecorator(Request(), TestRouter.prototype, 'handler', 0);
    const meta = Reflect.getMetadata(ARGS_METADATA, TestRouter, 'handler');
    expect(meta).toEqual([{ index: 0, type: HookParamtypes.REQUEST }]);
  });

  it('should set HookParamtypes.DOCUMENT metadata', () => {
    class TestRouter {
      handler(doc: any) {}
    }
    applyParameterDecorator(Document(), TestRouter.prototype, 'handler', 0);
    const meta = Reflect.getMetadata(ARGS_METADATA, TestRouter, 'handler');
    expect(meta).toEqual([{ index: 0, type: HookParamtypes.DOCUMENT }]);
  });

  it('should set HookParamtypes.PERMISSIONS metadata', () => {
    class TestRouter {
      handler(perms: any) {}
    }
    applyParameterDecorator(Permissions(), TestRouter.prototype, 'handler', 0);
    const meta = Reflect.getMetadata(ARGS_METADATA, TestRouter, 'handler');
    expect(meta).toEqual([{ index: 0, type: HookParamtypes.PERMISSIONS }]);
  });

  it('should set HookParamtypes.CONTEXT metadata', () => {
    class TestRouter {
      handler(ctx: any) {}
    }
    applyParameterDecorator(Context(), TestRouter.prototype, 'handler', 0);
    const meta = Reflect.getMetadata(ARGS_METADATA, TestRouter, 'handler');
    expect(meta).toEqual([{ index: 0, type: HookParamtypes.CONTEXT }]);
  });

  it('should preserve parameter order with mixed decorators', () => {
    class TestRouter {
      handler(perms: any, doc: any, req: any) {}
    }
    applyParameterDecorator(Permissions(), TestRouter.prototype, 'handler', 0);
    applyParameterDecorator(Document(), TestRouter.prototype, 'handler', 1);
    applyParameterDecorator(Request(), TestRouter.prototype, 'handler', 2);

    const meta = Reflect.getMetadata(ARGS_METADATA, TestRouter, 'handler');
    expect(meta).toHaveLength(3);
    expect(meta[0]).toEqual({ index: 0, type: HookParamtypes.PERMISSIONS });
    expect(meta[1]).toEqual({ index: 1, type: HookParamtypes.DOCUMENT });
    expect(meta[2]).toEqual({ index: 2, type: HookParamtypes.REQUEST });
  });
});
