import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest, Populate } from '../dist/advanced';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
const connections: mongoose.Connection[] = [];
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
let sequence = 0;
afterEach(async () => {
  vi.restoreAllMocks();
  for (const api of runtimes.splice(0)) api.runtime.clearOpenApiRoutes();
  for (const connection of connections.splice(0)) {
    await connection.dropDatabase();
    await connection.close();
  }
  mongoose.deleteModel(/^PopBinding/);
});

const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const deferred = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
};
const invalidTarget = expect.objectContaining({
  success: false,
  code: 'bad_request',
  errors: [{ detail: expect.stringMatching(/Populate target.*(source ref|source connection|actual.*model)/) }],
});

async function fixture(
  required: boolean,
  hydration: 'lean' | 'hydrated',
  mode: 'absent' | 'mismatch' | 'bound' | 'explicit' = 'bound',
) {
  const api = createAccessRuntime();
  runtimes.push(api);
  api.setGlobalOptions({
    requestComplexity: { maxBulkConcurrency: 1, maxHookConcurrency: 1 },
  });
  api.setDefaultModelOptions({ requireOperationAccessForPopulateQueries: required });
  const connection = await mongoose
    .createConnection(`mongodb://${mongoose.connection.host}:${mongoose.connection.port}`, {
      dbName: `pop-binding-${++sequence}`,
    })
    .asPromise();
  connections.push(connection);
  const targetName = `PopBindingTarget${sequence}`;
  const schema = () => new mongoose.Schema({ name: String, tenant: String, secret: String });
  const TargetB = connection.model(targetName, schema());
  const TargetA = mode === 'absent' ? undefined : mongoose.model(targetName, schema());
  const Target = mode === 'bound' ? TargetA! : TargetB;
  const ref = () => ({ type: mongoose.Schema.Types.ObjectId, ref: mode === 'explicit' ? TargetB : targetName });
  const Source = mongoose.model(
    `PopBindingSource${sequence}`,
    new mongoose.Schema({
      name: String,
      ref: ref(),
      refs: [ref()],
      matrix: [[ref()]],
      nested: { refs: [ref()] },
      children: [{ label: String, ref: ref(), refs: [ref()] }],
    }),
  );
  const ids = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
  for (const [model, suffix] of [
    [TargetA, 'A'],
    [TargetB, 'B'],
  ] as const) {
    if (model)
      await model.create(
        ids.slice(0, 3).map((_id, index) => ({
          _id,
          name: `row-${suffix}`,
          tenant: index === 1 ? 'b' : 'a',
          secret: 'hidden', // pragma: allowlist secret
        })),
      );
  }
  const data = {
    name: 'source',
    ref: ids[0],
    refs: [ids[0], ids[1], ids[0], ids[3]],
    matrix: [
      [ids[0], ids[1]],
      [ids[0], ids[3]],
    ],
    nested: { refs: [ids[0], ids[1], ids[0], ids[3]] },
    children: [{ label: 'child', ref: ids[0], refs: [ids[0], ids[1], ids[0], ids[3]] }],
  };
  const parent = await Source.create(data);
  const guard = vi.fn<() => boolean | Promise<boolean>>(() => true);
  const transform = vi.fn(async () => ({}));
  api.registerModelInstance(targetName, Target);
  api.setModelOptions(targetName, {
    operationAccess: { read: guard, list: guard },
    permissionSchema: { name: true, secret: false },
    baseFilter: { read: () => ({ tenant: 'a' }) },
    overrideFilter: { read: transform },
    stripPermissionsField: true,
  });
  const router = api.createRouter(Source, {
    basePath: '/sources',
    operationAccess: true,
    permissionSchema: {
      name: true,
      ref: true,
      refs: true,
      matrix: true,
      nested: { read: true, sub: { refs: true } },
      children: { read: true, create: true, update: true, sub: { label: true, ref: true, refs: true } },
    },
    hydration: { find: hydration, findOne: hydration },
    stripPermissionsField: true,
  });
  let callback: (req: ModelRequest) => Promise<void>;
  let failure: unknown;
  router.router.post('/probe', async (req, res) => {
    try {
      await callback(req as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  const root = api.createRouter({ basePath: '/root', operationAccess: true });
  const app = express();
  app.use(express.json(), router.routes, root.routes);
  const readsA = TargetA && vi.spyOn(TargetA.collection, 'find');
  const readsB = vi.spyOn(TargetB.collection, 'find');
  const insert = vi.spyOn(Source.collection, 'insertOne');
  const update = vi.spyOn(Source.collection, 'updateOne');
  const sourceRead = vi.spyOn(Source.collection, 'findOne');
  return {
    api,
    app,
    Source,
    Target,
    TargetA,
    TargetB,
    parent,
    ids,
    data,
    guard,
    transform,
    readsA,
    readsB,
    insert,
    update,
    sourceRead,
    descriptor: (path = 'ref'): Populate => ({ path, select: ['name', 'secret'], match: { name: /^row-/ } }),
    async execute(run: typeof callback) {
      callback = run;
      failure = undefined;
      await request(app).post('/sources/probe').expect(200, { ok: true });
      if (failure) throw failure;
    },
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function outcome(run: () => Promise<unknown>) {
  try {
    return await run();
  } catch (error) {
    return (error as { result?: unknown }).result ?? error;
  }
}
function expectNoTargetIO(f: Fixture) {
  expect(f.readsA?.mock.calls ?? []).toHaveLength(0);
  expect(f.readsB).not.toHaveBeenCalled();
}
function expectTarget(f: Fixture, value: unknown, array = false) {
  const row = { _id: String(f.ids[0]), name: f.Target === f.TargetA ? 'row-A' : 'row-B' };
  expect(JSON.parse(JSON.stringify(value))).toEqual(array ? [row, row] : row);
}

describe.each([true, false])('POP-07 actual target binding (Q=%s)', (required) => {
  describe.each(['lean', 'hydrated'] as const)('%s', (hydration) => {
    describe.each(['absent', 'mismatch'] as const)('%s source-connection target', (mode) => {
      it.each(['read', 'helper', 'create', 'update', 'upsert', 'nested-array', 'matrix', 'child'] as const)(
        'rejects %s before initiating writes or unintended target I/O',
        async (operation) => {
          const f = await fixture(required, hydration, mode);
          // Another runtime's actual target policy is never borrowed implicitly.
          if (f.TargetA) {
            const other = createAccessRuntime();
            runtimes.push(other);
            other.registerModelInstance(f.TargetA.modelName, f.TargetA);
            other.setModelOptions(f.TargetA.modelName, { permissionSchema: { name: true }, operationAccess: true });
          }
          await f.execute(async (req) => {
            const service = req.macl.getService(f.Source.modelName);
            const args = { populate: [f.descriptor()] };
            const result = await outcome(async () => {
              switch (operation) {
                case 'helper': {
                  const plan = await req.macl.genPopulate(f.Source.modelName, 'read', args.populate);
                  return f.Source.findById(f.parent._id)
                    .populate(plan)
                    .lean(hydration === 'lean');
                }
                case 'create':
                  return service.create(f.data, args, quiet);
                case 'update':
                  return service.updateOne({ _id: f.parent._id }, { name: 'changed' }, args, quiet);
                case 'upsert':
                  return service.upsert({ _id: new mongoose.Types.ObjectId() }, f.data, args, quiet);
                case 'nested-array':
                  return service.findOne({ _id: f.parent._id }, { populate: [f.descriptor('children.refs')] }, quiet);
                case 'matrix':
                  return service.findOne({ _id: f.parent._id }, { populate: [f.descriptor('matrix')] }, quiet);
                case 'child':
                  return service.readSub(String(f.parent._id), 'children', String(f.parent.children[0]._id), {
                    populate: [{ path: 'refs', select: ['name'] }],
                  });
                default:
                  return service.findOne({ _id: f.parent._id }, args, quiet);
              }
            });
            expect(f.insert).not.toHaveBeenCalled();
            expect(f.update).not.toHaveBeenCalled();
            expectNoTargetIO(f);
            expect(result).toEqual(invalidTarget);
            expect(f.sourceRead).not.toHaveBeenCalled();
            expect(f.api.getModelInstance(f.Target.modelName)).toBe(f.TargetB);
          });
        },
      );
    });

    it.each(['bound', 'explicit'] as const)(
      'preserves %s refs through canonical/helper/create/update/child with rows, fields, match and IDs',
      async (mode) => {
        const f = await fixture(required, hydration, mode);
        const paths = ['ref', 'refs', 'nested.refs', 'children.refs'];
        await f.execute(async (req) => {
          const service = req.macl.getService(f.Source.modelName);
          const args = { populate: paths.map(f.descriptor) };
          const result = await service.findOne({ _id: f.parent._id }, args, quiet);
          expect(result.success).toBe(true);
          const output = (result as any).data;
          expectTarget(f, output.ref);
          expectTarget(f, output.refs, true);
          expectTarget(f, output.nested.refs, true);
          expectTarget(f, output.children[0].refs, true);
          const plan = await req.macl.genPopulate(f.Source.modelName, 'read', args.populate);
          const helper = await f.Source.findById(f.parent._id)
            .populate(plan)
            .lean(hydration === 'lean');
          expectTarget(f, helper?.ref);
          expectTarget(f, helper?.children[0].refs, true);
          const created = await service.create(f.data, args, quiet);
          expect(created.success).toBe(true);
          expectTarget(f, (created as any).data[0].ref);
          const updated = await service.updateOne({ _id: f.parent._id }, { name: 'changed' }, args, quiet);
          expect(updated.success).toBe(true);
          expectTarget(f, (updated as any).data.ref);
          const child = await service.readSub(String(f.parent._id), 'children', String(f.parent.children[0]._id), {
            populate: [{ path: 'refs', select: ['name', 'secret'] }],
          });
          expect(child.success).toBe(true);
          expectTarget(f, (child as any).data.refs, true);
          const miss = await service.findOne(
            { _id: f.parent._id },
            { populate: [{ ...f.descriptor(), match: { name: 'never' } }] },
            quiet,
          );
          expect((miss as any).data.ref).toBeNull();
          const saved = await f.Source.findById(f.parent._id).lean();
          expect(saved?.ref).toEqual(f.ids[0]);
          expect(saved?.refs).toEqual(f.data.refs);
          expect(f.insert).toHaveBeenCalledTimes(1);
          expect(f.update).toHaveBeenCalledTimes(1);
          expect((mode === 'bound' ? f.readsB : f.readsA)!.mock.calls).toHaveLength(0);
          expect(f.guard).toHaveBeenCalledTimes(required ? 18 : 0);
        });
      },
    );

    it.each(['bound', 'explicit'] as const)(
      'binds %s nested reference-array adapter work with a native Mongoose shape control',
      async (mode) => {
        const f = await fixture(required, hydration, mode);
        await f.execute(async (req) => {
          const service = req.macl.getService(f.Source.modelName);
          const args = { select: ['matrix'], populate: [f.descriptor('matrix')] };
          const result = await service.findOne({ _id: f.parent._id }, args, quiet);
          expect(result.success).toBe(true);
          const plan = await service.genPopulate('read', args.populate);
          const helper = await f.Source.findById(f.parent._id)
            .populate(plan)
            .lean(hydration === 'lean');
          // Native multidimensional population has hydration-specific shape
          // behavior. This correction binds its model without promising new
          // recursive target finalization or changing that existing behavior.
          const native = await f.Source.findById(f.parent._id)
            .populate({
              path: 'matrix',
              model: f.Target,
              select: ['name'],
              match: { tenant: 'a', name: /^row-/ },
            })
            .lean(hydration === 'lean');
          expect(JSON.parse(JSON.stringify(helper?.matrix))).toEqual(JSON.parse(JSON.stringify(native?.matrix)));
          expect(JSON.stringify(result)).not.toContain('hidden');
          expect(mode === 'bound' ? f.readsA : f.readsB).toHaveBeenCalledTimes(3);
          expect(mode === 'bound' ? f.readsB : f.readsA).not.toHaveBeenCalled();
        });
      },
    );

    describe.each(['registry', 'schema'] as const)('late source %s replacement', (replacement) => {
      it.each(['read', 'helper', 'create', 'update', 'child'] as const)(
        'keeps the captured model through awaited %s and revalidates later calls',
        async (operation) => {
          const f = await fixture(required, hydration);
          const entered = deferred();
          const release = deferred();
          const suspend = async () => {
            entered.release();
            await release.promise;
          };
          if (required)
            f.guard.mockImplementationOnce(async () => {
              await suspend();
              return true;
            });
          else
            f.transform.mockImplementationOnce(async () => {
              await suspend();
              return {};
            });
          await f.execute(async (req) => {
            const service = req.macl.getService(f.Source.modelName);
            const args = { populate: [f.descriptor()] };
            const run = async () => {
              if (operation === 'helper') {
                const plan = await service.genPopulate('read', args.populate);
                return f.Source.findById(f.parent._id)
                  .populate(plan)
                  .lean(hydration === 'lean');
              }
              if (operation === 'create') return service.create(f.data, args, quiet);
              if (operation === 'update')
                return service.updateOne({ _id: f.parent._id }, { name: 'changed' }, args, quiet);
              if (operation === 'child')
                return service.readSub(String(f.parent._id), 'children', String(f.parent.children[0]._id), {
                  populate: [{ path: 'ref', select: ['name'] }],
                });
              return service.findOne({ _id: f.parent._id }, args, quiet);
            };
            const pending = run();
            await entered.promise;
            // A same-named replacement on the source connection must never become
            // the target of an already admitted operation, even after an await.
            if (replacement === 'registry') f.Source.db.models[f.Target.modelName] = f.TargetB;
            else f.Source.schema.path(operation === 'child' ? 'children.ref' : 'ref').options.ref = f.TargetB;
            release.release();
            const result = await pending;
            const output = operation === 'helper' ? result : (result as any).data;
            expectTarget(f, operation === 'create' ? (output as any)[0].ref : (output as any).ref);
            expect(f.readsA).toHaveBeenCalledTimes(1);
            expect(f.readsB).not.toHaveBeenCalled();
            const writes = f.insert.mock.calls.length + f.update.mock.calls.length;
            const later = await outcome(run);
            expect(later).toEqual(invalidTarget);
            expect(f.insert.mock.calls.length + f.update.mock.calls.length).toBe(writes);
            expect(f.readsA).toHaveBeenCalledTimes(1);
            expect(f.readsB).not.toHaveBeenCalled();
          });
        },
      );
    });

    it('keeps target model/policy ownership when the runtime registry changes during a source guard', async () => {
      const f = await fixture(required, hydration);
      const entered = deferred();
      const release = deferred();
      const contexts: unknown[] = [];
      f.api.setModelOption(f.Target.modelName, 'docPermissions.read', (_doc, _permissions, context) => {
        contexts.push(context.mongooseModel);
        return {};
      });
      f.api.setModelOption(f.Source.modelName, 'overrideFilter.read', async () => {
        entered.release();
        await release.promise;
        return {};
      });
      await f.execute(async (req) => {
        const service = req.macl.getService(f.Source.modelName);
        const args = { populate: [f.descriptor()] };
        const pending = service.findOne({ _id: f.parent._id }, args, quiet);
        await entered.promise;
        const snapshot = f.api.runtime.createBootstrapSnapshot();
        snapshot.modelInstances[f.Target.modelName] = f.TargetB as mongoose.Model<unknown>;
        f.api.runtime.restoreBootstrapSnapshot(snapshot);
        release.release();
        const result = await pending;
        expectTarget(f, (result as any).data.ref);
        expect(contexts.length).toBeGreaterThan(0);
        expect(contexts.every((model) => model === f.TargetA)).toBe(true);
        expect(f.readsA).toHaveBeenCalledTimes(1);
        expect(f.readsB).not.toHaveBeenCalled();
        expect(await service.findOne({ _id: f.parent._id }, args, quiet)).toEqual(invalidTarget);
        expect(f.readsA).toHaveBeenCalledTimes(1);
        expect(f.readsB).not.toHaveBeenCalled();
      });
    });

    it('requires the explicit cross-connection ref instance itself to own the configured policy', async () => {
      const f = await fixture(required, hydration, 'explicit');
      const snapshot = f.api.runtime.createBootstrapSnapshot();
      snapshot.modelInstances[f.Target.modelName] = f.TargetA as mongoose.Model<unknown>;
      f.api.runtime.restoreBootstrapSnapshot(snapshot);
      await f.execute(async (req) => {
        const service = req.macl.getService(f.Source.modelName);
        const args = { populate: [f.descriptor()] };
        expect(await service.findOne({}, args, quiet)).toEqual(invalidTarget);
        expect(await service.create(f.data, args, quiet)).toEqual(invalidTarget);
        expect(await outcome(() => service.genPopulate('read', args.populate))).toEqual(
          expect.objectContaining({ code: 'bad_request' }),
        );
        expect(f.insert).not.toHaveBeenCalled();
        expect(f.update).not.toHaveBeenCalled();
        expectNoTargetIO(f);
      });
    });

    it('binds explicit cross-connection fallback population alongside private inputs, including post-save and child copies', async () => {
      const f = await fixture(required, hydration, 'explicit');
      const Local = mongoose.model(`PopBindingLocal${sequence}`, new mongoose.Schema({ name: String }));
      const local = await Local.create({ name: 'private-input' });
      const reference = { type: mongoose.Schema.Types.ObjectId, ref: Local.modelName };
      f.Source.schema.add({ local: reference });
      (f.Source.schema.path('children') as unknown as { schema: mongoose.Schema }).schema.add({ local: reference });
      await f.Source.updateOne({ _id: f.parent._id }, { $set: { local: local._id, 'children.0.local': local._id } });
      f.update.mockClear();
      f.api.registerModelInstance(Local.modelName, Local);
      f.api.setModelOptions(Local.modelName, { operationAccess: { read: true }, permissionSchema: {} });
      const virtual = {
        get: (_doc: unknown, _permissions: unknown, _context: unknown, populated: any) => populated.local?.name,
        dependsOnPopulate: [{ path: 'local', select: ['name'] }],
      };
      f.api.setModelOptions(f.Source.modelName, {
        permissionSchema: {
          ...f.api.getModelOptions(f.Source.modelName).permissionSchema,
          local: true,
          computed: true,
          children: { read: true, create: true, sub: { ref: true, local: true, computed: true } },
        },
        virtuals: { computed: virtual, children: { sub: { computed: virtual } } },
      } as never);
      const localReads = vi.spyOn(Local.collection, 'find');
      await f.execute(async (req) => {
        const service = req.macl.getService(f.Source.modelName);
        const args = { select: ['ref', 'computed'], populate: [f.descriptor()] };
        const read = await service.findOne({ _id: f.parent._id }, args, quiet);
        const created = await service.create(
          { ...f.data, local: local._id, children: [{ ...f.data.children[0], local: local._id }] },
          args,
          quiet,
        );
        const child = await service.readSub(String(f.parent._id), 'children', String(f.parent.children[0]._id), {
          select: ['ref', 'computed'],
          populate: [{ path: 'ref', select: ['name', 'secret'] }],
        });
        for (const result of [read, created, child]) expect(result.success).toBe(true);
        for (const output of [(read as any).data, (created as any).data[0], (child as any).data]) {
          expectTarget(f, output.ref);
          expect(output.computed).toBe('private-input');
          expect(output).not.toHaveProperty('local');
        }
        expect(f.readsA).not.toHaveBeenCalled();
        expect(f.readsB).toHaveBeenCalledTimes(3);
        expect(localReads).toHaveBeenCalledTimes(3);
        expect(f.insert).toHaveBeenCalledTimes(1);
        expect(f.update).not.toHaveBeenCalled();
      });
    });

    it('retains original IDs on operation denial and ignores caller model choices for correctly bound refs', async () => {
      const f = await fixture(required, hydration);
      f.guard.mockReturnValue(false);
      const args = {
        select: ['ref', 'refs'],
        populate: ['ref', 'refs'].map((path) => ({
          path,
          select: ['name'],
          match: { name: 'row-A' },
          model: 'UnconfiguredCallerChoice',
        })),
      };
      const response = await request(f.app)
        .post('/sources/__query')
        .send({ ...args, options: quiet })
        .expect(200);
      if (required) {
        expect(response.body.data[0]).toMatchObject({ ref: String(f.ids[0]), refs: f.data.refs.map(String) });
        expectNoTargetIO(f);
      } else expectTarget(f, response.body.data[0].ref);
      await request(f.app)
        .post('/root')
        .send([{ target: 'model', name: f.Target.modelName, op: 'read', id: String(f.ids[0]) }])
        .expect(200)
        .expect((res) => expect(res.body[0].result.code).toBe('unauthorized'));
      f.guard.mockReturnValue(true);
      await f.execute(async (req) => {
        const plan = await req.macl.genPopulate(f.Source.modelName, 'read', {
          ...f.descriptor(),
          model: f.TargetB,
        } as Populate);
        const helper = await f.Source.findById(f.parent._id).populate(plan).lean();
        expectTarget(f, helper?.ref);
      });
      expect(f.readsB).not.toHaveBeenCalled();
    });
  });
});
