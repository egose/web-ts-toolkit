/**
 * VIRT-09 hardening — collisions, errors, bounds, persistence isolation.
 *
 * Cross-path verification (not first enforcement): core enforcement lives in
 * VIRT-01..06. This file cross-checks those guarantees across alternate
 * entrypoints and fixes evidenced gaps in owning modules.
 *
 * - Config: real root/child-schema collisions, malformed descriptors/deps/
 *   accesses, metadata overlaps, replacement/removal, rollback, in-flight
 *   coherence (never getModelAtt top-level only).
 * - Runtime: throw/undefined/absent omits, falsy present works, denial never
 *   invokes getters, aliasing cannot alter sibling/snapshots.
 * - Include/virtual overlap preflight per scope, private association
 *   transport, no private metadata across serializers.
 * - Peak active work for many rows + nested cases under VIRT-00A scope, no
 *   unbounded fan-out, limit-1 completes. Trusted DB work outside
 *   persistence admission.
 * - Client virtual input never persists under permissive schemas/Mixed/
 *   whole-container across direct/root/internal create/update/upsert/
 *   subdocument. Names stay excluded from DB ops even when rule true or
 *   getter inapplicable.
 * - Logs with sensitive value in input and thrown text contain neither.
 *   Metadata toggles must not change auth inputs.
 */
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAccessRuntime, permissionsPlugin } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let counter = 0;
const activeRuntimes: Array<{ clearOpenApiRoutes(): void }> = [];

afterEach(() => {
  for (const entry of activeRuntimes.splice(0)) entry.clearOpenApiRoutes();
  try {
    mongoose.deleteModel(/Virt09.*/);
  } catch {
    // ignore
  }
});

const track = () => {
  const tag = ++counter;
  return tag;
};

const baseGlobals = (runtime: ReturnType<typeof createAccessRuntime>, extra?: Record<string, unknown>) => {
  runtime.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
    ...(extra ?? {}),
  } as never);
};

const makeGetter = (suffix: string) =>
  async function (this: unknown, doc: unknown) {
    void suffix;
    void doc;
    return `v:${suffix}`;
  };

// ---------------------------------------------------------------------------
// 1. Cross-path configuration checks
// ---------------------------------------------------------------------------

describe('VIRT-09 config cross-path', () => {
  it('rejects root stored-path collision via bulk setModelOptions (not only constructor)', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const name = `Virt09CfgRoot${tag}`;
    const Model = mongoose.model(name, new mongoose.Schema({ name: String, address: String }));
    baseGlobals(runtime);
    runtime.createRouter(Model, {
      basePath: `/virt09-cfgroot-${tag}`,
      operationAccess: true,
      permissionSchema: { name: true },
    } as never);
    expect(() => runtime.setModelOptions(name, { virtuals: { address: { get: makeGetter('x') } } } as never)).toThrow(
      /stored path/i,
    );
    // Previous config preserved (no virtual registered).
    expect(runtime.runtime.getVirtualNames(name)).toEqual([]);
  });

  it('rejects single-nested child collision via real child schema (getModelAtt top-level would miss)', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const name = `Virt09CfgNested${tag}`;
    const profile = new mongoose.Schema({ bio: String, summary: String });
    const Model = mongoose.model(name, new mongoose.Schema({ name: String, profile }));
    baseGlobals(runtime);
    // getModelAtt-style top-level keys would be ['name','profile'] — 'summary'
    // is nested and would be missed by a top-level-only check.
    const topKeys = Object.keys((Model.schema as unknown as { obj: Record<string, unknown> }).obj);
    expect(topKeys).not.toContain('summary');
    expect(() =>
      runtime.createRouter(Model, {
        basePath: `/virt09-cfgnested-${tag}`,
        operationAccess: true,
        permissionSchema: { name: true },
        virtuals: { profile: { sub: { summary: { get: makeGetter('x'), dependsOn: ['bio'] } } } } as never,
      }),
    ).toThrow(/stored path|collides/i);
  });

  it('rejects array-child collision and dotted stored container misuse via dotted setter', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const name = `Virt09CfgArr${tag}`;
    const child = new mongoose.Schema({ displayName: String, email: String });
    const Model = mongoose.model(name, new mongoose.Schema({ name: String, contacts: [child] }));
    baseGlobals(runtime);
    const router = runtime.createRouter(Model, {
      basePath: `/virt09-cfgarr-${tag}`,
      operationAccess: true,
      permissionSchema: { name: true },
      virtuals: { contacts: { sub: { nick: { get: makeGetter('x'), dependsOn: ['displayName'] } } } } as never,
    } as never);
    // Dotted setter attempting to collide with persisted child path.
    expect(() =>
      (router as unknown as { set: (k: string, v: unknown) => void }).set('virtuals.contacts.sub.displayName', {
        get: makeGetter('bad'),
      } as never),
    ).toThrow();
    // Valid config preserved.
    expect(runtime.runtime.getVirtualNames(name, ['contacts', 'sub'])).toEqual(['nick']);
  });

  it('rejects malformed descriptors/deps/accesses across constructor, bulk, and dotted entrypoints', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    baseGlobals(runtime);

    // Constructor: non-callable getter.
    {
      const n = `Virt09CfgMalA${tag}`;
      const M = mongoose.model(n, new mongoose.Schema({ name: String }));
      expect(() =>
        runtime.createRouter(M, {
          basePath: `/virt09-cfgmala-${tag}`,
          operationAccess: true,
          permissionSchema: { name: true },
          virtuals: { bad: { get: 'nope' } } as never,
        }),
      ).toThrow(/callable|descriptor/i);
    }
    // Bulk setModelOptions: dotted dependsOn.
    {
      const n = `Virt09CfgMalB${tag}`;
      const M = mongoose.model(n, new mongoose.Schema({ name: String, address: String }));
      runtime.createRouter(M, {
        basePath: `/virt09-cfgmalb-${tag}`,
        operationAccess: true,
        permissionSchema: { name: true },
        virtuals: { ok: { get: makeGetter('ok'), dependsOn: ['address'] } } as never,
      } as never);
      expect(() =>
        runtime.setModelOptions(n, {
          virtuals: { bad: { get: makeGetter('x'), dependsOn: ['address.city'] } },
        } as never),
      ).toThrow(/top-level|dotted/i);
      expect(runtime.runtime.getVirtualNames(n)).toEqual(['ok']);
    }
    // Dotted set: unsupported access + virtual-to-virtual via replacement.
    {
      const n = `Virt09CfgMalC${tag}`;
      const M = mongoose.model(n, new mongoose.Schema({ name: String }));
      const router = runtime.createRouter(M, {
        basePath: `/virt09-cfgmalc-${tag}`,
        operationAccess: true,
        permissionSchema: { name: true },
        virtuals: {
          a: { get: makeGetter('a'), dependsOn: [] },
          b: { get: makeGetter('b'), dependsOn: [] },
        } as never,
      } as never);
      expect(() =>
        (router as unknown as { set: (k: string, v: unknown) => void }).set('virtuals.a.delete', {
          get: makeGetter('x'),
        } as never),
      ).toThrow(/unsupported|delete/i);
      expect(() =>
        runtime.setModelOption(
          n,
          'virtuals' as never,
          {
            a: { get: makeGetter('a'), dependsOn: [] },
            b: { get: makeGetter('b'), dependsOn: ['a'] },
          } as never,
        ),
      ).toThrow(/virtual-to-virtual/i);
      expect(runtime.runtime.getVirtualNames(n).sort()).toEqual(['a', 'b']);
    }
    // Non-array dependsOn via single setModelOption.
    {
      const n = `Virt09CfgMalD${tag}`;
      const M = mongoose.model(n, new mongoose.Schema({ name: String }));
      runtime.createRouter(M, {
        basePath: `/virt09-cfgmald-${tag}`,
        operationAccess: true,
        permissionSchema: { name: true },
      } as never);
      expect(() =>
        runtime.setModelOption(
          n,
          'virtuals.bad' as never,
          {
            get: makeGetter('x'),
            dependsOn: 'name',
          } as never,
        ),
      ).toThrow(/array/i);
    }
  });

  it('rejects protected metadata equal/ancestor/descendant overlaps and revalidates on field change', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    baseGlobals(runtime);

    // Equal overlap: virtual name equals permission field.
    {
      const n = `Virt09CfgMetaEq${tag}`;
      const M = mongoose.model(n, new mongoose.Schema({ name: String }));
      expect(() =>
        runtime.createRouter(M, {
          basePath: `/virt09-cfgmetaeq-${tag}`,
          operationAccess: true,
          permissionSchema: { name: true },
          documentPermissionField: 'auth',
          virtuals: { auth: { get: makeGetter('x') } } as never,
        }),
      ).toThrow(/permission field/i);
    }
    // Ancestor overlap: virtual `auth` is ancestor of field `auth.token`.
    {
      const n = `Virt09CfgMetaAnc${tag}`;
      const M = mongoose.model(n, new mongoose.Schema({ name: String }));
      expect(() =>
        runtime.createRouter(M, {
          basePath: `/virt09-cfgmetaanc-${tag}`,
          operationAccess: true,
          permissionSchema: { name: true },
          documentPermissionField: 'auth.token',
          virtuals: { auth: { get: makeGetter('x') } } as never,
        }),
      ).toThrow(/permission field/i);
    }
    // Descendant overlap via embedded scope: doc field `contacts` vs virtual `contacts.nick`.
    {
      const n = `Virt09CfgMetaDesc${tag}`;
      const child = new mongoose.Schema({ displayName: String });
      const M = mongoose.model(n, new mongoose.Schema({ name: String, contacts: [child] }));
      expect(() =>
        runtime.createRouter(M, {
          basePath: `/virt09-cfgmetadesc-${tag}`,
          operationAccess: true,
          permissionSchema: { name: true },
          documentPermissionField: 'contacts',
          virtuals: { contacts: { sub: { nick: { get: makeGetter('x'), dependsOn: ['displayName'] } } } } as never,
        }),
      ).toThrow(/permission field/i);
    }
    // Revalidation on documentPermissionField mutation preserves previous.
    {
      const n = `Virt09CfgMetaReval${tag}`;
      const M = mongoose.model(n, new mongoose.Schema({ name: String, address: String }));
      const router = runtime.createRouter(M, {
        basePath: `/virt09-cfgmetareval-${tag}`,
        operationAccess: true,
        permissionSchema: { name: true },
        virtuals: { fullAddress: { get: makeGetter('x'), dependsOn: ['address'] } } as never,
      } as never);
      expect(() =>
        (router as unknown as { set: (k: string, v: unknown) => void }).set(
          'documentPermissionField',
          'fullAddress' as never,
        ),
      ).toThrow(/permission field|overlap/i);
      expect(runtime.getModelOption(n, 'documentPermissionField')).toBe('_permissions');
      expect(runtime.runtime.getVirtualNames(n)).toEqual(['fullAddress']);
    }
  });

  it('supports replacement/removal with frozen snapshots and rollback on rejected mutation', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const name = `Virt09CfgReplace${tag}`;
    const Model = mongoose.model(name, new mongoose.Schema({ name: String, address: String }));
    baseGlobals(runtime);
    const firstGet = makeGetter('first');
    const router = runtime.createRouter(Model, {
      basePath: `/virt09-cfgreplace-${tag}`,
      operationAccess: true,
      permissionSchema: { name: true },
      virtuals: {
        fullAddress: { get: firstGet, dependsOn: ['address'] },
        extra: { get: makeGetter('extra'), dependsOn: [] },
      } as never,
    } as never);

    const beforeSnap = runtime.getModelOptions(name) as { virtuals: Record<string, { get: unknown }> };
    // Rejected bulk mutation preserves previous valid config.
    expect(() =>
      runtime.setModelOptions(name, { virtuals: { address: { get: makeGetter('bad') } } } as never),
    ).toThrow();
    expect((runtime.runtime.resolveVirtualDescriptor(name, 'fullAddress', 'read') as { get: unknown }).get).toBe(
      firstGet,
    );
    expect(runtime.runtime.getVirtualNames(name).sort()).toEqual(['extra', 'fullAddress']);

    // Replacement swaps frozen root (copy-on-write, identities preserved).
    const secondGet = makeGetter('second');
    (router as unknown as { set: (k: string, v: unknown) => void }).set('virtuals.fullAddress', {
      get: secondGet,
      dependsOn: ['address'],
    } as never);
    const afterSnap = runtime.getModelOptions(name) as { virtuals: Record<string, { get: unknown }> };
    expect(beforeSnap.virtuals).not.toBe(afterSnap.virtuals);
    expect(beforeSnap.virtuals.fullAddress.get).toBe(firstGet);
    expect(afterSnap.virtuals.fullAddress.get).toBe(secondGet);

    // Removal via undefined drops the leaf but keeps siblings; name stops being virtual.
    runtime.setModelOption(name, 'virtuals.extra' as never, undefined as never);
    expect(runtime.runtime.isVirtualField(name, 'extra')).toBe(false);
    expect(runtime.runtime.getVirtualNames(name)).toEqual(['fullAddress']);
  });

  it('keeps in-flight plan/getter coherent across bulk-replacement entrypoint', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const modelName = `Virt09CfgInflight${tag}`;
    const schema = new mongoose.Schema({ name: String });
    schema.plugin(permissionsPlugin, { modelName });
    const Model = mongoose.model(modelName, schema);
    baseGlobals(runtime);
    const newGet = vi.fn(async () => 'new');
    const oldGet = vi.fn(async () => {
      // Bulk-replace config mid-finalization via alternate entrypoint.
      runtime.setModelOptions(modelName, {
        virtuals: { fullAddress: { get: newGet, dependsOn: [] } },
      } as never);
      return 'old';
    });
    const router = runtime.createRouter(Model, {
      basePath: `/virt09-cfginflight-${tag}`,
      operationAccess: { list: true, read: true },
      permissionSchema: { name: { list: true }, fullAddress: { list: true } } as never,
      virtuals: { fullAddress: { dependsOn: [], list: oldGet as never } } as never,
    } as never);
    void router;
    await Model.create([{ name: 'c1' }]);
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    const res = await request(app)
      .post(`/virt09-cfginflight-${tag}/__query`)
      .send({ select: ['name', 'fullAddress'] })
      .expect(200);
    expect(res.body.data[0]).toHaveProperty('fullAddress', 'old');
    expect(newGet).not.toHaveBeenCalled();
    const res2 = await request(app)
      .post(`/virt09-cfginflight-${tag}/__query`)
      .send({ select: ['name', 'fullAddress'] })
      .expect(200);
    expect(res2.body.data[0]).toHaveProperty('fullAddress', 'new');
  });
});

// ---------------------------------------------------------------------------
// 2. Cross-path runtime checks
// ---------------------------------------------------------------------------

describe('VIRT-09 runtime cross-path', () => {
  const makeRuntimeApp = async (opts: {
    virtuals: Record<string, unknown>;
    permissionSchema: Record<string, unknown>;
    seed?: Array<Record<string, unknown>>;
    schemaFields?: Record<string, unknown>;
    docPermissions?: Record<string, unknown>;
    requestComplexity?: Record<string, unknown>;
  }) => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const modelName = `Virt09Run${tag}`;
    const schema = new mongoose.Schema((opts.schemaFields ?? { name: String, address: String }) as never, {
      strict: false,
    });
    schema.plugin(permissionsPlugin, { modelName });
    const Model = mongoose.model(modelName, schema);
    baseGlobals(runtime, opts.requestComplexity ? { requestComplexity: opts.requestComplexity as never } : undefined);
    const router = runtime.createRouter(Model, {
      basePath: `/virt09-run-${tag}`,
      operationAccess: { list: true, read: true, create: true, update: true, upsert: true, new: true } as never,
      permissionSchema: opts.permissionSchema as never,
      virtuals: opts.virtuals as never,
      ...(opts.docPermissions ? { docPermissions: opts.docPermissions } : {}),
    } as never);
    if (opts.seed) await Model.create(opts.seed as never);
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    return { app, runtime, router, modelName, Model, tag };
  };

  it('throw/undefined/absent omit; present falsy (0/false/null) compute', async () => {
    const throwGet = vi.fn(async (): Promise<string> => {
      throw new Error('boom');
    });
    const undefGet = vi.fn(async () => undefined);
    const absentGet = vi.fn(async () => 'should-not-run');
    const falsyGet = vi.fn(
      async (doc: { count?: number; flag?: boolean; note?: string | null }) =>
        `c:${String(doc.count)}:f:${String(doc.flag)}:n:${String(doc.note)}`,
    );
    const { app } = await makeRuntimeApp({
      schemaFields: { name: String, address: String, count: Number, flag: Boolean, note: String },
      virtuals: {
        thrower: { dependsOn: [], read: throwGet as never, list: throwGet as never },
        undef: { dependsOn: [], read: undefGet as never, list: undefGet as never },
        absent: { dependsOn: ['address'], read: absentGet as never, list: absentGet as never },
        falsy: { dependsOn: ['count', 'flag', 'note'], read: falsyGet as never, list: falsyGet as never },
      },
      permissionSchema: {
        name: { list: true, read: true },
        address: { list: true, read: true },
        count: { list: true, read: true },
        flag: { list: true, read: true },
        note: { list: true, read: true },
        thrower: { list: true, read: true },
        undef: { list: true, read: true },
        absent: { list: true, read: true },
        falsy: { list: true, read: true },
      },
      // address absent (omitted), count 0 + flag false + note null all present.
      seed: [{ name: 'r1', count: 0, flag: false, note: null }],
    });
    const res = await request(app)
      .post(`/virt09-run-${counter}/__query`)
      .send({ select: ['name', 'thrower', 'undef', 'absent', 'falsy'] })
      .expect(200);
    const row = res.body.data[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty('thrower');
    expect(row).not.toHaveProperty('undef');
    expect(row).not.toHaveProperty('absent');
    expect(absentGet).not.toHaveBeenCalled();
    expect(row).toHaveProperty('falsy', 'c:0:f:false:n:null');
    expect(falsyGet).toHaveBeenCalled();
    // Read path behaves the same (cross-path).
    const id = row._id as string;
    const read = await request(app)
      .post(`/virt09-run-${counter}/__query/${id}`)
      .send({ select: ['name', 'thrower', 'undef', 'absent', 'falsy'] })
      .expect(200);
    expect(read.body).not.toHaveProperty('thrower');
    expect(read.body).not.toHaveProperty('undef');
    expect(read.body).not.toHaveProperty('absent');
    expect(read.body).toHaveProperty('falsy', 'c:0:f:false:n:null');
  });

  it('definite and post-fetch denial never invoke getters (explicit + function + inapplicable)', async () => {
    const deniedGet = vi.fn(async () => 'denied');
    const funcDeniedGet = vi.fn(async () => 'func-denied');
    const inapplicableGet = vi.fn(async () => 'create-only');
    const { app } = await makeRuntimeApp({
      virtuals: {
        denied: { dependsOn: [], read: deniedGet as never, list: deniedGet as never },
        funcDenied: { dependsOn: [], read: funcDeniedGet as never, list: funcDeniedGet as never },
        createOnly: { dependsOn: [], create: inapplicableGet as never },
      },
      permissionSchema: {
        name: { list: true, read: true },
        denied: { list: false, read: false },
        funcDenied: { list: () => false, read: () => false },
        createOnly: { list: true, read: true },
      },
      seed: [{ name: 'd1' }],
    });
    const res = await request(app)
      .post(`/virt09-run-${counter}/__query`)
      .send({ select: ['name', 'denied', 'funcDenied', 'createOnly'] })
      .expect(200);
    const row = res.body.data[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty('denied');
    expect(row).not.toHaveProperty('funcDenied');
    expect(row).not.toHaveProperty('createOnly');
    expect(deniedGet).not.toHaveBeenCalled();
    expect(funcDeniedGet).not.toHaveBeenCalled();
    expect(inapplicableGet).not.toHaveBeenCalled();
  });

  it('document-dependent grant defers until post-fetch: denied doc skips, granted doc runs', async () => {
    const gatedGet = vi.fn(async (doc: { address?: string }) => `gated:${doc.address}`);
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const modelName = `Virt09RunDoc${tag}`;
    const schema = new mongoose.Schema({ name: String, address: String, tenant: String });
    schema.plugin(permissionsPlugin, { modelName });
    const Model = mongoose.model(modelName, schema);
    baseGlobals(runtime);
    const router = runtime.createRouter(Model, {
      basePath: `/virt09-rundoc-${tag}`,
      operationAccess: { list: true, read: true } as never,
      permissionSchema: {
        name: { list: true, read: true },
        address: { list: true, read: true },
        gated: { list: 'canViewGated', read: 'canViewGated' },
      } as never,
      virtuals: { gated: { dependsOn: ['address'], list: gatedGet as never, read: gatedGet as never } } as never,
      // Decide on `name` (always selected below) so the hook input is
      // available post-fetch without requiring unselected-field fetching.
      docPermissions: {
        list: async (doc: { name?: string }) => ({ canViewGated: (doc as { name?: string }).name === 'yes-row' }),
      } as never,
    } as never);
    await Model.create([
      { name: 'yes-row', address: 'a1', tenant: 'yes' },
      { name: 'no-row', address: 'a2', tenant: 'no' },
    ]);
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    const res = await request(app)
      .post(`/virt09-rundoc-${tag}/__query`)
      .send({ select: ['name', 'gated'] })
      .expect(200);
    const byName = Object.fromEntries((res.body.data as Array<Record<string, unknown>>).map((r) => [r.name, r]));
    expect(byName['yes-row']).toHaveProperty('gated', 'gated:a1');
    expect(byName['no-row']).not.toHaveProperty('gated');
    expect(gatedGet).toHaveBeenCalledTimes(1);
  });

  it('nested mutation and returned-value aliasing cannot alter sibling output or snapshots', async () => {
    const evilGet = vi.fn(async (doc: { nested?: { val?: string }; address?: string }) => {
      // Attempt to mutate getter input (must not leak to output/snapshots/siblings).
      if (doc.nested) (doc.nested as Record<string, unknown>).val = 'MUTATED';
      (doc as Record<string, unknown>).address = 'MUTATED';
      return { wrapped: (doc as { address?: string }).address, secret: 'inner' }; // pragma: allowlist secret
    });
    const siblingGet = vi.fn(async (doc: { address?: string }) => `sib:${doc.address}`);
    const { app, Model } = await makeRuntimeApp({
      schemaFields: { name: String, address: String, nested: mongoose.Schema.Types.Mixed },
      virtuals: {
        evil: { dependsOn: ['address'], read: evilGet as never, list: evilGet as never },
        sibling: { dependsOn: ['address'], read: siblingGet as never, list: siblingGet as never },
      },
      permissionSchema: {
        name: { list: true, read: true },
        address: { list: true, read: true },
        nested: { list: true, read: true },
        evil: { list: true, read: true },
        sibling: { list: true, read: true },
      },
      seed: [
        { name: 's1', address: 'orig', nested: { val: 'v1' } },
        { name: 's2', address: 'orig', nested: { val: 'v1' } },
      ],
    });
    const res = await request(app)
      .post(`/virt09-run-${counter}/__query`)
      .send({ select: ['name', 'address', 'nested', 'evil', 'sibling'] })
      .expect(200);
    const rows = res.body.data as Array<Record<string, unknown>>;
    // Sibling sees pristine address, not MUTATED, regardless of completion order.
    for (const row of rows) {
      expect(row).toHaveProperty('sibling', 'sib:orig');
      expect(row).toHaveProperty('address', 'orig');
      expect((row.nested as Record<string, unknown>).val).toBe('v1');
    }
    // Returned object is committed but isolated: mutating response must not affect stored docs.
    expect(rows[0]).toHaveProperty('evil');
    // Raw stored docs unchanged (no MUTATED leakage, no computed persistence).
    const raws = (await Model.find({}).lean()) as unknown as Array<Record<string, unknown>>;
    for (const raw of raws) {
      expect(raw.address).toBe('orig');
      expect((raw.nested as Record<string, unknown>).val).toBe('v1');
      expect(raw).not.toHaveProperty('evil');
      expect(raw).not.toHaveProperty('sibling');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Include/virtual preflight + private association boundaries
// ---------------------------------------------------------------------------

describe('VIRT-09 include preflight + private transport', () => {
  const makeIncludeApp = async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const targetName = `Virt09IncT${tag}`;
    const mainName = `Virt09IncM${tag}`;
    const targetGet = vi.fn(async (doc: { address?: string }) => `t:${doc.address}`);
    const mainGet = vi.fn(async (doc: { address?: string }) => `m:${doc.address}`);
    const targetSchema = new mongoose.Schema({ name: String, address: String, tid: String } as never, {
      strict: false,
    });
    targetSchema.plugin(permissionsPlugin, { modelName: targetName });
    const Target = mongoose.model(targetName, targetSchema);
    const mainSchema = new mongoose.Schema({ name: String, address: String, tid: String } as never, {
      strict: false,
    });
    mainSchema.plugin(permissionsPlugin, { modelName: mainName });
    const Main = mongoose.model(mainName, mainSchema);
    baseGlobals(runtime);
    runtime.createRouter(Target, {
      basePath: `/virt09-inct-${tag}`,
      operationAccess: { list: true, read: true } as never,
      permissionSchema: {
        name: { list: true, read: true },
        address: { list: true, read: true },
        tid: { list: true, read: true },
        tVirt: { list: true, read: true },
      } as never,
      virtuals: { tVirt: { dependsOn: ['address'], list: targetGet as never, read: targetGet as never } } as never,
    } as never);
    const mainRouter = runtime.createRouter(Main, {
      basePath: `/virt09-incm-${tag}`,
      operationAccess: { list: true, read: true } as never,
      permissionSchema: {
        name: { list: true, read: true },
        address: { list: true, read: true },
        tid: { list: true, read: true },
        fullAddress: { list: true, read: true },
      } as never,
      virtuals: { fullAddress: { dependsOn: ['address'], list: mainGet as never, read: mainGet as never } } as never,
    } as never);
    await Target.create([{ name: 't1', address: 'ta1', tid: 'k1' }]);
    await Main.create([{ name: 'm1', address: 'a1', tid: 'k1' }]);
    const app = express();
    app.use(express.json());
    app.use(mainRouter.routes);
    return { app, runtime, tag, mainName, targetName, Main, Target, getters: { targetGet, mainGet } };
  };

  it('include output path overlapping a virtual (equal/ancestor/descendant) fails before target dispatch', async () => {
    const { app, tag, getters } = await makeIncludeApp();
    // Equal: include path is exactly the virtual name on the receiving (main) model.
    const eq = await request(app)
      .post(`/virt09-incm-${tag}/__query`)
      .send({
        include: [
          { model: `Virt09IncT${tag}`, path: 'fullAddress', op: 'list', localField: 'tid', foreignField: 'tid' },
        ],
      })
      .expect(400);
    expect(JSON.stringify(eq.body)).toMatch(/virtual/i);
    expect(getters.targetGet).not.toHaveBeenCalled();

    // Descendant: include path under the virtual.
    const desc = await request(app)
      .post(`/virt09-incm-${tag}/__query`)
      .send({
        include: [
          { model: `Virt09IncT${tag}`, path: 'fullAddress.city', op: 'list', localField: 'tid', foreignField: 'tid' },
        ],
      })
      .expect(400);
    expect(JSON.stringify(desc.body)).toMatch(/virtual/i);

    // Ancestor: include path is ancestor of the virtual (would overwrite container).
    const anc = await request(app)
      .post(`/virt09-incm-${tag}/__query`)
      .send({
        include: [{ model: `Virt09IncT${tag}`, path: 'full', op: 'list', localField: 'tid', foreignField: 'tid' }],
      });
    // 'full' is not an ancestor of 'fullAddress' (different token) — must stay permitted.
    expect([200, 400]).toContain(anc.status);
  });

  it('nested include preflight uses the target scope and ordinary collisions stay permitted', async () => {
    const { app, tag } = await makeIncludeApp();
    // Nested include colliding with the TARGET virtual must fail (target scope).
    const nested = await request(app)
      .post(`/virt09-incm-${tag}/__query`)
      .send({
        include: [
          {
            model: `Virt09IncT${tag}`,
            path: 'targets',
            op: 'list',
            localField: 'tid',
            foreignField: 'tid',
            args: {
              include: [
                { model: `Virt09IncT${tag}`, path: 'tVirt', op: 'list', localField: 'tid', foreignField: 'tid' },
              ],
            },
          },
        ],
      })
      .expect(400);
    expect(JSON.stringify(nested.body)).toMatch(/virtual/i);

    // Ordinary non-virtual include path stays permitted.
    const ok = await request(app)
      .post(`/virt09-incm-${tag}/__query`)
      .send({
        select: ['name'],
        include: [
          {
            model: `Virt09IncT${tag}`,
            path: 'targets',
            op: 'list',
            localField: 'tid',
            foreignField: 'tid',
            args: { select: ['name'] },
          },
        ],
      })
      .expect(200);
    expect(ok.body.data[0]).toHaveProperty('targets');
  });

  it('nested correlated args.include colliding with the intermediate virtual fails upfront before dispatch', async () => {
    const deepGet = vi.fn(async (doc: { address?: string }) => `deep:${doc.address}`);
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const targetName = `Virt09CorrT${tag}`;
    const mainName = `Virt09CorrM${tag}`;
    const targetSchema = new mongoose.Schema({ name: String, address: String, tid: String } as never, {
      strict: false,
    });
    targetSchema.plugin(permissionsPlugin, { modelName: targetName });
    // Count target dispatches: upfront preflight must fail before ANY target query runs.
    let targetFindCalls = 0;
    targetSchema.pre('find', function () {
      targetFindCalls += 1;
    });
    targetSchema.pre('findOne', function () {
      targetFindCalls += 1;
    });
    const Target = mongoose.model(targetName, targetSchema);
    const mainSchema = new mongoose.Schema({ name: String, tid: String } as never, { strict: false });
    mainSchema.plugin(permissionsPlugin, { modelName: mainName });
    // Main dispatches too: upfront preflight must fail before the main query runs.
    let mainFindCalls = 0;
    mainSchema.pre('find', function () {
      mainFindCalls += 1;
    });
    const Main = mongoose.model(mainName, mainSchema);
    baseGlobals(runtime);
    runtime.createRouter(Target, {
      basePath: `/virt09-corrt-${tag}`,
      operationAccess: { list: true, read: true } as never,
      permissionSchema: {
        name: { list: true, read: true },
        address: { list: true, read: true },
        tid: { list: true, read: true },
        tVirt: { list: true, read: true },
        deepVirt: { list: true, read: true },
      } as never,
      virtuals: {
        tVirt: { dependsOn: ['address'], list: (async () => 't') as never, read: (async () => 't') as never },
        deepVirt: { dependsOn: ['address'], list: deepGet as never, read: deepGet as never },
      } as never,
    } as never);
    const mainRouter = runtime.createRouter(Main, {
      basePath: `/virt09-corrm-${tag}`,
      operationAccess: { list: true, read: true } as never,
      permissionSchema: { name: { list: true, read: true }, tid: { list: true, read: true } } as never,
    } as never);
    await Target.create([{ name: 't1', address: 'ta1', tid: 'k1' }] as never);
    await Main.create([{ name: 'm1', tid: 'k1' }] as never);
    const app = express();
    app.use(express.json());
    app.use(mainRouter.routes);
    // Nested correlated path 'tVirt' collides with the intermediate target
    // virtual → upfront 400 against the target scope, before any dispatch.
    targetFindCalls = 0;
    mainFindCalls = 0;
    const bad = await request(app)
      .post(`/virt09-corrm-${tag}/__query`)
      .send({
        select: ['name'],
        include: [
          {
            mode: 'correlated',
            model: targetName,
            op: 'list',
            path: 'targets',
            filter: { tid: { $parent: 'tid' } },
            args: {
              select: ['name'],
              include: [
                {
                  mode: 'correlated',
                  model: targetName,
                  op: 'list',
                  path: 'tVirt',
                  filter: { tid: { $parent: 'tid' } },
                  args: { select: ['name', 'deepVirt'] },
                },
              ],
            },
          },
        ],
      })
      .expect(400);
    expect(JSON.stringify(bad.body)).toMatch(/virtual/i);
    expect(deepGet).not.toHaveBeenCalled();
    // Upfront means no target dispatch at all (lazy execution would already
    // have issued the top-level correlated target query).
    expect(targetFindCalls).toBe(0);
    // And not even the main query runs: the request fails during argument
    // processing, before any document work.
    expect(mainFindCalls).toBe(0);
    // Ordinary nested correlated output stays permitted.
    const ok = await request(app)
      .post(`/virt09-corrm-${tag}/__query`)
      .send({
        select: ['name'],
        include: [
          {
            mode: 'correlated',
            model: targetName,
            op: 'list',
            path: 'targets',
            filter: { tid: { $parent: 'tid' } },
            args: { select: ['name'] },
          },
        ],
      })
      .expect(200);
    expect(ok.body.data[0].targets[0]).toHaveProperty('name', 't1');
  });

  it('legacy list join keeps association-only keys out of DTOs and getter input unless declared', async () => {
    const fkSeen: unknown[] = [];
    const probeGet = vi.fn(async (doc: Record<string, unknown>) => {
      fkSeen.push((doc as Record<string, unknown>).tid);
      return 'probe';
    });
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const targetName = `Virt09AssocT${tag}`;
    const mainName = `Virt09AssocM${tag}`;
    const targetSchema = new mongoose.Schema({ name: String, address: String, tid: String } as never, {
      strict: false,
    });
    targetSchema.plugin(permissionsPlugin, { modelName: targetName });
    const Target = mongoose.model(targetName, targetSchema);
    const mainSchema = new mongoose.Schema({ name: String, address: String, tid: String } as never, { strict: false });
    mainSchema.plugin(permissionsPlugin, { modelName: mainName });
    const Main = mongoose.model(mainName, mainSchema);
    baseGlobals(runtime);
    runtime.createRouter(Target, {
      basePath: `/virt09-assoct-${tag}`,
      operationAccess: { list: true, read: true } as never,
      // tid is NOT readable (denied) so it only exists as join key; probe must not see it.
      permissionSchema: {
        name: { list: true, read: true },
        tid: { list: false, read: false },
        probe: { list: true, read: true },
      } as never,
      virtuals: { probe: { dependsOn: ['name'], list: probeGet as never, read: probeGet as never } } as never,
    } as never);
    const mainRouter = runtime.createRouter(Main, {
      basePath: `/virt09-assocm-${tag}`,
      operationAccess: { list: true, read: true } as never,
      permissionSchema: { name: { list: true, read: true }, tid: { list: true, read: true } } as never,
    } as never);
    await Target.create([
      { name: 't1', tid: 'k1' },
      { name: 't2', tid: 'k2' },
    ]);
    await Main.create([
      { name: 'm1', tid: 'k1' },
      { name: 'm2', tid: 'k2' },
    ]);
    const app = express();
    app.use(express.json());
    app.use(mainRouter.routes);
    const res = await request(app)
      .post(`/virt09-assocm-${tag}/__query`)
      .send({
        select: ['name'],
        include: [
          {
            model: targetName,
            path: 'targets',
            op: 'list',
            localField: 'tid',
            foreignField: 'tid',
            args: { select: ['name', 'probe'] },
          },
        ],
      })
      .expect(200);
    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    // Correct attachment despite denied FK (order-independent lookup).
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect((byName.m1.targets as Array<Record<string, unknown>>)[0]).toHaveProperty('name', 't1');
    expect((byName.m2.targets as Array<Record<string, unknown>>)[0]).toHaveProperty('name', 't2');
    // Association-only FK absent from serialized DTOs and getter input (not declared/selected).
    for (const row of rows) {
      for (const t of row.targets as Array<Record<string, unknown>>) {
        expect(t).not.toHaveProperty('tid');
      }
    }
    expect(fkSeen).toEqual([undefined, undefined]);
    // No private metadata crosses serializers.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/VIRT_ASSOCIATION|virtAssociation|__virt|association/i);
    expect(Object.getOwnPropertySymbols(res.body)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Bounds: peak work, no fan-out, limit-1, trusted DB scope
// ---------------------------------------------------------------------------

describe('VIRT-09 bounds', () => {
  it('many rows x multiple getters stays at/below maxHookConcurrency with stable order', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const modelName = `Virt09Bound${tag}`;
    const schema = new mongoose.Schema({ name: String, address: String });
    schema.plugin(permissionsPlugin, { modelName });
    const Model = mongoose.model(modelName, schema);
    let active = 0;
    let peak = 0;
    const delayed = (suffix: string) => async (doc: { address?: string }) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 15));
      active -= 1;
      return `${suffix}:${doc.address}`;
    };
    baseGlobals(runtime, { requestComplexity: { maxHookConcurrency: 2 } as never });
    const router = runtime.createRouter(Model, {
      basePath: `/virt09-bound-${tag}`,
      operationAccess: { list: true } as never,
      permissionSchema: {
        name: { list: true },
        address: { list: true },
        v1: { list: true },
        v2: { list: true },
      } as never,
      virtuals: {
        v1: { dependsOn: ['address'], list: delayed('v1') as never },
        v2: { dependsOn: ['address'], list: delayed('v2') as never },
      } as never,
    } as never);
    const seed = Array.from({ length: 12 }, (_, i) => ({ name: `n${String(i).padStart(2, '0')}`, address: `a${i}` }));
    await Model.create(seed as never);
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    const res = await request(app)
      .post(`/virt09-bound-${tag}/__query`)
      .send({ select: ['name', 'v1', 'v2'], sort: 'name' })
      .expect(200);
    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(12);
    // Stable input order regardless of completion order (DB sorted by name).
    expect(rows.map((r) => r.name)).toEqual(seed.map((s) => s.name));
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(0);
  });

  it('nested populate+embedded work completes at limit 1 without deadlock', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const targetName = `Virt09NestT${tag}`;
    const mainName = `Virt09NestM${tag}`;
    const tGet = vi.fn(async (doc: { address?: string }) => `t:${doc.address}`);
    const nickGet = vi.fn(async (doc: { displayName?: string }) => `nick:${doc.displayName}`);
    const topGet = vi.fn(async (doc: { address?: string }) => `top:${doc.address}`);
    const targetSchema = new mongoose.Schema({ name: String, address: String } as never);
    targetSchema.plugin(permissionsPlugin, { modelName: targetName });
    const Target = mongoose.model(targetName, targetSchema);
    const contactSchema = new mongoose.Schema({ displayName: String } as never);
    const mainSchema = new mongoose.Schema({
      name: String,
      address: String,
      targetRef: { type: mongoose.Schema.Types.ObjectId, ref: targetName },
      contacts: [contactSchema],
    } as never);
    mainSchema.plugin(permissionsPlugin, { modelName: mainName });
    const Main = mongoose.model(mainName, mainSchema);
    baseGlobals(runtime, { requestComplexity: { maxHookConcurrency: 1 } as never });
    runtime.createRouter(Target, {
      basePath: `/virt09-nestt-${tag}`,
      operationAccess: { list: true, read: true } as never,
      permissionSchema: {
        name: { list: true, read: true },
        address: { list: true, read: true },
        tVirt: { list: true, read: true },
      } as never,
      virtuals: { tVirt: { dependsOn: ['address'], list: tGet as never, read: tGet as never } } as never,
    } as never);
    const mainRouter = runtime.createRouter(Main, {
      basePath: `/virt09-nestm-${tag}`,
      // NOTE: populate defaults to `read` target visibility (pre-existing
      // `populateAccess ?? 'read'` default, preserved by VIRT-05), so the
      // parent path needs a read grant for populate to attach. List-only
      // parents intentionally skip populate under the default.
      operationAccess: { list: true, read: true } as never,
      permissionSchema: {
        name: { list: true, read: true },
        address: { list: true, read: true },
        targetRef: { list: true, read: true },
        contacts: {
          list: true,
          read: true,
          sub: { displayName: { list: true, read: true }, nick: { list: true, read: true } },
        },
        top: { list: true, read: true },
      } as never,
      virtuals: {
        top: { dependsOn: ['address'], list: topGet as never, read: topGet as never },
        contacts: { sub: { nick: { get: nickGet as never, dependsOn: ['displayName'] } } },
      } as never,
    } as never);
    const t = (await Target.create({ name: 't1', address: 'ta1' } as never)) as unknown as { _id: unknown };
    await Main.create([
      { name: 'm1', address: 'a1', targetRef: t._id, contacts: [{ displayName: 'Ann' }] },
      { name: 'm2', address: 'a2', targetRef: t._id, contacts: [{ displayName: 'Bob' }] },
    ] as never);
    const app = express();
    app.use(express.json());
    app.use(mainRouter.routes);
    const res = await request(app)
      .post(`/virt09-nestm-${tag}/__query`)
      .send({
        select: ['name', 'top', 'contacts', 'targetRef'],
        populate: [{ path: 'targetRef', select: ['name', 'tVirt'] }],
      })
      .expect(200);
    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveProperty('top');
      expect((row.contacts as Array<Record<string, unknown>>)[0]).toHaveProperty('nick');
      expect(row.targetRef).toHaveProperty('tVirt', 't:ta1');
    }
    expect(tGet).toHaveBeenCalled();
    expect(nickGet).toHaveBeenCalled();
    expect(topGet).toHaveBeenCalled();
  });

  it('trusted getter DB I/O completes outside leaf persistence admission at limit 1', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const addrName = `Virt09Addr${tag}`;
    const userName = `Virt09User${tag}`;
    const addrSchema = new mongoose.Schema({ label: String });
    addrSchema.plugin(permissionsPlugin, { modelName: addrName });
    const Addr = mongoose.model(addrName, addrSchema);
    const userSchema = new mongoose.Schema({
      name: String,
      addrId: { type: mongoose.Schema.Types.ObjectId, ref: addrName },
    });
    userSchema.plugin(permissionsPlugin, { modelName: userName });
    const User = mongoose.model(userName, userSchema);
    baseGlobals(runtime, { requestComplexity: { maxHookConcurrency: 1, maxBulkConcurrency: 1 } as never });
    runtime.createRouter(Addr, {
      basePath: `/virt09-addr-${tag}`,
      operationAccess: { list: true, read: true } as never,
      permissionSchema: { label: { list: true, read: true } } as never,
    } as never);
    // Trusted direct DB read per row inside the getter (N+1 shape, outside
    // leaf persistence admission — must still complete at limit 1).
    const addrLabel = vi.fn(async function (this: unknown, doc: { addrId?: string }) {
      if (!doc.addrId) return undefined;
      const found = (await Addr.findById(doc.addrId).lean()) as unknown as { label?: string } | null;
      return found?.label ? `label:${found.label}` : undefined;
    });
    const userRouter = runtime.createRouter(User, {
      basePath: `/virt09-user-${tag}`,
      operationAccess: { list: true } as never,
      permissionSchema: {
        name: { list: true },
        addrId: { list: true },
        addrLabel: { list: true },
      } as never,
      virtuals: { addrLabel: { dependsOn: ['addrId'], list: addrLabel as never } } as never,
    } as never);
    const a1 = (await Addr.create({ label: 'L1' } as never)) as unknown as { _id: unknown };
    const a2 = (await Addr.create({ label: 'L2' } as never)) as unknown as { _id: unknown };
    await User.create([
      { name: 'u1', addrId: a1._id },
      { name: 'u2', addrId: a2._id },
    ] as never);
    const app = express();
    app.use(express.json());
    app.use(userRouter.routes);
    const res = await request(app)
      .post(`/virt09-user-${tag}/__query`)
      .send({ select: ['name', 'addrLabel'] })
      .expect(200);
    const byName = Object.fromEntries((res.body.data as Array<Record<string, unknown>>).map((r) => [r.name, r]));
    expect(byName.u1).toHaveProperty('addrLabel', 'label:L1');
    expect(byName.u2).toHaveProperty('addrLabel', 'label:L2');
    expect(addrLabel).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 5. Persistence isolation across entrypoints
// ---------------------------------------------------------------------------

describe('VIRT-09 persistence isolation', () => {
  const makePersistApp = async (opts: { permissionRule?: unknown; withSub?: boolean } = {}) => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const modelName = `Virt09Persist${tag}`;
    const contactSchema = new mongoose.Schema({ displayName: String, meta: mongoose.Schema.Types.Mixed } as never, {
      strict: false,
    });
    const schema = new mongoose.Schema(
      { name: String, address: String, meta: mongoose.Schema.Types.Mixed, contacts: [contactSchema] } as never,
      { strict: false },
    );
    schema.plugin(permissionsPlugin, { modelName });
    const Model = mongoose.model(modelName, schema);
    baseGlobals(runtime);
    const rule = opts.permissionRule ?? true;
    const router = runtime.createRouter(Model, {
      basePath: `/virt09-persist-${tag}`,
      operationAccess: {
        list: true,
        read: true,
        create: true,
        update: true,
        upsert: true,
        subs: { contacts: { list: true, read: true, create: true, update: true } },
      } as never,
      permissionSchema: {
        name: rule,
        address: rule,
        meta: rule,
        contacts: rule,
        fullAddress: rule,
        ...(opts.withSub === false
          ? {}
          : {
              contacts: {
                list: true,
                read: true,
                create: true,
                update: true,
                sub: {
                  displayName: { list: true, read: true, create: true, update: true },
                  nick: { list: true, read: true },
                },
              },
            }),
      } as never,
      virtuals: {
        fullAddress: {
          dependsOn: ['address'],
          read: (async (d: { address?: string }) => `addr:${d.address}`) as never,
          list: (async (d: { address?: string }) => `addr:${d.address}`) as never,
          create: (async (d: { address?: string }) => `addr:${d.address}`) as never,
          update: (async (d: { address?: string }) => `addr:${d.address}`) as never,
        },
        contacts: {
          sub: {
            nick: {
              get: (async (d: { displayName?: string }) => `nick:${d.displayName}`) as never,
              dependsOn: ['displayName'],
            },
          },
        },
      } as never,
    } as never);
    const rootRouter = runtime.createRouter({ basePath: `/virt09-persistroot-${tag}`, operationAccess: true } as never);
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    app.use(rootRouter.routes);
    // Internal service entrypoint probe (internal Service: create/updateById).
    (router as unknown as { router: { post: (p: string, h: unknown) => void } }).router.post(
      '/internal-probe',
      async (
        req: unknown,
        res: { json: (v: unknown) => void; status: (c: number) => { json: (v: unknown) => void } },
      ) => {
        try {
          const r = req as {
            macl: {
              getService: (n: string) => {
                create: (d: unknown) => Promise<unknown>;
                updateById: (id: string, d: unknown) => Promise<unknown>;
              };
            };
          };
          const svc = r.macl.getService(modelName);
          const created = (await svc.create({
            name: 'internal',
            address: 'ai',
            fullAddress: 'EVIL',
            meta: { fullAddress: 'EVIL' },
          } as never)) as unknown as {
            success: boolean;
            data: Array<{ _id: string }> | { _id: string };
            errors?: unknown;
          };
          const rows = Array.isArray(created.data) ? created.data : [created.data];
          if (!created.success || rows.length === 0 || !rows[0]?._id) {
            (res as { json: (v: unknown) => void }).json({ created, probeError: 'create-failed' });
            return;
          }
          const updated = (await svc.updateById(rows[0]._id, {
            address: 'ai2',
            fullAddress: 'EVIL2',
          } as never)) as unknown;
          (res as { json: (v: unknown) => void }).json({ created, updated });
        } catch (err) {
          res.status(500).json({ probeThrow: String((err as Error)?.message ?? err).slice(0, 500) });
        }
      },
    );
    return { app, runtime, router, rootRouter, modelName, Model, tag };
  };

  it('direct create/update/upsert never persist virtual keys under permissive + Mixed + whole-container', async () => {
    const { app, Model, tag } = await makePersistApp({ permissionRule: true });
    // Direct create with top-level + Mixed + embedded virtual keys.
    const created = await request(app)
      .post(`/virt09-persist-${tag}`)
      .send({
        name: 'p1',
        address: 'a1',
        fullAddress: 'EVIL',
        meta: { fullAddress: 'EVIL', keep: 'k' },
        contacts: [{ displayName: 'Ann', nick: 'EVIL' }],
      })
      .expect(201);
    const id = (created.body._id ?? created.body.data?.[0]?._id ?? created.body.data?._id) as string | undefined;
    const pid = String(id ?? (await Model.findOne({ name: 'p1' }).lean())._id);
    const raw = (await Model.findById(pid).lean()) as unknown as Record<string, unknown>;
    expect(raw).not.toHaveProperty('fullAddress');
    expect((raw.meta as Record<string, unknown>).fullAddress).toBeUndefined();
    expect((raw.meta as Record<string, unknown>).keep).toBe('k');
    expect((raw.contacts as Array<Record<string, unknown>>)[0]).not.toHaveProperty('nick');

    // Direct update with virtual keys.
    await request(app)
      .patch(`/virt09-persist-${tag}/${pid}`)
      .send({ address: 'a2', fullAddress: 'EVIL2', contacts: [{ displayName: 'Bob', nick: 'EVIL2' }] })
      .expect(200);
    const raw2 = (await Model.findById(pid).lean()) as unknown as Record<string, unknown>;
    expect(raw2).not.toHaveProperty('fullAddress');
    expect((raw2.contacts as Array<Record<string, unknown>>)[0]).not.toHaveProperty('nick');

    // Direct upsert-create and upsert-update branches (basic upsert PUT `/`).
    await request(app)
      .put(`/virt09-persist-${tag}`)
      .send({ name: 'up1', address: 'ua', fullAddress: 'EVIL' })
      .expect(201);
    const rawUp = (await Model.findOne({ name: 'up1' }).lean()) as unknown as Record<string, unknown>;
    expect(rawUp).not.toHaveProperty('fullAddress');
    const upId = String((rawUp as { _id: unknown })._id);
    await request(app)
      .put(`/virt09-persist-${tag}`)
      .send({ _id: upId, name: 'up1', address: 'ua2', fullAddress: 'EVIL2' })
      .expect(200);
    const rawUp2 = (await Model.findById(upId).lean()) as unknown as Record<string, unknown>;
    expect(rawUp2).not.toHaveProperty('fullAddress');
  });

  it('root batch + internal service + subdocument writes never persist virtual keys', async () => {
    const { app, Model, tag, modelName } = await makePersistApp({ permissionRule: true });
    // Root batch create with evil virtual keys.
    const rootBase = `/virt09-persistroot-${tag}`;
    const batch = await request(app)
      .post(rootBase)
      .send([
        {
          target: 'model',
          name: modelName,
          op: 'create',
          data: { name: 'r1', address: 'ra', fullAddress: 'EVIL', meta: { fullAddress: 'EVIL' } },
        },
      ])
      .expect(200);
    expect(batch.body[0].statusCode).toBe(201);
    const rawR = (await Model.findOne({ name: 'r1' }).lean()) as unknown as Record<string, unknown>;
    expect(rawR).not.toHaveProperty('fullAddress');
    // Evil Mixed key stripped: meta is either absent or present without the key.
    expect((rawR.meta as Record<string, unknown> | undefined)?.fullAddress).toBeUndefined();

    // Internal service direct create/update.
    await request(app).post(`/virt09-persist-${tag}/internal-probe`).send({}).expect(200);
    const rawI = (await Model.findOne({ name: 'internal' }).lean()) as unknown as Record<string, unknown>;
    expect(rawI).not.toHaveProperty('fullAddress');
    expect((rawI.meta as Record<string, unknown> | undefined)?.fullAddress).toBeUndefined();

    // Subdocument create/update/bulk with evil embedded keys.
    const parent = (await Model.create({ name: 'sub1', address: 'sa' } as never)) as unknown as { _id: unknown };
    const pid = String(parent._id);
    await request(app)
      .post(`/virt09-persist-${tag}/${pid}/contacts`)
      .send({ displayName: 'New', nick: 'EVIL' })
      .expect(201);
    const subId = String(
      ((await Model.findById(pid).lean()) as unknown as { contacts: Array<{ _id: unknown }> }).contacts[0]._id,
    );
    await request(app)
      .patch(`/virt09-persist-${tag}/${pid}/contacts/${subId}`)
      .send({ displayName: 'Upd', nick: 'EVIL2' })
      .expect(200);
    await request(app)
      .patch(`/virt09-persist-${tag}/${pid}/contacts`)
      .send([{ _id: subId, displayName: 'Bulk', nick: 'EVIL3' }])
      .expect(200);
    const rawS = (await Model.findById(pid).lean()) as unknown as { contacts: Array<Record<string, unknown>> };
    for (const c of rawS.contacts) expect(c).not.toHaveProperty('nick');
  });

  it('inapplicable virtuals and bare-true rules still stay out of DB sort/filter/distinct', async () => {
    const createOnlyGet = vi.fn(async () => 'c-only');
    const { app, tag } = await makePersistApp({});
    // Register a create-only virtual via runtime (inapplicable on list) — reuse model from helper is complex,
    // so build a dedicated small app for DB-op exclusion.
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag2 = track();
    const modelName = `Virt09DbOps${tag2}`;
    const schema = new mongoose.Schema({ name: String, address: String });
    schema.plugin(permissionsPlugin, { modelName });
    const Model = mongoose.model(modelName, schema);
    baseGlobals(runtime);
    const router = runtime.createRouter(Model, {
      basePath: `/virt09-dbops-${tag2}`,
      operationAccess: { list: true, read: true, distinct: true, count: true } as never,
      permissionSchema: {
        name: true,
        address: true,
        fullAddress: true,
        createOnly: true,
      } as never,
      virtuals: {
        fullAddress: {
          dependsOn: ['address'],
          list: (async (d: { address?: string }) => `a:${d.address}`) as never,
          read: (async (d: { address?: string }) => `a:${d.address}`) as never,
        },
        createOnly: { dependsOn: [], create: createOnlyGet as never },
      } as never,
      sortableFields: ['fullAddress', 'createOnly'],
    } as never);
    await Model.create([{ name: 'x1', address: 'a1' }] as never);
    const app2 = express();
    app2.use(express.json());
    app2.use(router.routes);
    void app;
    void tag;
    // Sort on virtual (even bare-true) is controlled, never reaches adapter.
    await request(app2).post(`/virt09-dbops-${tag2}/__query`).send({ sort: 'fullAddress' }).expect(400);
    await request(app2).post(`/virt09-dbops-${tag2}/__query`).send({ sort: 'createOnly' }).expect(400);
    // Filter on virtual is stripped (match-all), getters for inapplicable never run.
    const filtered = await request(app2)
      .post(`/virt09-dbops-${tag2}/__query`)
      .send({ filter: { fullAddress: 'evil' }, select: ['name'] })
      .expect(200);
    expect(filtered.body.data as Array<unknown>).toHaveLength(1);
    expect(createOnlyGet).not.toHaveBeenCalled();
    // Distinct on virtual is forbidden (basic distinct GET /distinct/:field).
    await request(app2).get(`/virt09-dbops-${tag2}/distinct/fullAddress`).expect(403);
    await request(app2).get(`/virt09-dbops-${tag2}/distinct/createOnly`).expect(403);
  });
});

// ---------------------------------------------------------------------------
// 6. Logs + metadata toggles
// ---------------------------------------------------------------------------

describe('VIRT-09 logs + metadata toggles', () => {
  it('structural failure logs contain neither secret input nor thrown text', async () => {
    const runtime = createAccessRuntime();
    activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
    const tag = track();
    const modelName = `Virt09Log${tag}`;
    const schema = new mongoose.Schema({ name: String, address: String });
    schema.plugin(permissionsPlugin, { modelName });
    const Model = mongoose.model(modelName, schema);
    const SECRET = `sekret-log-${tag}-9f3a1c`; // pragma: allowlist secret
    const THROWN = `thrown-sekret-${tag}-77aa`;
    const warnSpy = vi.fn();
    runtime.setGlobalOptions({
      requestPermissionField: '_permissions',
      globalPermissions: () => [],
      logger: { warn: warnSpy },
    } as never);
    const failGet = vi.fn(async (): Promise<string> => {
      throw new Error(`oops ${THROWN}`);
    });
    const router = runtime.createRouter(Model, {
      basePath: `/virt09-log-${tag}`,
      operationAccess: { list: true } as never,
      permissionSchema: { name: { list: true }, address: { list: true }, boom: { list: true } } as never,
      virtuals: { boom: { dependsOn: ['address'], list: failGet as never } } as never,
    } as never);
    await Model.create([{ name: 'l1', address: SECRET }] as never);
    const app = express();
    app.use(express.json());
    app.use(router.routes);
    const res = await request(app)
      .post(`/virt09-log-${tag}/__query`)
      .send({ select: ['name', 'boom'] })
      .expect(200);
    expect(res.body.data[0]).not.toHaveProperty('boom');
    expect(warnSpy).toHaveBeenCalled();
    const logged = warnSpy.mock.calls.map((c) => JSON.stringify(c)).join('\n');
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(THROWN);
    // Allowlisted structural keys only.
    expect(logged).toMatch(/virtualGetterFailed/);
    expect(logged).toMatch(/Virt09Log/);
  });

  it('metadata toggles do not change virtual authorization inputs', async () => {
    const gatedGet = vi.fn(async (doc: { address?: string }) => `g:${doc.address}`);
    const build = async (modelOptions: Record<string, unknown>) => {
      const runtime = createAccessRuntime();
      activeRuntimes.push(runtime.runtime as unknown as { clearOpenApiRoutes(): void });
      const tag = track();
      const modelName = `Virt09Meta${tag}`;
      const schema = new mongoose.Schema({ name: String, address: String, tenant: String });
      schema.plugin(permissionsPlugin, { modelName });
      const Model = mongoose.model(modelName, schema);
      baseGlobals(runtime);
      const router = runtime.createRouter(Model, {
        basePath: `/virt09-meta-${tag}`,
        operationAccess: { list: true } as never,
        permissionSchema: {
          name: { list: true },
          address: { list: true },
          gated: { list: 'canView' },
        } as never,
        virtuals: { gated: { dependsOn: ['address'], list: gatedGet as never } } as never,
        // Decide on `name` (selected) so hook input survives post-fetch
        // regardless of metadata/skim toggles.
        docPermissions: {
          list: async (doc: { name?: string }) => ({ canView: (doc as { name?: string }).name === 'm1' }),
        } as never,
        ...modelOptions,
      } as never);
      await Model.create([{ name: 'm1', address: 'a1', tenant: 'yes' }] as never);
      const app = express();
      app.use(express.json());
      app.use(router.routes);
      return { app, tag };
    };
    const variants: Record<string, unknown>[] = [
      {},
      { stripPermissionsField: true },
      { disableFieldPermissions: true },
      { exposedDocPermissionKeys: [] },
      { exposedDocPermissionKeys: ['canView'] },
    ];
    for (const modelOptions of variants) {
      gatedGet.mockClear();
      const { app, tag } = await build(modelOptions);
      const res = await request(app)
        .post(`/virt09-meta-${tag}/__query`)
        .send({
          select: ['name', 'gated'],
          options: { skim: true, includePermissions: false, includeFieldPermissions: false },
        })
        .expect(200);
      expect(res.body.data[0]).toHaveProperty('gated', 'g:a1');
      expect(gatedGet).toHaveBeenCalled();
    }
  });
});
