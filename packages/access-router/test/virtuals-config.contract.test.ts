/**
 * VIRT-01 virtual definition types + router option plumbing.
 *
 * Covers malformed descriptors, dotted/non-array dependencies, unsupported
 * accesses, root/embedded schema collisions, metadata-path overlaps,
 * rejected-mutation rollback, immutable descriptor snapshot replacement,
 * exact → .default → bare resolution (without interpreting an access-record
 * as a getter when the access is absent), and inapplicable-stays-virtual.
 */
import mongoose from 'mongoose';
import { afterEach, describe, expect, it } from 'vitest';

import { createAccessRuntime, defaultRuntime, setGlobalOptions } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let counter = 0;
const activeRuntimes: Array<{ clearOpenApiRoutes(): void }> = [];

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });
};

afterEach(() => {
  for (const entry of activeRuntimes.splice(0)) {
    entry.clearOpenApiRoutes();
  }
  defaultRuntime.clearOpenApiRoutes();
  resetGlobalOptions();
  mongoose.deleteModel(/VirtCfg.*/);
});

const makeGetter = (suffix: string) =>
  async function (this: unknown, doc: unknown) {
    void suffix;
    void doc;
    return `v:${suffix}`;
  };

describe('VIRT-01 virtuals option plumbing + configuration validation', () => {
  it('accepts a valid root virtual with permission key and resolves exact/default/bare', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = ++counter;
    const name = `VirtCfgValid${tag}`;
    const Model = mongoose.model(name, new mongoose.Schema({ name: String, address: String }));
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });

    const readGetter = makeGetter('read');
    runtime.createRouter(Model, {
      basePath: `/virtcfg-valid-${tag}`,
      operationAccess: { list: true, read: true },
      permissionSchema: {
        name: { read: true },
        address: { read: true },
        fullAddress: { read: true },
      },
      virtuals: {
        fullAddress: {
          dependsOn: ['address'],
          read: readGetter as never,
        },
      } as never,
    });

    expect(runtime.runtime.getVirtualNames(name)).toEqual(['fullAddress']);
    expect(runtime.runtime.isVirtualField(name, 'fullAddress')).toBe(true);
    expect(runtime.runtime.isVirtualField(name, 'address')).toBe(false);

    const resolved = runtime.runtime.resolveVirtualDescriptor(name, 'fullAddress', 'read') as {
      get: unknown;
      dependsOn: string[];
    };
    expect(resolved.get).toBe(readGetter);
    expect(resolved.dependsOn).toEqual(['address']);

    // getModelOption exact → .default → bare per getNestedOption (bare descriptor case).
    const viaNested = runtime.getModelOption(name, 'virtuals.fullAddress.read') as unknown;
    expect(viaNested).toBeDefined();
  });

  it('supports bare descriptor and default fallback without misinterpreting records', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = ++counter;
    const name = `VirtCfgFallback${tag}`;
    const Model = mongoose.model(name, new mongoose.Schema({ name: String, address: String }));
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });

    const bareGet = makeGetter('bare');
    const defaultGet = makeGetter('default');
    const readGet = makeGetter('read');

    runtime.createRouter(Model, {
      basePath: `/virtcfg-fallback-${tag}`,
      operationAccess: { list: true, read: true },
      permissionSchema: { name: true, address: true, bare: true, withDefault: true, readOnly: true },
      virtuals: {
        bare: { get: bareGet, dependsOn: ['address'] },
        withDefault: {
          default: { get: defaultGet, dependsOn: ['name'] },
          read: { get: readGet, dependsOn: ['address'] },
        },
        readOnly: { read: { get: readGet, dependsOn: ['address'] } },
      } as never,
    });

    // Bare applies to any access.
    expect((runtime.runtime.resolveVirtualDescriptor(name, 'bare', 'read') as { get: unknown }).get).toBe(bareGet);
    expect((runtime.runtime.resolveVirtualDescriptor(name, 'bare', 'create') as { get: unknown }).get).toBe(bareGet);

    // Exact wins over default.
    expect((runtime.runtime.resolveVirtualDescriptor(name, 'withDefault', 'read') as { get: unknown }).get).toBe(
      readGet,
    );
    expect((runtime.runtime.resolveVirtualDescriptor(name, 'withDefault', 'create') as { get: unknown }).get).toBe(
      defaultGet,
    );

    // Inapplicable stays virtual: no getter, but still a virtual (never persisted).
    expect(runtime.runtime.resolveVirtualDescriptor(name, 'readOnly', 'create')).toBeUndefined();
    expect(runtime.runtime.isVirtualField(name, 'readOnly')).toBe(true);
    expect(runtime.runtime.getVirtualNames(name).sort()).toEqual(['bare', 'readOnly', 'withDefault'].sort());
  });

  it('rejects malformed descriptors (non-callable getter, non-object, empty)', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = ++counter;
    const base = `VirtCfgMalformed${tag}`;
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });

    const badCases: Array<[string, unknown]> = [
      ['nonFunctionGet', { fullAddress: { get: 'not-fn', dependsOn: ['address'] } }],
      ['stringLeaf', { fullAddress: 'nope' }],
      ['emptyRecord', { fullAddress: {} }],
      ['dependsOnWithoutGetter', { fullAddress: { dependsOn: ['address'] } }],
      ['getWithSub', { fullAddress: { get: makeGetter('x'), sub: {} } }],
    ];

    for (const [suffix, virtuals] of badCases) {
      const modelName = `${base}${suffix}`;
      const Model = mongoose.model(modelName, new mongoose.Schema({ name: String, address: String }));
      expect(() =>
        runtime.createRouter(Model, {
          basePath: `/virtcfg-mal-${tag}-${suffix}`,
          operationAccess: true,
          permissionSchema: { name: true },
          virtuals: virtuals as never,
        }),
      ).toThrow();
    }
  });

  it('rejects dotted and non-array dependencies plus virtual-to-virtual', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = ++counter;
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });

    const mk = (suffix: string, virtuals: unknown) => {
      const modelName = `VirtCfgDep${tag}${suffix}`;
      const Model = mongoose.model(modelName, new mongoose.Schema({ name: String, address: String }));
      expect(() =>
        runtime.createRouter(Model, {
          basePath: `/virtcfg-dep-${tag}-${suffix}`,
          operationAccess: true,
          permissionSchema: { name: true },
          virtuals: virtuals as never,
        }),
      ).toThrow();
    };

    mk('dotted', { fullAddress: { get: makeGetter('x'), dependsOn: ['address.city'] } });
    mk('nonArray', { fullAddress: { get: makeGetter('x'), dependsOn: 'address' } });
    mk('unknownField', { fullAddress: { get: makeGetter('x'), dependsOn: ['addres'] } });
    mk('virtualToVirtual', {
      a: { get: makeGetter('a'), dependsOn: ['name'] },
      b: { get: makeGetter('b'), dependsOn: ['a'] },
    });
  });

  it('rejects unsupported accesses (delete/distinct/count/unknown)', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = ++counter;
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });

    for (const access of ['delete', 'distinct', 'count', 'bogus']) {
      const modelName = `VirtCfgAccess${tag}${access}`;
      const Model = mongoose.model(modelName, new mongoose.Schema({ name: String }));
      expect(() =>
        runtime.createRouter(Model, {
          basePath: `/virtcfg-acc-${tag}-${access}`,
          operationAccess: true,
          permissionSchema: { name: true },
          virtuals: { fullAddress: { [access]: { get: makeGetter(access) } } } as never,
        }),
      ).toThrow();
    }
  });

  it('rejects root and embedded stored-path collisions (real schema, not getModelAtt alone)', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = ++counter;
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });

    // Root collision: virtual name equals a persisted top-level path.
    {
      const modelName = `VirtCfgRootColl${tag}`;
      const Model = mongoose.model(modelName, new mongoose.Schema({ name: String, address: String }));
      expect(() =>
        runtime.createRouter(Model, {
          basePath: `/virtcfg-rootcoll-${tag}`,
          operationAccess: true,
          permissionSchema: { name: true },
          virtuals: { address: { get: makeGetter('x'), dependsOn: ['name'] } } as never,
        }),
      ).toThrow();
    }

    // Embedded collision: sub virtual equals a persisted child path.
    {
      const modelName = `VirtCfgEmbColl${tag}`;
      const child = new mongoose.Schema({ displayName: String, email: String });
      const Model = mongoose.model(modelName, new mongoose.Schema({ name: String, contacts: [child] }));
      expect(() =>
        runtime.createRouter(Model, {
          basePath: `/virtcfg-embcoll-${tag}`,
          operationAccess: true,
          permissionSchema: { name: true },
          virtuals: {
            contacts: { sub: { displayName: { get: makeGetter('x'), dependsOn: ['email'] } } },
          } as never,
        }),
      ).toThrow();
    }

    // Embedded container itself is NOT a leaf collision (allowed when valid).
    {
      const modelName = `VirtCfgEmbOk${tag}`;
      const child = new mongoose.Schema({ displayName: String, email: String });
      const Model = mongoose.model(modelName, new mongoose.Schema({ name: String, contacts: [child] }));
      expect(() =>
        runtime.createRouter(Model, {
          basePath: `/virtcfg-embok-${tag}`,
          operationAccess: true,
          permissionSchema: { name: true },
          virtuals: {
            contacts: { sub: { nick: { get: makeGetter('x'), dependsOn: ['displayName'] } } },
          } as never,
        }),
      ).not.toThrow();
      expect(runtime.runtime.getVirtualNames(modelName, ['contacts', 'sub'])).toEqual(['nick']);
      expect(
        (
          runtime.runtime.resolveVirtualDescriptor(modelName, 'nick', 'read', ['contacts', 'sub']) as {
            dependsOn: string[];
          }
        ).dependsOn,
      ).toEqual(['displayName']);
    }

    // Rejects _id/reserved and dotted definition names.
    for (const bad of ['_id', '__v', 'a.b']) {
      const modelName = `VirtCfgRes${tag}${bad.replace(/[^a-z]/gi, '')}`;
      const Model = mongoose.model(modelName, new mongoose.Schema({ name: String }));
      expect(() =>
        runtime.createRouter(Model, {
          basePath: `/virtcfg-res-${tag}-${bad.replace(/[^a-z]/gi, '')}`,
          operationAccess: true,
          permissionSchema: { name: true },
          virtuals: { [bad]: { get: makeGetter('x') } } as never,
        }),
      ).toThrow();
    }
  });

  it('rejects protected permission-field overlaps and revalidates on documentPermissionField change', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = ++counter;
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });

    // Equal overlap.
    {
      const modelName = `VirtCfgPermEq${tag}`;
      const Model = mongoose.model(modelName, new mongoose.Schema({ name: String }));
      expect(() =>
        runtime.createRouter(Model, {
          basePath: `/virtcfg-permeq-${tag}`,
          operationAccess: true,
          permissionSchema: { name: true },
          documentPermissionField: '_permissions',
          virtuals: { _permissions: { get: makeGetter('x') } } as never,
        }),
      ).toThrow();
    }

    // Revalidate on documentPermissionField mutation; preserve previous on rejection.
    {
      const modelName = `VirtCfgPermReval${tag}`;
      const Model = mongoose.model(modelName, new mongoose.Schema({ name: String, address: String }));
      const router = runtime.createRouter(Model, {
        basePath: `/virtcfg-permreval-${tag}`,
        operationAccess: true,
        permissionSchema: { name: true },
        virtuals: { fullAddress: { get: makeGetter('x'), dependsOn: ['address'] } } as never,
      });
      expect(runtime.runtime.getVirtualNames(modelName)).toEqual(['fullAddress']);

      expect(() => router.set('documentPermissionField', 'fullAddress' as never)).toThrow();
      // Previous valid config preserved.
      expect(runtime.getModelOption(modelName, 'documentPermissionField')).toBe('_permissions');
      expect(runtime.runtime.getVirtualNames(modelName)).toEqual(['fullAddress']);
    }
  });

  it('preserves previous valid config on rejected virtual mutation and supports removal/replacement', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = ++counter;
    const modelName = `VirtCfgRollback${tag}`;
    const Model = mongoose.model(modelName, new mongoose.Schema({ name: String, address: String }));
    runtime.setGlobalOptions({ requestPermissionField: '_permissions', globalPermissions: () => [] });

    const firstGet = makeGetter('first');
    const router = runtime.createRouter(Model, {
      basePath: `/virtcfg-rollback-${tag}`,
      operationAccess: true,
      permissionSchema: { name: true },
      virtuals: { fullAddress: { get: firstGet, dependsOn: ['address'] } } as never,
    });

    const before = runtime.runtime.resolveVirtualDescriptor(modelName, 'fullAddress', 'read') as { get: unknown };
    expect(before.get).toBe(firstGet);

    // Rejected mutation preserves previous.
    expect(() =>
      runtime.setModelOption(modelName, 'virtuals' as never, { address: { get: makeGetter('bad') } } as never),
    ).toThrow();
    const afterRejected = runtime.runtime.resolveVirtualDescriptor(modelName, 'fullAddress', 'read') as {
      get: unknown;
    };
    expect(afterRejected.get).toBe(firstGet);

    // Immutable snapshot replacement: old fetch keeps old descriptor.
    const snapshotBefore = runtime.getModelOptions(modelName) as { virtuals: Record<string, { get: unknown }> };
    const secondGet = makeGetter('second');
    router.set('virtuals.fullAddress' as never, { get: secondGet, dependsOn: ['address'] } as never);
    const snapshotAfter = runtime.getModelOptions(modelName) as { virtuals: Record<string, { get: unknown }> };
    expect(snapshotBefore.virtuals.fullAddress.get).toBe(firstGet);
    expect(snapshotAfter.virtuals.fullAddress.get).toBe(secondGet);
    expect(snapshotBefore.virtuals).not.toBe(snapshotAfter.virtuals);

    // Function identities preserved (no cloning/wrapping).
    expect(runtime.runtime.resolveVirtualDescriptor(modelName, 'fullAddress', 'read')).toMatchObject({
      get: secondGet,
    });
  });
});
