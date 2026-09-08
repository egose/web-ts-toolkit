import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type { AccessRuntimeApi } from '@web-ts-toolkit/access-router';
import { EgoseFactoryStatic } from '../src/factory';
import {
  AfterPersist,
  Decorate,
  DecorateAll,
  Context,
  Document,
  Filter,
  Id,
  Identifier,
  Module,
  OverrideFilter,
  Permissions,
  Prepare,
  Request,
  Router,
  Transform,
  Validate,
} from '../src/decorators';
import { applyMethodDecorator, applyParameterDecorator } from './helpers';

function createMockExpressApp() {
  return { use() {} } as any;
}

function setupModel(runtime: AccessRuntimeApi, modelName: string) {
  const model = Object.assign(function DecoHookAdapterContractModel() {}, {
    modelName,
    schema: { tree: {}, obj: {} },
    jsonSchema: () => ({}),
  });
  runtime.registerModelInstance(modelName, model as any);
  runtime.setModelOptions(modelName, {
    validate: {},
    overrideFilter: {},
    resolveIdFilter: undefined,
    prepare: {},
  } as any);
}

function bootstrap(router: Function, modelName: string, configure?: (runtime: AccessRuntimeApi) => void) {
  const factory = EgoseFactoryStatic.create();
  setupModel(factory.runtime, modelName);
  configure?.(factory.runtime);

  class TestModule {}
  Module({ routers: [router as any] })(TestModule);
  factory.bootstrap(TestModule, createMockExpressApp());

  return factory.runtime;
}

const chainHookCases = [
  { label: 'prepare', decorator: Prepare('create'), optionKey: 'prepare.create' },
  { label: 'transform', decorator: Transform('update'), optionKey: 'transform.update' },
  { label: 'afterPersist', decorator: AfterPersist('create'), optionKey: 'afterPersist.create' },
  { label: 'decorate', decorator: Decorate('read'), optionKey: 'decorate.read' },
  { label: 'decorateAll', decorator: DecorateAll('list'), optionKey: 'decorateAll.list' },
] as const;

describe('real access-router hook adapter contract', () => {
  it('registers @Validate as a callable runtime validator with expected identities', async () => {
    const modelName = 'DecoHookAdapterContractValidate';
    const request = { requestId: 'validate-request' };
    const permissions = { can: true };
    const context = { operation: 'create' };
    const seen: Record<string, unknown> = {};

    class UserRouter {
      validate(doc: unknown, perms: unknown, ctx: unknown, req: unknown) {
        seen.classThis = this;
        seen.doc = doc;
        seen.perms = perms;
        seen.ctx = ctx;
        seen.req = req;
        return true;
      }
    }
    applyMethodDecorator(Validate('create'), UserRouter.prototype, 'validate');
    applyParameterDecorator(Document(), UserRouter.prototype, 'validate', 0);
    applyParameterDecorator(Permissions(), UserRouter.prototype, 'validate', 1);
    applyParameterDecorator(Context(), UserRouter.prototype, 'validate', 2);
    applyParameterDecorator(Request(), UserRouter.prototype, 'validate', 3);
    Router(modelName)(UserRouter);

    const runtime = bootstrap(UserRouter, modelName);

    const validate = runtime.getModelOption(modelName, 'validate.create') as Function;
    const doc = { name: 'Ada' };
    const result = await validate.call(request, doc, permissions, context);

    expect(result).toBe(true);
    expect(seen.doc).toBe(doc);
    expect(seen.perms).toBe(permissions);
    expect(seen.ctx).toBe(context);
    expect(seen.req).toBe(request);
    expect(seen.classThis).toBeInstanceOf(UserRouter);
  });

  it('registers async @Validate update validators as scalar functions that preserve issue arrays', async () => {
    const modelName = 'DecoHookAdapterContractValidateAsyncUpdate';
    const issue = { path: 'name', message: 'required' };

    class UserRouter {
      async validate(doc: { valid: boolean }) {
        return doc.valid ? true : [issue];
      }
    }
    applyMethodDecorator(Validate('update'), UserRouter.prototype, 'validate');
    applyParameterDecorator(Document(), UserRouter.prototype, 'validate', 0);
    Router(modelName)(UserRouter);

    const runtime = bootstrap(UserRouter, modelName);

    const validate = runtime.getModelOption(modelName, 'validate.update');

    expect(validate).toEqual(expect.any(Function));
    expect(Array.isArray(validate)).toBe(false);
    await expect((validate as Function).call({}, { valid: true }, {}, { operation: 'update' })).resolves.toBe(true);
    await expect((validate as Function).call({}, { valid: false }, {}, { operation: 'update' })).resolves.toEqual([
      issue,
    ]);
  });

  it('preserves false validator results as controlled validation failures', async () => {
    const modelName = 'DecoHookAdapterContractValidateFalse';

    class UserRouter {
      validate() {
        return false;
      }
    }
    applyMethodDecorator(Validate('create'), UserRouter.prototype, 'validate');
    Router(modelName)(UserRouter);

    const runtime = bootstrap(UserRouter, modelName);

    const validate = runtime.getModelOption(modelName, 'validate.create') as Function;

    expect(await validate.call({}, {}, {}, { operation: 'create' })).toBe(false);
  });

  it('rejects duplicate decorated validators for the same operation during bootstrap', () => {
    const modelName = 'DecoHookAdapterContractValidateDuplicate';

    class UserRouter {
      first() {
        return true;
      }

      second() {
        return true;
      }
    }
    applyMethodDecorator(Validate('create'), UserRouter.prototype, 'first');
    applyMethodDecorator(Validate('create'), UserRouter.prototype, 'second');
    Router(modelName)(UserRouter);

    expect(() => bootstrap(UserRouter, modelName)).toThrow(/Duplicate decorated validator for validate\.create/);
  });

  it('rejects a decorated validator that would overwrite a static validation issue array', () => {
    const modelName = 'DecoHookAdapterContractValidateStaticArray';
    const staticIssues = [{ path: 'name', message: 'required' }];

    class UserRouter {
      validate() {
        return true;
      }
    }
    applyMethodDecorator(Validate('create'), UserRouter.prototype, 'validate');
    Router(modelName)(UserRouter);

    let runtime: AccessRuntimeApi | undefined;
    expect(() => {
      bootstrap(UserRouter, modelName, (configuredRuntime) => {
        runtime = configuredRuntime;
        configuredRuntime.setModelOption(modelName, 'validate.create' as any, staticIssues as any);
      });
    }).toThrow(/Duplicate decorated validator for validate\.create/);
    expect(runtime?.getModelOption(modelName, 'validate.create')).toStrictEqual(staticIssues);
  });

  it('injects override-filter filter, permissions, and request from the real callback shape', async () => {
    const modelName = 'DecoHookAdapterContractOverride';
    const request = { requestId: 'override-request' };
    const permissions = { role: 'reader' };
    const initialFilter = { tenantId: 'tenant-1' };

    class UserRouter {
      override(perms: unknown, req: unknown, filter: unknown) {
        return { filter, perms, req, classThis: this };
      }
    }
    applyMethodDecorator(OverrideFilter('read'), UserRouter.prototype, 'override');
    applyParameterDecorator(Permissions(), UserRouter.prototype, 'override', 0);
    applyParameterDecorator(Request(), UserRouter.prototype, 'override', 1);
    applyParameterDecorator(Filter(), UserRouter.prototype, 'override', 2);
    Router(modelName)(UserRouter);

    const runtime = bootstrap(UserRouter, modelName);

    const override = runtime.getModelOption(modelName, 'overrideFilter.read') as Function;
    const result = await override.call(request, initialFilter, permissions);

    expect(result.filter).toBe(initialFilter);
    expect(result.perms).toBe(permissions);
    expect(result.req).toBe(request);
    expect(result.classThis).toBeInstanceOf(UserRouter);
  });

  it('injects identifier id and request from the real callback shape', async () => {
    const modelName = 'DecoHookAdapterContractIdentifier';
    const request = { requestId: 'identifier-request' };

    class UserRouter {
      resolve(req: unknown, id: unknown) {
        return { _id: id, request: req, classThis: this };
      }
    }
    applyMethodDecorator(Identifier(), UserRouter.prototype, 'resolve');
    applyParameterDecorator(Request(), UserRouter.prototype, 'resolve', 0);
    applyParameterDecorator(Id(), UserRouter.prototype, 'resolve', 1);
    Router(modelName)(UserRouter);

    const runtime = bootstrap(UserRouter, modelName);

    const resolveIdFilter = runtime.getModelOption(modelName, 'resolveIdFilter') as Function;
    const result = await resolveIdFilter.call(request, 'abc123');

    expect(result._id).toBe('abc123');
    expect(result.request).toBe(request);
    expect(result.classThis).toBeInstanceOf(UserRouter);
  });

  it('executes two same-key hook-chain callbacks in declaration order', async () => {
    const modelName = 'DecoHookAdapterContractPrepare';
    const order: string[] = [];

    class UserRouter {
      first(doc: { steps: string[] }) {
        order.push('first');
        return { ...doc, steps: [...doc.steps, 'first'] };
      }

      second(doc: { steps: string[] }) {
        order.push('second');
        return { ...doc, steps: [...doc.steps, 'second'] };
      }
    }
    applyMethodDecorator(Prepare('create'), UserRouter.prototype, 'first');
    applyParameterDecorator(Document(), UserRouter.prototype, 'first', 0);
    applyMethodDecorator(Prepare('create'), UserRouter.prototype, 'second');
    applyParameterDecorator(Document(), UserRouter.prototype, 'second', 0);
    Router(modelName)(UserRouter);

    const runtime = bootstrap(UserRouter, modelName);

    const prepare = runtime.getModelOption(modelName, 'prepare.create') as Function[];
    expect(prepare).toHaveLength(2);

    let doc = { steps: [] as string[] };
    for (const hook of prepare) {
      doc = await hook.call({}, doc, {}, { operation: 'create' });
    }

    const firstIndex = order.indexOf('first');
    const secondIndex = order.indexOf('second');
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(doc.steps.slice(firstIndex, secondIndex + 1)).toEqual(['first', 'second']);
  });

  it.each(chainHookCases)(
    'appends decorated $label hooks after a preconfigured flat chain',
    async ({ decorator, optionKey }) => {
      const modelName = `DecoHookAdapterContractChain${optionKey.replace(/\W/g, '')}`;
      const order: string[] = [];
      const preconfigured = (doc: { steps: string[] }) => {
        order.push('preconfigured');
        return { ...doc, steps: [...doc.steps, 'preconfigured'] };
      };

      class UserRouter {
        first(doc: { steps: string[] }) {
          order.push('first');
          return { ...doc, steps: [...doc.steps, 'first'] };
        }

        second(doc: { steps: string[] }) {
          order.push('second');
          return { ...doc, steps: [...doc.steps, 'second'] };
        }
      }
      applyMethodDecorator(decorator, UserRouter.prototype, 'first');
      applyParameterDecorator(Document(), UserRouter.prototype, 'first', 0);
      applyMethodDecorator(decorator, UserRouter.prototype, 'second');
      applyParameterDecorator(Document(), UserRouter.prototype, 'second', 0);
      Router(modelName)(UserRouter);

      const runtime = bootstrap(UserRouter, modelName, (configuredRuntime) => {
        configuredRuntime.setModelOption(modelName, optionKey as any, [preconfigured] as any);
      });

      const chain = runtime.getModelOption(modelName, optionKey) as Function[];
      expect(chain).toHaveLength(3);
      expect(chain[0]).toBe(preconfigured);

      let doc = { steps: [] as string[] };
      for (const hook of chain) {
        doc = await hook.call({}, doc, {}, { operation: 'chain' });
      }

      expect(order).toEqual(['preconfigured', 'first', 'second']);
      expect(doc.steps).toEqual(['preconfigured', 'first', 'second']);
    },
  );

  it('appends a decorated hook after a preconfigured scalar function', () => {
    const modelName = 'DecoHookAdapterContractScalarChain';
    const preconfigured = () => ({ source: 'preconfigured' });

    class UserRouter {
      prepare() {
        return { source: 'decorated' };
      }
    }
    applyMethodDecorator(Prepare('create'), UserRouter.prototype, 'prepare');
    Router(modelName)(UserRouter);

    const runtime = bootstrap(UserRouter, modelName, (configuredRuntime) => {
      configuredRuntime.setModelOption(modelName, 'prepare.create' as any, preconfigured as any);
    });

    const chain = runtime.getModelOption(modelName, 'prepare.create') as Function[];
    expect(chain).toHaveLength(2);
    expect(chain[0]).toBe(preconfigured);
  });

  it.each([
    { label: 'nested array', modelSuffix: 'NestedArray', value: [[() => null]] },
    { label: 'non-function array entry', modelSuffix: 'NonFunctionArrayEntry', value: [() => null, 'bad'] },
    { label: 'non-function value', modelSuffix: 'NonFunctionValue', value: { bad: true } },
  ])('rejects malformed existing hook chains during bootstrap: $label', ({ modelSuffix, value }) => {
    const modelName = `DecoHookAdapterContractMalformed${modelSuffix}`;

    class UserRouter {
      prepare() {
        return {};
      }
    }
    applyMethodDecorator(Prepare('create'), UserRouter.prototype, 'prepare');
    Router(modelName)(UserRouter);

    expect(() =>
      bootstrap(UserRouter, modelName, (runtime) => {
        runtime.setModelOption(modelName, 'prepare.create' as any, value as any);
      }),
    ).toThrow(/Invalid hook chain for prepare\.create/);
  });

  describe('root validate shorthand preservation (BDECO-01)', () => {
    it.each([
      { label: 'root false', modelSuffix: 'RootFalse', rootValue: false },
      {
        label: 'root issue array',
        modelSuffix: 'RootIssueArray',
        rootValue: [{ path: 'name', message: 'required' }],
      },
      {
        label: 'root callback',
        modelSuffix: 'RootCallback',
        rootValue: function rootValidate() {
          return false;
        },
      },
    ])('rejects decorated Validate(create) over $label without erasing root', ({ modelSuffix, rootValue }) => {
      const modelName = `DecoHookAdapterContractValidate${modelSuffix}`;

      class UserRouter {
        validate() {
          return true;
        }
      }
      applyMethodDecorator(Validate('create'), UserRouter.prototype, 'validate');
      Router(modelName)(UserRouter);

      let runtime: AccessRuntimeApi | undefined;
      expect(() => {
        bootstrap(UserRouter, modelName, (configuredRuntime) => {
          runtime = configuredRuntime;
          configuredRuntime.setModelOption(modelName, 'validate' as any, rootValue as any);
        });
      }).toThrow(/Duplicate decorated validator for validate\.create/);
      expect(runtime?.getModelOption(modelName, 'validate' as any)).toStrictEqual(rootValue);
    });

    it('allows sibling validate operations while keeping both validators', async () => {
      const modelName = 'DecoHookAdapterContractValidateSiblingOps';

      class UserRouter {
        checkCreate(doc: { valid: boolean }) {
          return doc.valid ? true : false;
        }

        checkUpdate(doc: { valid: boolean }) {
          return doc.valid ? true : [{ path: 'name', message: 'stale' }];
        }
      }
      applyMethodDecorator(Validate('create'), UserRouter.prototype, 'checkCreate');
      applyParameterDecorator(Document(), UserRouter.prototype, 'checkCreate', 0);
      applyMethodDecorator(Validate('update'), UserRouter.prototype, 'checkUpdate');
      applyParameterDecorator(Document(), UserRouter.prototype, 'checkUpdate', 0);
      Router(modelName)(UserRouter);

      const runtime = bootstrap(UserRouter, modelName);
      const createValidate = runtime.getModelOption(modelName, 'validate.create') as Function;
      const updateValidate = runtime.getModelOption(modelName, 'validate.update') as Function;

      expect(await createValidate.call({}, { valid: true }, {}, {})).toBe(true);
      expect(await createValidate.call({}, { valid: false }, {}, {})).toBe(false);
      expect(await updateValidate.call({}, { valid: true }, {}, {})).toBe(true);
      expect(await updateValidate.call({}, { valid: false }, {}, {})).toEqual([{ path: 'name', message: 'stale' }]);
    });
  });

  describe('sibling and default operation chains (BDECO-01)', () => {
    const siblingFamilies = [
      {
        family: 'prepare',
        make: (op: 'create' | 'update' | 'default') => Prepare(op),
        base: 'prepare',
        pairs: [
          { first: 'create', second: 'update' },
          { first: 'default', second: 'create' },
        ],
      },
      {
        family: 'transform',
        make: (op: 'default' | 'update') => Transform(op),
        base: 'transform',
        pairs: [{ first: 'default', second: 'update' }],
      },
      {
        family: 'afterPersist',
        make: (op: 'create' | 'update' | 'default') => AfterPersist(op),
        base: 'afterPersist',
        pairs: [
          { first: 'create', second: 'update' },
          { first: 'default', second: 'update' },
        ],
      },
      {
        family: 'decorate',
        make: (op: 'create' | 'update' | 'default' | 'list' | 'read') => Decorate(op),
        base: 'decorate',
        pairs: [
          { first: 'create', second: 'update' },
          { first: 'default', second: 'read' },
        ],
      },
      {
        family: 'decorateAll',
        make: (op: 'default' | 'list') => DecorateAll(op),
        base: 'decorateAll',
        pairs: [{ first: 'default', second: 'list' }],
      },
    ] as const;

    for (const entry of siblingFamilies) {
      for (const pair of entry.pairs) {
        for (const order of ['forward', 'reverse'] as const) {
          it(`${entry.family} ${pair.first}+${pair.second} bootstraps in ${order} declaration order`, async () => {
            const firstOp = order === 'forward' ? pair.first : pair.second;
            const secondOp = order === 'forward' ? pair.second : pair.first;
            const modelName = `DecoHookAdapterSibling${entry.base}${pair.first}${pair.second}${order}`;

            class UserRouter {
              first(doc: { steps: string[] }) {
                return { ...doc, steps: [...doc.steps, `first-${firstOp}`] };
              }

              second(doc: { steps: string[] }) {
                return { ...doc, steps: [...doc.steps, `second-${secondOp}`] };
              }
            }
            applyMethodDecorator((entry.make as any)(firstOp), UserRouter.prototype, 'first');
            applyParameterDecorator(Document(), UserRouter.prototype, 'first', 0);
            applyMethodDecorator((entry.make as any)(secondOp), UserRouter.prototype, 'second');
            applyParameterDecorator(Document(), UserRouter.prototype, 'second', 0);
            Router(modelName)(UserRouter);

            const runtime = bootstrap(UserRouter, modelName);

            const firstChain = runtime.getModelOption(modelName, `${entry.base}.${firstOp}` as any) as Function[];
            const secondChain = runtime.getModelOption(modelName, `${entry.base}.${secondOp}` as any) as Function[];
            expect(firstChain).toHaveLength(1);
            expect(secondChain).toHaveLength(1);

            let firstDoc = { steps: [] as string[] };
            for (const hook of firstChain) {
              firstDoc = await hook.call({}, firstDoc, {}, {});
            }
            expect(firstDoc.steps).toEqual([`first-${firstOp}`]);

            let secondDoc = { steps: [] as string[] };
            for (const hook of secondChain) {
              secondDoc = await hook.call({}, secondDoc, {}, {});
            }
            expect(secondDoc.steps).toEqual([`second-${secondOp}`]);
          });
        }
      }
    }

    it('prepare create+update in reverse order keeps chains isolated (explicit)', async () => {
      const modelName = 'DecoHookAdapterPrepareReverseExplicit';

      class UserRouter {
        forUpdate(doc: { steps: string[] }) {
          return { ...doc, steps: [...doc.steps, 'update'] };
        }

        forCreate(doc: { steps: string[] }) {
          return { ...doc, steps: [...doc.steps, 'create'] };
        }
      }
      applyMethodDecorator(Prepare('update'), UserRouter.prototype, 'forUpdate');
      applyParameterDecorator(Document(), UserRouter.prototype, 'forUpdate', 0);
      applyMethodDecorator(Prepare('create'), UserRouter.prototype, 'forCreate');
      applyParameterDecorator(Document(), UserRouter.prototype, 'forCreate', 0);
      Router(modelName)(UserRouter);

      const runtime = bootstrap(UserRouter, modelName);
      const createChain = runtime.getModelOption(modelName, 'prepare.create') as Function[];
      const updateChain = runtime.getModelOption(modelName, 'prepare.update') as Function[];
      expect(createChain).toHaveLength(1);
      expect(updateChain).toHaveLength(1);

      let doc = { steps: [] as string[] };
      for (const hook of createChain) doc = await hook.call({}, doc, {}, {});
      expect(doc.steps).toEqual(['create']);
      doc = { steps: [] as string[] };
      for (const hook of updateChain) doc = await hook.call({}, doc, {}, {});
      expect(doc.steps).toEqual(['update']);
    });
  });

  describe('sparse parameter positions (BDECO-06)', () => {
    it('injects at a trailing declared index preserving a leading hole', async () => {
      const modelName = 'DecoHookAdapterSparseLeadingHole';
      const request = { requestId: 'sparse-leading' };
      const permissions = { read: true };
      const seen: Record<string, unknown> = {};

      class UserRouter {
        check(unused: unknown, perms: unknown) {
          seen.classThis = this;
          seen.unused = unused;
          seen.perms = perms;
          return true;
        }
      }
      applyMethodDecorator(Validate('create'), UserRouter.prototype, 'check');
      applyParameterDecorator(Permissions(), UserRouter.prototype, 'check', 1);
      Router(modelName)(UserRouter);

      const runtime = bootstrap(UserRouter, modelName);
      const validate = runtime.getModelOption(modelName, 'validate.create') as Function;
      const doc = { name: 'Ada' };
      const result = await validate.call(request, doc, permissions, { operation: 'create' });

      expect(result).toBe(true);
      expect(seen.unused).toBeUndefined();
      expect(seen.perms).toBe(permissions);
      expect(seen.classThis).toBeInstanceOf(UserRouter);
    });

    it('preserves an interior hole between decorated arguments', async () => {
      const modelName = 'DecoHookAdapterSparseInteriorHole';
      const seen: Record<string, unknown> = {};

      class UserRouter {
        check(doc: unknown, unused: unknown, ctx: unknown) {
          seen.doc = doc;
          seen.unused = unused;
          seen.ctx = ctx;
          return true;
        }
      }
      applyMethodDecorator(Validate('create'), UserRouter.prototype, 'check');
      applyParameterDecorator(Document(), UserRouter.prototype, 'check', 0);
      applyParameterDecorator(Context(), UserRouter.prototype, 'check', 2);
      Router(modelName)(UserRouter);

      const runtime = bootstrap(UserRouter, modelName);
      const validate = runtime.getModelOption(modelName, 'validate.create') as Function;
      const doc = { name: 'Ada' };
      const context = { operation: 'create' };
      const result = await validate.call({}, doc, { admin: true }, context);

      expect(result).toBe(true);
      expect(seen.doc).toBe(doc);
      expect(seen.unused).toBeUndefined();
      expect(seen.ctx).toBe(context);
    });

    it('leaves undecorated leading args undefined so defaults apply', async () => {
      const modelName = 'DecoHookAdapterSparseDefaultArg';

      class UserRouter {
        prepare(label = 'fallback', doc: { tag?: string }) {
          return { ...doc, tag: label };
        }
      }
      applyMethodDecorator(Prepare('create'), UserRouter.prototype, 'prepare');
      applyParameterDecorator(Document(), UserRouter.prototype, 'prepare', 1);
      Router(modelName)(UserRouter);

      const runtime = bootstrap(UserRouter, modelName);
      const chain = runtime.getModelOption(modelName, 'prepare.create') as Function[];
      expect(chain).toHaveLength(1);
      const result = await chain[0].call({}, { name: 'Ada' }, {}, { operation: 'create' });

      expect(result.tag).toBe('fallback');
    });

    it('injects @Request() at a nonzero index without moving other args', async () => {
      const modelName = 'DecoHookAdapterSparseNonzeroRequest';
      const request = { requestId: 'sparse-request' };
      const permissions = { read: true };
      const seen: Record<string, unknown> = {};

      class UserRouter {
        check(unused: unknown, req: unknown, perms: unknown) {
          seen.classThis = this;
          seen.unused = unused;
          seen.req = req;
          seen.perms = perms;
          return true;
        }
      }
      applyMethodDecorator(Validate('create'), UserRouter.prototype, 'check');
      applyParameterDecorator(Request(), UserRouter.prototype, 'check', 1);
      applyParameterDecorator(Permissions(), UserRouter.prototype, 'check', 2);
      Router(modelName)(UserRouter);

      const runtime = bootstrap(UserRouter, modelName);
      const validate = runtime.getModelOption(modelName, 'validate.create') as Function;
      const result = await validate.call(request, { name: 'Ada' }, permissions, { operation: 'create' });

      expect(result).toBe(true);
      expect(seen.unused).toBeUndefined();
      expect(seen.req).toBe(request);
      expect(seen.perms).toBe(permissions);
      expect(seen.classThis).toBeInstanceOf(UserRouter);
    });

    it('preserves sparse positions for inherited hooks', async () => {
      const modelName = 'DecoHookAdapterSparseInherited';

      class BaseRouter {
        check(unused: unknown, perms: unknown) {
          return { unused, perms };
        }
      }
      applyMethodDecorator(Validate('create'), BaseRouter.prototype, 'check');
      applyParameterDecorator(Permissions(), BaseRouter.prototype, 'check', 1);

      class ChildRouter extends BaseRouter {}
      Router(modelName)(ChildRouter);

      const runtime = bootstrap(ChildRouter, modelName);
      const validate = runtime.getModelOption(modelName, 'validate.create') as Function;
      const permissions = { read: true };
      const result = await validate.call({}, { name: 'Ada' }, permissions, { operation: 'create' });

      expect(result.unused).toBeUndefined();
      expect(result.perms).toBe(permissions);
    });

    it('preserves sparse positions for symbol hooks', async () => {
      const modelName = 'DecoHookAdapterSparseSymbol';
      const sym = Symbol('sparseCheck');

      class UserRouter {
        [sym](unused: unknown, perms: unknown) {
          return { unused, perms };
        }
      }
      applyMethodDecorator(Validate('create'), UserRouter.prototype, sym);
      applyParameterDecorator(Permissions(), UserRouter.prototype, sym, 1);
      Router(modelName)(UserRouter);

      const runtime = bootstrap(UserRouter, modelName);
      const validate = runtime.getModelOption(modelName, 'validate.create') as Function;
      const permissions = { read: true };
      const result = await validate.call({}, { name: 'Ada' }, permissions, { operation: 'create' });

      expect(result.unused).toBeUndefined();
      expect(result.perms).toBe(permissions);
    });
  });
});
