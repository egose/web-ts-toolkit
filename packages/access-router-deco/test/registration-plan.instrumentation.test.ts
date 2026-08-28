import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { EgoseFactoryStatic } from '../src/factory';
import { Module, Router, Prepare } from '../src/decorators';
import { applyMethodDecorator, applyParameterDecorator } from './helpers';
import { Document } from '../src/decorators';

function createMockExpressApp() {
  return { use() {} } as any;
}

function setupModel(runtime: any, modelName: string) {
  const model = Object.assign(function Model() {}, {
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

/**
 * Instrumentation regression for ARDECO-09:
 * Descriptor/metadata lookup must grow linearly with effective methods + prototype count,
 * not O(methods * hooks * prototypes). Previously compileRegistrationPlan filtered
 * every hook definition via isHookMethod which re-traversed prototype chain per hook.
 * Now it fetches owner/descriptor once per effective method and checks watermarks
 * directly on the function value (bootstrap-local, no global cache).
 */
describe('registration-plan instrumentation', () => {
  it('descriptor lookup scales linearly with methods+prototypes, not methods*hooks*prototypes', async () => {
    const modelName = 'InstrumentationLinear';
    const depth = 5;
    const methodsPerLevel = 10;
    const totalMethods = depth * methodsPerLevel;

    // Build chain Base -> L1 -> L2 -> L3 -> L4 -> L5 (depth=5 levels)
    // Each level defines `methodsPerLevel` distinct array-hook methods (Prepare create)
    // so duplicate detection does not trigger (array hooks compose).
    const classes: any[] = [];
    class Base {}
    classes.push(Base);
    for (let i = 0; i < methodsPerLevel; i++) {
      const name = `base_${i}`;
      Object.defineProperty(Base.prototype, name, {
        value: function (doc: any) {
          return doc;
        },
        writable: true,
        configurable: true,
      });
      applyMethodDecorator(Prepare('create') as any, Base.prototype, name);
      applyParameterDecorator(Document(), Base.prototype as any, name as any, 0);
    }

    let Current = Base;
    for (let level = 1; level < depth; level++) {
      const Prev = Current;
      class Next extends Prev {}
      // give distinct class name for diagnostics (not required)
      Object.defineProperty(Next, 'name', { value: `Level${level}` });
      for (let i = 0; i < methodsPerLevel; i++) {
        const name = `lvl${level}_${i}`;
        Object.defineProperty(Next.prototype, name, {
          value: function (doc: any) {
            return doc;
          },
          writable: true,
          configurable: true,
        });
        applyMethodDecorator(Prepare('create') as any, Next.prototype, name);
        applyParameterDecorator(Document(), Next.prototype as any, name as any, 0);
      }
      classes.push(Next);
      Current = Next;
    }

    const Leaf = Current;
    Router(modelName)(Leaf as any);
    class TestModule {}
    Module({ routers: [Leaf as any] })(TestModule);

    const factory = EgoseFactoryStatic.create();
    setupModel(factory.runtime, modelName);

    const spy = vi.spyOn(Reflect, 'getOwnPropertyDescriptor');
    const before = spy.mock.calls.length; // usually 0

    factory.bootstrap(TestModule as any, createMockExpressApp());

    const calls = spy.mock.calls.length - before;
    spy.mockRestore();

    // Verify hook chain length equals total distinct methods (50)
    const chain = factory.runtime.getModelOption(modelName, 'prepare.create') as Function[];
    expect(Array.isArray(chain)).toBe(true);
    expect(chain).toHaveLength(totalMethods);

    // Old O(methods*hooks*prototypes) would be ~ methods*13*depth ≈ 50*13*5 = 3250
    // Optimized linear is roughly methods*depth + enumeration overhead ≈ 50*5 + 50 ≈ 300
    // Measured ~700 with current instrumentation (includes enumeration + owner traversal).
    // Allow generous upper bound to avoid flakiness but still catch regression.
    const maxLinear = totalMethods * (depth + 3) * 2; // 50*8*2=800
    const minExpected = totalMethods; // at least one per method

    expect(calls).toBeGreaterThanOrEqual(minExpected);
    expect(calls).toBeLessThanOrEqual(maxLinear);

    // Diagnostic: if someone reintroduces per-hook descriptor traversal, this will be >2000
    expect(calls).toBeLessThan(2000);

    // Second check: linear growth – half the methods should be roughly half the calls
    // Build a smaller hierarchy (depth 5, 5 methods per level =25) and compare ratio.
    const smallMethodsPerLevel = 5;
    const smallTotal = depth * smallMethodsPerLevel;
    class SmallBase {}
    for (let i = 0; i < smallMethodsPerLevel; i++) {
      const name = `s_base_${i}`;
      Object.defineProperty(SmallBase.prototype, name, {
        value: function (doc: any) {
          return doc;
        },
        writable: true,
        configurable: true,
      });
      applyMethodDecorator(Prepare('create') as any, SmallBase.prototype, name);
      applyParameterDecorator(Document(), SmallBase.prototype as any, name as any, 0);
    }
    let SmallCurrent: any = SmallBase;
    for (let level = 1; level < depth; level++) {
      const Prev = SmallCurrent;
      class Next extends Prev {}
      for (let i = 0; i < smallMethodsPerLevel; i++) {
        const name = `s_lvl${level}_${i}`;
        Object.defineProperty(Next.prototype, name, {
          value: function (doc: any) {
            return doc;
          },
          writable: true,
          configurable: true,
        });
        applyMethodDecorator(Prepare('create') as any, Next.prototype, name);
        applyParameterDecorator(Document(), Next.prototype as any, name as any, 0);
      }
      SmallCurrent = Next;
    }
    const smallLeaf = SmallCurrent;
    const smallModel = `${modelName}Small`;
    Router(smallModel)(smallLeaf as any);
    class SmallModule {}
    Module({ routers: [smallLeaf as any] })(SmallModule);
    const smallFactory = EgoseFactoryStatic.create();
    setupModel(smallFactory.runtime, smallModel);
    const spy2 = vi.spyOn(Reflect, 'getOwnPropertyDescriptor');
    smallFactory.bootstrap(SmallModule as any, createMockExpressApp());
    const smallCalls = spy2.mock.calls.length;
    spy2.mockRestore();

    // Linear growth: smallCalls ≈ calls * (smallTotal/totalMethods) within factor 2
    const ratio = calls / smallCalls;
    const expectedRatio = totalMethods / smallTotal; // 2
    expect(ratio).toBeGreaterThan(expectedRatio * 0.5);
    expect(ratio).toBeLessThan(expectedRatio * 2.5);
  });
});
