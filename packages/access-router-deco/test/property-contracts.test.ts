import 'reflect-metadata';
import express from 'express';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  EgoseFactoryStatic,
  Module,
  Router,
  RouterOptions,
  Option,
  GlobalOption,
  ModelOption,
  DefaultModelOption,
} from '../src';
import type { Type } from '../src';

type Role = 'global' | 'model' | 'provider' | 'default' | 'root';
function fixture(Provider: Type, role: Role) {
  const model = new mongoose.Mongoose().model('PropertyItem', new mongoose.Schema({ name: String }));
  class AppModule {}
  if (role === 'global') Module({ routers: [] })(Provider);
  else if (role === 'model') {
    Router(model)(Provider);
    Module({ routers: [Provider] })(AppModule);
  } else if (role === 'root') {
    Router({ basePath: '/batch' })(Provider);
    Module({ routers: [Provider] })(AppModule);
  } else {
    if (role === 'provider') RouterOptions(model)(Provider);
    else RouterOptions({})(Provider);
    Module({ routers: [], routerOptions: [Provider] })(AppModule);
  }
  const factory = EgoseFactoryStatic.create();
  const app = express();
  return { factory, app, run: () => factory.bootstrap(role === 'global' ? Provider : AppModule, app) };
}

describe('property option contracts', () => {
  for (const role of ['global', 'model', 'provider', 'default', 'root'] as const) {
    for (const [scope, make] of [
      ['global', GlobalOption],
      ['model', ModelOption],
      ['default', DefaultModelOption],
    ] as const) {
      it(`${scope} inferred property on ${role} validates placement before publication`, () => {
        class Provider {
          extension = 'value';
        }
        make()(Provider.prototype, 'extension');
        const { factory, app, run } = fixture(Provider, role);
        const before = factory.runtime.runtime.createBootstrapSnapshot();
        if (scope === role || (scope === 'model' && role === 'provider')) expect(run).not.toThrow();
        else {
          expect(run).toThrow(/Invalid option scope.*extension/);
          expect(factory.runtime.runtime.createBootstrapSnapshot()).toEqual(before);
          expect(app.router.stack).toHaveLength(0);
        }
      });
    }
  }

  it.each([
    ['requestPermissionField', 123],
    ['documentPermissionField', null],
    ['idParam', false],
    ['idField', []],
    ['parentPath', 123],
    ['basePath', {}],
    ['queryRouteSegment', false],
    ['mutationRouteSegment', null],
    ['modelPermissionPrefix', 1],
    ['modelName', 1],
    ['listHardLimit', '10'],
    ['listHardLimit', NaN],
    ['listHardLimit', Infinity],
    ['requireRegisteredPopulateModels', 'false'],
  ])('legacy Option rejects %s = %s and rolls back earlier writes', (key, value) => {
    class Provider {
      first = 'changed';
      invalid = value;
    }
    Option('requestPermissionField')(Provider.prototype, 'first');
    Option(key as string)(Provider.prototype, 'invalid');
    const { factory, app, run } = fixture(Provider, 'global');
    const before = factory.runtime.runtime.createBootstrapSnapshot();
    expect(run).toThrow(/Invalid option value/);
    expect(factory.runtime.runtime.createBootstrapSnapshot()).toEqual(before);
    expect(app.router.stack).toHaveLength(0);
  });

  it('preserves extension keys, optional undefined, and valid false/zero values', () => {
    class Provider {
      flag = false;
      limit = 0;
      unset = undefined;
      extension = { custom: true };
    }
    Option('requireRegisteredPopulateModels')(Provider.prototype, 'flag');
    Option('listHardLimit')(Provider.prototype, 'limit');
    Option('requestPermissionField')(Provider.prototype, 'unset');
    Option('custom.extension')(Provider.prototype, 'extension');
    const { factory, run } = fixture(Provider, 'global');
    run();
    expect(factory.runtime.getGlobalOption('requireRegisteredPopulateModels')).toBe(false);
    expect(factory.runtime.getGlobalOptions()).toMatchObject({
      listHardLimit: 0,
      custom: { extension: { custom: true } },
    });
  });

  it('remaps a symbol property through three levels without stale writes', () => {
    const property = Symbol('option');
    class Base {
      [property] = 'base';
    }
    Option('old')(Base.prototype, property);
    class Middle extends Base {
      override [property] = 'middle';
    }
    Option('middle')(Middle.prototype, property);
    class Child extends Middle {
      override [property] = 'child';
    }
    Option('final')(Child.prototype, property);
    const { factory, run } = fixture(Child, 'global');
    run();
    const options = factory.runtime.getGlobalOptions();
    expect(options).toHaveProperty('final', 'child');
    expect(options).not.toHaveProperty('old');
    expect(options).not.toHaveProperty('middle');
  });

  it('rejects legacy property declarations on unconstructed root routers', () => {
    class Root {
      constructor() {
        throw new Error('must not construct');
      }
      option = 1;
    }
    Option('extension')(Root.prototype, 'option');
    expect(fixture(Root, 'root').run).toThrow(/Invalid option scope/);
  });
});
