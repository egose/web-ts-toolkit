import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compactPersistedProjection, planAuthorizedModelProjection } from '../src/acl/output-projection';
import { captureOutputHelperConfiguration } from '../src/acl/model-output-planning';
import {
  captureAuthorizationPermissions,
  readServiceAuthorization,
  readServiceOutputPolicy,
} from '../src/acl/service-authorization';
import { isCatalogOutputPath, prepareCapturedOutputCatalog } from '../src/acl/field-catalog';
import { EMPTY_DOCUMENT_GRANTS } from '../src/acl/document-grants';
import { ServiceAuthorizationError } from '../src/acl/authorization-snapshot';
import type { ModelRequest } from '../src/interfaces';
import type { AccessRouterPermissions } from '../src/permission';
import Permission from '../src/permission';
import type { DocumentGrants } from '../src/interfaces/access';
import { PERMISSIONS } from '../src/symbols';
import { ownedStageFixture, quietOutput, sourceModes } from './owned-stage-test-fixture';

afterEach(() => vi.restoreAllMocks());

describe('fresh owned output preparation avoids repeated projection work', () => {
  it('an output-only capture reuses privately immutable exact Permission data without copying its map again', () => {
    const actor = new Permission({ reader: true, admin: false });
    const fromEntries = vi.spyOn(Object, 'fromEntries');
    const captured = captureAuthorizationPermissions(actor, true);
    const copies = fromEntries.mock.calls.length;
    fromEntries.mockRestore();
    expect(captured === actor).toBe(true);
    expect(copies).toBe(0);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured.keys)).toBe(true);
    expect(captured.has('reader')).toBe(true);
  });

  it('does not treat a mutable Permission subclass as privately owned immutable actor data', () => {
    let reader = true;
    class LivePermissions extends Permission {
      has() {
        return reader;
      }
    }
    const live = new LivePermissions({ reader: true });
    const first = captureAuthorizationPermissions(live, true);
    expect(first).not.toBe(live);
    reader = false;
    expect(first.has('reader')).toBe(true);
    expect(captureAuthorizationPermissions(live, true).has('reader')).toBe(false);
    expect(() => captureAuthorizationPermissions(new Proxy(new Permission({ reader: true }), {}), true)).toThrow(
      TypeError,
    );
  });

  it.each(sourceModes)(
    '%s an independent helper re-reads a replaced actor while in-flight work retains its actor',
    async (mode) => {
      let release!: () => void;
      const waiting = new Promise<void>((done) => {
        release = done;
      });
      const f = ownedStageFixture({
        mode,
        modelOptions: {
          permissionSchema: {
            first: async (permissions) => {
              await waiting;
              return permissions.has('reader');
            },
            second: 'reader',
          },
        },
      });
      const input = { first: 'one', second: 'two' };
      const first = f.direct.pickAllowedFields(input, 'read', {});
      f.request[PERMISSIONS] = new Permission({ reader: false });
      release();
      expect(await first).toEqual(input);
      expect(await f.direct.pickAllowedFields(input, 'read', {})).toEqual({});
      expect(f.adapter.findOne).not.toHaveBeenCalled();
    },
  );

  it.each(sourceModes)('%s planning and evaluation use the same freshly captured primitive catalog', (mode) => {
    const f = ownedStageFixture({ mode });
    const configuration = readServiceAuthorization(f.call, f.binding).configuration;
    const output = readServiceOutputPolicy(f.call, f.binding);
    expect(output.catalog === configuration.catalog).toBe(true);
    expect(Object.isFrozen(output.catalog.paths)).toBe(true);
    const next = captureOutputHelperConfiguration(f.runtime, f.model.modelName);
    expect(next.catalog).not.toBe(output.catalog);
  });

  it('compacts ordinary wide projections by ancestors rather than comparing every pair', () => {
    const paths = Array.from({ length: 240 }, (_, index) => `field${index}`);
    const startsWith = vi.spyOn(String.prototype, 'startsWith');
    const result = compactPersistedProjection(paths);
    const comparisons = startsWith.mock.calls.length;
    startsWith.mockRestore();
    expect(result).toEqual(paths);
    expect(comparisons).toBeLessThanOrEqual(paths.length * 2);
  });

  it('owned primitive catalog indexing needs no second descriptor-density walk or index reset', () => {
    const f = ownedStageFixture();
    const catalog = readServiceOutputPolicy(f.call, f.binding).catalog;
    const arrays = Object.values(catalog);
    const descriptor = vi.spyOn(Object, 'getOwnPropertyDescriptor');
    for (let index = 0; index < 40; index++) isCatalogOutputPath(catalog, 'value');
    prepareCapturedOutputCatalog(catalog);
    for (let index = 0; index < 40; index++) isCatalogOutputPath(catalog, 'value');
    const densityReads = descriptor.mock.calls.filter(([value]) => arrays.includes(value)).length;
    descriptor.mockRestore();
    expect(densityReads).toBe(0);
  });

  it('compaction retains order and exact dotted ancestor semantics, not text prefixes', () => {
    expect(
      compactPersistedProjection([
        'ab.child',
        'a.b.c',
        'a.b',
        '_id',
        'a',
        'ab.child',
        '-excluded',
        '',
        'x..child',
        'x.',
        'y.child',
      ]),
    ).toEqual(['ab.child', '_id', 'a', 'x.', 'y.child']);
  });

  it('an unbranded frozen catalog still passes detached descriptor admission', () => {
    const paths = Object.freeze(['value', 'hidden']);
    const catalog = Object.freeze({ paths, protectedPaths: Object.freeze(['hidden']) });
    const f = ownedStageFixture({ configuration: { catalog } });
    const output = readServiceOutputPolicy(f.call, f.binding).catalog;
    expect(output).not.toBe(catalog);
    expect(output.paths).not.toBe(paths);
    expect(isCatalogOutputPath(output, 'value')).toBe(true);
    expect(isCatalogOutputPath(output, 'hidden')).toBe(false);
  });

  it('fresh catalogs see schema changes and do not share dynamic eligibility decisions', () => {
    const f = ownedStageFixture({ schema: { links: { type: Map, of: String } } });
    const first = captureOutputHelperConfiguration(f.runtime, f.model.modelName);
    for (let index = 0; index < 40; index++) {
      expect(isCatalogOutputPath(first.catalog, 'value')).toBe(true);
    }
    expect(isCatalogOutputPath(first.catalog, 'late')).toBe(false);
    expect(isCatalogOutputPath(first.catalog, 'links.named')).toBe(true);
    expect(isCatalogOutputPath(first.catalog, 'links.named.child')).toBe(false);
    f.model.schema.add({ late: String });
    const next = captureOutputHelperConfiguration(f.runtime, f.model.modelName);
    expect(next.catalog).not.toBe(first.catalog);
    expect(isCatalogOutputPath(next.catalog, 'late')).toBe(true);
    expect(isCatalogOutputPath(first.catalog, 'late')).toBe(false);
  });

  it('indexed catalog eligibility still excludes ref and virtual interiors and protected native paths', () => {
    const f = ownedStageFixture({
      schema: { target: { type: mongoose.Schema.Types.ObjectId, ref: 'Other' } },
      modelOptions: { virtuals: { summary: { get: () => 'summary' } }, permissionSchema: { summary: true } },
    });
    const catalog = readServiceOutputPolicy(f.call, f.binding).catalog;
    for (let index = 0; index < 40; index++) isCatalogOutputPath(catalog, 'value');
    expect(isCatalogOutputPath(catalog, 'target')).toBe(true);
    expect(isCatalogOutputPath(catalog, 'target.secret')).toBe(false);
    expect(isCatalogOutputPath(catalog, 'summary')).toBe(true);
    expect(isCatalogOutputPath(catalog, 'summary.secret')).toBe(false);
    for (const path of ['_permissions', '_permissions.owner', '__v', 'payload.__proto__', 'links.$*']) {
      expect(isCatalogOutputPath(catalog, path)).toBe(false);
    }
  });

  it.each(sourceModes)(
    '%s helper captures each call and evaluates fresh actor/empty facts with no I/O',
    async (mode) => {
      const seen: unknown[] = [];
      const predicate = vi.fn(function (
        this: ModelRequest,
        permissions: AccessRouterPermissions,
        facts: DocumentGrants,
      ) {
        seen.push(facts);
        return this === f.request && permissions.has('reader') && facts === EMPTY_DOCUMENT_GRANTS;
      });
      const hook = vi.fn(() => ({ owner: true }));
      const f = ownedStageFixture({
        mode,
        modelOptions: { permissionSchema: { value: predicate, hidden: false }, docPermissions: { read: hook } },
      });
      const denied = vi.fn(() => 'not observed');
      const input = { value: 'visible', hidden: 'denied data' };
      expect(await f.direct.pickAllowedFields(input, 'read', {})).toEqual({ value: 'visible' });
      f.runtime.setModelOption(f.model.modelName, 'permissionSchema.value', false);
      expect(await f.direct.pickAllowedFields(input, 'read', {})).toEqual({});
      expect(predicate).toHaveBeenCalledTimes(1);
      expect(seen).toEqual([EMPTY_DOCUMENT_GRANTS]);
      await expect(
        f.direct.pickAllowedFields(
          {
            value: 'visible',
            get hidden() {
              return denied();
            },
          },
          'read',
          {},
        ),
      ).rejects.toBeInstanceOf(ServiceAuthorizationError);
      expect(denied).not.toHaveBeenCalled();
      expect(hook).not.toHaveBeenCalled();
      expect(f.adapter.find).not.toHaveBeenCalled();
      expect(f.adapter.findOne).not.toHaveBeenCalled();
    },
  );

  it.each(sourceModes)('%s a normal wide read retains all 24 field checks and one read/hook', async (mode) => {
    const fields = Array.from({ length: 24 }, (_, index) => `field${index}`);
    const predicate = vi.fn((_permissions, facts) => facts.owner === true);
    const hook = vi.fn(() => ({ owner: true }));
    const f = ownedStageFixture({
      mode,
      schema: Object.fromEntries(fields.map((field) => [field, String])),
      modelOptions: {
        permissionSchema: Object.fromEntries(fields.map((field) => [field, predicate])),
        docPermissions: { read: hook },
      },
    });
    const input = { _id: 'row', ...Object.fromEntries(fields.map((field) => [field, field])) };
    f.adapter.findOne.mockResolvedValue(input);
    const plan = planAuthorizedModelProjection({ authorization: f.call, binding: f.binding, requestedSelect: fields });
    expect(plan.outputPersistedFields).toEqual(fields);
    const result = await f.direct.findById('row', { select: [...fields, '-_id'] }, quietOutput);
    expect(result.success && result.data).toEqual(Object.fromEntries(fields.map((field) => [field, field])));
    expect(predicate).toHaveBeenCalledTimes(24);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
    expect(f.adapter.find).not.toHaveBeenCalled();
  });
});
