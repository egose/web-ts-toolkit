import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { EgoseFactoryStatic } from '../src/factory';
import { Module, Router, RouteGuard, Permissions } from '../src/decorators';
import { applyMethodDecorator, applyParameterDecorator } from './helpers';

function createMockExpressApp() {
  return { use() {} } as any;
}

function setupModel(runtime: any, modelName: string) {
  const model = Object.assign(function DecoRouteGuardModel() {}, {
    modelName,
    schema: { tree: {}, obj: {} },
    jsonSchema: () => ({}),
  });
  runtime.registerModelInstance(modelName, model as any);
  runtime.setModelOptions(modelName, {
    validate: {},
    overrideFilter: {},
    resolveIdFilter: undefined,
    prepare: {},
  } as any);
}

function bootstrap(router: Function, modelName: string) {
  const factory = EgoseFactoryStatic.create();
  setupModel(factory.runtime, modelName);
  class TestModule {}
  Module({ routers: [router as any] })(TestModule);
  factory.bootstrap(TestModule, createMockExpressApp());
  return factory.runtime;
}

describe('RouteGuard real runtime', () => {
  it('sync true/false produce corresponding runtime authorization decision', async () => {
    const modelTrue = 'DecoRouteGuardSyncTrue';
    class RouterTrue {
      guard(perms: any) {
        void perms;
        return true;
      }
    }
    applyMethodDecorator(RouteGuard('read'), RouterTrue.prototype, 'guard');
    applyParameterDecorator(Permissions(), RouterTrue.prototype, 'guard', 0);
    Router(modelTrue)(RouterTrue);
    const runtimeTrue = bootstrap(RouterTrue, modelTrue);
    const guardTrue = runtimeTrue.getModelOption(modelTrue, 'operationAccess.read') as any;
    expect(typeof guardTrue).toBe('function');
    const perms = { has: (k: string) => k === 'admin' } as any;
    const req: any = {};
    expect(await guardTrue.call(req, perms)).toBe(true);
    expect(await guardTrue.call(req, { has: () => false } as any)).toBe(true);

    const modelFalse = 'DecoRouteGuardSyncFalse';
    class RouterFalse {
      guard(perms: any) {
        void perms;
        return false;
      }
    }
    applyMethodDecorator(RouteGuard('read'), RouterFalse.prototype, 'guard');
    applyParameterDecorator(Permissions(), RouterFalse.prototype, 'guard', 0);
    Router(modelFalse)(RouterFalse);
    const runtimeFalse = bootstrap(RouterFalse, modelFalse);
    const guardFalse = runtimeFalse.getModelOption(modelFalse, 'operationAccess.read') as any;
    expect(await guardFalse.call(req, perms)).toBe(false);
  });

  it('async true/false produce corresponding runtime authorization decision', async () => {
    const modelTrue = 'DecoRouteGuardAsyncTrue';
    class RouterTrue {
      async guard(perms: any) {
        void perms;
        return true;
      }
    }
    applyMethodDecorator(RouteGuard('list'), RouterTrue.prototype, 'guard');
    applyParameterDecorator(Permissions(), RouterTrue.prototype, 'guard', 0);
    Router(modelTrue)(RouterTrue);
    const runtimeTrue = bootstrap(RouterTrue, modelTrue);
    const guardTrue = runtimeTrue.getModelOption(modelTrue, 'operationAccess.list') as any;
    const perms = { has: () => true } as any;
    const req: any = {};
    expect(await guardTrue.call(req, perms)).toBe(true);

    const modelFalse = 'DecoRouteGuardAsyncFalse';
    class RouterFalse {
      async guard(perms: any) {
        void perms;
        return false;
      }
    }
    applyMethodDecorator(RouteGuard('list'), RouterFalse.prototype, 'guard');
    applyParameterDecorator(Permissions(), RouterFalse.prototype, 'guard', 0);
    Router(modelFalse)(RouterFalse);
    const runtimeFalse = bootstrap(RouterFalse, modelFalse);
    const guardFalse = runtimeFalse.getModelOption(modelFalse, 'operationAccess.list') as any;
    expect(await guardFalse.call(req, perms)).toBe(false);
  });

  it.each(['default', 'new', 'distinct'] as const)(
    'RouteGuard("%s") registers and executes through real runtime',
    async (operation) => {
      const modelName = `DecoRouteGuard${operation[0].toUpperCase()}${operation.slice(1)}`;
      const seen: any = {};
      const request = { requestId: 'rg-request' };
      class GuardRouter {
        guard(perms: any) {
          seen.perms = perms;
          seen.thisRef = this;
          return perms.has('allowed');
        }
      }
      applyMethodDecorator(RouteGuard(operation as any), GuardRouter.prototype, 'guard');
      applyParameterDecorator(Permissions(), GuardRouter.prototype, 'guard', 0);
      Router(modelName)(GuardRouter);
      const runtime = bootstrap(GuardRouter, modelName);
      const guard = runtime.getModelOption(modelName, `operationAccess.${operation}`) as any;
      expect(typeof guard).toBe('function');
      const allowedPerms = { has: (k: string) => k === 'allowed' } as any;
      const deniedPerms = { has: () => false } as any;
      expect(await guard.call(request, allowedPerms)).toBe(true);
      expect(await guard.call(request, deniedPerms)).toBe(false);
      expect(seen.thisRef).toBeInstanceOf(GuardRouter);
    },
  );

  it('preserves existing upsert and count behavior', async () => {
    for (const op of ['upsert', 'count'] as const) {
      const modelName = `DecoRouteGuard${op[0].toUpperCase()}${op.slice(1)}Preserve`;
      class GuardRouter {
        guard() {
          return true;
        }
      }
      applyMethodDecorator(RouteGuard(op as any), GuardRouter.prototype, 'guard');
      Router(modelName)(GuardRouter);
      const runtime = bootstrap(GuardRouter, modelName);
      const guard = runtime.getModelOption(modelName, `operationAccess.${op}`) as any;
      expect(typeof guard).toBe('function');
      expect(await guard.call({}, { has: () => true } as any)).toBe(true);
    }
  });

  it('JS call with unsupported operation throws before class metadata can be used for bootstrap', () => {
    expect(() => (RouteGuard as any)('subs')).toThrow(/Invalid @routeGuard operation "subs"/);
    expect(() => (RouteGuard as any)('unknownOp')).toThrow(/Invalid @routeGuard operation "unknownOp"/);
    expect(() => (RouteGuard as any)('')).toThrow(/Invalid @routeGuard operation/);
    // also when applying decorator with invalid operation via JS helper, should throw
    class Dummy {
      method() {
        return true;
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(Dummy.prototype, 'method')!;
    expect(() => {
      const deco = (RouteGuard as any)('invalid');
      deco(Dummy.prototype, 'method', descriptor);
    }).toThrow(/Invalid @routeGuard operation "invalid"/);
  });

  it('does not create metadata for invalid operations', () => {
    class BadRouter {
      bad() {
        return true;
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(BadRouter.prototype, 'bad')!;
    expect(() => {
      const deco = (RouteGuard as any)('subs');
      deco(BadRouter.prototype, 'bad', descriptor);
    }).toThrow();
    expect(Reflect.getMetadata('routeGuard.subs', BadRouter.prototype.bad)).toBeUndefined();
    expect(Reflect.getMetadata('operationAccess.subs', BadRouter.prototype.bad)).toBeUndefined();
  });
});
