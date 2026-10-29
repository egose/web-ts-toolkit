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
  'unsafeSkipListDocumentSnapshotChecks',
  'unsafeSkipReadDocumentSnapshotChecks',
  'unsafeSkipListOutputSnapshotChecks',
  'unsafeSkipReadOutputSnapshotChecks',
  'unsafeSkipListNestedDocumentSnapshotChecks',
  'unsafeSkipReadNestedDocumentSnapshotChecks',
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
    if (key.startsWith('unsafeSkip')) {
      expect(warn).toHaveBeenCalledTimes(2);
      for (const [, metadata] of warn.mock.calls) expect(metadata).toEqual({ modelName: inherited.modelName });
    } else expect(warn).not.toHaveBeenCalled();
  });
});
