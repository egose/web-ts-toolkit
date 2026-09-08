import 'reflect-metadata';
import express from 'express';
import mongoose from 'mongoose';
import { describe, it, expect } from 'vitest';
import { EgoseFactoryStatic } from '../src/factory';
import { Module, Router, RouterOptions, Prepare, Validate } from '../src/decorators';
import { applyMethodDecorator, applyParameterDecorator } from './helpers';
import { Document } from '../src/decorators/parameter.decorators';
import acl from '@web-ts-toolkit/access-router';

function getAppStackLength(app: express.Express): number {
  const stack = getAppStack(app);
  return stack ? stack.length : 0;
}

function getAppStack(app: express.Express): any[] | null {
  const a: any = app as any;
  if (a._router?.stack) return a._router.stack;
  if (a.router?.stack) return a.router.stack;
  if (typeof a._getRouter === 'function') {
    try {
      const r = a._getRouter();
      if (r?.stack) return r.stack;
    } catch {
      // ignore
    }
  }
  return null;
}

function expectSingleScopedMount(
  app: express.Express,
  result: { runtime: unknown; router: any },
  factory: EgoseFactoryStatic,
) {
  // BDECO-03: exactly one host layer is published and it owns the module
  // router; request runtime init is the first inner layer of that router.
  expect(result.runtime).toBe(factory.runtime);
  const stack = getAppStack(app);
  expect(stack).not.toBeNull();
  const top = stack![stack!.length - 1];
  expect(top.handle).toBe(result.router);
  const inner = (result.router as any).stack as any[];
  expect(Array.isArray(inner)).toBe(true);
  expect(inner.length).toBeGreaterThanOrEqual(1);
  expect(typeof inner[0].handle).toBe('function');
  expect(String(inner[0].handle?.name ?? inner[0].name ?? '')).toMatch(/setCore/i);
}

function getRuntimeSnapshot(factory: EgoseFactoryStatic) {
  const rt: any = (factory.runtime as any).runtime ?? factory.runtime;
  if (typeof rt.createBootstrapSnapshot === 'function') return rt.createBootstrapSnapshot();
  return null;
}

function cloneWithoutLogger(snapshot: any): any {
  if (!snapshot) return null;
  // Deep clone but replace logger which is circular
  const copy: any = JSON.parse(
    JSON.stringify(snapshot, (key, value) => {
      if (key === 'logger') return '[logger]';
      // Avoid circular refs from model instances? They are function objects, stringify will drop them; we handle separately
      if (typeof value === 'function') return '[Function]';
      return value;
    }),
  );
  return copy;
}

function snapshotEquals(a: any, b: any): boolean {
  return JSON.stringify(cloneWithoutLogger(a)) === JSON.stringify(cloneWithoutLogger(b));
}

function dummyModel(modelName: string) {
  return Object.assign(function M() {}, {
    modelName,
    schema: { tree: {}, obj: {} },
    jsonSchema: () => ({}),
  }) as any;
}

describe('bootstrap transactional atomicity (ARDECO-04)', () => {
  it('malformed existing hook chain leaves no package middleware and runtime unchanged (preflight)', () => {
    const modelName = 'DecoTxMalformedChainUser';
    const factory = EgoseFactoryStatic.create();
    const app = express();

    const model = dummyModel(modelName);
    factory.runtime.registerModelInstance(modelName, model);
    factory.runtime.setModelOption(modelName, 'prepare.create' as any, [[() => null]] as any);

    const preSnapshot = getRuntimeSnapshot(factory);
    const preOpenApiLen = factory.runtime.runtime.getOpenApiRoutes().length;
    const preStackLen = getAppStackLength(app);
    const preHasModel = factory.runtime.hasModelInstance(modelName);

    class UserRouter {
      prepare() {
        return {};
      }
    }
    applyMethodDecorator(Prepare('create'), UserRouter.prototype, 'prepare');
    Router(modelName)(UserRouter);

    class TestModule {}
    Module({ routers: [UserRouter] })(TestModule);

    expect(() => factory.bootstrap(TestModule, app)).toThrow(/Invalid hook chain for prepare\.create/);
    expect(getAppStackLength(app)).toBe(preStackLen);
    expect(snapshotEquals(getRuntimeSnapshot(factory), preSnapshot)).toBe(true);
    expect(factory.runtime.runtime.getOpenApiRoutes()).toHaveLength(preOpenApiLen);
    expect(factory.runtime.hasModelInstance(modelName)).toBe(preHasModel);

    // Fix chain and retry should succeed with exactly one scoped mount
    factory.runtime.setModelOption(modelName, 'prepare.create' as any, [] as any);
    const ret = factory.bootstrap(TestModule, app);
    expect(getAppStackLength(app)).toBe(preStackLen + 1);
    expectSingleScopedMount(app, ret, factory);
    const chain = factory.runtime.getModelOption(modelName, 'prepare.create') as Function[];
    expect(chain).toHaveLength(1);
    expect(ret.runtime).toBe(factory.runtime);
    expect(() => factory.bootstrap(TestModule, app)).toThrow(/already called/);
    expect(getAppStackLength(app)).toBe(preStackLen + 1);
  });

  it('duplicate validator intra-class leaves no middleware and does not mark bootstrapped', () => {
    const modelName = 'DecoTxDuplicateValidatorUser';
    const factory = EgoseFactoryStatic.create();
    const app = express();
    const preSnapshot = getRuntimeSnapshot(factory);
    const preStack = getAppStackLength(app);

    class UserRouter {
      a() {
        return true;
      }
      b() {
        return true;
      }
    }
    applyMethodDecorator(Validate('create'), UserRouter.prototype, 'a');
    applyMethodDecorator(Validate('create'), UserRouter.prototype, 'b');
    Router(modelName)(UserRouter);
    class TestModule {}
    Module({ routers: [UserRouter] })(TestModule);

    expect(() => factory.bootstrap(TestModule, app)).toThrow(/Duplicate decorated validator for validate\.create/);
    expect(getAppStackLength(app)).toBe(preStack);
    expect(snapshotEquals(getRuntimeSnapshot(factory), preSnapshot)).toBe(true);

    class FixedRouter {
      a() {
        return true;
      }
    }
    applyMethodDecorator(Validate('create'), FixedRouter.prototype, 'a');
    Router(modelName)(FixedRouter);
    class FixedModule {}
    Module({ routers: [FixedRouter] })(FixedModule);
    const factory2 = EgoseFactoryStatic.create();
    factory2.runtime.registerModelInstance(modelName, dummyModel(modelName));
    const pre2 = getRuntimeSnapshot(factory2);
    // use fresh app to avoid stack pollution from prior factory's app (which had 0)
    const app2 = express();
    const fixedRet = factory2.bootstrap(FixedModule, app2);
    expect(getAppStackLength(app2)).toBe(1);
    expectSingleScopedMount(app2, fixedRet, factory2);
    expect(fixedRet.runtime.getModelOption(modelName, 'validate.create')).toEqual(expect.any(Function));
    expect(() => factory2.bootstrap(FixedModule, app2)).toThrow(/already called/);
    expect(snapshotEquals(getRuntimeSnapshot(factory2), pre2)).toBe(false);
  });

  it('duplicate validator vs existing static array leaves runtime and app unchanged', () => {
    const modelName = 'DecoTxStaticValidatorUser';
    const factory = EgoseFactoryStatic.create();
    const app = express();
    const model = dummyModel(modelName);
    factory.runtime.registerModelInstance(modelName, model);
    const staticIssues = [{ path: 'name', message: 'required' }];
    factory.runtime.setModelOption(modelName, 'validate.create' as any, staticIssues as any);
    const preSnapshot = getRuntimeSnapshot(factory);
    const preStack = getAppStackLength(app);

    class UserRouter {
      validate() {
        return true;
      }
    }
    applyMethodDecorator(Validate('create'), UserRouter.prototype, 'validate');
    Router(modelName)(UserRouter);
    class TestModule {}
    Module({ routers: [UserRouter] })(TestModule);

    expect(() => factory.bootstrap(TestModule, app)).toThrow(/Duplicate decorated validator for validate\.create/);
    expect(getAppStackLength(app)).toBe(preStack);
    expect(snapshotEquals(getRuntimeSnapshot(factory), preSnapshot)).toBe(true);
    expect(factory.runtime.getModelOption(modelName, 'validate.create')).toStrictEqual(staticIssues);

    factory.runtime.setModelOption(modelName, 'validate.create' as any, undefined as any);
    const expectedLenBeforeRetry = getAppStackLength(app);
    const retryRet = factory.bootstrap(TestModule, app);
    expect(getAppStackLength(app)).toBe(expectedLenBeforeRetry + 1);
    expectSingleScopedMount(app, retryRet, factory);
    expect(factory.runtime.getModelOption(modelName, 'validate.create')).toEqual(expect.any(Function));
  });

  it('root validate shorthand conflict leaves runtime and app unchanged (BDECO-01)', () => {
    const modelName = 'DecoTxRootValidatorUser';
    const factory = EgoseFactoryStatic.create();
    const app = express();
    factory.runtime.registerModelInstance(modelName, dummyModel(modelName));
    factory.runtime.setModelOption(modelName, 'validate' as any, false as any);
    const preSnapshot = getRuntimeSnapshot(factory);
    const preStack = getAppStackLength(app);

    class UserRouter {
      validate() {
        return true;
      }
    }
    applyMethodDecorator(Validate('create'), UserRouter.prototype, 'validate');
    Router(modelName)(UserRouter);
    class TestModule {}
    Module({ routers: [UserRouter] })(TestModule);

    expect(() => factory.bootstrap(TestModule, app)).toThrow(/Duplicate decorated validator for validate\.create/);
    expect(getAppStackLength(app)).toBe(preStack);
    expect(snapshotEquals(getRuntimeSnapshot(factory), preSnapshot)).toBe(true);
    expect(factory.runtime.getModelOption(modelName, 'validate' as any)).toBe(false);
    expect(factory.runtime.getModelOption(modelName, 'validate.update' as any)).toBe(false);
  });

  it('model registration conflict leaves runtime and app unchanged and retry succeeds', () => {
    const modelName = 'DecoTxModelConflictUser';
    const factory = EgoseFactoryStatic.create();
    const app = express();
    const modelA = dummyModel(modelName);
    const modelB = dummyModel(modelName);
    factory.runtime.registerModelInstance(modelName, modelA);
    const preSnapshot = getRuntimeSnapshot(factory);
    const preStack = getAppStackLength(app);

    class UserRouter {}
    Router(modelB)(UserRouter);
    class TestModule {}
    Module({ routers: [UserRouter] })(TestModule);

    expect(() => factory.bootstrap(TestModule, app)).toThrow(/Runtime model registry conflict/);
    expect(getAppStackLength(app)).toBe(preStack);
    expect(snapshotEquals(getRuntimeSnapshot(factory), preSnapshot)).toBe(true);
    expect(factory.runtime.getModelInstance(modelName)).toBe(modelA);

    const factory2 = EgoseFactoryStatic.create();
    factory2.runtime.registerModelInstance(modelName, modelA);
    class UserRouter2 {}
    Router(modelA)(UserRouter2);
    class TestModule2 {}
    Module({ routers: [UserRouter2] })(TestModule2);
    const app2 = express();
    const pre2 = getAppStackLength(app2);
    const ret2 = factory2.bootstrap(TestModule2, app2);
    expect(getAppStackLength(app2)).toBe(pre2 + 1);
    expectSingleScopedMount(app2, ret2, factory2);
    expect(factory2.runtime.getModelInstance(modelName)).toBe(modelA);
  });

  it('second-router OpenAPI collision leaves no middleware and runtime restored', () => {
    const factory = EgoseFactoryStatic.create();
    const app = express();
    const model1 = 'DecoTxOpenApiUser';
    const model2 = 'DecoTxOpenApiPost';
    // Register dummy models so isolated runtime can create routers
    factory.runtime.registerModelInstance(model1, dummyModel(model1));
    factory.runtime.registerModelInstance(model2, dummyModel(model2));
    class UserRouter {}
    Router(model1, { basePath: '/shared' })(UserRouter);
    class PostRouter {}
    Router(model2, { basePath: '/shared' })(PostRouter);
    class TestModule {}
    Module({ routers: [UserRouter, PostRouter] })(TestModule);

    const preSnapshot = getRuntimeSnapshot(factory);
    const preStack = getAppStackLength(app);
    const preOpenApi = factory.runtime.runtime.getOpenApiRoutes().length;

    expect(() => factory.bootstrap(TestModule, app)).toThrow(/OpenAPI route collision/);
    expect(getAppStackLength(app)).toBe(preStack);
    expect(snapshotEquals(getRuntimeSnapshot(factory), preSnapshot)).toBe(true);
    expect(factory.runtime.runtime.getOpenApiRoutes()).toHaveLength(preOpenApi);

    class UserRouter2 {}
    Router(model1, { basePath: '/users' })(UserRouter2);
    class PostRouter2 {}
    Router(model2, { basePath: '/posts' })(PostRouter2);
    class TestModule2 {}
    Module({ routers: [UserRouter2, PostRouter2] })(TestModule2);
    const factory2 = EgoseFactoryStatic.create();
    factory2.runtime.registerModelInstance(model1, dummyModel(model1));
    factory2.runtime.registerModelInstance(model2, dummyModel(model2));
    const app2 = express();
    const ret2 = factory2.bootstrap(TestModule2, app2);
    expect(getAppStackLength(app2)).toBe(1);
    expectSingleScopedMount(app2, ret2, factory2);
    expect(factory2.runtime.runtime.getOpenApiRoutes().length).toBeGreaterThan(preOpenApi);
    expect(factory2.runtime.getModelOptions(model1).basePath).toBe('/users');
    expect(factory2.runtime.getModelOptions(model2).basePath).toBe('/posts');
  });

  it('final express mount failure restores runtime and keeps retryable', () => {
    const modelName = 'DecoTxFinalMountUser';
    const factory = EgoseFactoryStatic.create();
    factory.runtime.registerModelInstance(modelName, dummyModel(modelName));
    const app = express();
    const originalUse = (app as any).use.bind(app);
    let callCount = 0;
    // BDECO-03: exactly one host publication (`app.use(basePath, router)` with
    // init scoped inside the router), so fail the single mount.
    (app as any).use = (...args: any[]) => {
      callCount++;
      if (callCount === 1) throw new Error('final mount boom');
      return originalUse(...args);
    };
    const preSnapshot = getRuntimeSnapshot(factory);
    const preStack = getAppStackLength(app);

    class UserRouter {}
    Router(modelName)(UserRouter);
    class TestModule {}
    Module({ routers: [UserRouter] })(TestModule);

    expect(() => factory.bootstrap(TestModule, app)).toThrow(/final mount boom/);
    expect(getAppStackLength(app)).toBe(preStack);
    expect(snapshotEquals(getRuntimeSnapshot(factory), preSnapshot)).toBe(true);

    (app as any).use = originalUse;
    const retryRet = factory.bootstrap(TestModule, app);
    expect(getAppStackLength(app)).toBe(preStack + 1);
    expectSingleScopedMount(app, retryRet, factory);
    // Retry mounts exactly one copy of init + routes with no duplication.
    const innerHandles = ((retryRet.router as any).stack as any[]).map((l: any) => l.handle?.name ?? l.name);
    expect(innerHandles.filter((n: string) => /setCore/i.test(n))).toHaveLength(1);
    expect(() => factory.bootstrap(TestModule, app)).toThrow(/already called/);
    expect(getAppStackLength(app)).toBe(preStack + 1);
  });

  it('global/default/model option snapshots match pre-bootstrap after failure and retry mounts one copy', () => {
    const factory = EgoseFactoryStatic.create();
    factory.runtime.setGlobalOption('requestPermissionField' as any, '_pre' as any);
    factory.runtime.setDefaultModelOption('idParam' as any, 'preId' as any);
    const modelName = 'DecoTxSnapshotUser2';
    const model = dummyModel(modelName);
    factory.runtime.registerModelInstance(modelName, model);
    factory.runtime.setModelOption(modelName, 'basePath' as any, '/pre' as any);
    factory.runtime.setModelOption(modelName, 'prepare.create' as any, [() => ({})] as any);

    const app = express();
    const preStack = getAppStackLength(app);

    // Create a module that would fail via duplicate validator after global option would have been set
    class DupRouter {
      a() {
        return true;
      }
      b() {
        return true;
      }
    }
    applyMethodDecorator(Validate('create'), DupRouter.prototype, 'a');
    applyMethodDecorator(Validate('create'), DupRouter.prototype, 'b');
    Router(modelName)(DupRouter);
    class BadModule {}
    Module({ routers: [DupRouter], options: { requestPermissionField: '_changed2' } })(BadModule);

    expect(() => factory.bootstrap(BadModule, app)).toThrow(/Duplicate decorated validator/);
    expect(factory.runtime.getGlobalOption('requestPermissionField' as any)).toBe('_pre');
    expect(getAppStackLength(app)).toBe(preStack);
    expect(factory.runtime.getDefaultModelOption('idParam' as any)).toBe('preId');
    expect(factory.runtime.getModelOption(modelName, 'basePath' as any)).toBe('/pre');
  });

  it('successful bootstrap preserves route ordering, runtime ownership and duplicate-success rejection', () => {
    const factory = EgoseFactoryStatic.create();
    const app = express();
    app.use(express.json());
    const modelName = 'DecoTxSuccessUser2';
    const model = dummyModel(modelName);
    factory.runtime.registerModelInstance(modelName, model);

    class DefaultOpts {}
    RouterOptions({ parentPath: '/tenant' })(DefaultOpts);
    class UserRouter {}
    Router(modelName)(UserRouter);
    class HealthRouter {}
    Router({ basePath: '/health' })(HealthRouter);
    class TestModule {}
    Module({ routers: [HealthRouter, UserRouter], routerOptions: [DefaultOpts] })(TestModule);

    const preLen = getAppStackLength(app);
    const result = factory.bootstrap(TestModule, app);
    expect(result.runtime).toBe(factory.runtime);
    expect(result.router).toBeDefined();
    // BDECO-03: single scoped publication owns init + preserves definition order.
    expect(getAppStackLength(app)).toBe(preLen + 1);
    expectSingleScopedMount(app, result, factory);
    expect(result.runtime.getModelOptions(modelName).parentPath).toBe('/tenant');
    expect(() => factory.bootstrap(TestModule, app)).toThrow(/already called/);
    const len = getAppStackLength(app);
    expect(() => factory.bootstrap(TestModule, app)).toThrow(/already called/);
    expect(getAppStackLength(app)).toBe(len);
  });

  it('documents non-rollback boundary: constructor side effects are not undone', () => {
    let ctorSideEffect = 0;
    class LeakyRouter {
      constructor() {
        ctorSideEffect++;
      }
      a() {
        return true;
      }
      b() {
        return true;
      }
    }
    applyMethodDecorator(Validate('create'), LeakyRouter.prototype, 'a');
    applyMethodDecorator(Validate('create'), LeakyRouter.prototype, 'b');
    Router('DecoTxLeakyUser')(LeakyRouter);
    class TestModule {}
    Module({ routers: [LeakyRouter] })(TestModule);
    const factory = EgoseFactoryStatic.create();
    const app = express();
    const preCount = ctorSideEffect;
    expect(() => factory.bootstrap(TestModule, app)).toThrow(/Duplicate decorated validator/);
    expect(ctorSideEffect).toBe(preCount + 1);
    expect(getAppStackLength(app)).toBe(0);
  });

  it('BDECO-04: default-runtime lazy lookup followed by conflict leaves snapshot unchanged', () => {
    const modelName = 'Bdeco04LazyConflictUser';
    // Ensure a clean global mongoose entry for this run.
    try {
      (mongoose as any).deleteModel?.(modelName);
    } catch {
      // ignore
    }
    if ((mongoose.models as any)[modelName]) {
      delete (mongoose.models as any)[modelName];
    }
    const globalModel = mongoose.model(modelName, new mongoose.Schema({ name: String }));
    const factory = EgoseFactoryStatic.create(acl as any);
    const app = express();
    const preSnapshot = getRuntimeSnapshot(factory);
    const preStack = getAppStackLength(app);
    const preManagerNames: string[] = (factory.runtime as any).getModelNames?.() ?? [];

    class ConflictRouter {
      prepare() {
        return {};
      }
    }
    applyMethodDecorator(Prepare('create'), ConflictRouter.prototype, 'prepare');
    Router(dummyModel(modelName))(ConflictRouter);
    class TestModule {}
    Module({ routers: [ConflictRouter] })(TestModule);

    expect(() => factory.bootstrap(TestModule, app)).toThrow(/Runtime model registry conflict/);
    expect(getAppStackLength(app)).toBe(preStack);
    expect(snapshotEquals(getRuntimeSnapshot(factory), preSnapshot)).toBe(true);
    const postManagerNames: string[] = (factory.runtime as any).getModelNames?.() ?? [];
    expect(postManagerNames).toEqual(preManagerNames);
    expect((factory.runtime as any).runtime.hasModel(modelName)).toBe(false);

    try {
      (mongoose as any).deleteModel?.(modelName);
    } catch {
      // ignore
    }
    if ((mongoose.models as any)[modelName]) {
      delete (mongoose.models as any)[modelName];
    }
    expect(globalModel.modelName).toBe(modelName);
  });

  it('BDECO-04: reentrant constructor bootstrap rejected before nested publication and retryable', () => {
    const modelName = 'Bdeco04ReentrantUser';
    const otherModelName = 'Bdeco04ReentrantOther';
    const factory = EgoseFactoryStatic.create();
    factory.runtime.registerModelInstance(modelName, dummyModel(modelName));
    factory.runtime.registerModelInstance(otherModelName, dummyModel(otherModelName));
    const app = express();
    const preStack = getAppStackLength(app);
    let allowReentry = true;
    let reentryAttempts = 0;
    let nestedError: unknown = null;

    class ReentrantRouter {
      constructor() {
        if (allowReentry && reentryAttempts === 0) {
          reentryAttempts++;
          try {
            factory.bootstrap(TestModule, app);
          } catch (err) {
            nestedError = err;
            throw err;
          }
        }
      }
    }
    Router(modelName)(ReentrantRouter);
    class TestModule {}
    Module({ routers: [ReentrantRouter] })(TestModule);

    expect(() => factory.bootstrap(TestModule, app)).toThrow(/in progress|reentrant/i);
    expect(String((nestedError as Error)?.message ?? nestedError)).toMatch(/in progress|reentrant/i);
    expect(getAppStackLength(app)).toBe(preStack);

    // Independent tuple still works while the failed tuple is retryable.
    class OtherRouter {}
    Router(otherModelName)(OtherRouter);
    class OtherModule {}
    Module({ routers: [OtherRouter] })(OtherModule);
    const otherApp = express();
    const otherRet = factory.bootstrap(OtherModule, otherApp);
    expect(getAppStackLength(otherApp)).toBe(1);
    expectSingleScopedMount(otherApp, otherRet, factory);

    // Failed tuple is retryable once reentry is disabled.
    allowReentry = false;
    const retryRet = factory.bootstrap(TestModule, app);
    expect(getAppStackLength(app)).toBe(preStack + 1);
    expectSingleScopedMount(app, retryRet, factory);
    expect(() => factory.bootstrap(TestModule, app)).toThrow(/already called/);
    expect(getAppStackLength(app)).toBe(preStack + 1);
  });
});
