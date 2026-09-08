import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript';
import {
  Module,
  Router,
  GlobalPermissions,
  DocPermissions,
  BaseFilter,
  OverrideFilter,
  Validate,
  Prepare,
  Transform,
  AfterPersist,
  Decorate,
  DecorateAll,
  RouteGuard,
  Identifier,
  BeforeDelete,
  AfterDelete,
  Option,
  GlobalOption,
  ModelOption,
  DefaultModelOption,
  Request,
  Document,
  Permissions,
  Context,
  Filter,
  Id,
} from '../src';
import { EgoseFactoryStatic } from '../src/factory';
import {
  ARGS_METADATA,
  OPTIONS_METADATA,
  GLOBAL_PERMISSIONS_WATERMARK,
  DOC_PERMISSIONS_WATERMARK,
  BASE_FILTER_WATERMARK,
  OVERRIDE_FILTER_WATERMARK,
  VALIDATE_WATERMARK,
  PREPARE_WATERMARK,
  TRANSFORM_WATERMARK,
  AFTER_PERSIST_WATERMARK,
  DECORATE_WATERMARK,
  DECORATE_ALL_WATERMARK,
  ROUTE_GUARD_WATERMARK,
  IDENTIFIER_WATERMARK,
  BEFORE_DELETE_WATERMARK,
  AFTER_DELETE_WATERMARK,
  HOOK_DEFINITIONS,
} from '../src/constants';

// Compiles a real legacy (experimental) TypeScript decorator source string
// and evaluates it with the given decorator bindings in scope. This exercises
// actual `@Decorator` syntax: the vitest transform cannot parse legacy
// decorators inline, so the source is compiled with tsc
// (`experimentalDecorators: true`, no typecheck) exactly as a consumer build
// would emit it.
function evalLegacy(source: string, bindings: Record<string, unknown>, exportExpr: string): any {
  const { outputText } = transpileModule(source, {
    compilerOptions: {
      experimentalDecorators: true,
      emitDecoratorMetadata: false,
      target: ScriptTarget.ES2020,
      module: ModuleKind.None,
    },
  });
  const names = Object.keys(bindings);
  const values = names.map((name) => bindings[name]);
  const runner = new Function(...names, `${outputText}\nreturn (${exportExpr});`);
  return runner(...values);
}

describe('BDECO-05 decorator boundary', () => {
  describe('static method targets fail fast', () => {
    const methodFactories: Array<{
      name: string;
      make: () => (target: object, key: string | symbol, descriptor: PropertyDescriptor) => void;
      watermark: symbol;
      compositeKey?: string;
    }> = [
      { name: 'GlobalPermissions', make: () => GlobalPermissions() as any, watermark: GLOBAL_PERMISSIONS_WATERMARK },
      {
        name: 'DocPermissions',
        make: () => DocPermissions('create') as any,
        watermark: DOC_PERMISSIONS_WATERMARK,
        compositeKey: 'docPermissions.create',
      },
      {
        name: 'BaseFilter',
        make: () => BaseFilter('list') as any,
        watermark: BASE_FILTER_WATERMARK,
        compositeKey: 'baseFilter.list',
      },
      {
        name: 'OverrideFilter',
        make: () => OverrideFilter('read') as any,
        watermark: OVERRIDE_FILTER_WATERMARK,
        compositeKey: 'overrideFilter.read',
      },
      {
        name: 'Validate',
        make: () => Validate('create') as any,
        watermark: VALIDATE_WATERMARK,
        compositeKey: 'validate.create',
      },
      {
        name: 'Prepare',
        make: () => Prepare('create') as any,
        watermark: PREPARE_WATERMARK,
        compositeKey: 'prepare.create',
      },
      {
        name: 'Transform',
        make: () => Transform('update') as any,
        watermark: TRANSFORM_WATERMARK,
        compositeKey: 'transform.update',
      },
      {
        name: 'AfterPersist',
        make: () => AfterPersist('create') as any,
        watermark: AFTER_PERSIST_WATERMARK,
        compositeKey: 'afterPersist.create',
      },
      {
        name: 'Decorate',
        make: () => Decorate('read') as any,
        watermark: DECORATE_WATERMARK,
        compositeKey: 'decorate.read',
      },
      {
        name: 'DecorateAll',
        make: () => DecorateAll('list') as any,
        watermark: DECORATE_ALL_WATERMARK,
        compositeKey: 'decorateAll.list',
      },
      {
        name: 'RouteGuard',
        make: () => RouteGuard('read') as any,
        watermark: ROUTE_GUARD_WATERMARK,
        compositeKey: 'routeGuard.read',
      },
      { name: 'Identifier', make: () => Identifier() as any, watermark: IDENTIFIER_WATERMARK },
      { name: 'BeforeDelete', make: () => BeforeDelete() as any, watermark: BEFORE_DELETE_WATERMARK },
      { name: 'AfterDelete', make: () => AfterDelete() as any, watermark: AFTER_DELETE_WATERMARK },
    ];

    it.each(methodFactories.map((f) => [f.name, f] as const))(
      '%s on a static method throws before writing metadata',
      (_name, factory) => {
        class StaticRouter {
          static hook() {
            return true;
          }
        }
        const descriptor = Object.getOwnPropertyDescriptor(StaticRouter, 'hook')!;
        const decorator = factory.make();
        expect(() => (decorator as any)(StaticRouter, 'hook', descriptor)).toThrow(/static methods are not supported/);
        expect(Reflect.getMetadata(factory.watermark, StaticRouter.hook)).toBeUndefined();
        if (factory.compositeKey) {
          expect(Reflect.getMetadata(factory.compositeKey, StaticRouter.hook)).toBeUndefined();
        }
      },
    );

    it('static deny guard via legacy decorator syntax throws instead of disappearing', () => {
      expect(() =>
        evalLegacy(
          `class StaticDeny {
             @RouteGuard('read')
             static guard() { return false; }
           }`,
          { RouteGuard },
          'StaticDeny',
        ),
      ).toThrow(/static methods are not supported/);
    });

    it('instance guard via legacy decorator syntax still registers', () => {
      const InstanceAllow = evalLegacy(
        `class InstanceAllow {
           @RouteGuard('read')
           guard() { return true; }
         }`,
        { RouteGuard },
        'InstanceAllow',
      );
      expect(Reflect.getMetadata('routeGuard.read', InstanceAllow.prototype.guard)).toBe(true);
      expect(Reflect.getMetadata(ROUTE_GUARD_WATERMARK, InstanceAllow.prototype.guard)).toBe(true);
    });
  });

  describe('static/constructor parameter targets fail fast', () => {
    const paramFactories: Array<{ name: string; make: () => ParameterDecorator }> = [
      { name: 'Request', make: Request },
      { name: 'Document', make: Document },
      { name: 'Permissions', make: Permissions },
      { name: 'Context', make: Context },
      { name: 'Filter', make: Filter },
      { name: 'Id', make: Id },
    ];

    it.each(paramFactories.map((f) => [f.name, f] as const))(
      '@%s on a static method parameter throws',
      (_name, factory) => {
        class StaticRouter {
          static hook(_value: unknown) {}
        }
        expect(() => factory.make()(StaticRouter, 'hook', 0)).toThrow(/static methods are not supported/);
      },
    );

    it('two static parameter declarations cannot contaminate shared Function metadata', () => {
      class RouterA {
        static hook(_value: unknown) {}
      }
      class RouterB {
        static hook(_value: unknown) {}
      }
      expect(() => Permissions()(RouterA, 'hook', 0)).toThrow(/static methods are not supported/);
      expect(() => Permissions()(RouterB, 'hook', 0)).toThrow(/static methods are not supported/);
      expect(Reflect.getOwnMetadata(ARGS_METADATA, Function, 'hook')).toBeUndefined();
      expect(Reflect.getOwnMetadata(ARGS_METADATA, RouterA, 'hook')).toBeUndefined();
      expect(Reflect.getOwnMetadata(ARGS_METADATA, RouterB, 'hook')).toBeUndefined();
      expect(Reflect.getMetadata(ARGS_METADATA, RouterA, 'hook')).toBeUndefined();
      expect(Reflect.getMetadata(ARGS_METADATA, RouterB, 'hook')).toBeUndefined();
    });

    it.each(paramFactories.map((f) => [f.name, f] as const))(
      '@%s on a constructor parameter throws instead of silently returning',
      (_name, factory) => {
        class CtorRouter {
          constructor(_value: unknown) {}
        }
        expect(() => factory.make()(CtorRouter, undefined as any, 0)).toThrow(
          /constructor parameters are not supported/,
        );
        expect(Reflect.getOwnMetadata(ARGS_METADATA, CtorRouter, undefined as any)).toBeUndefined();
      },
    );

    it('legacy static parameter syntax throws', () => {
      expect(() =>
        evalLegacy(
          `class StaticParams {
             static hook(@Permissions() _perms) { return true; }
           }`,
          { Permissions },
          'StaticParams',
        ),
      ).toThrow(/static methods are not supported/);
    });

    it('legacy constructor parameter syntax throws', () => {
      expect(() =>
        evalLegacy(
          `class CtorInject {
             constructor(@Permissions() _perms) {}
           }`,
          { Permissions },
          'CtorInject',
        ),
      ).toThrow(/constructor parameters are not supported/);
    });

    it('legacy instance parameter syntax still registers', () => {
      const InstanceParams = evalLegacy(
        `class InstanceParams {
           hook(@Permissions() _perms) { return true; }
         }`,
        { Permissions },
        'InstanceParams',
      );
      const meta = Reflect.getMetadata(ARGS_METADATA, InstanceParams, 'hook');
      expect(meta).toEqual([{ index: 0, type: 3 }]);
    });
  });

  describe('static property targets fail fast', () => {
    const propertyFactories: Array<{ name: string; make: (key: string) => PropertyDecorator }> = [
      { name: 'Option', make: (key) => Option(key) },
      { name: 'GlobalOption', make: (key) => GlobalOption(key as never) },
      { name: 'ModelOption', make: (key) => ModelOption(key as never) },
      { name: 'DefaultModelOption', make: (key) => DefaultModelOption(key as never) },
    ];

    it.each(propertyFactories.map((f) => [f.name, f] as const))(
      '@%s on a static property throws before writing metadata',
      (_name, factory) => {
        class StaticOptions {}
        expect(() => factory.make('limit')(StaticOptions, 'limit')).toThrow(/static properties are not supported/);
        expect(Reflect.getOwnMetadata(OPTIONS_METADATA, StaticOptions)).toBeUndefined();
      },
    );

    it('legacy static property syntax throws', () => {
      expect(() =>
        evalLegacy(
          `class StaticProps {
             @Option('limit')
             static limit = 100;
           }`,
          { Option },
          'StaticProps',
        ),
      ).toThrow(/static properties are not supported/);
    });

    it('instance properties still register', () => {
      class InstanceOptions {
        limit = 100;
      }
      Option('limit')(InstanceOptions.prototype, 'limit');
      expect(Reflect.getMetadata(OPTIONS_METADATA, InstanceOptions.prototype)).toEqual([
        { optionKey: 'limit', propertyKey: 'limit' },
      ]);
    });
  });

  describe('missing/invalid operations are rejected without metadata', () => {
    const operationFactories: Array<{
      name: string;
      factory: (op: never) => (target: object, key: string | symbol, descriptor: PropertyDescriptor) => void;
      optionKey: string;
    }> = [
      { name: 'DocPermissions', factory: DocPermissions as any, optionKey: 'docPermissions' },
      { name: 'BaseFilter', factory: BaseFilter as any, optionKey: 'baseFilter' },
      { name: 'OverrideFilter', factory: OverrideFilter as any, optionKey: 'overrideFilter' },
      { name: 'Validate', factory: Validate as any, optionKey: 'validate' },
      { name: 'Prepare', factory: Prepare as any, optionKey: 'prepare' },
      { name: 'Transform', factory: Transform as any, optionKey: 'transform' },
      { name: 'AfterPersist', factory: AfterPersist as any, optionKey: 'afterPersist' },
      { name: 'Decorate', factory: Decorate as any, optionKey: 'decorate' },
      { name: 'DecorateAll', factory: DecorateAll as any, optionKey: 'decorateAll' },
      { name: 'RouteGuard', factory: RouteGuard as any, optionKey: 'routeGuard' },
    ];
    const badValues: Array<{ label: string; value: unknown; callWithNoArgs?: boolean }> = [
      { label: 'missing', value: undefined, callWithNoArgs: true },
      { label: 'undefined', value: undefined },
      { label: 'null', value: null },
      { label: 'empty', value: '' },
      { label: 'wrong-type number', value: 42 },
      { label: 'wrong-type object', value: { create: true } },
      { label: 'wrong-type array', value: ['create'] },
      { label: 'wrong-type boolean', value: true },
      { label: 'unsupported', value: 'bogus' },
      { label: 'nested subs guard', value: 'subs' },
    ];

    it.each(operationFactories.map((f) => [f.name, f] as const))(
      '%s rejects every invalid operation without leaving metadata',
      (_name, entry) => {
        for (const bad of badValues) {
          if (bad.callWithNoArgs) {
            expect(() => (entry.factory as any)()).toThrow(new RegExp(`Invalid @${entry.optionKey} operation`));
          } else {
            expect(() => entry.factory(bad.value as never)).toThrow(
              new RegExp(`Invalid @${entry.optionKey} operation`),
            );
          }
        }
        class Probe {
          hook() {
            return true;
          }
        }
        const definition = (HOOK_DEFINITIONS as Record<string, { watermark: symbol }>)[
          Object.keys(HOOK_DEFINITIONS).find(
            (key) => (HOOK_DEFINITIONS as Record<string, { optionKey: string }>)[key].optionKey === entry.optionKey,
          )!
        ];
        expect(Reflect.getMetadata(definition.watermark, Probe.prototype.hook)).toBeUndefined();
        expect(Reflect.getMetadata(entry.optionKey, Probe.prototype.hook)).toBeUndefined();
        // Failures leave no blocking state: a valid application still registers.
        class ValidProbe {
          hook() {
            return true;
          }
        }
        const validOp = (HOOK_DEFINITIONS as unknown as Record<string, { operations: readonly string[] }>)[
          Object.keys(HOOK_DEFINITIONS).find(
            (key) => (HOOK_DEFINITIONS as Record<string, { optionKey: string }>)[key].optionKey === entry.optionKey,
          )!
        ].operations[0];
        const validDecorator = entry.factory(validOp as never) as (
          target: object,
          key: string,
          descriptor: PropertyDescriptor,
        ) => void;
        const validDescriptor = Object.getOwnPropertyDescriptor(ValidProbe.prototype, 'hook')!;
        validDecorator(ValidProbe.prototype, 'hook', validDescriptor);
        expect(Reflect.getMetadata(definition.watermark, ValidProbe.prototype.hook)).toBe(true);
        expect(Reflect.getMetadata(`${entry.optionKey}.${validOp}`, ValidProbe.prototype.hook)).toBe(true);
      },
    );

    it('JavaScript BaseFilter() with no operation throws and leaves no unsuffixed metadata', () => {
      class JsRouter {
        hook() {
          return true;
        }
      }
      const descriptor = Object.getOwnPropertyDescriptor(JsRouter.prototype, 'hook')!;
      expect(() => (BaseFilter as any)()).toThrow(/Invalid @baseFilter operation/);
      expect(Reflect.getMetadata('baseFilter', JsRouter.prototype.hook)).toBeUndefined();
      expect(Reflect.getMetadata(BASE_FILTER_WATERMARK, JsRouter.prototype.hook)).toBeUndefined();
      expect(descriptor.value).toBe(JsRouter.prototype.hook);
    });
  });

  describe('valid operations and operationless hooks still register', () => {
    it('every valid operation registers watermark plus composite key', () => {
      const cases: Array<{ factory: (op: never) => unknown; optionKey: string }> = [
        { factory: DocPermissions as any, optionKey: 'docPermissions' },
        { factory: BaseFilter as any, optionKey: 'baseFilter' },
        { factory: OverrideFilter as any, optionKey: 'overrideFilter' },
        { factory: Validate as any, optionKey: 'validate' },
        { factory: Prepare as any, optionKey: 'prepare' },
        { factory: Transform as any, optionKey: 'transform' },
        { factory: AfterPersist as any, optionKey: 'afterPersist' },
        { factory: Decorate as any, optionKey: 'decorate' },
        { factory: DecorateAll as any, optionKey: 'decorateAll' },
        { factory: RouteGuard as any, optionKey: 'routeGuard' },
      ];
      for (const entry of cases) {
        const definitionKey = Object.keys(HOOK_DEFINITIONS).find(
          (key) => (HOOK_DEFINITIONS as Record<string, { optionKey: string }>)[key].optionKey === entry.optionKey,
        )!;
        const allowed = (HOOK_DEFINITIONS as unknown as Record<string, { operations: readonly string[] }>)[
          definitionKey
        ].operations;
        const watermark = (HOOK_DEFINITIONS as Record<string, { watermark: symbol }>)[definitionKey].watermark;
        for (const operation of allowed) {
          class Probe {
            hook() {
              return true;
            }
          }
          const decorator = entry.factory(operation as never) as (
            target: object,
            key: string,
            descriptor: PropertyDescriptor,
          ) => void;
          const descriptor = Object.getOwnPropertyDescriptor(Probe.prototype, 'hook')!;
          decorator(Probe.prototype, 'hook', descriptor);
          expect(Reflect.getMetadata(watermark, Probe.prototype.hook)).toBe(true);
          expect(Reflect.getMetadata(`${entry.optionKey}.${operation}`, Probe.prototype.hook)).toBe(true);
        }
      }
    });

    it('operationless hooks register without arguments', () => {
      const cases = [
        { make: () => GlobalPermissions() as any, watermark: GLOBAL_PERMISSIONS_WATERMARK, key: 'globalPermissions' },
        { make: () => Identifier() as any, watermark: IDENTIFIER_WATERMARK, key: 'identifier' },
        { make: () => BeforeDelete() as any, watermark: BEFORE_DELETE_WATERMARK, key: 'beforeDelete' },
        { make: () => AfterDelete() as any, watermark: AFTER_DELETE_WATERMARK, key: 'afterDelete' },
      ];
      for (const entry of cases) {
        class Probe {
          hook() {
            return true;
          }
        }
        const descriptor = Object.getOwnPropertyDescriptor(Probe.prototype, 'hook')!;
        (entry.make() as any)(Probe.prototype, 'hook', descriptor);
        expect(Reflect.getMetadata(entry.watermark, Probe.prototype.hook)).toBe(true);
        expect(Reflect.getMetadata(entry.key, Probe.prototype.hook)).toBe(true);
      }
    });

    it('symbol instance methods register', () => {
      const sym = Symbol('guard');
      class SymbolRouter {
        [sym]() {
          return true;
        }
      }
      const descriptor = Object.getOwnPropertyDescriptor(SymbolRouter.prototype, sym)!;
      (RouteGuard('read') as any)(SymbolRouter.prototype, sym, descriptor);
      expect(Reflect.getMetadata(ROUTE_GUARD_WATERMARK, (SymbolRouter.prototype as any)[sym])).toBe(true);
      expect(Reflect.getMetadata('routeGuard.read', (SymbolRouter.prototype as any)[sym])).toBe(true);
    });

    it('inherited and symbol instance hooks bootstrap end to end', async () => {
      const modelName = 'DecoBoundaryInheritSymbol';
      const sym = Symbol('prepareCreate');
      class BaseRouter {
        guard() {
          return false;
        }
      }
      (RouteGuard('read') as any)(
        BaseRouter.prototype,
        'guard',
        Object.getOwnPropertyDescriptor(BaseRouter.prototype, 'guard')!,
      );
      class ChildRouter extends BaseRouter {
        [sym](doc: unknown) {
          return doc;
        }
      }
      (Prepare('create') as any)(
        ChildRouter.prototype,
        sym,
        Object.getOwnPropertyDescriptor(ChildRouter.prototype, sym)!,
      );
      Router(modelName)(ChildRouter);
      const factory = EgoseFactoryStatic.create();
      const model = Object.assign(function DecoBoundaryModel() {}, {
        modelName,
        schema: { tree: {}, obj: {} },
        jsonSchema: () => ({}),
      });
      factory.runtime.registerModelInstance(modelName, model as any);
      factory.runtime.setModelOptions(modelName, {
        validate: {},
        overrideFilter: {},
        resolveIdFilter: undefined,
        prepare: {},
      } as any);
      class TestModule {}
      Module({ routers: [ChildRouter as any] })(TestModule);
      factory.bootstrap(TestModule, { use() {} } as any);
      const guard = factory.runtime.getModelOption(modelName, 'operationAccess.read') as any;
      expect(typeof guard).toBe('function');
      expect(await guard.call({}, { has: () => true } as any)).toBe(false);
      const prepare = factory.runtime.getModelOption(modelName, 'prepare.create') as any;
      expect(prepare).toBeDefined();
    });
  });
});
