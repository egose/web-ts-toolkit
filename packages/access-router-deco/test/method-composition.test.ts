import 'reflect-metadata';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Context,
  Document,
  EgoseFactoryStatic,
  Module,
  Permissions,
  Request,
  RouteGuard,
  Router,
  Validate,
} from '../src';
import { HOOK_DEFINITIONS } from '../src/constants';
import { getMethodMetadata, getMethodMetadataKeysStartWith } from '../src/metadata';
import { applyParameterDecorator } from './helpers';

type WrapperStyle = 'mutate' | 'replace';
const cases = (['mutate', 'replace'] as const).flatMap((style) =>
  [true, false].map((wrapperFirst) => ({ style, wrapperFirst })),
);

function wrapper(style: WrapperStyle, observe: (instance: unknown, args: unknown[]) => void): MethodDecorator {
  return (_target, _key, descriptor) => {
    const original = descriptor.value as Function;
    const value = function (this: unknown, ...args: unknown[]) {
      observe(this, args);
      return original.apply(this, args);
    } as typeof descriptor.value;
    if (style === 'replace') return { ...descriptor, value };
    descriptor.value = value;
  };
}

// Reflect.decorate uses the same right-to-left, returned-descriptor semantics
// as legacy TypeScript's __decorate helper; install its effective descriptor.
function compose(target: object, key: string | symbol, decorators: MethodDecorator[]) {
  Object.defineProperty(
    target,
    key,
    Reflect.decorate(decorators, target, key, Object.getOwnPropertyDescriptor(target, key)!),
  );
}

const connections: mongoose.Connection[] = [];
function bootstrap(RouterClass: new () => object) {
  const connection = mongoose.createConnection();
  connections.push(connection);
  const model = connection.model('Composition', new mongoose.Schema({ name: String }, { bufferCommands: false }));
  Router(model, {
    basePath: '/items',
    operationAccess: { read: true, list: true, update: false },
    permissionSchema: { name: { read: true } },
  })(RouterClass);
  class TestModule {}
  Module({ routers: [RouterClass], options: { handleErrors: true } })(TestModule);
  const app = express();
  const { runtime } = EgoseFactoryStatic.create().bootstrap(TestModule, app);
  return { app, runtime, model };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(connections.splice(0).map((connection) => connection.close()));
});

describe('method-wrapper composition', () => {
  it.each(cases)(
    '$style wrapper (wrapperFirst=$wrapperFirst) retains deny policy before persistence',
    async ({ style, wrapperFirst }) => {
      const observed = vi.fn();
      const body = vi.fn();
      class GuardRouter {
        allowed = false;
        guard(unused: unknown, req: unknown) {
          body(this, unused, req);
          return this.allowed;
        }
      }
      const instrument = wrapper(style, observed);
      const guard = RouteGuard('read');
      compose(GuardRouter.prototype, 'guard', wrapperFirst ? [instrument, guard] : [guard, instrument]);
      applyParameterDecorator(Request(), GuardRouter.prototype, 'guard', 1);
      const { app, runtime, model } = bootstrap(GuardRouter);
      const persistence = vi.spyOn(model.collection, 'findOne').mockRejectedValue(new Error('persistence reached'));

      await request(app).get('/items/507f1f77bcf86cd799439011').expect(401);
      expect(persistence).not.toHaveBeenCalled();
      expect(observed).toHaveBeenCalledTimes(1);
      expect(body).toHaveBeenCalledTimes(1);
      const [instance, args] = observed.mock.calls[0];
      expect(instance).toBeInstanceOf(GuardRouter);
      expect(args[0]).toBeUndefined();
      expect(args[1].originalUrl).toBe('/items/507f1f77bcf86cd799439011');
      expect(body).toHaveBeenCalledWith(instance, undefined, args[1]);
      const access = runtime.getModelOptions(model.modelName).operationAccess;
      expect(access).toMatchObject({ read: expect.any(Function), list: true, update: false });
      expect(getMethodMetadata(GuardRouter.prototype, 'guard', HOOK_DEFINITIONS.routeGuard.watermark)).toBe(true);
      expect(getMethodMetadataKeysStartWith(GuardRouter.prototype, 'guard', 'routeGuard')).toEqual(['routeGuard.read']);
    },
  );

  it.each(cases)(
    '$style wrapper (wrapperFirst=$wrapperFirst) preserves inherited symbol validator and sparse injection',
    async ({ style, wrapperFirst }) => {
      const key = Symbol('validate');
      const observed = vi.fn();
      const body = vi.fn();
      class Base {
        expected = 'valid';
        [key](unused: unknown, doc: { name: string }, gap: unknown, perms: unknown, ctx: unknown, req: unknown) {
          body(this, unused, doc, gap, perms, ctx, req);
          return doc.name === this.expected;
        }
      }
      const instrument = wrapper(style, observed);
      const validate = Validate('create');
      compose(Base.prototype, key, wrapperFirst ? [instrument, validate] : [validate, instrument]);
      for (const [index, decorator] of [
        [1, Document()],
        [3, Permissions()],
        [4, Context()],
        [5, Request()],
      ] as const) {
        applyParameterDecorator(decorator, Base.prototype, key, index);
      }
      class Child extends Base {}
      const { runtime, model } = bootstrap(Child);
      const validateHook = runtime.getModelOption(model.modelName, 'validate.create') as Function;
      expect(validateHook).toEqual(expect.any(Function));
      const perms = { allowed: true };
      const ctx = { operation: 'create' };
      const req = { requestId: 'composition' };
      const doc = { name: 'invalid' };
      expect(await validateHook.call(req, doc, perms, ctx)).toBe(false);
      expect(await validateHook.call(req, { name: 'valid' }, perms, ctx)).toBe(true);
      const instance = observed.mock.calls[0][0];
      expect(instance).toBeInstanceOf(Child);
      expect(observed.mock.calls[0][1]).toEqual([undefined, doc, undefined, perms, ctx, req]);
      expect(body).toHaveBeenNthCalledWith(1, instance, undefined, doc, undefined, perms, ctx, req);
      expect(observed).toHaveBeenCalledTimes(2);
      expect(getMethodMetadataKeysStartWith(Child.prototype, key, 'validate')).toEqual(['validate.create']);
    },
  );

  it.each([false, true])('override suppresses base hook/parameters (decorated=%s)', async (decorated) => {
    const baseBody = vi.fn();
    const childBody = vi.fn();
    class Base {
      guard(value: unknown) {
        baseBody(value);
        return false;
      }
    }
    compose(Base.prototype, 'guard', [wrapper('replace', vi.fn()), RouteGuard('read')]);
    applyParameterDecorator(Permissions(), Base.prototype, 'guard', 0);
    class Child extends Base {
      guard(value: unknown) {
        childBody(value);
        return false;
      }
    }
    compose(Child.prototype, 'guard', [wrapper('mutate', vi.fn()), ...(decorated ? [RouteGuard('list')] : [])]);
    if (decorated) applyParameterDecorator(Request(), Child.prototype, 'guard', 0);
    const { runtime, model } = bootstrap(Child);
    const access = runtime.getModelOptions(model.modelName).operationAccess as any;
    expect(access.read).toBe(true);
    expect(getMethodMetadata(Child.prototype, 'guard', 'routeGuard.read')).toBeNull();
    if (decorated) {
      const req = { requestId: 'child' };
      expect(await access.list.call(req, { has: () => true })).toBe(false);
      expect(childBody).toHaveBeenCalledWith(req);
    } else {
      expect(access.list).toBe(true);
      expect(childBody).not.toHaveBeenCalled();
    }
    expect(baseBody).not.toHaveBeenCalled();
  });

  it('rejects duplicate wrapped scalar hooks, including an inherited symbol', () => {
    const key = Symbol('baseGuard');
    class Base {
      [key]() {
        return false;
      }
    }
    compose(Base.prototype, key, [wrapper('replace', vi.fn()), RouteGuard('read')]);
    class Child extends Base {
      guard() {
        return true;
      }
    }
    compose(Child.prototype, 'guard', [wrapper('mutate', vi.fn()), RouteGuard('read')]);
    expect(() => bootstrap(Child)).toThrow(/Duplicate decorated @routeGuard.*Symbol\(baseGuard\)/);
  });

  it('rejects mixed hook families separated by a wrapper', () => {
    class Mixed {
      hook() {
        return false;
      }
    }
    compose(Mixed.prototype, 'hook', [Validate('create'), wrapper('replace', vi.fn()), RouteGuard('read')]);
    expect(() => bootstrap(Mixed)).toThrow(/multiple hook decorators/);
  });

  it('retains multiple operation declarations separated by wrappers without duplicating registration', async () => {
    const observed = vi.fn();
    class GuardRouter {
      guard() {
        return false;
      }
    }
    compose(GuardRouter.prototype, 'guard', [RouteGuard('list'), wrapper('replace', observed), RouteGuard('read')]);
    const { runtime, model } = bootstrap(GuardRouter);
    const access = runtime.getModelOptions(model.modelName).operationAccess as any;
    expect(await access.read.call({})).toBe(false);
    expect(await access.list.call({})).toBe(false);
    expect(access.update).toBe(false);
    expect(observed).toHaveBeenCalledTimes(2);
  });

  it('invokes the effective wrapper including its async return and error behavior', async () => {
    const original = vi.fn(() => true);
    const failure = new Error('wrapper failed');
    let reject = false;
    class GuardRouter {
      guard() {
        return original();
      }
    }
    const instrument: MethodDecorator = (_target, _key, descriptor) => ({
      ...descriptor,
      value: async function () {
        if (reject) throw failure;
        return false;
      } as typeof descriptor.value,
    });
    compose(GuardRouter.prototype, 'guard', [instrument, RouteGuard('read')]);
    const { runtime, model } = bootstrap(GuardRouter);
    const guard = runtime.getModelOption(model.modelName, 'operationAccess.read') as Function;
    expect(await guard.call({})).toBe(false);
    reject = true;
    await expect(guard.call({})).rejects.toBe(failure);
    expect(original).not.toHaveBeenCalled();
  });

  it('still reads function-only declarations from older package copies', async () => {
    class LegacyRouter {
      guard() {
        return false;
      }
    }
    Reflect.defineMetadata(HOOK_DEFINITIONS.routeGuard.watermark, true, LegacyRouter.prototype.guard);
    Reflect.defineMetadata('routeGuard.read', true, LegacyRouter.prototype.guard);
    const { runtime, model } = bootstrap(LegacyRouter);
    const guard = runtime.getModelOption(model.modelName, 'operationAccess.read') as Function;
    expect(await guard.call({})).toBe(false);
    expect(getMethodMetadataKeysStartWith(LegacyRouter.prototype, 'guard', 'routeGuard')).toEqual(['routeGuard.read']);
  });
});
