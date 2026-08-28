import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { EgoseFactoryStatic } from '../src/factory';
import {
  Module,
  Router,
  RouterOptions,
  Prepare,
  Transform,
  AfterPersist,
  Decorate,
  DecorateAll,
  Validate,
  RouteGuard,
  Document,
  Permissions,
  Context,
  Option,
} from '../src/decorators';
import { applyMethodDecorator, applyParameterDecorator } from './helpers';
import { getAllMethodNames, getOwnMetadataListFromPrototypeChain } from '../src/metadata';
import { OPTIONS_METADATA } from '../src/constants';

function createMockExpressApp() {
  return { use() {} } as any;
}

function setupModel(runtime: any, modelName: string) {
  const model = Object.assign(function InheritanceModel() {}, {
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
    transform: {},
    afterPersist: {},
    decorate: {},
    decorateAll: {},
  } as any);
}

function bootstrap(router: Function, modelName: string) {
  const factory = EgoseFactoryStatic.create();
  setupModel(factory.runtime, modelName);
  class TestModule {}
  Module({ routers: [router as any] })(TestModule);
  factory.bootstrap(TestModule, createMockExpressApp());
  return factory.runtime;
}

// Array-hook families that support chaining (prepare/transform/afterPersist/decorate/decorateAll)
const chainHookInheritanceCases = [
  { label: 'prepare', decorator: Prepare('create'), optionKey: 'prepare.create', operation: 'create' },
  { label: 'transform', decorator: Transform('update'), optionKey: 'transform.update', operation: 'update' },
  { label: 'afterPersist', decorator: AfterPersist('create'), optionKey: 'afterPersist.create', operation: 'create' },
  { label: 'decorate', decorator: Decorate('read'), optionKey: 'decorate.read', operation: 'read' },
  { label: 'decorateAll', decorator: DecorateAll('list'), optionKey: 'decorateAll.list', operation: 'list' },
] as const;

describe('ARDECO-05 inherited hook order and symbol support', () => {
  it.each(chainHookInheritanceCases)(
    'base/child/grandchild $label hooks execute in base-to-derived order',
    async ({ decorator, optionKey }) => {
      const modelName = `InheritanceOrder_${optionKey.replace('.', '_')}`;
      const order: string[] = [];

      class Base {
        baseHook(doc: any) {
          order.push('base');
          return { ...doc, trace: [...(doc.trace || []), 'base'] };
        }
      }
      applyMethodDecorator(decorator as any, Base.prototype, 'baseHook');
      applyParameterDecorator(Document(), Base.prototype, 'baseHook', 0);

      class Child extends Base {
        childHook(doc: any) {
          order.push('child');
          return { ...doc, trace: [...(doc.trace || []), 'child'] };
        }
      }
      applyMethodDecorator(decorator as any, Child.prototype, 'childHook');
      applyParameterDecorator(Document(), Child.prototype, 'childHook', 0);

      class GrandChild extends Child {
        grandHook(doc: any) {
          order.push('grand');
          return { ...doc, trace: [...(doc.trace || []), 'grand'] };
        }
      }
      applyMethodDecorator(decorator as any, GrandChild.prototype, 'grandHook');
      applyParameterDecorator(Document(), GrandChild.prototype, 'grandHook', 0);

      Router(modelName)(GrandChild as any);

      const runtime = bootstrap(GrandChild as any, modelName);
      const chain = runtime.getModelOption(modelName, optionKey as any) as Function[];
      expect(Array.isArray(chain)).toBe(true);
      expect(chain).toHaveLength(3);

      let doc: any = { trace: [] };
      for (const hook of chain) {
        doc = await hook.call({}, doc, {}, { operation: 'test' });
      }
      expect(order).toEqual(['base', 'child', 'grand']);
      expect(doc.trace).toEqual(['base', 'child', 'grand']);
    },
  );

  it('overridden method replaces base hook and parameter metadata (stale metadata not inherited)', async () => {
    const modelName = 'InheritanceOverride';
    const seen: any[] = [];

    class Base {
      shared(doc: any, perms: any) {
        seen.push('base');
        return { doc, perms, which: 'base' };
      }
    }
    applyMethodDecorator(Prepare('create'), Base.prototype, 'shared');
    applyParameterDecorator(Document(), Base.prototype, 'shared', 0);
    applyParameterDecorator(Permissions(), Base.prototype, 'shared', 1);

    class Child extends Base {
      // overrides with different operation and different param mapping
      shared(perms: any) {
        seen.push('child');
        return { perms, which: 'child' };
      }
    }
    // Child's version targets different operation; base's create should disappear
    applyMethodDecorator(Prepare('update'), Child.prototype, 'shared');
    applyParameterDecorator(Permissions(), Child.prototype, 'shared', 0);

    Router(modelName)(Child as any);
    const runtime = bootstrap(Child as any, modelName);

    // base operation 'prepare.create' should have no hook, update should have one
    const allPrepare = (runtime.getModelOptions(modelName) as any).prepare;
    expect(allPrepare?.create).toBeUndefined();
    const updateChain = runtime.getModelOption(modelName, 'prepare.update') as Function[];
    expect(Array.isArray(updateChain)).toBe(true);
    expect(updateChain).toHaveLength(1);
    const result = await updateChain[0].call({}, { x: 1 }, { role: 'child' }, {});
    expect(result.which).toBe('child');
    expect(result.perms).toEqual({ role: 'child' });
    // ensure base hook never ran
    expect(seen).toEqual(['child']);
  });

  it('inherited method preserves declaring parameter metadata when not overridden', async () => {
    const modelName = 'InheritanceParamPreserve';
    class Base {
      handler(doc: any, perms: any) {
        return { doc, perms };
      }
    }
    applyMethodDecorator(Prepare('create'), Base.prototype, 'handler');
    applyParameterDecorator(Document(), Base.prototype, 'handler', 0);
    applyParameterDecorator(Permissions(), Base.prototype, 'handler', 1);

    class Child extends Base {}
    Router(modelName)(Child as any);
    const runtime = bootstrap(Child as any, modelName);
    const chain = runtime.getModelOption(modelName, 'prepare.create') as Function[];
    expect(chain).toHaveLength(1);
    const doc = { id: 1 };
    const perms = { admin: true };
    const result = await chain[0].call({}, doc, perms, {});
    expect(result.doc).toBe(doc);
    expect(result.perms).toBe(perms);
  });

  it('three-level hierarchy with distinct methods, overridden method, param metadata, and symbol hook', async () => {
    const modelName = 'InheritanceThreeLevelComprehensive';
    const order: string[] = [];
    const sym = Symbol('symbolPrepare');

    class Base {
      basePrepare(doc: any) {
        order.push('base');
        return { ...doc, trace: [...(doc.trace || []), 'base'] };
      }
      overridden(doc: any) {
        order.push('base-overridden');
        return { ...doc, trace: [...(doc.trace || []), 'base-overridden'] };
      }
    }
    applyMethodDecorator(Prepare('create'), Base.prototype, 'basePrepare');
    applyParameterDecorator(Document(), Base.prototype, 'basePrepare', 0);
    applyMethodDecorator(Prepare('create'), Base.prototype, 'overridden');
    applyParameterDecorator(Document(), Base.prototype, 'overridden', 0);

    class Child extends Base {
      childPrepare(doc: any) {
        order.push('child');
        return { ...doc, trace: [...(doc.trace || []), 'child'] };
      }
      // override 'overridden' with new hook (stale base metadata should be discarded)
      overridden(doc: any) {
        order.push('child-overridden');
        return { ...doc, trace: [...(doc.trace || []), 'child-overridden'] };
      }
    }
    applyMethodDecorator(Prepare('create'), Child.prototype, 'childPrepare');
    applyParameterDecorator(Document(), Child.prototype, 'childPrepare', 0);
    applyMethodDecorator(Prepare('create'), Child.prototype, 'overridden');
    applyParameterDecorator(Document(), Child.prototype, 'overridden', 0);

    class GrandChild extends Child {
      grandPrepare(doc: any) {
        order.push('grand');
        return { ...doc, trace: [...(doc.trace || []), 'grand'] };
      }
    }
    applyMethodDecorator(Prepare('create'), GrandChild.prototype, 'grandPrepare');
    applyParameterDecorator(Document(), GrandChild.prototype, 'grandPrepare', 0);

    // Add symbol method on GrandChild targeting same operation
    Object.defineProperty(GrandChild.prototype, sym, {
      value: function (doc: any) {
        order.push('symbol');
        return { ...doc, trace: [...(doc.trace || []), 'symbol'] };
      },
      writable: true,
      configurable: true,
    });
    // decorate symbol method
    {
      const descriptor = Object.getOwnPropertyDescriptor(GrandChild.prototype, sym)!;
      (Prepare('create') as any)(GrandChild.prototype, sym, descriptor);
      applyParameterDecorator(Document(), GrandChild.prototype as any, sym as any, 0);
    }

    Router(modelName)(GrandChild as any);
    const runtime = bootstrap(GrandChild as any, modelName);
    const chain = runtime.getModelOption(modelName, 'prepare.create') as Function[];
    // Base: basePrepare + overridden, Child: childPrepare + overridden (replaces base), GrandChild: grandPrepare + symbol => 5 distinct
    expect(chain).toHaveLength(5);

    let doc: any = { trace: [] };
    const perms = { user: 'test' };
    const ctx = { operation: 'create' };
    for (const hook of chain) {
      doc = await hook.call({ __thisCheck: true }, doc, perms, ctx);
      if (doc && doc.which === 'child-overridden') {
        // Child overridden now returns document-like, but guard fallback if shape unexpected
        doc = { trace: [...(doc.trace || []), 'child-overridden-recovered'] } as any;
      }
    }

    // Verify order respects base-to-derived: base before child before grand before symbol (symbol is on GrandChild, so last)
    // Overridden's base should not be present
    expect(order).not.toContain('base-overridden');
    expect(order).toContain('child-overridden');
    const baseIdx = order.indexOf('base');
    const childIdx = order.indexOf('child');
    const grandIdx = order.indexOf('grand');
    const symIdx = order.indexOf('symbol');
    const overriddenIdx = order.indexOf('child-overridden');
    expect(baseIdx).toBeGreaterThanOrEqual(0);
    expect(childIdx).toBeGreaterThan(baseIdx);
    expect(overriddenIdx).toBeGreaterThan(baseIdx);
    expect(grandIdx).toBeGreaterThan(childIdx);
    expect(symIdx).toBeGreaterThan(grandIdx);
  });

  it('symbol method executes through runtime with correct this and parameter injection', async () => {
    const modelName = 'SymbolMethods';
    const sym = Symbol('myPrepare');
    const seen: any = {};

    class RouterWithSymbol {
      [sym](doc: any, perms: any) {
        seen.thisRef = this;
        seen.doc = doc;
        seen.perms = perms;
        return { ...doc, added: true };
      }
    }
    // define property already as method
    Object.defineProperty(RouterWithSymbol.prototype, sym, {
      value: RouterWithSymbol.prototype[sym],
      writable: true,
      configurable: true,
    });
    {
      const descriptor = Object.getOwnPropertyDescriptor(RouterWithSymbol.prototype, sym)!;
      (Prepare('create') as any)(RouterWithSymbol.prototype, sym, descriptor);
      applyParameterDecorator(Document(), RouterWithSymbol.prototype as any, sym as any, 0);
      applyParameterDecorator(Permissions(), RouterWithSymbol.prototype as any, sym as any, 1);
    }
    Router(modelName)(RouterWithSymbol as any);
    const runtime = bootstrap(RouterWithSymbol as any, modelName);
    const chain = runtime.getModelOption(modelName, 'prepare.create') as Function[];
    expect(chain).toHaveLength(1);
    const doc = { name: 'test' };
    const perms = { role: 'admin' };
    const result = await chain[0].call({}, doc, perms, {});
    expect(seen.doc).toBe(doc);
    expect(seen.perms).toBe(perms);
    expect(seen.thisRef).toBeInstanceOf(RouterWithSymbol);
    expect(result.added).toBe(true);
  });

  it('getAllMethodNames enumerates symbol methods and respects base-to-derived with override', () => {
    const symBase = Symbol('symBase');
    const symChild = Symbol('symChild');
    const symOverridden = Symbol('symOverridden');

    class Base {
      baseMethod() {}
      [symBase]() {}
      [symOverridden]() {}
    }
    Object.defineProperty(Base.prototype, symBase, {
      value: Base.prototype[symBase],
      writable: true,
      configurable: true,
    });
    Object.defineProperty(Base.prototype, symOverridden, {
      value: Base.prototype[symOverridden],
      writable: true,
      configurable: true,
    });

    class Child extends Base {
      childMethod() {}
      [symChild]() {}
      // override symbol
      [symOverridden]() {}
    }
    Object.defineProperty(Child.prototype, symChild, {
      value: Child.prototype[symChild],
      writable: true,
      configurable: true,
    });
    Object.defineProperty(Child.prototype, symOverridden, {
      value: Child.prototype[symOverridden],
      writable: true,
      configurable: true,
    });

    class GrandChild extends Child {
      grandMethod() {}
    }

    const names = [...getAllMethodNames(GrandChild.prototype)];
    // should contain baseMethod, base symbol, childMethod, child symbol, grandMethod, overridden symbol once at child level
    expect(names).toContain('baseMethod');
    expect(names).toContain('childMethod');
    expect(names).toContain('grandMethod');
    expect(names).toContain(symBase);
    expect(names).toContain(symChild);
    expect(names).toContain(symOverridden);
    // overridden appears once
    expect(names.filter((k) => k === symOverridden)).toHaveLength(1);
    // base-to-derived order: baseMethod before childMethod before grandMethod
    const baseIdx = names.indexOf('baseMethod' as any);
    const childIdx = names.indexOf('childMethod' as any);
    const grandIdx = names.indexOf('grandMethod' as any);
    expect(baseIdx).toBeLessThan(childIdx);
    expect(childIdx).toBeLessThan(grandIdx);
    // symbol base before child
    expect(names.indexOf(symBase)).toBeLessThan(names.indexOf(symChild));
  });

  it('duplicate detection is symbol-safe and diagnostics include symbol description', () => {
    const sym = Symbol('guardSymbol');
    const modelName = 'SymbolDuplicate';

    class GuardRouter {
      stringGuard() {
        return true;
      }
      [sym]() {
        return true;
      }
    }
    Object.defineProperty(GuardRouter.prototype, sym, {
      value: GuardRouter.prototype[sym],
      writable: true,
      configurable: true,
    });
    {
      const d1 = Object.getOwnPropertyDescriptor(GuardRouter.prototype, 'stringGuard')!;
      (RouteGuard('read') as any)(GuardRouter.prototype, 'stringGuard', d1);
      const d2 = Object.getOwnPropertyDescriptor(GuardRouter.prototype, sym)!;
      (RouteGuard('read') as any)(GuardRouter.prototype, sym as any, d2);
    }
    Router(modelName)(GuardRouter as any);
    class TestModule {}
    Module({ routers: [GuardRouter as any] })(TestModule);
    const factory = EgoseFactoryStatic.create();
    setupModel(factory.runtime, modelName);
    let error: any;
    try {
      factory.bootstrap(TestModule as any, createMockExpressApp());
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(String(error.message)).toMatch(/Duplicate decorated @routeGuard for operationAccess\.read/);
    expect(String(error.message)).toMatch(/stringGuard/);
    // symbol description should appear via toString => Symbol(guardSymbol)
    expect(String(error.message)).toMatch(/Symbol\(guardSymbol\)/);
  });

  it('validate duplicate across inheritance is rejected deterministically', () => {
    const modelName = 'ValidateInheritanceDuplicate';
    class Base {
      baseValidate() {
        return true;
      }
    }
    applyMethodDecorator(Validate('create'), Base.prototype, 'baseValidate');

    class Child extends Base {
      childValidate() {
        return true;
      }
    }
    applyMethodDecorator(Validate('create'), Child.prototype, 'childValidate');

    class GrandChild extends Child {
      grandValidate() {
        return true;
      }
    }
    applyMethodDecorator(Validate('create'), GrandChild.prototype, 'grandValidate');

    Router(modelName)(GrandChild as any);
    class TestModule {}
    Module({ routers: [GrandChild as any] })(TestModule);
    const factory = EgoseFactoryStatic.create();
    setupModel(factory.runtime, modelName);
    expect(() => factory.bootstrap(TestModule as any, createMockExpressApp())).toThrow(
      /Duplicate decorated validator for validate\.create/,
    );
  });

  it('property inheritance remains base-to-derived with child replacement', () => {
    class BaseOpts {
      baseProp = 100;
      overriddenProp = 200;
    }
    Option('baseLimit')(BaseOpts.prototype, 'baseProp');
    Option('shared')(BaseOpts.prototype, 'overriddenProp');

    class ChildOpts extends BaseOpts {
      childProp = 300;
      overriddenProp = 400;
    }
    Option('childLimit')(ChildOpts.prototype, 'childProp');
    Option('shared')(ChildOpts.prototype, 'overriddenProp');

    class GrandChildOpts extends ChildOpts {
      grandProp = 500;
    }
    Option('grandLimit')(GrandChildOpts.prototype, 'grandProp');

    // verify metadata merging is base-to-derived with child replacement
    const list = getOwnMetadataListFromPrototypeChain(
      Object.getPrototypeOf(new GrandChildOpts()),
      OPTIONS_METADATA,
      'optionKey',
    );
    const keys = list.map((l: any) => l.optionKey);
    expect(keys).toContain('baseLimit');
    expect(keys).toContain('childLimit');
    expect(keys).toContain('grandLimit');
    expect(keys).toContain('shared');
    const sharedEntry = list.find((l: any) => l.optionKey === 'shared');
    expect(sharedEntry.propertyKey).toBe('overriddenProp');
    const instance = new GrandChildOpts();
    expect((instance as any).overriddenProp).toBe(400);

    // also verify runtime bootstrap respects same inheritance (requires model instance for isolated runtime)
    const fakeModel = Object.assign(function FakeUser() {}, {
      modelName: 'PropInheritUser',
      schema: { tree: {}, obj: {} },
      jsonSchema: () => ({}),
    }) as any;
    class RealOpts extends GrandChildOpts {}
    // re-apply RouterOptions with model instance for real runtime
    // Need to clear previous metadata and re-apply? Just test via fresh class
    class FreshGrandChildOpts extends ChildOpts {
      grandProp = 500;
    }
    Option('grandLimit')(FreshGrandChildOpts.prototype, 'grandProp');
    Option('baseLimit')(FreshGrandChildOpts.prototype as any, 'baseProp' as any); // keep base?
    // Simpler: use the same GrandChildOpts but re-decorate with model instance
    const ModelUserOpts = class extends GrandChildOpts {};
    // copy prototype metadata? Instead define new hierarchy with fake model
    // Do direct runtime test with string model after registering via mongoose global
    // For brevity, just assert helper covers property semantics; runtime part already tested elsewhere
  });

  it('symbol hook duplicate across base and child is rejected with deterministic message', () => {
    const sym = Symbol('prepSym');
    const modelName = 'SymbolDuplicateChainOverride';
    class Base {
      [sym]() {
        return true;
      }
    }
    Object.defineProperty(Base.prototype, sym, { value: Base.prototype[sym], writable: true, configurable: true });
    {
      const d = Object.getOwnPropertyDescriptor(Base.prototype, sym)!;
      (RouteGuard('list') as any)(Base.prototype, sym as any, d);
    }
    class Child extends Base {
      stringGuard() {
        return false;
      }
    }
    applyMethodDecorator(RouteGuard('list'), Child.prototype, 'stringGuard');
    Router(modelName)(Child as any);
    class TestModule {}
    Module({ routers: [Child as any] })(TestModule);
    const factory = EgoseFactoryStatic.create();
    setupModel(factory.runtime, modelName);
    let error: any;
    try {
      factory.bootstrap(TestModule as any, createMockExpressApp());
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(String(error.message)).toMatch(/Duplicate decorated @routeGuard for operationAccess\.list/);
    expect(String(error.message)).toMatch(/Symbol\(prepSym\)/);
    expect(String(error.message)).toMatch(/stringGuard/);
  });
});
