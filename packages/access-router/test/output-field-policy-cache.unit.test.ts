import { afterEach, describe, expect, it, vi } from 'vitest';
import { mongo } from 'mongoose';
import Permission from '../src/permission';
import type { DocumentGrants } from '../src/interfaces';
import * as fieldAuthorization from '../src/acl/field-authorization';
import * as serviceAuthorization from '../src/acl/service-authorization';
import {
  createDocumentStage,
  documentStageSource,
  memoizeStageFieldDecision,
  prepareEmbeddedDocumentStage,
  readDocumentStage,
  resolveDocumentStage,
} from '../src/acl/document-stage';
import {
  authorizeEmbeddedOutputPlan,
  evaluateAuthorizedOutputField,
  requestOutputFieldPaths,
} from '../src/acl/output-field-filter';
import {
  createPublicationRowBudget,
  outputPublicationFor,
  closeOutputPublication,
} from '../src/acl/output-publication';
import { resolveOutputDocumentStage } from '../src/acl/output-field-filter';
import { finalizeModelOutput, finalizeModelOutputs } from '../src/output/finalize-model-output';
import { ownedStageFixture, quietOutput, sourceModes, stageAccess } from './owned-stage-test-fixture';
import { deferred } from './hook-admission-fixture';

const { ServiceAuthorizationError } = serviceAuthorization;
const construction = (call: Parameters<typeof outputPublicationFor>[0]) => ({
  budget: createPublicationRowBudget(outputPublicationFor(call)),
  depth: 0,
});
afterEach(() => vi.restoreAllMocks());

describe('owned call preparation and stage-local field decisions', () => {
  it.each(sourceModes)('%s stage memo owns its value slot despite an inherited application setter', async (mode) => {
    const f = ownedStageFixture({ mode });
    const stage = await f.stage({ value: 'original' });
    const setter = vi.fn();
    const evaluate = vi.fn(() => true);
    const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'value');
    let first: unknown, cached: unknown;
    try {
      Object.defineProperty(
        Object.prototype,
        'value',
        Object.assign(Object.create(null), { configurable: true, set: setter }),
      );
      first = memoizeStageFieldDecision(stage, f.binding, 'value', evaluate);
      cached = memoizeStageFieldDecision(stage, f.binding, 'value', evaluate);
    } finally {
      if (descriptor) Object.defineProperty(Object.prototype, 'value', descriptor);
      else Reflect.deleteProperty(Object.prototype, 'value');
    }
    expect(first).toBe(true);
    expect(cached).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(setter).not.toHaveBeenCalled();
  });

  it.each([1, 7])('prepares three static field rules once for %s real row stages', async (rows) => {
    const hook = vi.fn(() => ({ owner: true }));
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['public', 'global', 'alternative'] },
        permissionSchema: { public: true, global: 'reader', alternative: ['reader', ['doc:owner']] },
        docPermissions: { read: hook },
      },
    });
    const reads = vi.spyOn(serviceAuthorization, 'readServiceOutputFieldAuthorization');
    const extract = vi.spyOn(fieldAuthorization, 'extractOutputFieldRuleEntries');
    const inputs = Array.from({ length: rows }, (_, index) => ({ public: index, global: index, alternative: index }));
    const contexts: any[] = [];
    expect(
      await finalizeModelOutputs({ ...f.args, inputs, onFinalized: (_row, context) => contexts.push(context) }),
    ).toEqual(inputs);
    expect(hook).toHaveBeenCalledTimes(rows);
    expect(reads).toHaveBeenCalledTimes(1);
    expect(extract).toHaveBeenCalledTimes(3);
    expect(new Set(contexts.map((context) => context.docPermissions)).size).toBe(rows);
    expect(contexts.every((context) => !('documentAuthorization' in context))).toBe(true);
  });

  it('uses an authenticated settled output memo before cold rule preparation, never across a wrong receiver', async () => {
    const rule = vi.fn(() => false);
    const f = ownedStageFixture({ modelOptions: { permissionSchema: { value: rule } } });
    const stage = await f.stage({ value: 'visible' });
    expect(memoizeStageFieldDecision(stage, f.binding, 'output:value', () => true)).toBe(true);
    const extract = vi.spyOn(fieldAuthorization, 'extractOutputFieldRuleEntries');
    expect(evaluateAuthorizedOutputField(stage, f.binding, 'value')).toBe(true);
    expect(extract).not.toHaveBeenCalled();
    expect(rule).not.toHaveBeenCalled();
    expect(() => evaluateAuthorizedOutputField(stage, { ...f.binding, modelName: 'foreign' }, 'value')).toThrow(
      ServiceAuthorizationError,
    );
  });

  it('keeps global/document AND/OR decisions and backend output grants separate from request metadata', async () => {
    const rule = vi.fn(function (this: unknown, permissions, facts) {
      expect(this).toBe(f.request);
      expect(permissions.has('reader')).toBe(true);
      expect(permissions.has('admin')).toBe(false);
      return facts.owner === true;
    });
    const backend = vi.fn(() => false);
    const schema = {
      global: 'reader',
      owner: 'doc:owner',
      both: 'reader doc:owner',
      either: ['reader', 'doc:owner'],
      impossible: 'admin doc:owner',
      deferred: rule,
      denied: false,
      backend,
    };
    const f = ownedStageFixture({
      configuration: { catalog: { paths: Object.keys(schema) }, permissionSchema: schema },
      authorization: { outputFields: { mode: 'grant', paths: ['backend'] } },
    });
    const stages = [await f.stage({}, { owner: true }), await f.stage({}, { owner: false })];
    const allowed: string[][] = [];
    for (const stage of stages) {
      const paths: string[] = [];
      for (const field of Object.keys(schema))
        if (await evaluateAuthorizedOutputField(stage, f.binding, field)) paths.push(field);
      allowed.push(paths);
    }
    expect(allowed).toEqual([
      ['global', 'owner', 'both', 'either', 'deferred', 'backend'],
      ['global', 'either', 'backend'],
    ]);
    expect(rule).toHaveBeenCalledTimes(2);
    expect(backend).not.toHaveBeenCalled();
    rule.mockImplementation(() => false);
    const metadata = [];
    for (const stage of stages)
      metadata.push(await requestOutputFieldPaths(stage, f.binding, 'read', construction(f.call)));
    expect(metadata).toEqual([
      ['global', 'owner', 'both', 'either', 'deferred'],
      ['global', 'either'],
    ]);
    expect(rule).toHaveBeenCalledTimes(2);
    expect(backend).toHaveBeenCalledTimes(2);
  });

  it('does not treat mutated fieldStates or appended plan paths as output authority', async () => {
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['public', 'denied', 'deferred'] },
        permissionSchema: { public: true, denied: false, deferred: () => false },
      },
    });
    const stage = await f.stage({ public: 'yes' });
    expect(evaluateAuthorizedOutputField(stage, f.binding, 'public')).toBe(true);
    f.plan.fieldStates = { public: 'denied', denied: 'granted', deferred: 'granted' };
    f.plan.outputPersistedFields.push('denied', 'deferred');
    expect(
      await finalizeModelOutput({ ...f.args, input: { public: 'yes', denied: 'never', deferred: 'never' } }),
    ).toEqual({ public: 'yes' });
  });

  it('runs earlier ancestor callbacks before a static child denial and memoizes them across siblings', async () => {
    const ancestor = vi.fn(() => true);
    const f = ownedStageFixture({
      modelOptions: { permissionSchema: { branch: { read: ancestor, sub: { value: false, sibling: true } } } },
    });
    const stage = await f.stage({ branch: { value: 'never', sibling: 'yes' } });
    expect(await evaluateAuthorizedOutputField(stage, f.binding, 'branch.value')).toBe(false);
    ancestor.mockImplementation(() => false);
    expect(await evaluateAuthorizedOutputField(stage, f.binding, 'branch.sibling')).toBe(true);
    expect(ancestor).toHaveBeenCalledTimes(1);
    const call = f.ownCall({ authorization: { outputFields: { mode: 'grant', paths: ['branch.value'] } } });
    const granted = createDocumentStage(call, f.binding, {});
    await resolveDocumentStage(granted, () => ({}));
    expect(evaluateAuthorizedOutputField(granted, f.binding, 'branch.value')).toBe(true);
    expect(ancestor).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('reuses exact request keys across nested lookup routes with decision=%s', async (allowed) => {
    const rule = vi.fn(() => allowed);
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['branch', 'branch.value', 'branch.value.deep'] },
        permissionSchema: {
          'branch.value': rule,
          branch: { read: true, sub: { value: { read: !allowed, sub: { deep: true } } } },
        },
      },
    });
    const stage = await f.stage({});
    expect(await evaluateAuthorizedOutputField(stage, f.binding, 'branch.value')).toBe(allowed);
    expect(await evaluateAuthorizedOutputField(stage, f.binding, 'branch.value.deep')).toBe(allowed);
    expect(rule).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'preserves dotted precedence without conflating distinct lookup routes, reverse=%s',
    async (reverse) => {
      const f = ownedStageFixture({
        configuration: {
          catalog: { paths: ['branch', 'branch.value', 'branch.value.deep'] },
          permissionSchema: {
            'branch.value': true,
            branch: { read: true, sub: { value: { read: false, sub: { deep: true } } } },
          },
        },
      });
      const lookups: [string, boolean][] = [
        ['branch.value', true],
        ['branch.value.deep', false],
      ];
      if (reverse) lookups.reverse();
      for (let row = 0; row < 2; row++) {
        // Call preparation must distinguish lookup routes. A stage intentionally
        // retains an ancestor's first request:path decision (the preceding test).
        for (const [field, allowed] of lookups) {
          const stage = await f.stage({});
          expect(await evaluateAuthorizedOutputField(stage, f.binding, field)).toBe(allowed);
        }
      }
    },
  );

  it('keeps read/update request keys, same-ID row stages and new calls independent', async () => {
    const read = vi.fn((_permissions, facts) => facts.reader);
    const update = vi.fn((_permissions, facts) => facts.writer);
    const f = ownedStageFixture({ modelOptions: { permissionSchema: { value: { read, update } } } });
    const a = await f.stage({ _id: 'same' }, { reader: true, writer: false });
    const b = await f.stage({ _id: 'same' }, { reader: false, writer: true });
    const budget = construction(f.call);
    expect(await evaluateAuthorizedOutputField(a, f.binding, 'value')).toBe(true);
    expect(await evaluateAuthorizedOutputField(b, f.binding, 'value')).toBe(false);
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(await requestOutputFieldPaths(a, f.binding, 'read', budget)).toEqual(['value']);
      expect(await requestOutputFieldPaths(b, f.binding, 'read', budget)).toEqual([]);
      expect(await requestOutputFieldPaths(a, f.binding, 'update', budget)).toEqual([]);
      expect(await requestOutputFieldPaths(b, f.binding, 'update', budget)).toEqual(['value']);
    }
    const call = f.ownCall({ access: stageAccess('update'), readResponse: false });
    const post = createDocumentStage(call, f.binding, { _id: 'same' });
    await resolveDocumentStage(post, () => ({ reader: true, writer: false }));
    expect(await evaluateAuthorizedOutputField(post, f.binding, 'value')).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(3);
  });

  it('does not prepopulate later static keys past an earlier pending dynamic callback', async () => {
    const release = deferred();
    const events: string[] = [];
    const first = vi.fn(async () => {
      events.push('first:start');
      await release.promise;
      events.push('first:end');
      return true;
    });
    const second = vi.fn(() => {
      events.push('second');
      return true;
    });
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['first', 'second', 'last'] },
        permissionSchema: { first, second, last: true },
      },
    });
    const output = finalizeModelOutput({ ...f.args, input: { first: 'first', second: 'second', last: 'last' } });
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    expect(second).not.toHaveBeenCalled();
    release.resolve();
    expect(await output).toEqual({ first: 'first', second: 'second', last: 'last' });
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('shares pending request/output decisions and does not overwrite an already-settled conflicting request key', async () => {
    const release = deferred();
    const rule = vi.fn(async () => {
      await release.promise;
      return true;
    });
    const f = ownedStageFixture({ modelOptions: { permissionSchema: { value: rule } } });
    const stage = await f.stage({ value: 'value' });
    const a = evaluateAuthorizedOutputField(stage, f.binding, 'value');
    const b = evaluateAuthorizedOutputField(stage, f.binding, 'value');
    expect(a).toBe(b);
    release.resolve();
    expect(await a).toBe(true);
    expect(rule).toHaveBeenCalledTimes(1);
    const conflict = await f.stage({ value: 'other' });
    expect(memoizeStageFieldDecision(conflict, f.binding, 'request:read:value', () => false)).toBe(false);
    expect(evaluateAuthorizedOutputField(conflict, f.binding, 'value')).toBe(false);
    expect(rule).toHaveBeenCalledTimes(1);
  });
});

describe('owned field grammar, facts and native configuration capture', () => {
  it('defers functions before fetch and retains unprefixed document-grant fallback without inventing a native DSL', async () => {
    const permissions = new Permission({ reader: true, admin: false });
    const fn = vi.fn(() => true);
    const natives = [new Date(1), Buffer.from([1]), new Map([['key', true]]), new mongo.BSON.ObjectId()];
    for (const prefix of ['', 'doc:']) {
      for (const rule of [
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
        [false, ...natives],
        ...natives,
        fn,
      ]) {
        const prepared = fieldAuthorization.prepareRequestFieldRule(rule, permissions, prefix);
        expect(prepared.state).toBe(fieldAuthorization.classifyRequestFieldRule(rule, permissions, prefix));
        if (prepared.decision !== undefined)
          for (const facts of [{}, { admin: true, owner: true }]) {
            expect(
              await fieldAuthorization.evaluateScopedAccessRule({
                req: {},
                rule,
                globalPermissions: permissions,
                docPermissions: facts,
                modelPermissionPrefix: prefix,
              }),
            ).toBe(prepared.decision);
          }
      }
    }
    expect(fn).not.toHaveBeenCalled();
    const f = ownedStageFixture({ modelOptions: { permissionSchema: { value: 'admin' } } });
    expect(await evaluateAuthorizedOutputField(await f.stage({}, { admin: true }), f.binding, 'value')).toBe(true);
    expect(await f.direct.pickAllowedFields({ value: 'not-current-authority' }, 'read')).toEqual({});
  });

  it.each(sourceModes)(
    '%s field callbacks share immutable boolean facts within one stage, not between rows',
    async (mode) => {
      const maps = [{ owner: true }, { owner: false }];
      const seen: DocumentGrants[] = [];
      const rule = vi.fn((_permissions, facts) => {
        seen.push(facts);
        expect(Object.isFrozen(facts)).toBe(true);
        expect(Reflect.set(facts, 'owner', !facts.owner)).toBe(false);
        return facts.owner;
      });
      const f = ownedStageFixture({ mode, modelOptions: { permissionSchema: { first: rule, second: rule } } });
      for (let row = 0; row < 2; row++) {
        const stage = await f.stage({ _id: 'same' }, maps[row]);
        maps[row].owner = !maps[row].owner;
        expect(await evaluateAuthorizedOutputField(stage, f.binding, 'first')).toBe(row === 0);
        expect(await evaluateAuthorizedOutputField(stage, f.binding, 'second')).toBe(row === 0);
      }
      expect(rule).toHaveBeenCalledTimes(4);
      expect(seen[0]).toBe(seen[1]);
      expect(seen[2]).toBe(seen[3]);
      expect(seen[0]).not.toBe(seen[2]);
      expect(seen[0]).not.toBe(maps[0]);
    },
  );

  it('captures native rule normalization once; changing its application wire method cannot grant a warmed/new stage', async () => {
    const native = new mongo.BSON.Long(1, 2);
    const f = ownedStageFixture({
      configuration: { catalog: { paths: ['value'] }, permissionSchema: { value: native } },
    });
    const first = await f.stage({});
    expect(await evaluateAuthorizedOutputField(first, f.binding, 'value')).toBe(false);
    const wire = vi.fn(() => true);
    Object.assign(native, { toBSON: wire });
    expect(await evaluateAuthorizedOutputField(await f.stage({}), f.binding, 'value')).toBe(false);
    expect(await evaluateAuthorizedOutputField(first, f.binding, 'value')).toBe(false);
    expect(wire).not.toHaveBeenCalled();
  });

  it('captures ordinary access slots before callbacks, while function closures remain trusted application state', async () => {
    let allowed = true;
    const rule = vi.fn(() => allowed);
    const schema = { value: { read: rule } };
    const f = ownedStageFixture({ configuration: { catalog: { paths: ['value'] }, permissionSchema: schema } });
    schema.value.read = () => false;
    const first = await f.stage({});
    expect(await evaluateAuthorizedOutputField(first, f.binding, 'value')).toBe(true);
    allowed = false;
    expect(await evaluateAuthorizedOutputField(await f.stage({}), f.binding, 'value')).toBe(false);
    expect(await evaluateAuthorizedOutputField(first, f.binding, 'value')).toBe(true);
    expect(rule).toHaveBeenCalledTimes(2);
  });

  it('raw DTO filtering uses fresh empty facts and backend output policy, not a retained stage or hook', async () => {
    const hook = vi.fn(() => ({ owner: true }));
    const deferredRule = vi.fn((_permissions, facts) => facts.owner === true);
    const f = ownedStageFixture({
      modelOptions: {
        permissionSchema: { name: true, value: 'doc:owner', first: deferredRule, second: false },
        docPermissions: { read: hook },
      },
    });
    f.adapter.findOne.mockResolvedValue({ name: 'yes', value: 'private', first: 'private', second: 'backend' });
    const result = await f.direct.findOne({}, { select: ['name', 'value', 'first', 'second', '-_id'] }, quietOutput);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    const reads = f.adapter.findOne.mock.calls.length;
    expect(await f.direct.pickAllowedFields(result.data, 'read')).toEqual({ name: 'yes' });
    expect(
      await f.direct.pickAllowedFields({ ...result.data, second: 'backend' }, 'read', {
        authorization: { outputFields: { mode: 'grant', paths: ['second'] } },
      }),
    ).toEqual({ name: 'yes', second: 'backend' });
    expect(f.adapter.findOne).toHaveBeenCalledTimes(reads);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(deferredRule.mock.calls.slice(1).every(([, facts]) => Object.keys(facts).length === 0)).toBe(true);
  });
});

describe('genuine embedded stages route ancestors to the owning actor/facts', () => {
  it.each(sourceModes)(
    '%s shares parent facts/preparation but memoizes equal-ID child leaves separately',
    async (mode) => {
      const parentRule = vi.fn((_permissions, facts) => facts.owner);
      let leafCount = 0;
      const leaf = vi.fn(function (this: unknown, permissions, facts) {
        expect(this).toBe(f.request);
        expect(permissions.has('reader')).toBe(true);
        expect(facts).toBe(readDocumentStage(parent, f.binding).grants);
        return leafCount++ === 0;
      });
      const f = ownedStageFixture({
        mode,
        modelOptions: { permissionSchema: { children: { read: parentRule, sub: { value: leaf } } } },
      });
      const parent = await f.stage(
        {
          children: [
            { _id: 'same', value: 'first' },
            { _id: 'same', value: 'second' },
          ],
        },
        { owner: true },
      );
      const scoped = authorizeEmbeddedOutputPlan(f.plan, f.plan.childPlans.children);
      expect(authorizeEmbeddedOutputPlan(f.plan, f.plan.childPlans.children)).toBe(scoped);
      const children = [];
      for (const value of documentStageSource(parent, f.binding).children as Record<string, unknown>[]) {
        const child = prepareEmbeddedDocumentStage(scoped.authorization!, scoped.authorizationBinding!, value, {
          stage: parent,
          binding: f.binding,
        }).stage;
        await resolveDocumentStage(child, () => readDocumentStage(parent, f.binding).grants);
        children.push(child);
      }
      for (let repeat = 0; repeat < 2; repeat++) {
        expect(await evaluateAuthorizedOutputField(children[0], scoped.authorizationBinding!, 'value')).toBe(true);
        expect(await evaluateAuthorizedOutputField(children[1], scoped.authorizationBinding!, 'value')).toBe(false);
      }
      expect(parentRule).toHaveBeenCalledTimes(1);
      expect(leaf).toHaveBeenCalledTimes(2);
      expect(readDocumentStage(children[0], scoped.authorizationBinding!).grants).toBe(
        readDocumentStage(parent, f.binding).grants,
      );
      await closeOutputPublication(outputPublicationFor(f.call));
      expect(() => evaluateAuthorizedOutputField(children[0], scoped.authorizationBinding!, 'value')).toThrow(
        ServiceAuthorizationError,
      );
      expect(() => authorizeEmbeddedOutputPlan(f.plan, { ...f.plan.childPlans.children })).toThrow(
        ServiceAuthorizationError,
      );
    },
  );
});
