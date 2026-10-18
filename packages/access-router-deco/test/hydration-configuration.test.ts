import 'reflect-metadata';
import express from 'express';
import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelHydrationOptions, ModelRouterOptions } from '@web-ts-toolkit/access-router';
import { DefaultModelOption, EgoseFactoryStatic, ModelOption, Module, Option, Router, RouterOptions } from '../src';

function model(name: string) {
  return new mongoose.Mongoose().model(name, new mongoose.Schema({ name: String }));
}

afterEach(() => vi.restoreAllMocks());

describe('HYD-05 decorator hydration configuration', () => {
  it.each([false, true])(
    'preserves shallow class/provider/property precedence (model providers first=%s)',
    (reverse) => {
      const models = ['Default', 'Provider', 'Router', 'Property', 'Cleared'].map((name) => model(`HydDeco${name}`));

      class Defaults {
        record: ModelHydrationOptions = { find: 'lean', findOne: 'lean' };
        read = 'lean';
      }
      RouterOptions({ hydration: { publicList: 'hydrated', findById: 'lean' } })(Defaults);
      DefaultModelOption('hydration')(Defaults.prototype, 'record');
      DefaultModelOption('hydration.publicRead')(Defaults.prototype, 'read');

      class Provider {
        record: ModelHydrationOptions = { findOne: 'lean' };
        read = 'lean';
      }
      RouterOptions(models[1], { hydration: { publicList: 'hydrated', find: 'hydrated' } })(Provider);
      ModelOption('hydration')(Provider.prototype, 'record');
      ModelOption('hydration.publicRead')(Provider.prototype, 'read');
      class RouterProvider {}
      RouterOptions(models[2], { hydration: { find: 'lean' } })(RouterProvider);
      class PropertyProvider {}
      RouterOptions(models[3], { hydration: { find: 'lean' } })(PropertyProvider);

      class DefaultRouter {}
      Router(models[0])(DefaultRouter);
      class ProviderRouter {}
      Router(models[1])(ProviderRouter);
      class ClassRouter {}
      Router(models[2], { hydration: { publicRead: 'lean' } })(ClassRouter);
      class PropertyRouter {
        record: ModelHydrationOptions = { findOne: 'lean' };
        list = 'hydrated';
      }
      Router(models[3], { hydration: { publicRead: 'lean', findById: 'lean' } })(PropertyRouter);
      ModelOption('hydration')(PropertyRouter.prototype, 'record');
      ModelOption('hydration.publicList')(PropertyRouter.prototype, 'list');
      class ClearedRouter {}
      Router(models[4], { hydration: undefined })(ClearedRouter);

      class AppModule {}
      const providers = [Provider, RouterProvider, PropertyProvider];
      Module({
        routers: [DefaultRouter, ProviderRouter, ClassRouter, PropertyRouter, ClearedRouter],
        routerOptions: reverse ? [...providers, Defaults] : [Defaults, ...providers],
      })(AppModule);
      const factory = EgoseFactoryStatic.create();
      factory.runtime.setDefaultModelOptions({ hydration: { publicList: 'hydrated', publicRead: 'hydrated' } });
      factory.bootstrap(AppModule, express());
      const expected = [
        { find: 'lean', findOne: 'lean', publicRead: 'lean' },
        { findOne: 'lean', publicRead: 'lean' },
        { publicRead: 'lean' },
        { findOne: 'lean', publicList: 'hydrated' },
        undefined,
      ];
      expect(models.map((m) => factory.runtime.getModelOptions(m.modelName).hydration)).toEqual(expected);
      expect(factory.runtime.getDefaultModelOptions().hydration).toEqual(expected[0]);

      // Starting defaults are not a second per-member inheritance layer or a broadcast.
      factory.runtime.setDefaultModelOption('hydration', { findById: 'lean' });
      expect(models.map((m) => factory.runtime.getModelOptions(m.modelName).hydration)).toEqual(expected);
      const later = model('HydDecoLater');
      factory.runtime.registerModelInstance(later.modelName, later);
      factory.runtime.setModelOptions(later.modelName, {});
      expect(factory.runtime.getModelOptions(later.modelName).hydration).toEqual({ findById: 'lean' });
    },
  );

  it.each(['model', 'provider', 'default'] as const)('supports all dotted %s properties and clearing', (scope) => {
    const Item = model('HydDecoDotted');
    class Provider {
      record: ModelHydrationOptions = { publicRead: 'lean', findById: 'lean' };
      publicList = 'hydrated';
      publicRead = undefined;
      find = 'lean';
      findOne = 'lean';
      findById = undefined;
    }
    const property = scope === 'default' ? DefaultModelOption : ModelOption;
    property('hydration')(Provider.prototype, 'record');
    for (const key of ['publicList', 'publicRead', 'find', 'findOne', 'findById'] as const) {
      property(`hydration.${key}`)(Provider.prototype, key);
    }
    class ItemRouter {}
    if (scope === 'model') Router(Item)(Provider);
    else {
      if (scope === 'provider') RouterOptions(Item)(Provider);
      else RouterOptions({})(Provider);
      Router(Item)(ItemRouter);
    }
    class AppModule {}
    Module({
      routers: scope === 'model' ? [Provider] : [ItemRouter],
      routerOptions: scope === 'model' ? [] : [Provider],
    })(AppModule);
    const { runtime } = EgoseFactoryStatic.create().bootstrap(AppModule, express());
    expect(runtime.getModelOptions(Item.modelName).hydration).toEqual({
      publicList: 'hydrated',
      publicRead: undefined,
      find: 'lean',
      findOne: 'lean',
      findById: undefined,
    });
  });

  it.each(['model', 'provider', 'default'] as const)('clears a whole %s record with an undefined property', (scope) => {
    const Item = model('HydDecoClear');
    class Provider {
      unset = undefined;
    }
    const property = scope === 'default' ? DefaultModelOption : ModelOption;
    property('hydration')(Provider.prototype, 'unset');
    class ItemRouter {}
    if (scope === 'model') Router(Item, { hydration: { find: 'lean' } })(Provider);
    else {
      if (scope === 'provider') RouterOptions(Item, { hydration: { find: 'lean' } })(Provider);
      else RouterOptions({ hydration: { find: 'lean' } })(Provider);
      Router(Item)(ItemRouter);
    }
    class AppModule {}
    Module({
      routers: scope === 'model' ? [Provider] : [ItemRouter],
      routerOptions: scope === 'model' ? [] : [Provider],
    })(AppModule);
    const { runtime } = EgoseFactoryStatic.create().bootstrap(AppModule, express());
    expect(runtime.getModelOptions(Item.modelName).hydration).toBeUndefined();
    if (scope === 'default') expect(runtime.getDefaultModelOptions().hydration).toBeUndefined();
  });

  const scopes = ['router', 'provider', 'default', 'model-property', 'provider-property', 'default-property'] as const;
  type Scope = (typeof scopes)[number];

  function invalidFixture(scope: Scope, value: unknown, key = 'hydration') {
    const Existing = model('HydDecoExisting');
    const Candidate = model('HydDecoCandidate');
    class ExistingRouter {}
    Router(Existing, { basePath: '/existing', hydration: { publicRead: 'lean' } })(ExistingRouter);
    class CandidateRouter {}
    Router(Candidate, { basePath: '/candidate' })(CandidateRouter);
    class Provider {
      first = 123;
      candidateValue = value;
    }
    const configure = (next: unknown) => {
      value = next;
      const options = { listHardLimit: 777, [key]: value } as ModelRouterOptions;
      if (scope === 'router') Router(Candidate, { ...options, basePath: '/candidate' })(CandidateRouter);
      else if (scope === 'provider') RouterOptions(Candidate, options)(Provider);
      else if (scope === 'default') RouterOptions(options)(Provider);
    };
    if (scope.endsWith('property')) {
      const property = scope === 'default-property' ? DefaultModelOption : ModelOption;
      property('listHardLimit')(Provider.prototype, 'first');
      if (key === 'hydration' || key === 'hydration.find' || key === 'hydration.publicRead') {
        property(key)(Provider.prototype, 'candidateValue');
      } else if (key === 'defaults' && scope !== 'default-property') {
        ModelOption('defaults')(Provider.prototype, 'candidateValue');
      } else {
        // Legacy Option permits intentionally invalid/obsolete keys; canonical setters still reject them.
        Option(key)(Provider.prototype, 'candidateValue');
      }
      if (scope === 'model-property') Router(Candidate, { basePath: '/candidate' })(Provider);
      else if (scope === 'provider-property') RouterOptions(Candidate)(Provider);
      else RouterOptions({})(Provider);
    }
    configure(value);
    class AppModule {}
    Module({
      routers: [ExistingRouter, scope === 'model-property' ? Provider : CandidateRouter],
      routerOptions: scope === 'router' || scope === 'model-property' ? [] : [Provider],
      options: { requestPermissionField: 'temporary' },
    })(AppModule);
    const factory = EgoseFactoryStatic.create();
    factory.runtime.registerModelInstance(Existing.modelName, Existing);
    factory.runtime.setModelOptions(Existing.modelName, { hydration: { find: 'lean' }, listHardLimit: 12 });
    factory.runtime.setDefaultModelOptions({ hydration: { publicRead: 'hydrated' }, listHardLimit: 10 });
    const app = express();
    app.get('/host', (_req, res) => res.sendStatus(204));
    return { factory, app, AppModule, configure };
  }

  const invalidRecords = [null, [], false, 'lean', new Date(0), { default: 'lean' }, { publicRead: true }];
  for (const scope of scopes) {
    it.each(invalidRecords)(`rejects invalid ${scope} record %j atomically and permits a corrected retry`, (value) => {
      const f = invalidFixture(scope, value);
      const before = f.factory.runtime.runtime.createBootstrapSnapshot();
      const length = f.app.router.stack.length;
      // Observe the canonical setter before factory rollback, not just the final restored state.
      let rejected = 0;
      let diagnostic = '';
      for (const name of [
        'setModelOptions',
        'setModelOption',
        'setDefaultModelOptions',
        'setDefaultModelOption',
      ] as const) {
        const original = f.factory.runtime[name];
        vi.spyOn(f.factory.runtime, name).mockImplementation((...args: any[]) => {
          const snapshot = f.factory.runtime.runtime.createBootstrapSnapshot();
          try {
            return Reflect.apply(original, f.factory.runtime, args);
          } catch (error) {
            expect(f.factory.runtime.runtime.createBootstrapSnapshot()).toEqual(snapshot);
            rejected++;
            diagnostic = (error as Error).message;
            throw error;
          }
        });
      }
      expect(() => f.factory.bootstrap(f.AppModule, f.app)).toThrow(TypeError);
      expect(rejected).toBe(1);
      expect(diagnostic).toMatch(/^hydration(?:\.| )/);
      expect(f.factory.runtime.runtime.createBootstrapSnapshot()).toEqual(before);
      expect(f.app.router.stack).toHaveLength(length);
      f.configure({ publicRead: 'lean' });
      f.factory.bootstrap(f.AppModule, f.app);
      expect(f.app.router.stack).toHaveLength(length + 1);
      expect(f.factory.runtime.getModelOptions('HydDecoCandidate').hydration).toEqual({ publicRead: 'lean' });
      expect(() => f.factory.bootstrap(f.AppModule, f.app)).toThrow(/already called/);
    });
  }

  it.each(['model-property', 'provider-property', 'default-property'] as const)(
    'rejects invalid dotted %s hydration with path-bearing canonical errors',
    (scope) => {
      for (const [key, value] of [
        ['hydration.find', false],
        ['hydration.publicRead', null],
        ['hydration.default', 'lean'],
      ] as const) {
        const f = invalidFixture(scope, value, key);
        const before = f.factory.runtime.runtime.createBootstrapSnapshot();
        expect(() => f.factory.bootstrap(f.AppModule, f.app)).toThrow(new RegExp(key.replace('.', '\\.')));
        expect(f.factory.runtime.runtime.createBootstrapSnapshot()).toEqual(before);
        expect(f.app.router.stack).toHaveLength(1);
      }
    },
  );

  it.each(scopes)('rejects legacy %s defaults with migration diagnostics and rollback', (scope) => {
    for (const key of ['lean', 'hydration']) {
      const f = invalidFixture(scope, { publicReadOptions: { [key]: undefined } }, 'defaults');
      const before = f.factory.runtime.runtime.createBootstrapSnapshot();
      expect(() => f.factory.bootstrap(f.AppModule, f.app)).toThrow(
        new RegExp(`defaults.publicReadOptions.${key}.*hydration.publicRead`),
      );
      expect(f.factory.runtime.runtime.createBootstrapSnapshot()).toEqual(before);
      expect(f.app.router.stack).toHaveLength(1);
    }
  });

  it('rejects retired bucket and dotted defaults properties before mounting', () => {
    for (const scope of ['model-property', 'default-property'] as const) {
      for (const [key, value] of [
        ['defaults.findOptions', { lean: true }],
        ['defaults.findOptions.lean', undefined],
        ['defaults.findOptions.hydration', 'lean'],
      ] as const) {
        const f = invalidFixture(scope, value, key);
        const before = f.factory.runtime.runtime.createBootstrapSnapshot();
        expect(() => f.factory.bootstrap(f.AppModule, f.app)).toThrow(/defaults.findOptions.*hydration.find/);
        expect(f.factory.runtime.runtime.createBootstrapSnapshot()).toEqual(before);
        expect(f.app.router.stack).toHaveLength(1);
      }
    }
  });
});
