import { afterEach, describe, expect, it, vi } from 'vitest';
import { mongo } from 'mongoose';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import type { AccessRouterRequest } from '../src/interfaces/request';
import type { DocumentAuthorization, ServiceOutputContext } from '../src/interfaces/service-authorization';
import type { AuthorizationBinding, ResolveServiceAuthorizationInput } from '../src/acl/service-authorization';
import * as serviceAuthorization from '../src/acl/service-authorization';
import * as fieldAuthorization from '../src/acl/field-authorization';
import {
  createDocumentAuthorizationStage,
  memoizeDocumentFieldDecision,
  readDocumentAuthorization,
  resolveDocumentAuthorization,
} from '../src/acl/document-authorization';
import {
  evaluateAuthorizedOutputField,
  requestOutputFieldPaths,
  resolveOutputDocumentAuthorization,
} from '../src/acl/output-field-filter';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';
import { finalizeModelOutput, finalizeModelOutputs, type FinalizeSnapshot } from '../src/output/finalize-model-output';

const access = { operation: 'read', virtualAccess: 'read', outputAccess: 'read', docPermissionsAccess: 'read' };
const { resolveServiceAuthorization, ServiceAuthorizationError } = serviceAuthorization;

function fixture(schema: Record<string, unknown>, extra: Partial<ResolveServiceAuthorizationInput> = {}) {
  const input: ResolveServiceAuthorizationInput = {
    binding: {
      request: { actor: 'original' } as unknown as AccessRouterRequest,
      runtime: new AccessRuntime(),
      model: {},
      modelName: 'Order',
    },
    access,
    configuration: {
      catalog: { paths: [...Object.keys(schema), '_id'] },
      permissionSchema: schema,
      modelPermissionPrefix: 'doc:',
      stripPermissionsField: true,
    },
    requestPermissions: new Permission({ reader: true, admin: false }),
    ...extra,
  };
  const authorization = resolveServiceAuthorization(input);
  const plan = planAuthorizedModelProjection({ authorization, binding: input.binding, requestedSelect: ['-_id'] });
  const args = {
    receivingModelName: 'Order',
    request: input.binding.request,
    plan,
    snapshot: input.configuration as FinalizeSnapshot,
    ...input.access,
  };
  const document = (snapshot: Record<string, unknown>, options: { knownOutput?: boolean } = {}) =>
    resolveOutputDocumentAuthorization({
      authorization,
      binding: input.binding,
      snapshot,
      context: { modelName: 'Order', operation: input.access.operation },
      ...options,
    });
  return { input, authorization, binding: input.binding, plan, args, document };
}

afterEach(() => vi.restoreAllMocks());

describe('ARCPU-02 call-owned field-policy preparation', () => {
  it.each([1, 7])('prepares three no-virtual static fields once for %s rows, not per row', async (rows) => {
    const hook = vi.fn(() => ({ privateGrant: true }));
    const schema = { public: true, global: 'reader', alternative: ['reader', ['doc:owner']] };
    const f = fixture(schema, {
      configuration: {
        catalog: { paths: [...Object.keys(schema), '_id'] },
        permissionSchema: schema,
        modelPermissionPrefix: 'doc:',
        stripPermissionsField: true,
        docPermissions: { read: hook },
      },
    });
    expect(f.plan.candidates).toEqual([]);
    expect(f.plan.childPlans).toEqual({});
    const read = vi.spyOn(serviceAuthorization, 'readServiceOutputFieldAuthorization');
    const extract = vi.spyOn(fieldAuthorization, 'extractOutputFieldRuleEntries');
    const prepare = vi.spyOn(fieldAuthorization, 'prepareRequestFieldRule');
    const evaluate = vi.spyOn(fieldAuthorization, 'evaluateScopedAccessRule');
    const contexts: ServiceOutputContext[] = [];
    const inputs = Array.from({ length: rows }, (_, index) => ({
      _id: 'same',
      public: `public:${index}`,
      global: `global:${index}`,
      alternative: `alternative:${index}`,
    }));
    const output = await finalizeModelOutputs({
      ...f.args,
      inputs,
      onFinalized: (_output, context, index) => {
        contexts[index!] = context;
      },
    });
    expect(output).toEqual(inputs.map(({ _id: _ignored, ...row }) => row));
    expect(new Set(contexts.map((context) => context.documentAuthorization)).size).toBe(rows);
    expect(hook).toHaveBeenCalledTimes(rows);
    expect(read).toHaveBeenCalledTimes(1);
    expect(extract).toHaveBeenCalledTimes(3);
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(evaluate).not.toHaveBeenCalled();
    for (const context of contexts) {
      for (const field of Object.keys(schema)) {
        expect(await evaluateAuthorizedOutputField(context.documentAuthorization, f.binding, field)).toBe(true);
      }
    }
    expect(read).toHaveBeenCalledTimes(1);
    expect(extract).toHaveBeenCalledTimes(3);
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('consults an authenticated document memo before even the first configuration/rule preparation', async () => {
    const rule = vi.fn(() => false);
    const f = fixture({ value: rule });
    const handle = await f.document({ value: 'visible' });
    await memoizeDocumentFieldDecision(handle, f.binding, 'output:value', () => true);
    const read = vi.spyOn(serviceAuthorization, 'readServiceOutputFieldAuthorization');
    const extract = vi.spyOn(fieldAuthorization, 'extractOutputFieldRuleEntries');
    const prepare = vi.spyOn(fieldAuthorization, 'prepareRequestFieldRule');
    expect(await evaluateAuthorizedOutputField(handle, f.binding, 'value')).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(rule).not.toHaveBeenCalled();
    expect(() =>
      evaluateAuthorizedOutputField(handle, { ...f.binding, request: {} as AccessRouterRequest }, 'value'),
    ).toThrow(ServiceAuthorizationError);
  });

  it('keeps mixed global/document rules, stateful decisions and backend grants separate from request metadata', async () => {
    let request!: AccessRouterRequest;
    const rule = vi.fn(function (this: AccessRouterRequest, permissions, grants) {
      expect(this).toBe(request);
      expect(permissions.has('reader')).toBe(true);
      expect(permissions.has('admin')).toBe(false);
      expect(grants.privateGrant).toBe(true);
      return grants.owner === true;
    });
    const backendRule = vi.fn(() => false);
    const hook = vi.fn((doc) => ({ owner: doc.ownerId === 'original', privateGrant: true }));
    const schema = {
      global: 'reader',
      owner: 'doc:owner',
      both: 'reader doc:owner',
      either: ['reader', 'doc:owner'],
      impossible: 'admin doc:owner',
      deferred: rule,
      denied: false,
      backend: backendRule,
    };
    const f = fixture(schema, {
      authorization: { outputFields: { mode: 'grant', paths: ['backend'] } },
      configuration: {
        catalog: { paths: [...Object.keys(schema), 'ownerId', '_id'] },
        permissionSchema: schema,
        modelPermissionPrefix: 'doc:',
        stripPermissionsField: true,
        docPermissions: { read: hook },
      },
    });
    request = f.binding.request;
    const contexts: ServiceOutputContext[] = [];
    const output = await finalizeModelOutputs({
      ...f.args,
      inputs: ['original', 'other'].map((ownerId) => ({
        _id: 'same',
        ownerId,
        ...Object.fromEntries(Object.keys(schema).map((path) => [path, path])),
      })),
      onFinalized: (_output, context, index) => {
        contexts[index!] = context;
      },
    });
    expect(output).toEqual([
      { global: 'global', owner: 'owner', both: 'both', either: 'either', deferred: 'deferred', backend: 'backend' },
      { global: 'global', either: 'either', backend: 'backend' },
    ]);
    expect(rule).toHaveBeenCalledTimes(2);
    expect(backendRule).not.toHaveBeenCalled();
    rule.mockImplementation(() => false);
    const metadata = await Promise.all(
      contexts.map((context) => requestOutputFieldPaths(context.documentAuthorization, f.binding, 'read')),
    );
    expect(metadata).toEqual([
      ['global', 'owner', 'both', 'either', 'deferred'],
      ['global', 'either'],
    ]);
    for (const context of contexts) {
      expect(await evaluateAuthorizedOutputField(context.documentAuthorization, f.binding, 'backend')).toBe(true);
    }
    expect(rule).toHaveBeenCalledTimes(2);
    expect(backendRule).toHaveBeenCalledTimes(2);
    expect(hook).toHaveBeenCalledTimes(2);
  });

  it('does not trust replaced plan fieldStates, even after another field/call has warmed the cache', async () => {
    const f = fixture({ public: true, denied: false, deferred: () => false });
    const first = await f.document({ public: 'yes' });
    expect(await evaluateAuthorizedOutputField(first, f.binding, 'public')).toBe(true);
    f.plan.fieldStates = { public: 'denied', denied: 'granted', deferred: 'granted' };
    f.plan.outputPersistedFields.push('denied', 'deferred');
    const output = await finalizeModelOutput({
      ...f.args,
      input: { public: 'yes', denied: 'never', deferred: 'never' },
    });
    expect(output).toEqual({ public: 'yes' });
  });

  it('preserves earlier ancestor callbacks before static denials, but bypasses them for backend grants', async () => {
    const ancestor = vi.fn(() => true);
    const schema = { branch: { read: ancestor, sub: { value: false, sibling: true } } };
    const f = fixture(schema, {
      configuration: {
        catalog: { paths: ['branch', 'branch.value', 'branch.sibling'], containerPaths: ['branch'] },
        permissionSchema: schema,
      },
    });
    const denied = await f.document({ branch: { value: 'never' } });
    expect(await evaluateAuthorizedOutputField(denied, f.binding, 'branch.value')).toBe(false);
    expect(ancestor).toHaveBeenCalledTimes(1);
    ancestor.mockImplementation(() => false);
    expect(await evaluateAuthorizedOutputField(denied, f.binding, 'branch.sibling')).toBe(true);
    expect(ancestor).toHaveBeenCalledTimes(1); // Same-stage ancestor decision, not a second callback.
    const call = resolveServiceAuthorization({
      ...f.input,
      authorization: { outputFields: { mode: 'grant', paths: ['branch.value'] } },
    });
    const granted = await resolveDocumentAuthorization(
      createDocumentAuthorizationStage(call, f.binding, {}),
      () => ({}),
    );
    expect(await evaluateAuthorizedOutputField(granted, f.binding, 'branch.value')).toBe(true);
    expect(ancestor).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('retains request memo decisions across exact and nested lookup routes: %s', async (exact) => {
    const rule = vi.fn(() => exact);
    const schema = {
      'branch.value': rule,
      branch: { read: true, sub: { value: { read: !exact, sub: { deep: true } } } },
    };
    const f = fixture(schema, {
      configuration: {
        catalog: { paths: ['branch', 'branch.value', 'branch.value.deep'] },
        permissionSchema: schema,
      },
    });
    const handle = await f.document({});
    expect(await evaluateAuthorizedOutputField(handle, f.binding, 'branch.value')).toBe(exact);
    expect(await evaluateAuthorizedOutputField(handle, f.binding, 'branch.value.deep')).toBe(exact);
    expect(rule).toHaveBeenCalledTimes(1);
  });

  it.each(['root', 'ancestor', 'sub'] as const)(
    'does not freeze live function-backed schema lookup properties across stages: %s',
    async (kind) => {
      const dynamic = Object.assign(() => true, { value: true, sub: { value: true } });
      const schema =
        kind === 'root' ? dynamic : { branch: kind === 'ancestor' ? dynamic : { read: true, sub: dynamic } };
      const base = fixture({});
      const authorization = resolveServiceAuthorization({
        ...base.input,
        configuration: { catalog: { paths: ['value', 'branch.value'] }, permissionSchema: schema },
      });
      const field = kind === 'root' ? 'value' : 'branch.value';
      const make = () =>
        resolveDocumentAuthorization(createDocumentAuthorizationStage(authorization, base.binding, {}), () => ({}));
      const first = await make();
      expect(await evaluateAuthorizedOutputField(first, base.binding, field)).toBe(true);
      dynamic.value = false;
      dynamic.sub.value = false;
      const second = await make();
      expect(await evaluateAuthorizedOutputField(second, base.binding, field)).toBe(false);
      expect(await evaluateAuthorizedOutputField(first, base.binding, field)).toBe(true);
      if (kind === 'root') {
        Object.assign(dynamic, { added: true });
        expect(await requestOutputFieldPaths(second, base.binding, 'read')).toEqual(['added']);
      }
    },
  );

  it.each([false, true])(
    'preserves exact dotted-rule precedence without conflating nested lookup routes: %s',
    async (reverse) => {
      const schema = {
        'branch.value': true,
        branch: { read: true, sub: { value: { read: false, sub: { deep: true } } } },
      };
      const f = fixture(schema, {
        configuration: {
          catalog: { paths: ['branch', 'branch.value', 'branch.value.deep'] },
          permissionSchema: schema,
        },
      });
      const lookups: Array<[string, boolean]> = [
        ['branch.value', true],
        ['branch.value.deep', false],
      ];
      if (reverse) lookups.reverse();
      for (let row = 0; row < 2; row++) {
        for (const [field, allowed] of lookups) {
          const handle = await f.document({});
          expect(await evaluateAuthorizedOutputField(handle, f.binding, field)).toBe(allowed);
        }
      }
    },
  );

  it('keeps access-specific rules, distinct stages and separate calls independent', async () => {
    const readRule = vi.fn((_permissions, grants) => grants.reader === true);
    const updateRule = vi.fn((_permissions, grants) => grants.writer === true);
    const f = fixture({ value: { read: readRule, update: updateRule } });
    const snapshot = { _id: 'same', value: 'value' };
    const make = (reader: boolean, writer: boolean) =>
      resolveDocumentAuthorization(createDocumentAuthorizationStage(f.authorization, f.binding, snapshot), () => ({
        reader,
        writer,
      }));
    const a = await make(true, false);
    const b = await make(false, true);
    const read = vi.spyOn(serviceAuthorization, 'readServiceOutputFieldAuthorization');
    const prepare = vi.spyOn(fieldAuthorization, 'prepareRequestFieldRule');
    expect(await evaluateAuthorizedOutputField(a, f.binding, 'value')).toBe(true);
    expect(await evaluateAuthorizedOutputField(b, f.binding, 'value')).toBe(false);
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(await requestOutputFieldPaths(a, f.binding, 'read')).toEqual(['value']);
      expect(await requestOutputFieldPaths(b, f.binding, 'read')).toEqual([]);
      expect(await requestOutputFieldPaths(a, f.binding, 'update')).toEqual([]);
      expect(await requestOutputFieldPaths(b, f.binding, 'update')).toEqual(['value']);
    }
    expect(read).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(readRule).toHaveBeenCalledTimes(2);
    expect(updateRule).toHaveBeenCalledTimes(2);
    const update = resolveServiceAuthorization({
      ...f.input,
      access: { operation: 'update', virtualAccess: 'update', outputAccess: 'update', docPermissionsAccess: 'update' },
    });
    const handle = await resolveDocumentAuthorization(
      createDocumentAuthorizationStage(update, f.binding, snapshot),
      () => ({ reader: true, writer: false }),
    );
    expect(await evaluateAuthorizedOutputField(handle, f.binding, 'value')).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(updateRule).toHaveBeenCalledTimes(3);
  });
});

describe('ARCPU-02 classification and native-leaf isolation', () => {
  for (const knownOutput of [false, true]) {
    it.each([false, true])(
      `does not normalize invalid function-backed native rules into grants (trimmed: ${knownOutput}, array: %s)`,
      async (array) => {
        const native = new mongo.BSON.Long(1, 2);
        const schema = Object.assign(() => {}, { value: array ? [native] : native });
        const base = fixture({});
        const authorization = resolveServiceAuthorization({
          ...base.input,
          configuration: {
            catalog: { paths: ['value'] },
            permissionSchema: schema,
            modelPermissionPrefix: { length: 4, toString: () => 'doc:' },
          },
        });
        const descriptor = Object.getOwnPropertyDescriptor(mongo.BSON.Long.prototype, 'toBSON');
        try {
          Object.defineProperty(mongo.BSON.Long.prototype, 'toBSON', { configurable: true, value: () => 'reader' });
          const handle = await resolveOutputDocumentAuthorization({
            authorization,
            binding: base.binding,
            snapshot: {},
            context: { modelName: 'Order' },
            knownOutput,
          });
          expect(await evaluateAuthorizedOutputField(handle, base.binding, 'value')).toBe(false);
        } finally {
          if (descriptor) Object.defineProperty(mongo.BSON.Long.prototype, 'toBSON', descriptor);
          else Reflect.deleteProperty(mongo.BSON.Long.prototype, 'toBSON');
        }
      },
    );
  }

  it('does not freeze rules normalized from native BSON when wire hooks change between stages', async () => {
    const base = fixture({});
    const authorization = resolveServiceAuthorization({
      ...base.input,
      configuration: {
        catalog: { paths: ['value'] },
        permissionSchema: { value: new mongo.BSON.Long(1, 2) },
      },
    });
    const descriptor = Object.getOwnPropertyDescriptor(mongo.BSON.Long.prototype, 'toBSON');
    let allowed = true;
    try {
      Object.defineProperty(mongo.BSON.Long.prototype, 'toBSON', {
        configurable: true,
        value: () => allowed,
      });
      const make = () =>
        resolveDocumentAuthorization(createDocumentAuthorizationStage(authorization, base.binding, {}), () => ({}));
      const first = await make();
      expect(await evaluateAuthorizedOutputField(first, base.binding, 'value')).toBe(true);
      allowed = false;
      const second = await make();
      const fresh = serviceAuthorization.readServiceOutputFieldAuthorization(authorization, base.binding);
      expect(fresh.reusable).toBe(false); // Proven from stored native input, not its normalized boolean view.
      expect((fresh.permissionSchema as { value: unknown }).value).toBe(false);
      expect(await evaluateAuthorizedOutputField(second, base.binding, 'value')).toBe(false);
      expect(await evaluateAuthorizedOutputField(first, base.binding, 'value')).toBe(true);
    } finally {
      if (descriptor) Object.defineProperty(mongo.BSON.Long.prototype, 'toBSON', descriptor);
      else Reflect.deleteProperty(mongo.BSON.Long.prototype, 'toBSON');
    }
  });

  it('does not freeze a prefix normalized from native BSON between stages', async () => {
    const base = fixture({});
    const authorization = resolveServiceAuthorization({
      ...base.input,
      configuration: {
        catalog: { paths: ['value'] },
        permissionSchema: { value: 'doc:owner' },
        modelPermissionPrefix: new mongo.BSON.Long(1, 2),
      },
    });
    const descriptor = Object.getOwnPropertyDescriptor(mongo.BSON.Long.prototype, 'toBSON');
    let prefix = 'doc:';
    try {
      Object.defineProperty(mongo.BSON.Long.prototype, 'toBSON', { configurable: true, value: () => prefix });
      const make = () =>
        resolveDocumentAuthorization(createDocumentAuthorizationStage(authorization, base.binding, {}), () => ({
          owner: true,
        }));
      const first = await make();
      expect(await evaluateAuthorizedOutputField(first, base.binding, 'value')).toBe(true);
      prefix = 'other:';
      const second = await make();
      expect(await evaluateAuthorizedOutputField(second, base.binding, 'value')).toBe(false);
      expect(await evaluateAuthorizedOutputField(first, base.binding, 'value')).toBe(true);
    } finally {
      if (descriptor) Object.defineProperty(mongo.BSON.Long.prototype, 'toBSON', descriptor);
      else Reflect.deleteProperty(mongo.BSON.Long.prototype, 'toBSON');
    }
  });

  it('does not bypass native rule rejection after an earlier stage warmed field preparation', async () => {
    const base = fixture({});
    const authorization = resolveServiceAuthorization({
      ...base.input,
      configuration: { catalog: { paths: ['value'] }, permissionSchema: { value: new mongo.BSON.Long(1, 2) } },
    });
    const make = () =>
      resolveDocumentAuthorization(createDocumentAuthorizationStage(authorization, base.binding, {}), () => ({}));
    expect(await evaluateAuthorizedOutputField(await make(), base.binding, 'value')).toBe(false);
    const version = Symbol.for('@@mdb.bson.version');
    const descriptor = Object.getOwnPropertyDescriptor(mongo.BSON.BSONValue.prototype, version)!;
    try {
      Object.defineProperty(mongo.BSON.BSONValue.prototype, version, { ...descriptor, get: () => -1 });
      await expect(evaluateAuthorizedOutputField(await make(), base.binding, 'value')).rejects.toBeInstanceOf(
        ServiceAuthorizationError,
      );
    } finally {
      Object.defineProperty(mongo.BSON.BSONValue.prototype, version, descriptor);
    }
  });

  it('preserves coercion receiver identity per field read and per metadata resolution', async () => {
    const seen = new WeakSet<object>();
    const receivers: object[] = [];
    const prefix = {
      length: 4,
      toString() {
        receivers.push(this);
        const repeated = seen.has(this);
        seen.add(this);
        return repeated ? 'other:' : 'doc:';
      },
    };
    const base = fixture({});
    const authorization = resolveServiceAuthorization({
      ...base.input,
      configuration: {
        catalog: { paths: ['first', 'second'] },
        permissionSchema: { first: 'doc:owner', second: 'doc:owner' },
        modelPermissionPrefix: prefix,
      },
    });
    const make = () =>
      resolveDocumentAuthorization(createDocumentAuthorizationStage(authorization, base.binding, {}), () => ({
        owner: true,
      }));
    for (let row = 0; row < 2; row++) {
      const handle = await make();
      expect(await evaluateAuthorizedOutputField(handle, base.binding, 'first')).toBe(true);
      expect(await evaluateAuthorizedOutputField(handle, base.binding, 'second')).toBe(true);
    }
    expect(await requestOutputFieldPaths(await make(), base.binding, 'read')).toEqual(['first']);
    expect(receivers).toHaveLength(6);
    expect(new Set(receivers.slice(0, 4)).size).toBe(4);
    expect(receivers[4]).toBe(receivers[5]);
    expect(receivers[4]).not.toBe(prefix);
  });

  it('retains current classification and conservatively defers unprefixed runtime document grants', async () => {
    const permissions = new Permission({ reader: true, admin: false });
    const fn = vi.fn(() => true);
    const native = [new Date(1), Buffer.from([1]), new Map([['key', true]]), new mongo.BSON.ObjectId()];
    const rules = [
      true,
      false,
      undefined,
      'reader',
      'admin',
      'doc:owner',
      'reader doc:owner',
      'admin doc:owner',
      ['admin', ['reader', 'doc:owner']],
      [],
      [false, ...native],
      ...native,
      fn,
    ];
    for (const prefix of ['', 'doc:']) {
      for (const rule of rules) {
        const prepared = fieldAuthorization.prepareRequestFieldRule(rule, permissions, prefix);
        expect(prepared.state).toBe(fieldAuthorization.classifyRequestFieldRule(rule, permissions, prefix));
        if (prepared.decision !== undefined) {
          for (const docPermissions of [{}, { admin: true, owner: true }]) {
            expect(
              await fieldAuthorization.evaluateScopedAccessRule({
                req: {},
                rule,
                globalPermissions: permissions,
                docPermissions,
                modelPermissionPrefix: prefix,
              }),
            ).toBe(prepared.decision);
          }
        }
      }
    }
    expect(fn).not.toHaveBeenCalled();
    expect(fieldAuthorization.prepareRequestFieldRule('admin', permissions, 'doc:')).toEqual({
      state: 'denied',
      decision: undefined,
    });
    const f = fixture({ value: 'admin' });
    const handle = await resolveDocumentAuthorization(
      createDocumentAuthorizationStage(f.authorization, f.binding, {}),
      () => ({ admin: true }),
    );
    expect(await evaluateAuthorizedOutputField(handle, f.binding, 'value')).toBe(true);
    const trimmed = await f.document({}, { knownOutput: true });
    expect(await evaluateAuthorizedOutputField(trimmed, f.binding, 'value')).toBe(false);
  });

  it('copies native-valued/coercible prefix configuration for every evaluation rather than sharing cache leaves', async () => {
    const seen: object[] = [];
    const prefix = {
      length: 4,
      when: new Date(1),
      bytes: Buffer.from([1]),
      id: new mongo.BSON.ObjectId(),
      decimal: mongo.BSON.Decimal128.fromString('1.2'),
      long: mongo.BSON.Long.fromNumber(4),
      map: new Map([['when', new Date(2)]]),
      toString() {
        expect(this.when.getTime()).toBe(1);
        expect(this.bytes[0]).toBe(1);
        expect(this.id.equals(prefix.id)).toBe(true);
        expect(this.decimal.toString()).toBe('1.2');
        expect(this.long.toNumber()).toBe(4);
        expect(this.map.get('when')!.getTime()).toBe(2);
        seen.push(this);
        this.when.setTime(99);
        this.bytes[0] = 9;
        this.id.id = Buffer.alloc(12);
        this.decimal.bytes[0] ^= 255;
        this.long.low = 99;
        this.map.clear();
        return 'doc:';
      },
    };
    const schema = { first: 'doc:owner', second: ['doc:owner', [prefix.when, prefix.map]] };
    // Exercise the runtime fallback directly: the existing projection planner
    // itself coerces open/non-string prefixes and is outside this cache's scope.
    const base = fixture({});
    const authorization = resolveServiceAuthorization({
      ...base.input,
      configuration: {
        catalog: { paths: Object.keys(schema) },
        permissionSchema: schema,
        modelPermissionPrefix: prefix,
      },
    });
    const read = vi.spyOn(serviceAuthorization, 'readServiceOutputFieldAuthorization');
    for (let row = 0; row < 2; row++) {
      const handle = await resolveDocumentAuthorization(
        createDocumentAuthorizationStage(authorization, base.binding, {}),
        () => ({ owner: true }),
      );
      expect(await evaluateAuthorizedOutputField(handle, base.binding, 'first')).toBe(true);
      expect(await evaluateAuthorizedOutputField(handle, base.binding, 'second')).toBe(true);
      expect(await evaluateAuthorizedOutputField(handle, base.binding, 'first')).toBe(true);
    }
    // Native-bearing slices cannot be retained as call-invariant read results.
    expect(read).toHaveBeenCalledTimes(4);
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);
    const captured = serviceAuthorization.readServiceOutputFieldAuthorization(authorization, base.binding)
      .modelPermissionPrefix as typeof prefix;
    expect(captured.when.getTime()).toBe(1);
    expect(captured.bytes[0]).toBe(1);
    expect(captured.id.equals(prefix.id)).toBe(true);
    expect(captured.decimal.toString()).toBe('1.2');
    expect(captured.long.toNumber()).toBe(4);
    expect(captured.map.get('when')!.getTime()).toBe(2);
    expect(prefix.when.getTime()).toBe(1);
    expect(prefix.map.size).toBe(1);
    captured.when.setTime(99);
    captured.map.clear();
    const next = await resolveDocumentAuthorization(
      createDocumentAuthorizationStage(authorization, base.binding, {}),
      () => ({ owner: true }),
    );
    expect(await evaluateAuthorizedOutputField(next, base.binding, 'first')).toBe(true);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('does not share mutable callback grants between fields or rows', async () => {
    const seen: object[] = [];
    const native = { when: new Date(1), bytes: Buffer.from([1]), id: new mongo.BSON.ObjectId() };
    const rule = vi.fn((_permissions, grants) => {
      expect(grants.when.getTime()).toBe(1);
      expect(grants.bytes[0]).toBe(1);
      expect(grants.id.equals(native.id)).toBe(true);
      seen.push(grants.when);
      grants.when.setTime(99);
      grants.bytes[0] = 9;
      grants.id.id = Buffer.alloc(12);
      return true;
    });
    const f = fixture({ first: rule, second: rule });
    for (let row = 0; row < 2; row++) {
      const handle = await resolveDocumentAuthorization(
        createDocumentAuthorizationStage(f.authorization, f.binding, {}),
        () => native,
      );
      expect(await evaluateAuthorizedOutputField(handle, f.binding, 'first')).toBe(true);
      expect(await evaluateAuthorizedOutputField(handle, f.binding, 'second')).toBe(true);
      expect((readDocumentAuthorization(handle, f.binding).grants.when as Date).getTime()).toBe(1);
    }
    expect(rule).toHaveBeenCalledTimes(4);
    expect(new Set(seen).size).toBe(4);
    expect(native.when.getTime()).toBe(1);
    expect(native.bytes[0]).toBe(1);
  });

  it('never recovers deferred grants or reruns document hooks on known trimmed DTOs', async () => {
    const rule = vi.fn(() => true);
    const hook = vi.fn(() => ({ owner: true }));
    const schema = { public: true, owner: 'doc:owner', deferred: rule, backend: false };
    const f = fixture(schema, {
      authorization: { outputFields: { mode: 'grant', paths: ['backend'] } },
      configuration: {
        catalog: { paths: Object.keys(schema) },
        permissionSchema: schema,
        modelPermissionPrefix: 'doc:',
        docPermissions: { read: hook },
      },
    });
    const original = await f.document({});
    expect(await evaluateAuthorizedOutputField(original, f.binding, 'owner')).toBe(true);
    const trimmed = await f.document({ public: 'yes', owner: 'old', deferred: 'old' }, { knownOutput: true });
    expect(await evaluateAuthorizedOutputField(trimmed, f.binding, 'public')).toBe(true);
    expect(await evaluateAuthorizedOutputField(trimmed, f.binding, 'owner')).toBe(false);
    expect(await evaluateAuthorizedOutputField(trimmed, f.binding, 'deferred')).toBe(false);
    expect(await evaluateAuthorizedOutputField(trimmed, f.binding, 'backend')).toBe(true);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(rule).not.toHaveBeenCalled();
  });
});

describe('ARCPU-02 memo-hit and owning-stage validation', () => {
  it.each(['date', 'buffer', 'bson', 'nested'] as const)(
    'rejects a mutated %s stage on a warmed static hit',
    async (kind) => {
      const f = fixture({ value: true });
      const snapshot = {
        when: new Date(1),
        bytes: Buffer.from([1]),
        id: new mongo.BSON.ObjectId(),
        nested: { value: 1 },
      };
      const handle = await f.document(snapshot);
      expect(await evaluateAuthorizedOutputField(handle, f.binding, 'value')).toBe(true);
      if (kind === 'date') snapshot.when.setTime(2);
      if (kind === 'buffer') snapshot.bytes[0] = 2;
      if (kind === 'bson') snapshot.id.id = Buffer.alloc(12);
      if (kind === 'nested') snapshot.nested.value = 2;
      expect(() => evaluateAuthorizedOutputField(handle, f.binding, 'value')).toThrow(ServiceAuthorizationError);
    },
  );

  it.each(['snapshot', 'binding'] as const)('revalidates %s after lookup of an already-settled memo', async (kind) => {
    const f = fixture({ value: true });
    const snapshot = { when: new Date(1) };
    const binding = { ...f.binding };
    const handle = await f.document(snapshot);
    expect(await evaluateAuthorizedOutputField(handle, binding, 'value')).toBe(true);
    const cached = evaluateAuthorizedOutputField(handle, binding, 'value');
    if (kind === 'snapshot') snapshot.when.setTime(2);
    else binding.model = {};
    await expect(cached).rejects.toBeInstanceOf(ServiceAuthorizationError);
  });

  it.each(['snapshot', 'binding'] as const)('revalidates %s after a deferred user callback', async (kind) => {
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rule = vi.fn(async () => {
      entered();
      await waiting;
      return true;
    });
    const f = fixture({ value: rule });
    const snapshot = { when: new Date(1) };
    const handle = await f.document(snapshot);
    const binding = { ...f.binding };
    const pending = evaluateAuthorizedOutputField(handle, binding, 'value');
    await started;
    const cached = evaluateAuthorizedOutputField(handle, binding, 'value');
    if (kind === 'snapshot') snapshot.when.setTime(2);
    else binding.model = {};
    release();
    await expect(pending).rejects.toBeInstanceOf(ServiceAuthorizationError);
    await expect(cached).rejects.toBeInstanceOf(ServiceAuthorizationError);
    expect(rule).toHaveBeenCalledTimes(1);
  });

  async function embedded(leafRule: unknown = true, parentRule: unknown = true) {
    const f = fixture(
      { children: { read: parentRule, sub: { value: leafRule } } },
      {
        configuration: {
          catalog: { paths: ['children', 'children.value'], containerPaths: ['children'] },
          permissionSchema: { children: { read: parentRule, sub: { value: leafRule } } },
          modelPermissionPrefix: 'doc:',
        },
      },
    );
    const snapshot = { private: new Date(1) };
    const parent = await f.document(snapshot);
    const binding: AuthorizationBinding = { ...f.binding, scopePath: ['children'] };
    const authorization = resolveServiceAuthorization({ ...f.input, binding, parent: f.authorization });
    const children: DocumentAuthorization[] = [];
    for (const value of ['first', 'second']) {
      children.push(
        await resolveOutputDocumentAuthorization({
          authorization,
          binding,
          snapshot: { value },
          context: { modelName: 'Order' },
          owningDocument: parent,
          owningBinding: f.binding,
        }),
      );
    }
    return { ...f, snapshot, parent, childBinding: binding, children };
  }

  it('retains owning-parent routing once and per-element leaf decisions with shared rule preparation', async () => {
    const parentRule = vi.fn(() => true);
    const leafRule = vi.fn(() => true);
    const f = await embedded(leafRule, parentRule);
    const extract = vi.spyOn(fieldAuthorization, 'extractOutputFieldRuleEntries');
    for (const handle of f.children) {
      expect(await evaluateAuthorizedOutputField(handle, f.childBinding, 'value')).toBe(true);
      expect(await evaluateAuthorizedOutputField(handle, f.childBinding, 'value')).toBe(true);
    }
    expect(extract).toHaveBeenCalledTimes(1);
    expect(parentRule).toHaveBeenCalledTimes(1);
    expect(leafRule).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    'classifies ancestor rules against the routed owner, not the child permission view: %s',
    async (reader) => {
      const f = await embedded(true, 'reader');
      const binding = f.childBinding;
      const authorization = resolveServiceAuthorization({
        ...f.input,
        binding,
        parent: f.authorization,
        requestPermissions: new Permission({ reader }),
      });
      const child = await resolveOutputDocumentAuthorization({
        authorization,
        binding,
        snapshot: {},
        context: { modelName: 'Order' },
        owningDocument: f.parent,
        owningBinding: f.binding,
      });
      expect(await evaluateAuthorizedOutputField(child, binding, 'value')).toBe(true);
    },
  );

  it.each([false, true])('validates the owning stage on static child hits (mutate after lookup: %s)', async (after) => {
    const f = await embedded();
    const handle = f.children[0];
    expect(await evaluateAuthorizedOutputField(handle, f.childBinding, 'value')).toBe(true);
    if (after) {
      const cached = evaluateAuthorizedOutputField(handle, f.childBinding, 'value');
      f.snapshot.private.setTime(2);
      await expect(cached).rejects.toBeInstanceOf(ServiceAuthorizationError);
    } else {
      f.snapshot.private.setTime(2);
      expect(() => evaluateAuthorizedOutputField(handle, f.childBinding, 'value')).toThrow(ServiceAuthorizationError);
    }
  });

  it('rejects a child rule that mutates retained owning-parent values', async () => {
    let mutate = () => {};
    const leaf = vi.fn(() => {
      mutate();
      return true;
    });
    const f = await embedded(leaf);
    mutate = () => {
      f.snapshot.private.setTime(2);
    };
    await expect(evaluateAuthorizedOutputField(f.children[0], f.childBinding, 'value')).rejects.toBeInstanceOf(
      ServiceAuthorizationError,
    );
    expect(leaf).toHaveBeenCalledTimes(1);
  });
});
