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
 * Registration-plan instrumentation (ARDECO-09 follow-up).
 *
 * Deterministic `Reflect.getOwnPropertyDescriptor` call counts are the work
 * counter — no wall-clock timing, so no CI flakiness from machine speed.
 *
 * Measured bound: descriptor lookups during bootstrap scale as
 * O(methods x depth) — one prototype-owner traversal plus a constant number of
 * descriptor reads per effective method — NOT
 * O(methods x hook-definitions x depth). The previous implementation filtered
 * every hook definition via `isHookMethod`, re-walking the prototype chain once
 * per (method, hook) pair. The claim is deliberately NOT "linear in methods
 * plus depth": per-method cost grows with depth (owner walk), so depth appears
 * as a factor, and method scaling is measured at fixed depth while depth
 * scaling is measured at fixed methods-per-level.
 *
 * Baseline evidence (deterministic counts, not timed): 50 `Prepare` methods
 * over depth 5 bootstraps with ~700 lookups. The old per-hook shape would cost
 * ~50 x 13 hook definitions x 5 = 3250, so the 2000 tripwire below catches a
 * per-hook regression while the methods x (depth + const) bound pins the
 * current shape. Registration semantics are preserved via the composed
 * `prepare.create` chain-length assertions in each scenario.
 */
describe('registration-plan instrumentation', () => {
  function buildHookHierarchy(depth: number, methodsPerLevel: number, prefix: string) {
    const defineHookMethods = (proto: object, level: string) => {
      for (let i = 0; i < methodsPerLevel; i++) {
        const name = `${prefix}_${level}_${i}`;
        Object.defineProperty(proto, name, {
          value: function (doc: any) {
            return doc;
          },
          writable: true,
          configurable: true,
        });
        applyMethodDecorator(Prepare('create') as any, proto, name);
        applyParameterDecorator(Document(), proto as any, name as any, 0);
      }
    };

    // Build chain Base -> L1 -> ... (depth levels). Each level defines
    // `methodsPerLevel` distinct array-hook methods (Prepare create) so
    // duplicate detection does not trigger (array hooks compose).
    class Base {}
    defineHookMethods(Base.prototype, 'base');
    let Current: any = Base;
    for (let level = 1; level < depth; level++) {
      const Prev = Current;
      class Next extends Prev {}
      // give distinct class name for diagnostics (not required)
      Object.defineProperty(Next, 'name', { value: `${prefix}_Level${level}` });
      defineHookMethods(Next.prototype, `lvl${level}`);
      Current = Next;
    }
    return Current;
  }

  function bootstrapAndCount(modelName: string, Leaf: any) {
    Router(modelName)(Leaf as any);
    class TestModule {}
    Module({ routers: [Leaf as any] })(TestModule);

    const factory = EgoseFactoryStatic.create();
    setupModel(factory.runtime, modelName);

    const spy = vi.spyOn(Reflect, 'getOwnPropertyDescriptor');
    factory.bootstrap(TestModule as any, createMockExpressApp());
    const calls = spy.mock.calls.length;
    spy.mockRestore();

    const chain = factory.runtime.getModelOption(modelName, 'prepare.create') as Function[];
    return { calls, chain };
  }

  it('method count scales linearly at fixed inheritance depth', () => {
    const depth = 5;
    const methodsPerLevel = 10;
    const totalMethods = depth * methodsPerLevel;

    const full = bootstrapAndCount('InstrumentationLinear', buildHookHierarchy(depth, methodsPerLevel, 'm'));

    // Registration semantics preserved: hook chain holds every distinct method.
    expect(Array.isArray(full.chain)).toBe(true);
    expect(full.chain).toHaveLength(totalMethods);

    // Old O(methods*hooks*depth) would be ~ methods*13*depth = 50*13*5 = 3250.
    // Current O(methods*depth) shape: methods*(depth + enumeration constant),
    // with a 2x slack factor to avoid environment flakiness.
    const maxLinear = totalMethods * (depth + 3) * 2; // 50*8*2=800
    const minExpected = totalMethods; // at least one lookup per method

    expect(full.calls).toBeGreaterThanOrEqual(minExpected);
    expect(full.calls).toBeLessThanOrEqual(maxLinear);

    // Diagnostic tripwire: reintroducing per-hook descriptor traversal lands
    // near ~3250, well above this line; baseline is ~700 (see header).
    expect(full.calls).toBeLessThan(2000);

    // Linear growth at fixed depth: half the methods cost roughly half the
    // lookups (depth 5, 5 methods per level = 25 total).
    const smallMethodsPerLevel = 5;
    const smallTotal = depth * smallMethodsPerLevel;
    const small = bootstrapAndCount('InstrumentationLinearSmall', buildHookHierarchy(depth, smallMethodsPerLevel, 's'));
    expect(small.chain).toHaveLength(smallTotal);

    const ratio = full.calls / small.calls;
    const expectedRatio = totalMethods / smallTotal; // 2
    expect(ratio).toBeGreaterThan(expectedRatio * 0.5);
    expect(ratio).toBeLessThan(expectedRatio * 2.5);
  });

  it('per-method lookup cost grows at most linearly with inheritance depth', () => {
    // Fixed methods-per-level, varying depth: depth 5 (50 methods) vs depth 2
    // (20 methods). Same bound shape evaluated at each depth pins the depth
    // factor; the per-method comparison shows depth contributes linearly
    // (owner walk), not multiplied by the 13 hook definitions.
    const methodsPerLevel = 10;
    const deepDepth = 5;
    const shallowDepth = 2;

    const deep = bootstrapAndCount('InstrumentationDepthDeep', buildHookHierarchy(deepDepth, methodsPerLevel, 'd'));
    const shallow = bootstrapAndCount(
      'InstrumentationDepthShallow',
      buildHookHierarchy(shallowDepth, methodsPerLevel, 'p'),
    );
    expect(deep.chain).toHaveLength(deepDepth * methodsPerLevel);
    expect(shallow.chain).toHaveLength(shallowDepth * methodsPerLevel);

    expect(deep.calls).toBeLessThanOrEqual(deepDepth * methodsPerLevel * (deepDepth + 3) * 2);
    expect(shallow.calls).toBeLessThanOrEqual(shallowDepth * methodsPerLevel * (shallowDepth + 3) * 2);

    const deepPerMethod = deep.calls / (deepDepth * methodsPerLevel);
    const shallowPerMethod = shallow.calls / (shallowDepth * methodsPerLevel);
    // Deeper hierarchies cost more per method, but only by the depth ratio —
    // a hooks-multiplied regression would widen the gap ~13x instead.
    expect(deepPerMethod).toBeGreaterThanOrEqual(shallowPerMethod * 0.5);
    expect(deepPerMethod).toBeLessThanOrEqual(shallowPerMethod * (deepDepth / shallowDepth) * 2);
  });
});
