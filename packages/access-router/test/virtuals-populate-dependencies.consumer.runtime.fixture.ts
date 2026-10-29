import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import { createAccessRuntime, type ModelVirtualDescriptor } from '@web-ts-toolkit/access-router';
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';

interface Target {
  name: string;
  balance: number;
  tenantId: string;
  reviewedAt: Date;
}
interface UserTarget {
  name: string;
  secret: string;
}
interface Source {
  accounts: (mongoose.Types.ObjectId | null)[] | null;
  user: mongoose.Types.ObjectId | null;
}

async function runInstalledArrayDependencies() {
  const connection = await mongoose
    .createConnection(process.env.MONGODB_URL!, {
      dbName: `private_array_consumer_${randomUUID().replaceAll('-', '')}`,
    })
    .asPromise();
  let server: Server | undefined;
  try {
    const TargetModel = connection.model<Target>(
      'Document',
      new mongoose.Schema<Target>({
        name: String,
        balance: Number,
        tenantId: String,
        reviewedAt: Date,
      }),
    );
    const UserModel = connection.model<UserTarget>(
      'User',
      new mongoose.Schema<UserTarget>({ name: String, secret: String }),
    );
    const SourceModel = connection.model<Source>(
      'ArraySource',
      new mongoose.Schema<Source>({
        accounts: [{ type: mongoose.Schema.Types.ObjectId, ref: TargetModel.modelName }],
        user: { type: mongoose.Schema.Types.ObjectId, ref: UserModel.modelName },
      }),
    );
    const account = await TargetModel.create({
      name: 'Main',
      balance: 10,
      tenantId: 'a',
      reviewedAt: new Date('2024-01-02T00:00:00Z'),
    });
    const outside = await TargetModel.create({ name: 'Outside', balance: 100, tenantId: 'b' });
    const user = await UserModel.create({ name: 'Ada', secret: 'enabled' });
    const missing = new mongoose.Types.ObjectId();
    const originals = [account._id, missing, null, account._id, outside._id];
    const source = await SourceModel.create({ accounts: originals, user: user._id });
    for (const hydration of ['lean', 'hydrated'] as const) {
      const api = createAccessRuntime();
      api.setGlobalOptions({ globalPermissions: () => [] });
      const defaultModels = api.getDefaultModelOptions();
      assert.equal(defaultModels.requireOperationAccessForPopulateQueries, true);
      assert.equal(defaultModels.requireOperationAccessForPopulateDependencies, true);
      assert.equal(Object.hasOwn(api.getGlobalOptions(), 'requireOperationAccessForPopulateQueries'), false);
      for (const flag of [
        'requireOperationAccessForPopulateQueries',
        'requireOperationAccessForPopulateDependencies',
      ]) {
        for (const [setter, args] of [
          [api.setGlobalOption, [flag, undefined]],
          [api.setGlobalOptions, [{ [flag]: false }]],
          [api.set, [flag, false]],
          [api.set, [{ [flag]: false }]],
        ] as const) {
          assert.throws(
            () => Reflect.apply(setter, undefined, args),
            /target-model configuration.*setModelOptions.*setDefaultModelOptions/,
          );
        }
      }
      // Configuration-only Document: no target router or HTTP mount is required.
      api.registerModelInstance(TargetModel.modelName, TargetModel);
      api.setModelOptions(TargetModel.modelName, {
        operationAccess: { read: true },
        baseFilter: { read: () => ({ tenantId: 'a' }) },
        permissionSchema: { name: true, balance: false, reviewedAt: false },
        stripPermissionsField: true,
      });
      api.registerModelInstance(UserModel.modelName, UserModel);
      api.setModelOptions(UserModel.modelName, {
        operationAccess: { read: false, list: false },
        permissionSchema: { name: true, secret: false },
        requireOperationAccessForPopulateQueries: true,
        requireOperationAccessForPopulateDependencies: true,
        stripPermissionsField: true,
      });
      let calls = 0;
      const eligibleCount: ModelVirtualDescriptor<Source, number, { accounts: Target }> = {
        dependsOnPopulate: [{ path: 'accounts', select: { balance: 1, _id: -1 } }],
        get(doc, _permissions, context, populated = {}) {
          calls++;
          assert.equal(Object.hasOwn(context, 'populated'), false);
          assert.equal(JSON.stringify(doc).includes('balance'), false);
          assert.deepEqual(populated.accounts, [{ balance: 10 }, null, null, { balance: 10 }, null]);
          return populated.accounts?.filter((target) => (target?.balance ?? 0) > 0).length;
        },
      };
      let userCalls = 0;
      const userAllowed: ModelVirtualDescriptor<Source, boolean, { user: UserTarget }> = {
        dependsOnPopulate: [{ path: 'user', select: 'secret -_id' }],
        get(doc, _permissions, context, populated = {}) {
          userCalls++;
          assert.equal(Object.hasOwn(context, 'populated'), false);
          assert.equal(JSON.stringify(doc).includes('secret'), false);
          assert.deepEqual(populated.user, { secret: 'enabled' });
          return populated.user?.secret === 'enabled';
        },
      };
      let nativeCalls = 0;
      const reviewYear: ModelVirtualDescriptor<Source, number, { accounts: Target }> = {
        dependsOnPopulate: [{ path: 'accounts', select: 'reviewedAt -_id' }],
        get(doc, _permissions, _context, populated = {}) {
          nativeCalls++;
          assert.equal(JSON.stringify(doc).includes('reviewedAt'), false);
          const slots = populated.accounts;
          assert.ok(slots && slots[0]?.reviewedAt instanceof Date && slots[3]?.reviewedAt instanceof Date);
          assert.deepEqual(slots.slice(1, 3), [null, null]);
          assert.equal(slots[4], null);
          const year = slots[0].reviewedAt.getUTCFullYear();
          slots[0].reviewedAt.setUTCFullYear(1999);
          assert.equal(slots[3].reviewedAt.getUTCFullYear(), 2024); // duplicate slot owns a native copy
          return year;
        },
      };
      const sources = api.createRouter<Source, { eligibleCount: number; userAllowed: boolean; reviewYear: number }>(
        SourceModel,
        {
          basePath: '/sources',
          operationAccess: { read: true },
          hydration: { publicRead: hydration },
          requireOperationAccessForPopulateQueries: false,
          requireOperationAccessForPopulateDependencies: false,
          permissionSchema: { accounts: true, eligibleCount: true, user: true, userAllowed: true, reviewYear: true },
          defaults: { publicReadArgs: { populate: [{ path: 'accounts', select: 'name -_id' }] } },
          virtuals: { eligibleCount, userAllowed, reviewYear },
          stripPermissionsField: true,
        },
      );
      sources.router.post('/verify-live-defaults', async (req, res) => {
        const service = sources.getService(req as ModelRequest);
        const args = {
          select: ['accounts', 'eligibleCount', '-_id'],
          populate: [{ path: 'accounts', select: 'name -_id' }],
        };
        const stored = api.getModelOptions(TargetModel.modelName);
        api.setModelOptions(TargetModel.modelName, {
          requireOperationAccessForPopulateQueries: undefined,
          requireOperationAccessForPopulateDependencies: undefined,
        });
        api.setDefaultModelOptions({
          requireOperationAccessForPopulateQueries: true,
          requireOperationAccessForPopulateDependencies: true,
        });
        const first = await service.findOne({ _id: source._id }, args);
        assert.ok(first.success);
        assert.deepEqual(first.data, { accounts: originals });
        api.setDefaultModelOptions({
          requireOperationAccessForPopulateQueries: false,
          requireOperationAccessForPopulateDependencies: false,
        });
        api.setModelOptions(TargetModel.modelName, { stripPermissionsField: true });
        const second = await service.findOne({ _id: source._id }, args); // same service AND request
        assert.ok(second.success);
        assert.deepEqual(second.data, { accounts: [{ name: 'Main' }, { name: 'Main' }], eligibleCount: 2 });
        assert.equal(api.getModelOptions(TargetModel.modelName).requireOperationAccessForPopulateQueries, undefined);
        assert.equal(stored.requireOperationAccessForPopulateQueries, false);
        assert.equal(sources.options.requireOperationAccessForPopulateQueries, false);

        // Suspend the source row stage after policy capture. New defaults/target overrides
        // cannot change this in-flight call, but the next call on the same service refreshes.
        let entered!: () => void;
        let release!: () => void;
        const waiting = new Promise<void>((resolve) => {
          entered = resolve;
        });
        const resume = new Promise<void>((resolve) => {
          release = resolve;
        });
        let paused = false;
        sources.setOption('baseFilter.read', async () => {
          if (!paused) {
            paused = true;
            entered();
            await resume;
          }
          return {};
        });
        const held = service.findOne({ _id: source._id }, args);
        await waiting;
        api.setDefaultModelOptions({
          requireOperationAccessForPopulateQueries: true,
          requireOperationAccessForPopulateDependencies: true,
        });
        api.setModelOption(TargetModel.modelName, 'requireOperationAccessForPopulateQueries', true);
        release();
        const third = await held;
        assert.ok(third.success);
        assert.deepEqual(third.data, { accounts: [{ name: 'Main' }, { name: 'Main' }], eligibleCount: 2 });
        const fourth = await service.findOne({ _id: source._id }, args);
        assert.ok(fourth.success);
        assert.deepEqual(fourth.data, { accounts: originals });
        res.json({ ok: true });
      });
      const app = express();
      app.use(express.json());
      app.use(sources.routes);
      const root = api.createRouter({ basePath: '/batch', operationAccess: true });
      app.use(root.routes);
      server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      const url = `http://127.0.0.1:${address.port}/sources/__query/${source._id}`;
      async function read(args: object) {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(args),
        });
        assert.equal(response.status, 200);
        return response.json();
      }
      const select = ['accounts', 'eligibleCount', '-_id'];
      // A default is ordinary population; public missing/out-of-scope rows are filtered.
      assert.deepEqual(await read({ select }), {
        accounts: [{ name: 'Main' }, { name: 'Main' }],
        eligibleCount: 2,
      });
      // Suppress the default: original IDs/null/order/duplicates/misses are restored.
      assert.deepEqual(await read({ select, populate: [] }), {
        accounts: originals.map((id) => (id === null ? null : String(id))),
        eligibleCount: 2,
      });
      assert.deepEqual(await read({ select: ['eligibleCount', '-_id'], populate: [] }), { eligibleCount: 2 });
      sources.permissionSchema('accounts', false);
      assert.deepEqual(await read({ select, populate: [] }), { eligibleCount: 2 });
      assert.equal(calls, 4); // getter assertions cannot pass via swallowed fail-closed errors
      api.setModelOption(TargetModel.modelName, 'operationAccess.read', false);
      assert.deepEqual(await read({ select, populate: [] }), {});
      assert.equal(calls, 4);
      // Strict private denial cannot hide selected/permitted original parent IDs.
      sources.permissionSchema('accounts', true);
      const ids = originals.map((id) => (id === null ? null : String(id)));
      assert.deepEqual(await read({ select, populate: [] }), { accounts: ids });
      assert.equal(calls, 4); // strict private admission blocks computation too
      for (const queries of [true, false]) {
        for (const dependencies of [true, false]) {
          api.setModelOptions(TargetModel.modelName, {
            requireOperationAccessForPopulateQueries: queries,
            requireOperationAccessForPopulateDependencies: dependencies,
          });
          const before: number = calls;
          const computed = dependencies ? {} : { eligibleCount: 2 };
          assert.deepEqual(await read({ select }), {
            accounts: queries ? ids : [{ name: 'Main' }, { name: 'Main' }],
            ...computed,
          });
          assert.deepEqual(await read({ select, populate: [] }), { accounts: ids, ...computed });
          assert.deepEqual(await read({ select: ['eligibleCount', '-_id'], populate: [] }), computed);
          sources.permissionSchema('accounts', false);
          assert.deepEqual(await read({ select }), computed); // both false still enforces source denial
          sources.permissionSchema('accounts', true);
          assert.equal(calls, before + (dependencies ? 0 : 4));
          // All four pairs per TARGET: the other target uses the inverse pair in
          // the SAME request/runtime, and neither inherits the source's false flags.
          api.setModelOptions(UserModel.modelName, {
            requireOperationAccessForPopulateQueries: !queries,
            requireOperationAccessForPopulateDependencies: !dependencies,
          });
          api.setDefaultModelOptions({
            requireOperationAccessForPopulateQueries: !queries,
            requireOperationAccessForPopulateDependencies: !dependencies,
          });
          const beforeMixed: number = calls;
          const beforeUser: number = userCalls;
          const beforeNative: number = nativeCalls;
          assert.deepEqual(
            await read({
              select: ['accounts', 'eligibleCount', 'reviewYear', 'user', 'userAllowed', '-_id'],
              populate: [
                { path: 'accounts', select: 'name balance reviewedAt -_id' },
                { path: 'user', select: 'name secret -_id' },
              ],
            }),
            {
              accounts: queries ? ids : [{ name: 'Main' }, { name: 'Main' }],
              user: queries ? { name: 'Ada' } : String(user._id),
              ...(dependencies ? { userAllowed: true } : { eligibleCount: 2, reviewYear: 2024 }),
            },
          );
          assert.equal(calls, beforeMixed + Number(!dependencies));
          assert.equal(userCalls, beforeUser + Number(dependencies));
          assert.equal(nativeCalls, beforeNative + Number(!dependencies));
        }
      }
      assert.equal(defaultModels.requireOperationAccessForPopulateDependencies, true);
      assert.equal(defaultModels.requireOperationAccessForPopulateQueries, true);
      assert.equal(createAccessRuntime().getDefaultModelOption('requireOperationAccessForPopulateDependencies'), true);
      // Public exclusion and identity are unchanged by the positive private fetch union.
      api.setModelOption(TargetModel.modelName, 'permissionSchema', { name: true, balance: true });
      assert.deepEqual(await read({ select }), {
        accounts: [{ name: 'Main' }, { name: 'Main' }],
        eligibleCount: 2,
      });
      assert.deepEqual(await read({ select, populate: [{ path: 'accounts', select: ['name'] }] }), {
        accounts: [
          { _id: String(account._id), name: 'Main' },
          { _id: String(account._id), name: 'Main' },
        ],
        eligibleCount: 2,
      });
      assert.deepEqual(
        await read({ select, populate: [{ path: 'accounts', select: 'name -_id', match: { name: 'missing' } }] }),
        {
          accounts: [],
          eligibleCount: 2, // an admitted public miss never restores IDs
        },
      );
      api.setModelOption(TargetModel.modelName, 'permissionSchema', { name: true, balance: false });
      // Ordinary list access/match can succeed while private inputs retain request READ scope.
      api.setModelOption(TargetModel.modelName, 'requireOperationAccessForPopulateQueries', true);
      api.setModelOption(TargetModel.modelName, 'operationAccess.list', true);
      assert.deepEqual(
        await read({
          select,
          populate: [{ path: 'accounts', select: 'name -_id', access: 'list', match: { tenantId: 'b' } }],
        }),
        { accounts: [{ name: 'Outside' }], eligibleCount: 2 },
      );
      const beforeMalformed = calls;
      // Malformed dynamic JS is conservative: the string does not enable bypass.
      Reflect.apply(api.setModelOption, undefined, [
        TargetModel.modelName,
        'requireOperationAccessForPopulateDependencies',
        'false',
      ]);
      assert.equal(api.getModelOption(TargetModel.modelName, 'requireOperationAccessForPopulateDependencies'), true);
      assert.deepEqual(await read({ select, populate: [] }), { accounts: ids });
      api.setModelOption(TargetModel.modelName, 'requireOperationAccessForPopulateDependencies', true);
      assert.deepEqual(await read({ select, populate: [] }), { accounts: ids });
      assert.equal(calls, beforeMalformed);
      // Both false still cannot authorize standalone/root operations.
      api.setModelOptions(TargetModel.modelName, {
        requireOperationAccessForPopulateQueries: false,
        requireOperationAccessForPopulateDependencies: false,
      });
      api.setModelOption(TargetModel.modelName, 'operationAccess.list', false);
      const batch = await fetch(`http://127.0.0.1:${address.port}/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([
          { target: 'model', name: TargetModel.modelName, op: 'read', id: String(account._id) },
          { target: 'model', name: TargetModel.modelName, op: 'list' },
        ]),
      });
      assert.equal(batch.status, 200);
      for (const entry of await batch.json()) {
        assert.equal(entry.statusCode, 401);
        assert.equal(entry.result.code, 'unauthorized');
      }
      // If target HTTP routes are subsequently constructed, both-false still grants none.
      const documents = api.createRouter(TargetModel, { basePath: '/documents' });
      app.use(documents.routes);
      for (const route of ['/documents/__query', `/documents/__query/${account._id}`]) {
        const response: Response = await fetch(`http://127.0.0.1:${address.port}${route}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        assert.equal(response.status, 401);
      }
      // Both dependency modes preserve authorized public unions and exact arrays in
      // BOTH hydration modes, including out-of-scope/missing IDs, nulls and duplicates.
      api.setModelOption(TargetModel.modelName, 'operationAccess.read', true);
      for (const strict of [true, false]) {
        api.setModelOption(TargetModel.modelName, 'requireOperationAccessForPopulateDependencies', strict);
        const before: number = calls;
        assert.deepEqual(await read({ select }), {
          accounts: [{ name: 'Main' }, { name: 'Main' }],
          eligibleCount: 2,
        });
        assert.deepEqual(await read({ select, populate: [] }), {
          accounts: originals.map((id) => (id === null ? null : String(id))),
          eligibleCount: 2,
        });
        assert.deepEqual(await read({ select: ['eligibleCount', '-_id'], populate: [] }), { eligibleCount: 2 });
        sources.permissionSchema('accounts', false);
        assert.deepEqual(await read({ select, populate: [] }), { eligibleCount: 2 });
        sources.permissionSchema('accounts', true);
        assert.equal(calls, before + 4);
      }
      api.setModelOption(TargetModel.modelName, 'operationAccess.read', false);
      api.setModelOptions(TargetModel.modelName, {
        requireOperationAccessForPopulateQueries: false,
        requireOperationAccessForPopulateDependencies: false,
      });
      let failures = 0;
      sources.setOption('virtuals.eligibleCount', {
        ...eligibleCount,
        get() {
          failures++;
          throw new Error('deliberate getter failure');
        },
      });
      assert.deepEqual(await read({ select, populate: [] }), { accounts: ids });
      assert.equal(failures, 1); // failed private computation still preserves authorized original IDs
      sources.setOption('virtuals.eligibleCount', eligibleCount);
      const live = await fetch(`http://127.0.0.1:${address.port}/sources/verify-live-defaults`, { method: 'POST' });
      assert.equal(live.status, 200);
      assert.deepEqual(await live.json(), { ok: true });
      assert.deepEqual((await SourceModel.findById(source._id).lean())?.accounts, originals);
      assert.equal((await TargetModel.findById(account._id).lean())?.reviewedAt.getUTCFullYear(), 2024);
      await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
      server = undefined;
    }
  } finally {
    if (server)
      await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
    await connection.dropDatabase();
    await connection.close();
  }
}

runInstalledArrayDependencies().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
