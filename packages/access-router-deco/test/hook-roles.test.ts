import 'reflect-metadata';
import express from 'express';
import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EgoseFactoryStatic } from '../src/factory';
import {
  Module,
  Router,
  RouterOptions,
  GlobalPermissions,
  DocPermissions,
  RouteGuard,
  BaseFilter,
  OverrideFilter,
  Validate,
  Prepare,
  Transform,
  AfterPersist,
  Decorate,
  DecorateAll,
  BeforeDelete,
  AfterDelete,
  Identifier,
  Id,
} from '../src/decorators';
import { HOOK_DEFINITIONS } from '../src/constants';
import { applyMethodDecorator, applyParameterDecorator } from './helpers';
import type { Type } from '../src/interfaces';

type Role = 'module' | 'model router' | 'model options' | 'default options' | 'root router';
const roles: Role[] = ['module', 'model router', 'model options', 'default options', 'root router'];
const modelRoles: Role[] = ['model router', 'model options'];
const sharedRoles: Role[] = [...modelRoles, 'default options'];
// Explicit public contract, independent of the implementation's role table.
const hooks = [
  { name: 'globalPermissions', make: () => GlobalPermissions(), allowed: ['module'] as Role[] },
  { name: 'docPermissions', make: () => DocPermissions('read'), allowed: modelRoles },
  { name: 'routeGuard', make: () => RouteGuard('read'), allowed: sharedRoles },
  { name: 'baseFilter', make: () => BaseFilter('read'), allowed: modelRoles },
  { name: 'overrideFilter', make: () => OverrideFilter('read'), allowed: modelRoles },
  { name: 'validate', make: () => Validate('create'), allowed: modelRoles },
  { name: 'prepare', make: () => Prepare('create'), allowed: modelRoles },
  { name: 'transform', make: () => Transform('update'), allowed: modelRoles },
  { name: 'afterPersist', make: () => AfterPersist('create'), allowed: modelRoles },
  { name: 'decorate', make: () => Decorate('read'), allowed: modelRoles },
  { name: 'decorateAll', make: () => DecorateAll('list'), allowed: modelRoles },
  { name: 'beforeDelete', make: () => BeforeDelete(), allowed: modelRoles },
  { name: 'afterDelete', make: () => AfterDelete(), allowed: modelRoles },
  { name: 'identifier', make: () => Identifier(), allowed: sharedRoles },
];

afterEach(() => vi.restoreAllMocks());

function fixture(role: Role, Provider: Type) {
  const model = new mongoose.Mongoose().model('HookRoleItem', new mongoose.Schema({ slug: String }));
  class TestModule {}
  switch (role) {
    case 'module':
      Module({})(Provider);
      break;
    case 'model router':
      Router(model)(Provider);
      Module({ routers: [Provider] })(TestModule);
      break;
    case 'model options':
      RouterOptions(model)(Provider);
      Module({ routerOptions: [Provider] })(TestModule);
      break;
    case 'default options':
      RouterOptions({})(Provider);
      Module({ routerOptions: [Provider] })(TestModule);
      break;
    case 'root router':
      Router({ basePath: '/root' })(Provider);
      Module({ routers: [Provider] })(TestModule);
      break;
  }
  const factory = EgoseFactoryStatic.create();
  const app = express();
  const snapshot = factory.runtime.runtime.createBootstrapSnapshot();
  const mutations = [
    vi.spyOn(factory.runtime, 'setGlobalOptions'),
    vi.spyOn(factory.runtime, 'setGlobalOption'),
    vi.spyOn(factory.runtime, 'setDefaultModelOptions'),
    vi.spyOn(factory.runtime, 'setDefaultModelOption'),
    vi.spyOn(factory.runtime, 'setModelOptions'),
    vi.spyOn(factory.runtime, 'setModelOption'),
    vi.spyOn(factory.runtime, 'registerModelInstance'),
    vi.spyOn(factory.runtime, 'createRouter'),
    vi.spyOn(app, 'use'),
  ];
  const bootstrap = () => factory.bootstrap(role === 'module' ? Provider : TestModule, app);
  const expectUntouched = () => {
    for (const spy of mutations) expect(spy).not.toHaveBeenCalled();
    expect(factory.runtime.runtime.createBootstrapSnapshot()).toEqual(snapshot);
    expect(app.router.stack).toHaveLength(0);
  };
  return { factory, bootstrap, expectUntouched, moduleType: role === 'module' ? Provider : TestModule };
}

function expectRoleError(bootstrap: () => unknown, className: string, member: string, hook: string) {
  let error: unknown;
  try {
    bootstrap();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(Error);
  const message = (error as Error).message;
  expect(message).toContain(`${className}.${member}`);
  expect(message).toContain(`@${hook}`);
  expect(message).toContain('not supported on');
  expect(message).toContain('valid placement:');
  expect(message).toContain(hook === 'globalPermissions' ? '@Module' : '@Router(Model)');
}

describe('known hook class roles', () => {
  for (const role of roles) {
    for (const hook of hooks) {
      const allowed = hook.allowed.includes(role);
      it(`${allowed ? 'accepts' : 'rejects'} @${hook.name} on ${role}`, () => {
        const constructed = vi.fn();
        class Provider {
          constructor() {
            constructed();
          }
          policy(): any {
            return {};
          }
        }
        applyMethodDecorator(hook.make(), Provider.prototype, 'policy');
        const { bootstrap, expectUntouched } = fixture(role, Provider);
        if (allowed) {
          expect(bootstrap().runtime).toBeDefined();
          expect(constructed).toHaveBeenCalledTimes(1);
        } else {
          expectRoleError(bootstrap, 'Provider', 'policy', hook.name);
          expectUntouched();
          // Failure remains deterministic and releases the tuple reservation.
          expectRoleError(bootstrap, 'Provider', 'policy', hook.name);
          expectUntouched();
        }
        if (role === 'root router') expect(constructed).not.toHaveBeenCalled();
      });
    }
  }

  for (const role of roles) {
    const invalidHook = role === 'model router' || role === 'model options' ? hooks[0] : hooks[3];
    it(`rejects inherited symbol declarations on ${role}`, () => {
      const key = Symbol('inherited-policy');
      class Base {
        [key](): any {
          return {};
        }
      }
      applyMethodDecorator(invalidHook.make(), Base.prototype, key);
      class Provider extends Base {}
      const { bootstrap, expectUntouched } = fixture(role, Provider);
      expectRoleError(bootstrap, 'Provider', String(key), invalidHook.name);
      expectUntouched();
    });

    for (const override of ['method', 'accessor'] as const) {
      it(`suppresses wrong-role base hooks with an undecorated ${override} override on ${role}`, () => {
        const key = Symbol('overridden-policy');
        class Base {
          [key](): any {
            return {};
          }
        }
        applyMethodDecorator(invalidHook.make(), Base.prototype, key);
        class Provider extends Base {
          constructor() {
            super();
            if (role === 'root router') throw new Error('root must not be constructed');
          }
        }
        const getter = vi.fn(() => {
          throw new Error('getter must not run');
        });
        Object.defineProperty(
          Provider.prototype,
          key,
          override === 'method'
            ? {
                value() {
                  return {};
                },
              }
            : { get: getter },
        );
        const { bootstrap } = fixture(role, Provider);
        expect(bootstrap().runtime).toBeDefined();
        expect(getter).not.toHaveBeenCalled();
      });
    }
  }

  for (const role of roles.filter((role) => role !== 'root router')) {
    for (const sameMember of [true, false]) {
      it(`rejects mixed allowed/disallowed hooks on ${sameMember ? 'one member' : 'distinct members'} of ${role}`, () => {
        class Provider {
          policy(): any {
            return {};
          }
          invalid(): any {
            return {};
          }
        }
        const valid = role === 'module' ? GlobalPermissions() : RouteGuard('read');
        const invalid = role === 'model router' || role === 'model options' ? hooks[0] : hooks[3];
        applyMethodDecorator(valid, Provider.prototype, 'policy');
        // Two allowed families before the invalid one must not short-circuit role validation.
        if (sameMember && role !== 'module') applyMethodDecorator(Identifier(), Provider.prototype, 'policy');
        const member = sameMember ? 'policy' : 'invalid';
        applyMethodDecorator(invalid.make(), Provider.prototype, member);
        const { bootstrap, expectUntouched } = fixture(role, Provider);
        expectRoleError(bootstrap, 'Provider', member, invalid.name);
        expectUntouched();
      });
    }
  }

  it('rejects a wrapped wrong-role hook using its member anchor', () => {
    class Provider {
      policy() {
        return false;
      }
    }
    applyMethodDecorator(RouteGuard('read'), Provider.prototype, 'policy');
    const original = Provider.prototype.policy;
    Provider.prototype.policy = function () {
      return original.call(this);
    };
    const { bootstrap, expectUntouched } = fixture('root router', Provider);
    expectRoleError(bootstrap, 'Provider', 'policy', 'routeGuard');
    expectUntouched();
  });

  it('rejects a late root hook before applying earlier valid module, default, and model hooks', () => {
    class InvalidRoot {
      constructor() {
        throw new Error('root must not be constructed');
      }
      deny() {
        return false;
      }
    }
    applyMethodDecorator(RouteGuard('read'), InvalidRoot.prototype, 'deny');
    const { bootstrap, expectUntouched, moduleType } = fixture('root router', InvalidRoot);
    class Defaults {
      deny() {
        return false;
      }
    }
    RouterOptions({})(Defaults);
    applyMethodDecorator(RouteGuard('read'), Defaults.prototype, 'deny');
    class ModelRouter {
      deny() {
        return false;
      }
    }
    Router('LateRoleItem')(ModelRouter);
    applyMethodDecorator(RouteGuard('read'), ModelRouter.prototype, 'deny');
    Object.defineProperty(moduleType.prototype, 'permissions', { value: () => [] });
    applyMethodDecorator(GlobalPermissions(), moduleType.prototype, 'permissions');
    Module({ routers: [ModelRouter, InvalidRoot], routerOptions: [Defaults] })(moduleType);

    expectRoleError(bootstrap, 'InvalidRoot', 'deny', 'routeGuard');
    expectUntouched();
  });

  for (const role of ['module', 'model router', 'model options', 'default options'] as const) {
    it(`uses a decorated symbol override's valid role on ${role}`, () => {
      const key = Symbol('redecorated-policy');
      class Base {
        [key](): any {
          return {};
        }
      }
      const invalid = role === 'module' || role === 'default options' ? BaseFilter('read') : GlobalPermissions();
      applyMethodDecorator(invalid, Base.prototype, key);
      class Provider extends Base {
        [key](): any {
          return {};
        }
      }
      const valid = role === 'module' ? GlobalPermissions() : RouteGuard('read');
      applyMethodDecorator(valid, Provider.prototype, key);
      const { bootstrap } = fixture(role, Provider);
      expect(bootstrap().runtime).toBeDefined();
    });
  }

  it('rejects legacy function-only wrong-role hook metadata', () => {
    class Provider {
      policy() {
        return false;
      }
    }
    Reflect.defineMetadata(HOOK_DEFINITIONS.routeGuard.watermark, true, Provider.prototype.policy);
    Reflect.defineMetadata('routeGuard.read', true, Provider.prototype.policy);
    const { bootstrap, expectUntouched } = fixture('module', Provider);
    expectRoleError(bootstrap, 'Provider', 'policy', 'routeGuard');
    expectUntouched();
  });

  it('invokes valid inherited symbol default guards and identifiers with instance state', async () => {
    const guard = Symbol('guard');
    const identifier = Symbol('identifier');
    class Base {
      field = 'slug';
      [guard]() {
        return false;
      }
      [identifier](id: string) {
        return { [this.field]: id };
      }
    }
    applyMethodDecorator(RouteGuard('read'), Base.prototype, guard);
    applyMethodDecorator(Identifier(), Base.prototype, identifier);
    applyParameterDecorator(Id(), Base.prototype, identifier, 0);
    class Provider extends Base {}
    const { factory, bootstrap } = fixture('default options', Provider);
    bootstrap();
    const deny = factory.runtime.getDefaultModelOption('operationAccess.read') as Function;
    const resolve = factory.runtime.getDefaultModelOption('resolveIdFilter') as Function;
    expect(await deny.call({})).toBe(false);
    expect(await resolve.call({}, 'item-1')).toEqual({ slug: 'item-1' });
  });

  it('publishes a hook-free root without invoking its constructor', () => {
    class Provider {
      constructor() {
        throw new Error('root must not be constructed');
      }
      helper() {
        return false;
      }
    }
    const { bootstrap } = fixture('root router', Provider);
    expect(bootstrap().router.stack.length).toBeGreaterThan(1);
  });
});
