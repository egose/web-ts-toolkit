import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRuntime } from '../dist/index.mjs';
import type { ModelRequest } from '../dist/advanced';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();
const runtimes: ReturnType<typeof createAccessRuntime>[] = [];
const connections: mongoose.Connection[] = [];
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
let serial = 0;
const latch = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
};
afterEach(async () => {
  vi.restoreAllMocks();
  runtimes.splice(0).forEach((api) => api.runtime.clearOpenApiRoutes());
  for (const connection of connections.splice(0)) {
    await connection.dropDatabase();
    await connection.close();
  }
  mongoose.deleteModel(/^MpoIncludeBinding/);
});

describe.each(['legacy', 'correlated'] as const)('MPO-05 captured %s include receiver', (mode) => {
  describe.each(['lean', 'hydrated'] as const)('source hydration %s', (hydration) => {
    it.each([false, true])(
      'keeps its actual Model/private input ownership across source await (registry replacement: %s)',
      async (replace) => {
        const n = ++serial;
        const api = createAccessRuntime();
        runtimes.push(api);
        const B = await mongoose
          .createConnection(`mongodb://${mongoose.connection.host}:${mongoose.connection.port}`, {
            dbName: `mpo-include-binding-${n}`,
          })
          .asPromise();
        connections.push(B);
        const userName = `MpoIncludeBindingUser${n}`;
        const targetName = `MpoIncludeBindingTarget${n}`;
        const userSchema = () => new mongoose.Schema({ secret: String });
        const UserA = mongoose.model(userName, userSchema());
        const UserB = B.model(userName, userSchema());
        const userId = new mongoose.Types.ObjectId();
        await UserA.create({ _id: userId, secret: 'private-A' });
        await UserB.create({ _id: userId, secret: 'private-B' });
        const schema = () =>
          new mongoose.Schema({
            key: String,
            name: String,
            user: { type: mongoose.Schema.Types.ObjectId, ref: userName },
          });
        const TargetA = mongoose.model(targetName, schema());
        const TargetB = B.model(targetName, schema());
        const targetId = new mongoose.Types.ObjectId();
        await TargetA.create({ _id: targetId, key: 'join', name: 'row-A', user: userId });
        await TargetB.create({ _id: targetId, key: 'join', name: 'row-B', user: userId });
        const Source = mongoose.model(`MpoIncludeBindingSource${n}`, new mongoose.Schema({ key: String }));
        const source = await Source.create({ key: 'join' });
        const targetReadsA = vi.spyOn(TargetA.collection, 'find');
        const targetReadsB = vi.spyOn(TargetB.collection, 'find');
        const privateReadsA = vi.spyOn(UserA.collection, 'find');
        const privateReadsB = vi.spyOn(UserB.collection, 'find');
        const contexts: unknown[] = [];
        const views: unknown[] = [];
        const inputs: unknown[] = [];
        api.setGlobalOptions({ requestComplexity: { maxBulkConcurrency: 1, maxHookConcurrency: 1 } });
        api.setDefaultModelOptions({
          requireOperationAccessForPopulateQueries: true,
          requireOperationAccessForPopulateDependencies: false,
        });
        // User A is deliberately closed for public fields and standalone reads.
        // Only the server declaration supplies the selected private input mask.
        api.registerModelInstance(userName, UserA);
        api.setModelOptions(userName, { operationAccess: false, permissionSchema: {} });
        api.registerModelInstance(targetName, TargetA);
        const getter = vi.fn((doc, _permissions, context, populated) => {
          views.push(JSON.parse(JSON.stringify(doc)));
          inputs.push(populated);
          expect(context).not.toHaveProperty('populated');
          return populated.user?.secret;
        });
        api.setModelOptions(targetName, {
          requireOperationAccessForPopulateDependencies: true, // User A's D, not Target's D, owns these inputs.
          operationAccess: { read: true, list: true },
          permissionSchema: { name: true, value: true },
          stripPermissionsField: true,
          docPermissions: (_doc, _permissions, context) => {
            contexts.push(context.mongooseModel);
            return {};
          },
          virtuals: { value: { get: getter, dependsOnPopulate: [{ path: 'user', select: 'secret -_id' }] } },
        } as never);
        const entered = latch();
        const resume = latch();
        let calls = 0;
        api.createRouter(Source, {
          requireOperationAccessForPopulateDependencies: true,
          operationAccess: true,
          permissionSchema: { key: true },
          stripPermissionsField: true,
          hydration: { findOne: hydration },
          baseFilter: {
            read: async () => {
              if (calls++ === 0) {
                entered.release();
                await resume.promise;
              }
              return {};
            },
          },
        });
        const include = {
          model: targetName,
          op: 'list' as const,
          path: 'joined',
          args: { select: ['name', 'value', '-_id'] },
          ...(mode === 'legacy'
            ? { localField: 'key', foreignField: 'key' }
            : { mode, filter: { key: { $parent: 'key' } } }),
        };
        const app = express().use(api());
        let failure: unknown;
        app.post('/probe', async (req, res) => {
          try {
            const service = (req as ModelRequest).macl.getService(Source.modelName);
            const pending = service.findOne(
              { _id: source._id },
              { select: ['key', '-_id'], include: [include] } as never,
              quiet,
            );
            await Promise.race([
              entered.promise,
              pending.then((result) => {
                throw new Error(`source suspension was not reached: ${JSON.stringify(result)}`);
              }),
            ]);
            if (replace) {
              // Server-owned registry update after capture. Target B and User B
              // share names/IDs with A, but User B has no runtime ACL configuration.
              const replacement = api.runtime.createBootstrapSnapshot();
              replacement.modelInstances[targetName] = TargetB as mongoose.Model<unknown>;
              api.runtime.restoreBootstrapSnapshot(replacement);
            }
            resume.release();
            const result = await pending;
            expect(result.success).toBe(true);
            expect(getter).toHaveBeenCalledTimes(1); // Swallowed getter errors cannot satisfy the probe.
            expect(inputs).toEqual([{ user: { secret: 'private-A' } }]);
            for (const view of views) {
              expect(JSON.stringify(view)).not.toContain('private-A');
              expect(view).not.toHaveProperty('user.secret');
            }
            expect({
              output: JSON.parse(JSON.stringify((result as { data: unknown }).data)),
              targetReads: { A: targetReadsA.mock.calls.length, B: targetReadsB.mock.calls.length },
              privateReads: { A: privateReadsA.mock.calls.length, B: privateReadsB.mock.calls.length },
              targetContextPinned: contexts.length > 0 && contexts.every((model) => model === TargetA),
            }).toEqual({
              output: { key: 'join', joined: [{ name: 'row-A', value: 'private-A' }] },
              targetReads: { A: 1, B: 0 },
              privateReads: { A: 1, B: 0 },
              targetContextPinned: true,
            });
          } catch (error) {
            failure = error;
            resume.release();
          }
          res.json({ done: true });
        });
        await request(app).post('/probe').expect(200, { done: true });
        if (failure) throw failure;
      },
    );
  });
});
