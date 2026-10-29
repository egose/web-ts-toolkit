import 'reflect-metadata';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';
import {
  DefaultModelOption,
  EgoseFactoryStatic,
  GlobalOption,
  ModelOption,
  Module,
  Option,
  Router,
  RouterOptions,
} from '../dist/index.mjs';
import { useMongoTestDatabase } from '../../access-router/test/setup';

useMongoTestDatabase();
const Q = 'requireOperationAccessForPopulateQueries';
const D = 'requireOperationAccessForPopulateDependencies';
const flags = [Q, D] as const;
const quiet = { includePermissions: false, includeFieldPermissions: false };
const factories: EgoseFactoryStatic[] = [];
let sequence = 0;
afterEach(() => {
  vi.restoreAllMocks();
  factories.splice(0).forEach((factory) => factory.runtime.runtime.clearOpenApiRoutes());
  mongoose.deleteModel(/^MpoDeco/);
});

async function fixture(hydration: 'lean' | 'hydrated', q: boolean | undefined, d: boolean | undefined) {
  const n = ++sequence;
  const User = mongoose.model(`MpoDecoUser${n}`, new mongoose.Schema({ name: String, value: Number }));
  const Document = mongoose.model(`MpoDecoDocument${n}`, new mongoose.Schema({ name: String, value: Number }));
  const Project = mongoose.model(
    `MpoDecoProject${n}`,
    new mongoose.Schema({
      document: { type: mongoose.Schema.Types.ObjectId, ref: Document.modelName },
      user: { type: mongoose.Schema.Types.ObjectId, ref: User.modelName },
    }),
  );
  class Defaults {
    query = false;
    dependency = false;
  }
  // Bulk values are intentionally replaced by exact property writes.
  RouterOptions({ [Q]: true, [D]: true })(Defaults);
  DefaultModelOption(Q)(Defaults.prototype, 'query');
  DefaultModelOption(D)(Defaults.prototype, 'dependency');
  class DocumentOptions {
    query = q;
    dependency = d;
  }
  RouterOptions(Document, {
    [Q]: true,
    [D]: true,
    operationAccess: false,
    permissionSchema: { name: true, value: false },
  })(DocumentOptions);
  ModelOption(Q)(DocumentOptions.prototype, 'query');
  ModelOption(D)(DocumentOptions.prototype, 'dependency');
  class DocumentRouter {}
  // Factory applies another bulk call and createRouter(Document, {}) after the properties above.
  Router(Document, { basePath: '/documents', sortableFields: ['name'] })(DocumentRouter);
  class UserOptions {
    query = true;
    dependency = true;
  }
  RouterOptions(User, { operationAccess: false, permissionSchema: { name: true, value: false } })(UserOptions);
  // The legacy extension decorator follows its class's model role; it cannot broadcast globally.
  Option(Q)(UserOptions.prototype, 'query');
  ModelOption(D)(UserOptions.prototype, 'dependency');
  const documentValue = vi.fn((_doc, _perms, _ctx, inputs) => inputs.document?.value);
  const userValue = vi.fn((_doc, _perms, _ctx, inputs) => inputs.user?.value);
  class ProjectRouter {
    query = false;
    dependency = false;
  }
  Router(Project, {
    basePath: '/projects',
    operationAccess: true,
    permissionSchema: { document: true, user: true, documentValue: true, userValue: true },
    virtuals: {
      documentValue: { get: documentValue, dependsOnPopulate: [{ path: 'document', select: 'value -_id' }] },
      userValue: { get: userValue, dependsOnPopulate: [{ path: 'user', select: 'value -_id' }] },
    },
    hydration: { findOne: hydration },
  } as never)(ProjectRouter);
  ModelOption(Q)(ProjectRouter.prototype, 'query');
  ModelOption(D)(ProjectRouter.prototype, 'dependency');
  class Root {}
  Router({ basePath: '/root', operationAccess: true })(Root);
  class AppModule {}
  Module({ routers: [DocumentRouter, ProjectRouter, Root], routerOptions: [UserOptions, DocumentOptions, Defaults] })(
    AppModule,
  );
  const factory = EgoseFactoryStatic.create();
  factories.push(factory);
  const app = express().use(express.json());
  const createRouter = vi.spyOn(factory.runtime, 'createRouter');
  factory.bootstrap(AppModule, app);
  const constructionOptions = createRouter.mock.results.find(
    (_result, index) => createRouter.mock.calls[index][0] === Document,
  )!.value.options;
  createRouter.mockRestore();
  // Host-owned probe installs the owning runtime outside the module router.
  app.use('/probe', factory.runtime());
  let callback!: (req: ModelRequest) => Promise<unknown>;
  let value: unknown, failure: unknown;
  app.post('/probe', async (req, res) => {
    try {
      value = await callback(req as ModelRequest);
    } catch (error) {
      failure = error;
    }
    res.json({ ok: true });
  });
  const document = await Document.create({ name: 'document', value: 11 });
  const user = await User.create({ name: 'user', value: 17 });
  const project = await Project.create({ document: document._id, user: user._id });
  return {
    factory,
    app,
    AppModule,
    Document,
    User,
    Project,
    document,
    user,
    project,
    documentValue,
    userValue,
    constructionOptions,
    async execute(run: (req: ModelRequest) => Promise<unknown>) {
      callback = run;
      failure = undefined;
      await request(app).post('/probe').send({}).expect(200);
      if (failure) throw failure;
      return value;
    },
  };
}

describe.each(['lean', 'hydrated'] as const)('MPO-02 built decorator factory (%s)', (hydration) => {
  it.each([
    [undefined, undefined],
    [false, true],
    [true, false],
    [true, true],
  ] as const)(
    'bulk/property/repeated empty setup preserves Q=%s D=%s and live defaults on later SAME-service calls',
    async (query, dependency) => {
      const f = await fixture(hydration, query, dependency);
      const api = f.factory.runtime;
      const stored = api.getModelOptions(f.Document.modelName);
      expect(Object.hasOwn(stored, Q)).toBe(true);
      expect(Object.hasOwn(stored, D)).toBe(true);
      expect(stored[Q]).toBe(query);
      expect(stored[D]).toBe(dependency);
      await f.execute(async (req) => {
        const service = req.macl.getService(f.Project.modelName);
        const args = {
          select: ['document', 'user', 'documentValue', 'userValue'],
          populate: [
            { path: 'document', select: 'name -_id' },
            { path: 'user', select: 'name -_id' },
          ],
        };
        const run = async (q: boolean, d: boolean) => {
          const result = await service.findOne({ _id: f.project._id }, args, quiet);
          expect(result).toMatchObject({ success: true });
          if (!result.success) throw new Error(result.code);
          if (q) expect(result.data.document).toEqual(f.document._id);
          else expect(result.data.document).toEqual({ name: 'document' });
          expect(result.data.user).toEqual(f.user._id);
          expect(result.data.documentValue).toBe(d ? undefined : 11);
          expect(result.data).not.toHaveProperty('userValue');
          expect(f.userValue).not.toHaveBeenCalled();
        };
        await run(query ?? false, dependency ?? false);
        api.setDefaultModelOptions({ [Q]: true, [D]: true });
        await run(query ?? true, dependency ?? true);
        expect(api.getModelOptions(f.Document.modelName)[Q]).toBe(query);
        expect(api.getModelOptions(f.Document.modelName)[D]).toBe(dependency);
        api.setModelOptions(f.Document.modelName, { [Q]: undefined, [D]: undefined });
        await run(true, true);
        api.setDefaultModelOptions({ [Q]: false, [D]: false });
        await run(false, false);
      });
      // Actual public entry guards do not inherit Document's populate bypass.
      await request(f.app).get(`/documents/${f.document._id}`).expect(401);
      const root = await request(f.app)
        .post('/root')
        .send([{ target: 'model', name: f.Document.modelName, op: 'list' }])
        .expect(200);
      expect(root.body[0].statusCode).toBe(401);
    },
  );

  it('rolls back default/model/cleared overrides and raw stored/construction snapshots after late mount failure, then retries cleanly', async () => {
    const f = await fixture(hydration, undefined, true);
    const api = f.factory.runtime;
    const before = api.runtime.createBootstrapSnapshot();
    const raw = api.getModelOptions(f.Document.modelName);
    const defaults = api.getDefaultModelOptions();
    const construction = f.constructionOptions;
    class ChangedDefaults {
      dependency = undefined;
    }
    RouterOptions({ [Q]: true, [D]: false })(ChangedDefaults);
    DefaultModelOption(D)(ChangedDefaults.prototype, 'dependency');
    class ChangedDocument {
      query = true;
      dependency = undefined;
    }
    RouterOptions(f.Document, { [Q]: false, [D]: false })(ChangedDocument);
    ModelOption(Q)(ChangedDocument.prototype, 'query');
    ModelOption(D)(ChangedDocument.prototype, 'dependency');
    class FailedModule {}
    Module({ routers: [], routerOptions: [ChangedDocument, ChangedDefaults] })(FailedModule);
    const app = express();
    const original = new Error('late publication failure');
    const use = vi.spyOn(app, 'use').mockImplementationOnce(() => {
      throw original;
    });
    expect(() => f.factory.bootstrap(FailedModule, app)).toThrow(original);
    expect(api.runtime.createBootstrapSnapshot()).toEqual(before);
    expect(api.getModelOptions(f.Document.modelName)).toEqual(raw);
    expect(api.getDefaultModelOptions()).toEqual(defaults);
    expect(f.constructionOptions).toBe(construction);
    expect(construction[Q]).toBeUndefined();
    expect(construction[D]).toBe(true);
    expect(raw[Q]).toBeUndefined();
    expect(raw[D]).toBe(true);
    use.mockRestore();
    f.factory.bootstrap(FailedModule, app);
    expect(api.getModelOptions(f.Document.modelName)[Q]).toBe(true);
    expect(api.getModelOptions(f.Document.modelName)[D]).toBeUndefined();
    expect(api.getDefaultModelOptions()[D]).toBeUndefined();
    expect(raw[D]).toBe(true);
    expect(raw[Q]).toBeUndefined();
    expect(construction[D]).toBe(true);
    expect(construction[Q]).toBeUndefined();
    expect(app.router.stack).toHaveLength(1);
  });
});

describe.each(flags)('MPO-02 decorator scope %s', (flag) => {
  it.each(['legacy', 'scoped', 'inferred', 'bulk'] as const)(
    '%s stale module usage fails actionably and atomically, including undefined',
    (form) => {
      const factory = EgoseFactoryStatic.create();
      factories.push(factory);
      for (const value of [false, true, undefined, null, 0, 'false']) {
        class StaleModule {
          policy = value;
        }
        if (form === 'legacy') Option(flag)(StaleModule.prototype, 'policy');
        else if (form === 'scoped') GlobalOption(flag as never)(StaleModule.prototype, 'policy');
        else if (form === 'inferred') GlobalOption()(StaleModule.prototype, flag);
        Module({
          routers: [],
          options: { requestPermissionField: 'changed', ...(form === 'bulk' ? { [flag]: value } : {}) },
        })(StaleModule);
        const before = factory.runtime.runtime.createBootstrapSnapshot();
        const app = express();
        expect(() => factory.bootstrap(StaleModule, app)).toThrow(
          new RegExp(`${flag}.*target.*setModelOptions.*setDefaultModelOptions`),
        );
        expect(factory.runtime.runtime.createBootstrapSnapshot()).toEqual(before);
        expect(app.router.stack).toHaveLength(0);
      }
    },
  );

  it.each(['default', 'model', 'legacy-model'] as const)(
    '%s properties validate booleans/undefined before normalization and rollback invalid initialization',
    (scope) => {
      for (const value of [null, 0, 'false', {}, []]) {
        class Provider {
          policy = value;
        }
        const Model = new mongoose.Mongoose().model('MpoDecoInvalid', new mongoose.Schema({ name: String }));
        if (scope === 'default') {
          RouterOptions({ [flag]: false })(Provider);
          DefaultModelOption(flag)(Provider.prototype, 'policy');
        } else {
          RouterOptions(Model, { [flag]: false })(Provider);
          (scope === 'model' ? ModelOption : Option)(flag)(Provider.prototype, 'policy');
        }
        class AppModule {}
        Module({ routers: [], routerOptions: [Provider] })(AppModule);
        const factory = EgoseFactoryStatic.create();
        factories.push(factory);
        const before = factory.runtime.runtime.createBootstrapSnapshot();
        expect(() => factory.bootstrap(AppModule, express())).toThrow(
          new RegExp(`Invalid option value for ${flag}.*boolean or undefined`),
        );
        expect(factory.runtime.runtime.createBootstrapSnapshot()).toEqual(before);
      }
    },
  );
});
