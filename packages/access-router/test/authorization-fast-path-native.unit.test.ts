import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import { Service } from '../src/services/service';
import { PublicService } from '../src/services/public-service';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import Permission from '../src/permission';
import { PERMISSIONS } from '../src/symbols';
import { ServiceAuthorizationError } from '../src/acl/authorization-snapshot';
import { unsafeSnapshotOptions } from '../src/acl/unsafe-snapshot-options';
import {
  createTrustedOutputBudget,
  materializeTrustedOutputValue,
  trustedMapOutputScope,
  visitTrustedOutput,
} from '../src/acl/trusted-output-materialization';

const B = mongoose.mongo.BSON;
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const active = {
  ...Object.fromEntries(unsafeSnapshotOptions.map((name) => [name, true])),
  unsafeUseListAuthorizationFastPath: true,
  unsafeUseReadAuthorizationFastPath: true,
};
const code = (scope: Record<string, unknown>) => new B.Code('return 1', scope);
const ref = (fields: Record<string, unknown>) => new B.DBRef('collection', new B.ObjectId(), 'db', fields);
const wire = (value: unknown) => Object.assign(new B.ObjectId(), { toBSON: () => value });
const copy = (value: unknown, budget = createTrustedOutputBudget(), depth = 0) =>
  materializeTrustedOutputValue(value, 'value', budget, { keep: () => true }, depth);
const compatible = (value: unknown) =>
  B.deserialize(B.serialize({ value }), { promoteValues: false, bsonRegExp: true }).value;
function nested(count: number): Record<string, unknown> {
  let value: Record<string, unknown> = { leaf: 'selected' };
  for (let index = 0; index < count; index++) value = { next: value };
  return value;
}

let serial = 0;
function fixture(options: Record<string, unknown> = {}, schema: mongoose.SchemaDefinition = {}) {
  const model = mongoose.model(
    `FastNative${++serial}`,
    new mongoose.Schema({
      name: String,
      value: mongoose.Schema.Types.Mixed,
      hidden: mongoose.Schema.Types.Mixed,
      ...schema,
    }),
  );
  const runtime = new AccessRuntime();
  runtime.setGlobalOptions({ logger: { warn: vi.fn() } });
  runtime.registerModelInstance(model.modelName, model);
  const hook = vi.fn(() => ({}));
  const rule = vi.fn(() => true);
  runtime.setModelOptions(model.modelName, {
    ...active,
    hydration: { find: 'lean', findOne: 'lean', publicList: 'lean', publicRead: 'lean' },
    permissionSchema: { name: rule, value: rule, hidden: false },
    docPermissions: { list: hook, read: hook },
    operationAccess: { read: true, list: true },
    stripPermissionsField: true,
    ...options,
  } as never);
  const request: any = { [PERMISSIONS]: new Permission({ reader: true }) };
  const adapter = { mongooseModel: model, find: vi.fn(), findOne: vi.fn() };
  const [service, pub] = runWithRuntime(runtime, () => {
    request.macl = new Core(request);
    return [
      new (class extends Service {
        protected createModelAdapter() {
          return adapter;
        }
      })(request, model.modelName),
      new (class extends PublicService {
        protected createModelAdapter() {
          return adapter;
        }
      })(request, model.modelName),
    ];
  });
  return { adapter, hook, rule, service, pub };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^FastNative/);
});

describe('encountered selected key work, including denied values (FP06-R2 residual)', () => {
  const fields = (count = 21000, getter?: () => unknown) => {
    const output: Record<string, unknown> = {};
    for (let index = 0; index < count; index++)
      Object.defineProperty(
        output,
        `hidden${index}`,
        getter
          ? { enumerable: true, configurable: true, get: getter }
          : { enumerable: true, configurable: true, value: 'never' },
      );
    return output;
  };
  const containers = [
    ['ordinary', (value: Record<string, unknown>) => value, 19999],
    ['Code', code, 19998],
    ['DBRef', ref, 19997],
    ['wire', wire, 19998],
  ] as const;

  it.each(containers)('bounds all denied %s data keys before policy/value work', (_name, make, calls) => {
    const keep = vi.fn(() => false);
    expect(() => materializeTrustedOutputValue(make(fields()), 'value', createTrustedOutputBudget(), { keep })).toThrow(
      ServiceAuthorizationError,
    );
    expect(keep).toHaveBeenCalledTimes(calls);
  });

  it.each(containers)('bounds denied %s accessor keys without reading values', (_name, make, calls) => {
    const getter = vi.fn(() => new Proxy({}, {}));
    const keep = vi.fn(() => false);
    expect(() =>
      materializeTrustedOutputValue(make(fields(21000, getter)), 'value', createTrustedOutputBudget(), { keep }),
    ).toThrow(ServiceAuthorizationError);
    expect(keep).toHaveBeenCalledTimes(calls);
    expect(getter).not.toHaveBeenCalled();
  });

  it('checks a depleted budget before even the first denied native-key policy call and poisons the result', () => {
    const budget = createTrustedOutputBudget();
    visitTrustedOutput(budget, 0, 19998);
    const keep = vi.fn(() => false);
    expect(() => materializeTrustedOutputValue(code(fields(100)), 'value', budget, { keep })).toThrow(
      ServiceAuthorizationError,
    );
    expect(keep).not.toHaveBeenCalled();
    expect(() => visitTrustedOutput(budget, 0, 0)).toThrow(ServiceAuthorizationError);
  });

  it('charges exactly one slot for a denied property, just like an accepted scalar, without visiting its huge child', () => {
    const budget = createTrustedOutputBudget();
    visitTrustedOutput(budget, 0, 19997);
    const keep = vi.fn(() => false);
    const input = code({ hidden: new Proxy({ giant: Array(21000) }, {}) });
    expect(materializeTrustedOutputValue(input, 'value', budget, { keep })).toStrictEqual(code({}));
    expect(keep).toHaveBeenCalledTimes(1);
    expect(() => visitTrustedOutput(budget, 0)).toThrow(ServiceAuthorizationError);
  });

  it.each([false, true])('charges protected object keys before skipping them, BSON=%s', (bson) => {
    const value = Object.defineProperty({}, 'constructor', { enumerable: true, get: vi.fn() });
    const budget = createTrustedOutputBudget();
    visitTrustedOutput(budget, 0, bson ? 19998 : 19999);
    expect(() =>
      materializeTrustedOutputValue(bson ? code(value) : value, 'value', budget, { keep: () => true }),
    ).toThrow(ServiceAuthorizationError);
    expect(Object.getOwnPropertyDescriptor(value, 'constructor')!.get).not.toHaveBeenCalled();
  });

  it('charges every encountered protected named-Map field without reading its value', () => {
    const getter = vi.fn();
    const map = new Map([['constructor', Object.defineProperty({}, 'never', { get: getter })]]);
    expect(() => trustedMapOutputScope(map, Array(21000).fill('constructor'), createTrustedOutputBudget(), 0)).toThrow(
      ServiceAuthorizationError,
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it('retains the denied Map bound and outer-ancestor cycle controls', () => {
    const keep = vi.fn(() => false);
    const map = new Map(Object.keys(fields()).map((key) => [key, new Proxy({}, {})]));
    expect(() =>
      materializeTrustedOutputValue(code(map as never), 'value', createTrustedOutputBudget(), { keep }),
    ).toThrow(ServiceAuthorizationError);
    expect(keep.mock.calls.length).toBeLessThanOrEqual(20000);
    const root: Record<string, unknown> = {};
    root.value = wire(root);
    expect(() => copy(root)).toThrow(ServiceAuthorizationError);
  });

  it.each(['list', 'read', 'publicList', 'publicRead'] as const)(
    'rejects unknown wire keys through actual %s with one document/wire hook and no partial data',
    async (origin) => {
      const expanded = fields(); // Preallocated outside application hook execution.
      const hook = vi.fn(() => expanded);
      const f = fixture({ permissionSchema: { token: true } }, { token: mongoose.Schema.Types.ObjectId });
      const row = { token: Object.assign(new B.ObjectId(), { toBSON: hook }) };
      f.adapter.find.mockResolvedValue([row]);
      f.adapter.findOne.mockResolvedValue(row);
      const query = { select: ['token', '-_id'] };
      const result =
        origin === 'list'
          ? await f.service.find({}, query, quiet)
          : origin === 'read'
            ? await f.service.findOne({}, query, quiet)
            : origin === 'publicList'
              ? await f.pub._list({}, query, quiet)
              : await f.pub._read({}, query, quiet);
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
      expect(result).not.toHaveProperty('data');
      expect(f.hook).toHaveBeenCalledTimes(1);
      expect(hook).toHaveBeenCalledTimes(1);
    },
  );

  it('bounds current denied wire keys in an issued helper without rerunning the document hook', async () => {
    const f = fixture({ permissionSchema: { token: true } }, { token: mongoose.Schema.Types.ObjectId });
    f.adapter.find.mockResolvedValue([{ token: new B.ObjectId() }]);
    const result = await f.service.find({}, { select: ['token', '-_id'] }, quiet);
    if (!result.success) throw new Error(result.code);
    const row = result.data[0] as Record<string, unknown>;
    const expanded = fields();
    const hook = vi.fn(() => expanded);
    row.token = Object.assign(new B.ObjectId(), { toBSON: hook });
    let failure: unknown;
    try {
      await f.service.pickAllowedFields(row, 'list', {
        documentAuthorization: result.contexts[0].documentAuthorization,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ServiceAuthorizationError);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(f.hook).toHaveBeenCalledTimes(1);
  });

  it('keeps whole-result budget failure for a native virtual return', async () => {
    const expanded = fields();
    const hook = vi.fn(() => expanded);
    const getter = vi.fn(() => Object.assign(new B.ObjectId(), { toBSON: hook }));
    const f = fixture({
      permissionSchema: { name: true, computed: true },
      virtuals: { computed: { dependsOn: ['name'], get: getter } },
    });
    f.adapter.find.mockResolvedValue([{ name: 'selected' }]);
    const result = await f.service.find({}, { select: ['name', 'computed', '-_id'] }, quiet);
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
    expect(result).not.toHaveProperty('data');
    expect(getter).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('budgets denied emitted-metadata keys against selected data work before reading their values', async () => {
    const grants = fields(10000);
    const getter = vi.fn(() => 'never');
    const documentHook = vi.fn(() => grants);
    const f = fixture({
      stripPermissionsField: false,
      exposedDocPermissionKeys: ['allowed'],
      docPermissions: { list: documentHook },
      permissionSchema: {
        name: () => {
          for (const key of Object.keys(grants))
            Object.defineProperty(grants, key, { enumerable: true, configurable: true, get: getter });
          return true;
        },
        value: true,
      },
    });
    // Native tests normally use immutable data descriptors. This mutation occurs
    // after grant admission, exercising the explicitly borrowed active grant state.
    f.adapter.find.mockResolvedValue([{ name: 'selected', value: Array(6000).fill('selected') }]);
    const result = await f.service.find(
      {},
      { select: ['name', 'value', '-_id'] },
      { ...quiet, includePermissions: true },
    );
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
    expect(result).not.toHaveProperty('data');
    expect(getter).not.toHaveBeenCalled();
    expect(documentHook).toHaveBeenCalledTimes(1);
  });

  it('budgets denied retained-helper metadata keys without observing their accessors', async () => {
    const f = fixture({ stripPermissionsField: false, exposedDocPermissionKeys: ['allowed'] });
    f.adapter.find.mockResolvedValue([{ name: 'selected', value: Array(6000).fill('selected') }]);
    const result = await f.service.find(
      {},
      { select: ['name', 'value', '-_id'] },
      { ...quiet, includePermissions: true },
    );
    if (!result.success) throw new Error(result.code);
    const getter = vi.fn(() => 'never');
    (result.data[0] as Record<string, unknown>)._permissions = fields(10000, getter);
    let failure: unknown;
    try {
      await f.service.pickAllowedFields(result.data[0], 'list', {
        documentAuthorization: result.contexts[0].documentAuthorization,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ServiceAuthorizationError);
    expect(getter).not.toHaveBeenCalled();
    expect(f.hook).toHaveBeenCalledTimes(1);
  });
});

describe('selected native shared structural budget (FP06-R2)', () => {
  it.each(['list', 'read'] as const)('rejects 20,001 Code.scope entries through real Service %s', async (origin) => {
    const f = fixture();
    const row = { name: 'selected', value: code({ expanded: Array(20001).fill('selected') }) };
    f.adapter.find.mockResolvedValue([row]);
    f.adapter.findOne.mockResolvedValue(row);
    const result =
      origin === 'list'
        ? await f.service.find({}, { select: ['name', 'value', '-_id'] }, quiet)
        : await f.service.findOne({}, { select: ['name', 'value', '-_id'] }, quiet);
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
    expect(result).not.toHaveProperty('data');
    expect(f.hook).toHaveBeenCalledTimes(1);
    expect(f.rule).toHaveBeenCalledTimes(2);
  });

  it('charges a native scope against the already-depleted shared budget', () => {
    const budget = createTrustedOutputBudget();
    visitTrustedOutput(budget, 0, 19995);
    expect(() => copy(code({ expanded: Array(10).fill('selected') }), budget)).toThrow(ServiceAuthorizationError);
  });

  it('rejects a selected native scope deeper than 100', () => {
    expect(() => copy(code(nested(110)))).toThrow(ServiceAuthorizationError);
  });

  it('rejects a 21,000-accessor wire expansion before any serializer property reads', () => {
    const getter = vi.fn(() => 'selected');
    const expanded = {};
    for (let index = 0; index < 21000; index++)
      Object.defineProperty(expanded, `slot${index}`, { enumerable: true, get: getter });
    const hook = vi.fn(() => expanded);
    expect(() => copy(Object.assign(new B.ObjectId(), { toBSON: hook }))).toThrow(ServiceAuthorizationError);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(getter.mock.calls.length).toBe(0);
  });

  it.each([
    ['Code', () => code({ expanded: Array(20001).fill('selected') })],
    ['DBRef fields', () => ref({ expanded: Array(20001).fill('selected') })],
    ['DBRef oid', () => Object.assign(ref({}), { oid: { expanded: Array(20001).fill('selected') } })],
    ['wire Code', () => wire(code({ expanded: Array(20001).fill('selected') }))],
    ['wire DBRef', () => wire(ref({ expanded: Array(20001).fill('selected') }))],
    ['nested native', () => code({ child: ref({ child: code({ expanded: Array(20001).fill('selected') }) }) })],
    ['child wire hook', () => code({ child: wire({ expanded: Array(20001).fill('selected') }) })],
    ['wire depth', () => wire({ child: ref({ child: code(nested(100)) }) })],
  ] as const)('bounds contained/wire-expanded %s before BSON serialization', (_label, make) => {
    const serialize = vi.spyOn(B.ObjectId.prototype, 'serializeInto');
    expect(() => copy(code({ id: new B.ObjectId(), child: make() }))).toThrow(ServiceAuthorizationError);
    expect(serialize).not.toHaveBeenCalled();
  });

  it('admits depth 100, rejects depth 101, including a nested child native', () => {
    expect(copy(code(nested(98)))).toBeInstanceOf(B.Code);
    expect(() => copy(code(nested(99)))).toThrow(ServiceAuthorizationError);
    expect(copy(code({ child: code(nested(96)) }))).toBeInstanceOf(B.Code);
    expect(() => copy(code({ child: code(nested(97)) }))).toThrow(ServiceAuthorizationError);
    expect(copy(code({ leaf: 'selected' }), createTrustedOutputBudget(), 98)).toBeInstanceOf(B.Code);
    expect(() => copy(code({ leaf: 'selected' }), createTrustedOutputBudget(), 99)).toThrow(ServiceAuthorizationError);
  });

  it('charges native + scope + scalar once: exactly three remaining slots, not two', () => {
    const enough = createTrustedOutputBudget();
    visitTrustedOutput(enough, 0, 19997);
    expect(copy(code({ leaf: 'selected' }), enough)).toBeInstanceOf(B.Code);
    const short = createTrustedOutputBudget();
    visitTrustedOutput(short, 0, 19998);
    expect(() => copy(code({ leaf: 'selected' }), short)).toThrow(ServiceAuthorizationError);
  });

  it('charges every emitted occurrence of aliased native containers, not just unique identities', () => {
    const shared = { leaf: 'selected' };
    const output = copy(code({ a: shared, b: shared })) as InstanceType<typeof B.Code>;
    expect(output.scope).toEqual({ a: { leaf: 'selected' }, b: { leaf: 'selected' } });
    expect(output.scope!.a).not.toBe(output.scope!.b);
    const expanded = Array(6000).fill('selected');
    expect(() => copy(code({ a: expanded, b: expanded }))).toThrow(ServiceAuthorizationError);
  });

  it.each(['Code', 'DBRef'] as const)(
    'supports read-only %s native/container state without source writes',
    (family) => {
      const fields = Object.freeze({ selected: Object.freeze(['yes']) });
      const input = Object.freeze(family === 'Code' ? code(fields) : ref(fields));
      const before = Object.getOwnPropertyDescriptors(input);
      const output = copy(input);
      expect(output).toStrictEqual(compatible(input));
      expect(output).not.toBe(input);
      expect(Object.getOwnPropertyDescriptors(input)).toEqual(before);
      expect(fields.selected).toEqual(['yes']);
    },
  );

  it('rejects an oversized read-only native graph under the same budget without mutating it', () => {
    const expanded = Object.freeze(Array(20001).fill('selected'));
    const scope = Object.freeze({ expanded });
    const input = Object.freeze(code(scope));
    expect(() => copy(input)).toThrow(ServiceAuthorizationError);
    expect(input.scope).toBe(scope);
    expect(scope.expanded).toBe(expanded);
    expect(expanded).toHaveLength(20001);
  });
});

describe('bounded wire preparation and native compatibility', () => {
  it.each([
    ['ObjectId', () => new B.ObjectId()],
    ['Long', () => B.Long.fromString('9007199254740993')],
    ['Timestamp', () => B.Timestamp.fromNumber(123)],
    ['Decimal128', () => B.Decimal128.fromString('123.45')],
    ['Double', () => new B.Double(1.5)],
    ['Int32', () => new B.Int32(123)],
    ['Binary', () => new B.Binary(Buffer.from([1, 2, 3]))],
    ['UUID', () => new B.UUID()],
    ['BSONRegExp', () => new B.BSONRegExp('selected', 'im')],
    ['BSONSymbol', () => new B.BSONSymbol('selected')],
    ['MinKey', () => new B.MinKey()],
    ['MaxKey', () => new B.MaxKey()],
    ['Code without scope', () => new B.Code('return 1')],
    ['Code scope', () => code({ date: new Date(123), long: B.Long.fromNumber(5), array: [1, null, undefined] })],
    ['DBRef fields', () => ref({ code: code({ selected: true }), array: [{ decimal: B.Decimal128.fromString('1') }] })],
    ['Date', () => new Date(123)],
  ] as const)('preserves ordinary %s output type/shape', (_label, make) => {
    const input = make();
    const output = copy(input);
    expect(output).toStrictEqual(compatible(input));
    expect(output).not.toBe(input);
  });

  it('preserves wire normalization types and observes root/child data hooks once, with one native wire copy', () => {
    const child = vi.fn(() => new B.Int32(7));
    const root = vi.fn(() =>
      code({ id: new B.ObjectId(), child: Object.assign(new B.ObjectId(), { toBSON: child }), number: 1 }),
    );
    const serialize = vi.spyOn(B.ObjectId.prototype, 'serializeInto');
    const output = copy(Object.assign(new B.Long(1), { toBSON: root })) as InstanceType<typeof B.Code>;
    expect(output).toBeInstanceOf(B.Code);
    expect(output.scope!.child).toBeInstanceOf(B.Int32);
    expect(output.scope!.number).toBeInstanceOf(B.Int32);
    expect(root).toHaveBeenCalledTimes(1);
    expect(child).toHaveBeenCalledTimes(1);
    expect(serialize).toHaveBeenCalledTimes(1);
  });

  it('supports self-returning and inherited data hooks without repeating them', () => {
    class Native extends B.Code {
      toBSON = vi.fn(() => this);
    }
    const input = new Native('return 1', { selected: true });
    const output = copy(input);
    expect(output).toStrictEqual(code({ selected: true }));
    expect(input.toBSON).toHaveBeenCalledTimes(1);
    const inherited = vi.fn(() => ref({ selected: true }));
    class Other extends B.ObjectId {
      toBSON() {
        return inherited();
      }
    }
    expect(copy(new Other())).toBeInstanceOf(B.DBRef);
    expect(inherited).toHaveBeenCalledTimes(1);
  });

  it('supports a data hook on an ordinary wire-contained document exactly once', () => {
    const hook = vi.fn(() => ({ selected: new B.Int32(3) }));
    const output = copy(code({ child: { toBSON: hook } })) as InstanceType<typeof B.Code>;
    expect(output.scope).toEqual({ child: { selected: new B.Int32(3) } });
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('prepares Maps, sparse arrays and nested binary/date values with actual BSON semantics', () => {
    const sparse: unknown[] = [undefined];
    sparse.length = 2;
    sparse.push(new B.Long(7));
    const scope = {
      map: new Map([['selected', code({ leaf: true })]]),
      array: sparse,
      bytes: new Uint8Array([1, 2]),
      date: new Date(123),
      regexp: /selected/im,
    };
    expect(copy(code(scope))).toStrictEqual(compatible(code(scope)));
  });

  it.each(['Code', 'DBRef', 'wire'] as const)('does not read selected %s container accessors', (family) => {
    const getter = vi.fn(() => 'selected');
    const scope = Object.defineProperty({}, 'selected', { enumerable: true, get: getter });
    expect(() => copy(family === 'Code' ? code(scope) : family === 'DBRef' ? ref(scope) : wire(scope))).toThrow(
      ServiceAuthorizationError,
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it.each(['wire', 'scope', 'fields', 'child', 'prototype'] as const)(
    'rejects a selected %s proxy without executing its traps',
    (place) => {
      const trap = vi.fn(() => {
        throw new Error('must not observe');
      });
      const proxy = new Proxy({}, { get: trap, ownKeys: trap, getPrototypeOf: trap });
      const value =
        place === 'wire'
          ? wire(proxy)
          : place === 'scope'
            ? code(proxy)
            : place === 'fields'
              ? ref(proxy)
              : place === 'child'
                ? code({ child: proxy })
                : wire(Object.create(proxy));
      expect(() => copy(value)).toThrow(ServiceAuthorizationError);
      expect(trap).not.toHaveBeenCalled();
    },
  );

  it.each(['Code', 'DBRef', 'wire'] as const)('rejects selected %s cycles with controlled errors', (family) => {
    const scope: Record<string, unknown> = {};
    const value = family === 'Code' ? code(scope) : family === 'DBRef' ? ref(scope) : wire(scope);
    scope.cycle = value;
    expect(() => copy(value)).toThrow(ServiceAuthorizationError);
  });

  it('drops unsafe/protected keys before reading them, including inside Code/DBRef and wire graphs', () => {
    const getter = vi.fn(() => ({ polluted: true }));
    const scope = { selected: 'yes', __v: 'never' };
    for (const key of ['__proto__', 'prototype', 'constructor', '_doc', '$__'])
      Object.defineProperty(scope, key, { enumerable: true, get: getter });
    const output = copy(wire(code({ child: ref({ child: scope }) }))) as InstanceType<typeof B.Code>;
    expect((output.scope!.child as InstanceType<typeof B.DBRef>).fields.child).toEqual({ selected: 'yes' });
    expect(getter).not.toHaveBeenCalled();
    expect({}).not.toHaveProperty('polluted');
  });

  it.each([
    ['bare BSON tag', () => wire({ _bsontype: 'Code', code: 'return 1', scope: { selected: true } })],
    ['unknown native family', () => Object.create(B.BSONValue.prototype)],
    ['custom wire prototype', () => wire(new (class Custom {})())],
    ['wire symbol', () => wire(Symbol('selected'))],
    ['wire function', () => wire(() => true)],
    ['chained hooks', () => wire({ toBSON: () => ({ selected: true }) })],
  ] as const)('fails closed for %s rather than allowing the serializer to traverse it', (_label, make) => {
    expect(() => copy(make())).toThrow(ServiceAuthorizationError);
  });

  it('does not execute accessor hooks/state or custom serializer overrides', () => {
    const getter = vi.fn(() => () => ({}));
    const id = Object.defineProperty(new B.ObjectId(), 'toBSON', { get: getter });
    expect(() => copy(id)).toThrow(ServiceAuthorizationError);
    const native = Object.defineProperty(code({ selected: true }), 'scope', { get: getter });
    expect(() => copy(native)).toThrow(ServiceAuthorizationError);
    const serializer = vi.fn(() => 12);
    expect(() => copy(Object.assign(new B.ObjectId(), { serializeInto: serializer }))).toThrow(
      ServiceAuthorizationError,
    );
    expect(getter).not.toHaveBeenCalled();
    expect(serializer).not.toHaveBeenCalled();
  });

  it('propagates controlled authorization errors and contains arbitrary hook errors', () => {
    const controlled = new ServiceAuthorizationError('native hook');
    expect(() =>
      copy(
        Object.assign(new B.ObjectId(), {
          toBSON: () => {
            throw controlled;
          },
        }),
      ),
    ).toThrow(controlled);
    expect(() =>
      copy(
        Object.assign(new B.ObjectId(), {
          toBSON: () => {
            throw new Error('private');
          },
        }),
      ),
    ).toThrow(ServiceAuthorizationError);
  });

  it.each([null, 'normalized', 7, ['selected'], { selected: true }])(
    'keeps ordinary primitive/container wire normalization: %j',
    (normalized) => {
      const hook = vi.fn(() => normalized);
      const input = Object.assign(new B.ObjectId(), { toBSON: hook });
      // Construct the control separately so the measured hook is observed only by copy().
      expect(copy(input)).toStrictEqual(compatible(wire(normalized)));
      expect(hook).toHaveBeenCalledTimes(1);
    },
  );

  it('observes a BSON-contained Date normalization once and rejects a nonnumeric result', () => {
    const getTime = vi.fn(() => 123);
    expect(copy(code({ date: Object.assign(new Date(0), { getTime }) }))).toStrictEqual(code({ date: new Date(123) }));
    expect(getTime).toHaveBeenCalledTimes(1);
    expect(() => copy(code({ date: Object.assign(new Date(0), { getTime: () => ({ huge: Array(21000) }) }) }))).toThrow(
      ServiceAuthorizationError,
    );
  });

  it.each(['Code', 'DBRef', 'array'] as const)(
    'does not execute inherited setters installed by a %s wire hook',
    (family) => {
      const key = 'fp08NativeSlot';
      const setter = vi.fn();
      const hook = vi.fn(() => {
        Object.defineProperty(Object.prototype, key, { configurable: true, set: setter });
        const scope = { [key]: 'selected' };
        return family === 'Code' ? code(scope) : family === 'DBRef' ? ref(scope) : [scope];
      });
      let error: unknown;
      try {
        copy(Object.assign(new B.ObjectId(), { toBSON: hook }));
      } catch (caught) {
        error = caught;
      } finally {
        Reflect.deleteProperty(Object.prototype, key);
      }
      expect(error).toBeInstanceOf(ServiceAuthorizationError);
      expect(setter).not.toHaveBeenCalled();
      expect(hook).toHaveBeenCalledTimes(1);
    },
  );

  it('shares the depleted budget across wire replacement and nested native preparation', () => {
    const budget = createTrustedOutputBudget();
    visitTrustedOutput(budget, 0, 19995);
    const child = vi.fn(() => code({ selected: 'yes' }));
    const root = vi.fn(() => ({ child: Object.assign(new B.ObjectId(), { toBSON: child }) }));
    expect(() => copy(Object.assign(new B.ObjectId(), { toBSON: root }), budget)).toThrow(ServiceAuthorizationError);
    expect(root).toHaveBeenCalledTimes(1);
    expect(child).toHaveBeenCalledTimes(1);
  });

  it('does not inherit a hook-installed Code.scope when the actual native has no scope', () => {
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'scope');
    const native = new B.Code('return 1');
    const hook = vi.fn(() => {
      Object.defineProperty(Object.prototype, 'scope', { configurable: true, value: { expanded: Array(21000) } });
      return native;
    });
    let output: unknown;
    try {
      output = copy(Object.assign(new B.ObjectId(), { toBSON: hook }));
    } finally {
      if (previous) Object.defineProperty(Object.prototype, 'scope', previous);
      else Reflect.deleteProperty(Object.prototype, 'scope');
    }
    expect(output).toStrictEqual(native);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('retains nonmethod toBSON business properties in wire-contained records and Maps', () => {
    const input = code({ child: { toBSON: 'business' }, map: new Map([['toBSON', 'business']]) });
    expect(copy(input)).toStrictEqual(compatible(input));
  });

  it.each(['scope', 'fields', 'normalized scope'] as const)('rejects a native-as-document %s root', (place) => {
    const native = ref({ selected: true });
    const input =
      place === 'scope'
        ? new B.Code('return 1', native)
        : place === 'fields'
          ? Object.assign(ref({}), { fields: native })
          : code({ toBSON: () => native });
    expect(() => copy(input)).toThrow(ServiceAuthorizationError);
  });
});

describe('native values on public services, issued helpers and virtual return channels', () => {
  it('keeps ordinary BSON output on mixed borrowed/copied root fallback rows with one hook per row', async () => {
    const f = fixture();
    const borrowed = { name: 'borrowed', value: code({ selected: true }) };
    const copied = Object.defineProperty({ value: ref({ selected: true }) }, 'name', {
      enumerable: true,
      get: () => 'copied',
    });
    f.adapter.find.mockResolvedValue([borrowed, copied]);
    const result = await f.service.find({}, { select: ['name', 'value', '-_id'] }, quiet);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    expect(result.data[0]).toEqual(borrowed);
    expect(result.data[1]).toEqual({ name: 'copied', value: copied.value });
    expect(result.data[0].value).toBeInstanceOf(B.Code);
    expect(result.data[1].value).toBeInstanceOf(B.DBRef);
    expect(f.hook).toHaveBeenCalledTimes(2);
    expect(f.hook.mock.calls[0][0]).toBe(borrowed);
    expect(f.hook.mock.calls[1][0]).not.toBe(copied);
  });

  it.each(['list', 'read'] as const)(
    'bounds DBRef fields through PublicService %s with one actual hook',
    async (origin) => {
      const f = fixture();
      const row = { name: 'selected', value: ref({ expanded: Array(20001).fill('selected') }) };
      f.adapter.find.mockResolvedValue([row]);
      f.adapter.findOne.mockResolvedValue(row);
      const result =
        origin === 'list'
          ? await f.pub._list({}, { select: ['name', 'value', '-_id'] }, quiet)
          : await f.pub._read({}, { select: ['name', 'value', '-_id'] }, quiet);
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
      expect(result).not.toHaveProperty('data');
      expect(f.hook).toHaveBeenCalledTimes(1);
    },
  );

  it('rechecks current selected native structure on an issued trusted helper without rerunning hooks', async () => {
    const f = fixture();
    f.adapter.find.mockResolvedValue([{ name: 'selected', value: code({ selected: true }) }]);
    const result = await f.service.find({}, { select: ['name', 'value', '-_id'] }, quiet);
    if (!result.success) throw new Error(result.code);
    const row = result.data[0] as Record<string, unknown>;
    const documentAuthorization = result.contexts[0].documentAuthorization;
    expect((row.value as InstanceType<typeof B.Code>).scope).toEqual({ selected: true });
    row.value = ref({ expanded: Array(20001).fill('selected') });
    await expect(f.service.pickAllowedFields(row, 'list', { documentAuthorization })).rejects.toBeInstanceOf(
      ServiceAuthorizationError,
    );
    row.value = code({ selected: true });
    expect(await f.service.pickAllowedFields(row, 'list', { documentAuthorization })).toEqual({
      name: 'selected',
      value: code({ selected: true }),
    });
    expect(f.hook).toHaveBeenCalledTimes(1);
    expect(f.rule).toHaveBeenCalledTimes(2);
  });

  it('omits invalid native virtual returns without reading accessors or rejecting unselected source graphs', async () => {
    const getter = vi.fn(() => 'never');
    const invalid = vi.fn(() => code(Object.defineProperty({}, 'selected', { enumerable: true, get: getter })));
    const supported = ref({ selected: true });
    const valid = vi.fn(() => supported);
    const f = fixture({
      alwaysSelectFields: ['hidden'],
      permissionSchema: { name: true, invalid: true, valid: true },
      virtuals: {
        invalid: { dependsOn: ['name'], get: invalid },
        valid: { dependsOn: ['name'], get: valid },
      },
    });
    f.adapter.find.mockResolvedValue([
      { name: 'selected', hidden: code({ huge: Array(21000), cycle: new Proxy({}, {}) }) },
    ]);
    const result = await f.service.find({}, { select: ['name', 'invalid', 'valid', '-_id'] }, quiet);
    expect(result).toMatchObject({ success: true, data: [{ name: 'selected', valid: supported }] });
    if (result.success) expect(result.data[0]).not.toHaveProperty('invalid');
    expect(getter).not.toHaveBeenCalled();
    expect(invalid).toHaveBeenCalledTimes(1);
    expect(valid).toHaveBeenCalledTimes(1);
    expect(f.hook).toHaveBeenCalledTimes(1);
  });

  it('never publishes partial output after exhausting the shared budget in a native virtual return', async () => {
    const getter = vi.fn(() => code({ expanded: Array(20001).fill('selected') }));
    const f = fixture({
      permissionSchema: { name: true, computed: true },
      virtuals: { computed: { dependsOn: ['name'], get: getter } },
    });
    f.adapter.find.mockResolvedValue([{ name: 'selected' }]);
    const result = await f.service.find({}, { select: ['name', 'computed', '-_id'] }, quiet);
    expect(result).toMatchObject({ success: false, code: 'bad_request' });
    expect(result).not.toHaveProperty('data');
    expect(getter).toHaveBeenCalledTimes(1);
    expect(f.hook).toHaveBeenCalledTimes(1);
  });
});
