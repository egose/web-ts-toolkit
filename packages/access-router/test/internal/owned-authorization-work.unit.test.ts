import { afterEach, describe, expect, it, vi } from 'vitest';
import * as stages from '../../src/acl/document-stage';
import * as planning from '../../src/acl/model-output-planning';
import { evaluateAuthorizedOutputField } from '../../src/acl/output-field-filter';
import { finalizeModelOutput } from '../../src/output/finalize-model-output';
import { EMPTY_DOCUMENT_GRANTS } from '../../src/acl/document-grants';
import { captureAuthorizationFieldCatalog, readOwnedAuthorizationCatalogWork } from '../../src/acl/field-catalog';
import { captureAuthorizationConfiguration } from '../../src/acl/captured-authorization-configuration';
import { copyAuthorizationValue, ServiceAuthorizationError } from '../../src/acl/authorization-snapshot';
import {
  createTrustedOutputBudget,
  materializeTrustedOutputValue,
  visitTrustedOutput,
} from '../../src/acl/trusted-output-materialization';
import { ownedStageFixture, quietOutput, sourceModes } from '../support/private/owned-stage-test-fixture';

afterEach(() => vi.restoreAllMocks());

const fields = Array.from({ length: 24 }, (_, index) => `field${index}`);
const schema = Object.fromEntries(fields.map((field) => [field, String]));
const row = (ordinal = 0) => ({
  _id: String(ordinal),
  ...Object.fromEntries(fields.map((field, index) => [field, `${ordinal}:${index}:${'x'.repeat(32)}`])),
});

describe('owned authorization performs only necessary per-stage work', () => {
  it('fresh library-owned string catalogs are not traversed/copied again during configuration capture', () => {
    const f = ownedStageFixture({ schema });
    const catalog = captureAuthorizationFieldCatalog(f.model.schema, undefined);
    const capture = captureAuthorizationConfiguration({ catalog, permissionSchema: { field0: true } });
    expect(capture.catalog === catalog).toBe(true);
    expect(Object.isFrozen(capture.catalog.paths)).toBe(true);
  });

  it('owned catalog reuse charges exactly the same full capture budget as unbranded data', () => {
    const f = ownedStageFixture({ schema });
    const catalog = captureAuthorizationFieldCatalog(f.model.schema, undefined);
    const work = readOwnedAuthorizationCatalogWork(catalog)!;
    const lookalike = Object.freeze({ ...catalog });
    for (const input of [catalog, lookalike]) {
      const padding = Array(20000 - work.slots - 2).fill(false);
      expect(() => copyAuthorizationValue({ catalog: input, padding }, true)).not.toThrow();
      expect(() => copyAuthorizationValue({ catalog: input, padding: [...padding, false] }, true)).toThrow(
        ServiceAuthorizationError,
      );
    }
    const unbranded = captureAuthorizationConfiguration({ catalog: lookalike });
    expect(unbranded.catalog).not.toBe(lookalike);
    expect(unbranded.catalog.paths).not.toBe(catalog.paths);
  });

  it('scalar construction avoids graph allocations without resetting budget/depth/poison', () => {
    const budget = createTrustedOutputBudget();
    const allocation = vi.spyOn(globalThis, 'WeakSet');
    expect(materializeTrustedOutputValue('value', 'field0', budget, { keep: () => true })).toBe('value');
    expect(allocation).not.toHaveBeenCalled();
    allocation.mockRestore();
    visitTrustedOutput(budget, 0, 19999);
    expect(() => materializeTrustedOutputValue(false, 'denied', budget, { keep: () => false })).toThrow(
      ServiceAuthorizationError,
    );
    expect(() => materializeTrustedOutputValue(null, 'late', budget, { keep: () => true }, 0, true)).toThrow(
      ServiceAuthorizationError,
    );
    expect(() =>
      materializeTrustedOutputValue(0, 'deep', createTrustedOutputBudget(), { keep: () => true }, 101),
    ).toThrow(ServiceAuthorizationError);
  });
  it.each(sourceModes)(
    '%s immutable global rules need only request-key records, not duplicate aggregate records',
    async (mode) => {
      const f = ownedStageFixture({
        mode,
        schema,
        modelOptions: { permissionSchema: Object.fromEntries(fields.map((field) => [field, 'reader'])) },
      });
      const stage = await f.stage(row());
      const memo = vi.spyOn(stages, 'memoizeStageFieldDecision');
      for (const field of fields) expect(evaluateAuthorizedOutputField(stage, f.binding, field)).toBe(true);
      expect(memo).toHaveBeenCalledTimes(24);
      expect(memo.mock.calls.every((call) => call[2].startsWith('request:'))).toBe(true);
    },
  );

  it('settled synchronous field decisions do not allocate a rejected/pending promise', async () => {
    const f = ownedStageFixture();
    const stage = await f.stage({ value: 'v' });
    const catchCalls = vi.spyOn(Promise.prototype, 'catch');
    const evaluate = vi.fn(() => true);
    expect(stages.memoizeStageFieldDecision(stage, f.binding, 'sync', evaluate)).toBe(true);
    expect(stages.memoizeStageFieldDecision(stage, f.binding, 'sync', evaluate)).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(catchCalls).not.toHaveBeenCalled();
  });

  it('synchronous reentry still receives the one shared pending promise', async () => {
    const f = ownedStageFixture();
    const stage = await f.stage({ value: 'v' });
    let pending: boolean | Promise<boolean> | undefined;
    expect(
      stages.memoizeStageFieldDecision(stage, f.binding, 'recursive', () => {
        pending = stages.memoizeStageFieldDecision(stage, f.binding, 'recursive', () => false);
        return true;
      }),
    ).toBe(true);
    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).resolves.toBe(true);
  });

  it.each(sourceModes)(
    '%s raw per-row repicks capture fresh output policy, not query/hook/default configuration',
    async (mode) => {
      const seen: unknown[] = [];
      const f = ownedStageFixture({
        mode,
        schema,
        modelOptions: {
          permissionSchema: Object.fromEntries(
            fields.map((field) => [
              field,
              (permissions, facts) => {
                seen.push(facts);
                return permissions.has('reader');
              },
            ]),
          ),
          docPermissions: { list: vi.fn(() => ({ owner: true })) },
        },
      });
      const capture = vi.spyOn(planning, 'captureModelAuthorizationConfiguration');
      const fullOptions = vi.spyOn(f.runtime, 'getModelOptions');
      const input = Array.from({ length: 100 }, (_, index) => row(index));
      const output = await Promise.all(input.map((doc) => f.direct.pickAllowedFields(doc, 'list', {})));
      expect(output).toEqual(input.map(({ _id, ...data }) => ({ _id, ...data })));
      expect(seen).toHaveLength(2400);
      expect(seen.every((facts) => facts === EMPTY_DOCUMENT_GRANTS)).toBe(true);
      expect(capture).not.toHaveBeenCalled();
      expect(fullOptions).not.toHaveBeenCalled();
      expect(f.adapter.find).not.toHaveBeenCalled();
      expect(f.adapter.findOne).not.toHaveBeenCalled();
      f.runtime.setModelOption(f.model.modelName, 'permissionSchema.field0', false);
      const next = await f.direct.pickAllowedFields(input[0], 'list', {});
      expect(next).not.toHaveProperty('field0');
      expect(output[0]).toHaveProperty('field0', input[0].field0);
    },
  );

  it.each(sourceModes)(
    '%s two virtuals use two independent views of one stable source, not three copies',
    async (mode) => {
      const inputs: Record<string, unknown>[] = [];
      const getter = vi.fn((doc: Readonly<Record<string, unknown>>) => {
        inputs.push(doc);
        const value = doc.field0;
        (doc as Record<string, unknown>).field0 = 'callback mutation';
        return value;
      });
      const f = ownedStageFixture({
        mode,
        schema,
        select: ['field0', 'summary', 'upper', '-_id'],
        modelOptions: {
          permissionSchema: { field0: true, summary: true, upper: true },
          virtuals: { summary: { get: getter, dependsOn: ['field0'] }, upper: { get: getter, dependsOn: ['field0'] } },
        },
      });
      const source = row();
      const stage = await f.stage(source);
      const copy = vi.spyOn(stages, 'copyDocumentView');
      const output = await finalizeModelOutput({ ...f.args, input: source, documentStage: stage });
      expect(output).toEqual({ field0: source.field0, summary: source.field0, upper: source.field0 });
      expect(getter).toHaveBeenCalledTimes(2);
      expect(inputs[0]).not.toBe(inputs[1]);
      expect(source.field0).not.toBe('callback mutation');
      expect(copy).toHaveBeenCalledTimes(2);
    },
  );

  it.each(sourceModes)(
    '%s last virtual exposure also detaches mutable native leaves from every sibling',
    async (mode) => {
      const observed: number[] = [];
      const getter = (doc: Readonly<{ value: Date }>) => {
        observed.push(doc.value.getTime());
        doc.value.setTime(99);
        return observed.at(-1);
      };
      const f = ownedStageFixture({
        mode,
        schema: { value: Date },
        select: ['summary', 'upper', '-_id'],
        modelOptions: {
          permissionSchema: { value: true, summary: true, upper: true },
          virtuals: { summary: { get: getter, dependsOn: ['value'] }, upper: { get: getter, dependsOn: ['value'] } },
        },
      });
      const source = { _id: 'native', value: new Date(0) };
      const stage = await f.stage(source);
      const output = await finalizeModelOutput({ ...f.args, input: source, documentStage: stage });
      expect(output).toEqual({ summary: 0, upper: 0 });
      expect(observed).toEqual([0, 0]);
      expect(source.value.getTime()).toBe(0);
    },
  );

  it('a helper sees setters on the next call but not halfway through an awaiting field predicate', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((done) => {
      release = done;
    });
    const f = ownedStageFixture({
      schema,
      modelOptions: {
        permissionSchema: {
          field0: async () => {
            await waiting;
            return true;
          },
          field1: true,
        },
      },
    });
    const first = f.direct.pickAllowedFields(row(), 'read', {});
    f.runtime.setModelOption(f.model.modelName, 'permissionSchema', { field0: false, field1: false });
    release();
    expect(await first).toMatchObject({ field0: row().field0, field1: row().field1 });
    const next = await f.direct.pickAllowedFields(row(), 'read', {});
    expect(next).not.toHaveProperty('field0');
    expect(next).not.toHaveProperty('field1');
  });

  it.each(sourceModes)('%s document callbacks still run 24 times with one immutable fact map', async (mode) => {
    const facts: unknown[] = [];
    const evaluate = vi.fn((_permissions, grants) => {
      facts.push(grants);
      return grants.owner === true;
    });
    const hook = vi.fn(() => ({ owner: true }));
    const f = ownedStageFixture({
      mode,
      schema,
      modelOptions: {
        permissionSchema: Object.fromEntries(fields.map((field) => [field, evaluate])),
        docPermissions: { read: hook },
      },
    });
    f.adapter.findOne.mockResolvedValue(row());
    const result = await f.direct.findById('0', { select: [...fields, '-_id'] }, quietOutput);
    expect(result.success).toBe(true);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledTimes(24);
    expect(new Set(facts).size).toBe(1);
    expect(Object.isFrozen(facts[0])).toBe(true);
  });
});
