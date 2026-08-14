import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import {
  getMetadata,
  getOwnMetadata,
  getMetadataKeysStartWith,
  getMethodDescriptor,
  getMethodOwner,
  getMethodMetadata,
  getMethodMetadataKeysStartWith,
  getAllMethodNames,
  isRootRouter,
  isModelRouter,
  isDefaultModelRouterOptions,
  isModelRouterOptions,
  isGlobalPermissionsMethod,
  isDocPermissionsMethod,
  isBaseFilterMethod,
  isOverrideFilterMethod,
  isValidateMethod,
  isPrepareMethod,
  isTransformMethod,
  isAfterPersistMethod,
  isDecorateMethod,
  isDecorateAllMethod,
  isRouteGuardMethod,
  isIdentifierMethod,
  isBeforeDeleteMethod,
  isAfterDeleteMethod,
} from '../src/metadata';
import {
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
} from '../src/decorators';
import {
  DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK,
  GLOBAL_PERMISSIONS_WATERMARK,
  MODEL_ROUTER_OPTIONS_WATERMARK,
  ROOT_ROUTER_WATERMARK,
  ROUTER_WATERMARK,
} from '../src/constants';
import { applyMethodDecorator } from './helpers';

describe('metadata', () => {
  describe('getMetadata', () => {
    it('should return null when no metadata exists', () => {
      expect(getMetadata({}, 'nonexistent')).toBeNull();
    });

    it('should return metadata when it exists', () => {
      const obj = {};
      Reflect.defineMetadata('testKey', 'testValue', obj);
      expect(getMetadata(obj, 'testKey')).toBe('testValue');
    });
  });

  describe('getOwnMetadata', () => {
    it('should not return inherited metadata', () => {
      class Base {}
      class Child extends Base {}
      Reflect.defineMetadata(ROUTER_WATERMARK, true, Base);

      expect(getMetadata(Child, ROUTER_WATERMARK)).toBe(true);
      expect(getOwnMetadata(Child, ROUTER_WATERMARK)).toBeNull();
    });
  });

  describe('getMetadataKeysStartWith', () => {
    it('should return matching keys', () => {
      const obj = {};
      Reflect.defineMetadata('docPermissions.create', true, obj);
      Reflect.defineMetadata('docPermissions.update', true, obj);
      Reflect.defineMetadata('baseFilter.list', true, obj);
      Reflect.defineMetadata('docPermissionsExtra', true, obj);
      Reflect.defineMetadata(Symbol('docPermissions.symbol'), true, obj);

      const keys = getMetadataKeysStartWith(obj, 'docPermissions');
      expect(keys).toHaveLength(2);
      expect(keys).toContain('docPermissions.create');
      expect(keys).toContain('docPermissions.update');
    });

    it('should include exact keys and ignore prefix neighbors', () => {
      const obj = {};
      Reflect.defineMetadata('validate', true, obj);
      Reflect.defineMetadata('validate.create', true, obj);
      Reflect.defineMetadata('validateExtra', true, obj);

      expect(getMetadataKeysStartWith(obj, 'validate')).toEqual(['validate', 'validate.create']);
    });

    it('should return empty array when no matches', () => {
      const obj = {};
      Reflect.defineMetadata('baseFilter.list', true, obj);
      expect(getMetadataKeysStartWith(obj, 'docPermissions')).toEqual([]);
    });
  });

  describe('getMethodDescriptor', () => {
    it('should find own method', () => {
      class Test {
        myMethod() {}
      }
      const descriptor = getMethodDescriptor(Test.prototype, 'myMethod');
      expect(descriptor).toBeDefined();
      expect(typeof descriptor!.value).toBe('function');
    });

    it('should find inherited method', () => {
      class Base {
        inherited() {}
      }
      class Child extends Base {}
      expect(getMethodDescriptor(Child.prototype, 'inherited')).toBeDefined();
    });

    it('should return undefined for nonexistent method', () => {
      class Test {}
      expect(getMethodDescriptor(Test.prototype, 'nope')).toBeUndefined();
    });
  });

  describe('getMethodOwner', () => {
    it('should return the prototype that declares the effective method', () => {
      class Base {
        inherited() {}
        overridden() {}
      }
      class Child extends Base {
        overridden() {}
      }

      expect(getMethodOwner(Child.prototype, 'inherited')).toBe(Base.prototype);
      expect(getMethodOwner(Child.prototype, 'overridden')).toBe(Child.prototype);
    });
  });

  describe('getMethodMetadata', () => {
    it('should return metadata for a decorated method', () => {
      class Test {
        handler() {}
      }
      applyMethodDecorator(GlobalPermissions(), Test.prototype, 'handler');
      expect(getMethodMetadata(Test.prototype, 'handler', GLOBAL_PERMISSIONS_WATERMARK)).toBe(true);
    });

    it('should return null for undecorated method', () => {
      class Test {
        handler() {}
      }
      expect(getMethodMetadata(Test.prototype, 'handler', GLOBAL_PERMISSIONS_WATERMARK)).toBeNull();
    });
  });

  describe('getMethodMetadataKeysStartWith', () => {
    it('should return composite keys for a method', () => {
      class Test {
        handler() {}
      }
      applyMethodDecorator(DocPermissions('create'), Test.prototype, 'handler');
      applyMethodDecorator(DocPermissions('update'), Test.prototype, 'handler');

      const keys = getMethodMetadataKeysStartWith(Test.prototype, 'handler', 'docPermissions');
      expect(keys).toContain('docPermissions.create');
      expect(keys).toContain('docPermissions.update');
    });
  });

  describe('getAllMethodNames', () => {
    it('should yield own methods', () => {
      class Test {
        a() {}
        b() {}
        c() {}
      }
      const names = [...getAllMethodNames(Test.prototype)];
      expect(names).toContain('a');
      expect(names).toContain('b');
      expect(names).toContain('c');
    });

    it('should yield inherited methods', () => {
      class Base {
        baseMethod() {}
      }
      class Child extends Base {
        childMethod() {}
      }
      const names = [...getAllMethodNames(Child.prototype)];
      expect(names).toContain('baseMethod');
      expect(names).toContain('childMethod');
    });

    it('should exclude constructor', () => {
      class Test {
        myMethod() {}
      }
      expect([...getAllMethodNames(Test.prototype)]).not.toContain('constructor');
    });

    it('should exclude getters and setters', () => {
      class Test {
        get prop() {
          return 1;
        }
        set prop(v: number) {}
        method() {}
      }
      const names = [...getAllMethodNames(Test.prototype)];
      expect(names).not.toContain('prop');
      expect(names).toContain('method');
    });

    it('should yield overridden methods only once', () => {
      class Base {
        foo() {}
        bar() {}
      }
      class Child extends Base {
        foo() {}
      }
      const names = [...getAllMethodNames(Child.prototype)];
      const fooCount = names.filter((n) => n === 'foo').length;
      expect(fooCount).toBe(1);
      expect(names).toContain('bar');
    });
  });

  describe('class-level watermark helpers', () => {
    it('isRootRouter', () => {
      const A = class {};
      Reflect.defineMetadata(ROOT_ROUTER_WATERMARK, true, A);
      expect(isRootRouter(A)).toBe(true);
      expect(isRootRouter(class {})).toBe(false);
    });

    it('isModelRouter', () => {
      const A = class {};
      Reflect.defineMetadata(ROUTER_WATERMARK, true, A);
      expect(isModelRouter(A)).toBe(true);
      expect(isModelRouter(class {})).toBe(false);
    });

    it('isDefaultModelRouterOptions', () => {
      const A = class {};
      Reflect.defineMetadata(DEFAULT_MODEL_ROUTER_OPTIONS_WATERMARK, true, A);
      expect(isDefaultModelRouterOptions(A)).toBe(true);
      expect(isDefaultModelRouterOptions(class {})).toBe(false);
    });

    it('isModelRouterOptions', () => {
      const A = class {};
      Reflect.defineMetadata(MODEL_ROUTER_OPTIONS_WATERMARK, true, A);
      expect(isModelRouterOptions(A)).toBe(true);
      expect(isModelRouterOptions(class {})).toBe(false);
    });
  });

  describe('method-level watermark helpers', () => {
    const helpers: Array<{
      name: string;
      helper: (obj: object, method: string) => boolean;
      decorator: () => MethodDecorator;
    }> = [
      { name: 'isGlobalPermissionsMethod', helper: isGlobalPermissionsMethod, decorator: GlobalPermissions },
      { name: 'isDocPermissionsMethod', helper: isDocPermissionsMethod, decorator: () => DocPermissions('read') },
      { name: 'isBaseFilterMethod', helper: isBaseFilterMethod, decorator: () => BaseFilter('list') },
      { name: 'isOverrideFilterMethod', helper: isOverrideFilterMethod, decorator: () => OverrideFilter('read') },
      { name: 'isValidateMethod', helper: isValidateMethod, decorator: () => Validate('create') },
      { name: 'isPrepareMethod', helper: isPrepareMethod, decorator: () => Prepare('update') },
      { name: 'isTransformMethod', helper: isTransformMethod, decorator: () => Transform('update') },
      { name: 'isAfterPersistMethod', helper: isAfterPersistMethod, decorator: () => AfterPersist('create') },
      { name: 'isDecorateMethod', helper: isDecorateMethod, decorator: () => Decorate('read') },
      { name: 'isDecorateAllMethod', helper: isDecorateAllMethod, decorator: () => DecorateAll('list') },
      { name: 'isRouteGuardMethod', helper: isRouteGuardMethod, decorator: () => RouteGuard('delete') },
      { name: 'isIdentifierMethod', helper: isIdentifierMethod, decorator: Identifier },
      { name: 'isBeforeDeleteMethod', helper: isBeforeDeleteMethod, decorator: BeforeDelete },
      { name: 'isAfterDeleteMethod', helper: isAfterDeleteMethod, decorator: AfterDelete },
    ];

    for (const { name, helper, decorator } of helpers) {
      it(name, () => {
        class Target {
          handler() {}
          other() {}
        }
        applyMethodDecorator(decorator(), Target.prototype, 'handler');
        const instance = new Target();

        expect(helper(instance, 'handler')).toBe(true);
        expect(helper(instance, 'other')).toBe(false);
      });
    }
  });
});
