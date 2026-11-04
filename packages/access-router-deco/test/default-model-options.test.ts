import 'reflect-metadata';
import express from 'express';
import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '@web-ts-toolkit/access-router';
import { DefaultModelOption, EgoseFactoryStatic, Module, Router, RouterOptions } from '../src';

const flags = [
  'requireExplicitSelect',
  'stripDisallowedSort',
  'stripPermissionsField',
  'disableFieldPermissions',
] as const;
const retired = [
  'unsafeSkipListDocumentSnapshotChecks',
  'unsafeSkipReadDocumentSnapshotChecks',
  'unsafeSkipListOutputSnapshotChecks',
  'unsafeSkipReadOutputSnapshotChecks',
  'unsafeSkipListNestedDocumentSnapshotChecks',
  'unsafeSkipReadNestedDocumentSnapshotChecks',
  'unsafeSkipListInitialOutputSnapshotCopy',
  'unsafeSkipReadInitialOutputSnapshotCopy',
  'unsafeUseListAuthorizationFastPath',
  'unsafeUseReadAuthorizationFastPath',
] as const;

describe('default-model flag inheritance through decorator bootstrap', () => {
  it.each(flags)('%s stays inherited while explicit model false remains authoritative', (key) => {
    const api = createAccessRuntime(),
      warn = vi.fn();
    api.setGlobalOptions({ logger: { warn } });
    const db = new mongoose.Mongoose();
    const inherited = db.model('DefaultFlagsInherited', new mongoose.Schema({ name: String }));
    const explicit = db.model('DefaultFlagsExplicit', inherited.schema);
    class Defaults {
      enabled = true;
    }
    RouterOptions({})(Defaults);
    DefaultModelOption(key)(Defaults.prototype, 'enabled');
    class Inherited {}
    Router(inherited)(Inherited);
    class Explicit {}
    Router(explicit, { [key]: false })(Explicit);
    class AppModule {}
    Module({ routerOptions: [Defaults], routers: [Inherited, Explicit] })(AppModule);
    EgoseFactoryStatic.create(api).bootstrap(AppModule, express());
    expect(api.getModelOption(inherited.modelName, key)).toBe(true);
    expect(api.getModelOption(explicit.modelName, key)).toBe(false);
    const before = api.getModelOptions(inherited.modelName);
    api.setDefaultModelOption(key, false);
    expect(api.getModelOption(inherited.modelName, key)).toBe(false);
    api.setDefaultModelOption(key, true);
    expect(api.getModelOptions(inherited.modelName)[key]).toBe(true);
    expect(api.getModelOptions(explicit.modelName)[key]).toBe(false);
    expect(before[key]).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    'readAuthorizationMode',
    'listAuthorizationMode',
    'createAuthorizationMode',
    'updateAuthorizationMode',
  ] as const)('%s stays inherited while explicit isolation is retained and undefined restores inheritance', (key) => {
    const api = createAccessRuntime();
    const warn = vi.fn();
    api.setGlobalOptions({ logger: { warn } });
    const db = new mongoose.Mongoose();
    const inherited = db.model('DefaultModesInherited', new mongoose.Schema({ name: String }));
    const explicit = db.model('DefaultModesExplicit', inherited.schema);
    class Defaults {
      enabled = 'trusted' as const;
    }
    RouterOptions({})(Defaults);
    DefaultModelOption(key)(Defaults.prototype, 'enabled');
    class Inherited {}
    Router(inherited)(Inherited);
    class Explicit {}
    Router(explicit, { [key]: 'isolated' })(Explicit);
    class App {}
    Module({ routerOptions: [Defaults], routers: [Inherited, Explicit] })(App);
    EgoseFactoryStatic.create(api).bootstrap(App, express());
    expect(api.getModelOption(inherited.modelName, key)).toBe('trusted');
    expect(api.getModelOption(explicit.modelName, key)).toBe('isolated');
    const before = api.getModelOptions(inherited.modelName);
    expect(warn).toHaveBeenCalledTimes(2);
    api.setDefaultModelOption(key, undefined);
    expect(api.getModelOption(inherited.modelName, key)).toBe('isolated');
    api.setDefaultModelOption(key, 'trusted');
    expect(api.getModelOption(inherited.modelName, key)).toBe('trusted');
    expect(api.getModelOption(explicit.modelName, key)).toBe('isolated');
    expect(before[key]).toBe('trusted');
    expect(warn).toHaveBeenCalledTimes(4);
    api.setModelOption(explicit.modelName, key, undefined);
    expect(api.getModelOptions(explicit.modelName)[key]).toBe('trusted');
    expect(warn).toHaveBeenCalledTimes(5);
  });

  it.each(retired)('rejects retired default %s before bootstrap publication, even for undefined', (key) => {
    const api = createAccessRuntime();
    const warn = vi.fn();
    api.setGlobalOptions({ logger: { warn } });
    class Defaults {
      retired = undefined;
    }
    RouterOptions({})(Defaults);
    DefaultModelOption(key as never)(Defaults.prototype, 'retired');
    class App {}
    Module({ routerOptions: [Defaults], routers: [] })(App);
    const before = api.runtime.createBootstrapSnapshot();
    expect(() => EgoseFactoryStatic.create(api).bootstrap(App, express())).toThrow(/removed/);
    expect(api.runtime.createBootstrapSnapshot()).toEqual(before);
    expect(warn).not.toHaveBeenCalled();
  });
});
