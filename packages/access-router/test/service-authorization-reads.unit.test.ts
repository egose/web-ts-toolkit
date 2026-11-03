import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as calls from '../src/acl/service-authorization';
import {
  readDocumentStage,
  readDocumentStageAccess,
  memoizeStageFieldDecision,
  documentStageSource,
} from '../src/acl/document-stage';
import { copyOutputValue, evaluateAuthorizedOutputField } from '../src/acl/output-field-filter';
import { createPublicationRowBudget, outputPublicationFor } from '../src/acl/output-publication';
import { prepareModelQuery, executePreparedFindOne } from '../src/acl/prepared-query';
import { createServiceExecution, readServiceExecution } from '../src/acl/service-execution';
import { finalizeModelOutputs } from '../src/output/finalize-model-output';
import { ownedStageFixture, quietOutput, sourceModes, stageAccess } from './owned-stage-test-fixture';

afterEach(() => vi.restoreAllMocks());

describe('owned primitive reads and native copies only at actual exposure', () => {
  it('shares validated primitive projections and the genuinely private immutable actor within a call', () => {
    const f = ownedStageFixture();
    const paths = ['name', 'value'];
    const access = { ...stageAccess(), extension: new Date(1) };
    const call = f.ownCall({
      access,
      configuration: { ...f.configuration, catalog: { paths, extension: new Map([['when', new Date(1)]]) } },
    });
    const output = calls.readServiceOutputPolicy(call, f.binding);
    const permissions = calls.getAuthorizationPermissions(call, f.binding);
    paths.push('later');
    access.extension.setTime(99);
    expect(calls.readServiceOutputPolicy(call, f.binding)).toBe(output);
    expect(calls.readServiceAuthorizationAccess(call, f.binding)).toBe(output.access);
    expect(output.access).not.toHaveProperty('extension');
    expect(output.catalog).not.toHaveProperty('extension');
    expect(output.catalog.paths).toEqual(['name', 'value']);
    expect(Object.isFrozen(output.catalog.paths)).toBe(true);
    expect(Object.isFrozen(output.access)).toBe(true);
    expect(calls.getAuthorizationPermissions(call, f.binding)).toBe(permissions);
    expect(Object.isFrozen(permissions)).toBe(true);
    expect(Object.isFrozen(permissions.keys)).toBe(true);
    expect(Reflect.set(permissions, 'has', () => true)).toBe(false);
    expect(permissions).not.toHaveProperty('permissions');
    expect(() => (permissions.keys as string[]).push('admin')).toThrow();
    expect(calls.getAuthorizationPermissions(f.ownCall(), f.binding)).not.toBe(permissions);
  });

  it.each([new Date(1), Buffer.from([1]), new mongoose.mongo.BSON.ObjectId(), new Map(), true, undefined])(
    'rejects non-string catalog paths instead of retaining mutable or malformed leaves: %s',
    (path) => {
      const f = ownedStageFixture();
      expect(() => f.ownCall({ configuration: { ...f.configuration, catalog: { paths: [path] as never } } })).toThrow(
        calls.ServiceAuthorizationError,
      );
    },
  );

  it('rejects sparse/native catalog arrays and non-string access tuple members before sharing', () => {
    const f = ownedStageFixture();
    for (const paths of [new Array(1), new Map(), new Set(['value'])])
      expect(() =>
        f.ownCall({
          configuration: { ...f.configuration, catalog: { ...f.configuration.catalog, opaquePaths: paths as never } },
        }),
      ).toThrow(calls.ServiceAuthorizationError);
    expect(() => f.ownCall({ access: { ...stageAccess(), operation: new Date(1) as never } })).toThrow(
      calls.ServiceAuthorizationError,
    );
  });

  it.each(['request', 'runtime', 'model', 'modelName', 'scopePath'] as const)(
    'authenticates every narrow read and cold/warm field lookup against changed %s',
    async (key) => {
      const f = ownedStageFixture();
      const stage = await f.stage({ value: 'open' }, { owner: true });
      const evaluate = vi.fn(() => true);
      expect(memoizeStageFieldDecision(stage, f.binding, 'warm', evaluate)).toBe(true);
      expect(evaluateAuthorizedOutputField(stage, f.binding, 'value')).toBe(true);
      const binding = { ...f.binding, [key]: key === 'modelName' ? 'Other' : key === 'scopePath' ? ['children'] : {} };
      const construction = { budget: createPublicationRowBudget(outputPublicationFor(f.call)), depth: 0 };
      for (let repeat = 0; repeat < 2; repeat++) {
        for (const read of [
          calls.readServiceAuthorization,
          calls.readServiceAuthorizationAccess,
          calls.readServiceDocumentPermissions,
          calls.readServiceFinalizerConfiguration,
          calls.readServiceOutputMetadata,
          calls.readServiceOutputPolicy,
          calls.readServiceOutputFieldAuthorization,
          calls.getAuthorizationPermissions,
        ]) {
          expect(() => read(f.call, binding)).toThrow(calls.ServiceAuthorizationError);
          expect(() => read({ ...f.call }, f.binding)).toThrow(calls.ServiceAuthorizationError);
        }
        expect(() => readDocumentStageAccess(stage, binding)).toThrow(calls.ServiceAuthorizationError);
        expect(() => readDocumentStage(stage, binding)).toThrow(calls.ServiceAuthorizationError);
        expect(() => memoizeStageFieldDecision(stage, binding, 'warm', evaluate)).toThrow(
          calls.ServiceAuthorizationError,
        );
        expect(() => evaluateAuthorizedOutputField(stage, binding, 'value')).toThrow(calls.ServiceAuthorizationError);
        expect(() =>
          copyOutputValue('value', { ...f.plan, authorizationBinding: binding }, 'value', construction),
        ).toThrow(calls.ServiceAuthorizationError);
      }
      expect(evaluate).toHaveBeenCalledTimes(1);
    },
  );

  it.each(sourceModes)(
    '%s source mutations do not alter captured facts or revive memo/source comparison machinery',
    async (mode) => {
      const f = ownedStageFixture({ mode });
      const source = { value: 'original', when: new Date(1), bytes: Buffer.from([1]) };
      const stage = await f.stage(source, { owner: true });
      const facts = readDocumentStage(stage, f.binding).grants;
      expect(evaluateAuthorizedOutputField(stage, f.binding, 'value')).toBe(true);
      source.value = 'changed';
      source.when.setTime(2);
      source.bytes[0] = 2;
      expect(readDocumentStage(stage, f.binding).grants).toBe(facts);
      expect(evaluateAuthorizedOutputField(stage, f.binding, 'value')).toBe(true);
      expect(documentStageSource(stage, f.binding).value).toBe(mode === 'trusted' ? 'changed' : 'original');
      expect((documentStageSource(stage, f.binding).when as Date).getTime()).toBe(mode === 'trusted' ? 2 : 1);
    },
  );

  it('shared fact/access reads do not re-traverse or copy source natives or owned facts', async () => {
    const f = ownedStageFixture();
    const stage = await f.stage({ when: new Date(10) }, { owner: true });
    const facts = readDocumentStage(stage, f.binding).grants;
    const clone = vi.spyOn(Date.prototype, 'getTime');
    for (let repeat = 0; repeat < 8; repeat++) {
      readDocumentStageAccess(stage, f.binding);
      expect(readDocumentStage(stage, f.binding).grants).toBe(facts);
      expect(memoizeStageFieldDecision(stage, f.binding, 'value', () => true)).toBe(true);
    }
    expect(clone).not.toHaveBeenCalled();
    expect(Reflect.set(facts, 'owner', false)).toBe(false);
  });

  it('adapter/query diagnostic native values are detached from private policy at their actual receiving boundary', async () => {
    const f = ownedStageFixture();
    const original = new Date(7);
    const execution = createServiceExecution(f.direct, stageAccess(), {
      rows: { mode: 'scope', filter: { when: { $gte: original } } },
    });
    const state = readServiceExecution(f.direct, execution);
    const policy = (calls.readServiceAuthorization(state.authorization, state.binding).authorization.rows as any)
      .filter;
    const dates = (value: any): Date[] =>
      value instanceof Date ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(dates) : [];
    const exposed: Date[] = [];
    f.adapter.findOne.mockImplementation(async (args) => {
      exposed.push(...dates(args.filter));
      expect(exposed.length).toBeGreaterThan(0);
      for (const date of exposed) {
        expect(date).not.toBe(policy.when.$gte);
        date.setTime(99);
      }
      return { name: 'yes' };
    });
    const query = await prepareModelQuery(f.direct, execution, { kind: 'client-read', filter: {} });
    const result = await executePreparedFindOne(f.direct, execution, query, { select: ['name', '-_id'] }, quietOutput);
    expect(result).toMatchObject({ success: true, data: { name: 'yes' } });
    if (!result.success) throw new Error(result.code);
    for (const date of dates(result.query?.filter)) {
      expect(date).not.toBe(policy.when.$gte);
      date.setTime(100);
    }
    expect(policy.when.$gte.getTime()).toBe(7);
    expect(original.getTime()).toBe(7);
    expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
  });

  it('private rule/finalizer/metadata/full owner reads perform zero unrelated native graph copies', async () => {
    const f = ownedStageFixture({
      configuration: { defaults: { payload: Array.from({ length: 128 }, (_, index) => ({ when: new Date(index) })) } },
    });
    const stage = await f.stage({ value: 'yes' });
    const clone = vi.spyOn(Date.prototype, 'getTime');
    const construction = { budget: createPublicationRowBudget(outputPublicationFor(f.call)), depth: 0 };
    for (let repeat = 0; repeat < 4; repeat++) {
      expect(calls.readServiceAuthorizationAccess(f.call, f.binding).outputAccess).toBe('read');
      expect(calls.readServiceOutputPolicy(f.call, f.binding).catalog.paths).toContain('value');
      expect(calls.readServiceOutputFieldAuthorization(f.call, f.binding).permissionSchema).toHaveProperty(
        'value',
        true,
      );
      expect(calls.readServiceOutputMetadata(f.call, f.binding).stripPermissionsField).toBe(true);
      expect(calls.readServiceFinalizerConfiguration(f.call, f.binding)).not.toHaveProperty('defaults');
      expect(calls.readServiceDocumentPermissions(f.call, f.binding)).not.toHaveProperty('relatedTargets');
      expect(readDocumentStageAccess(stage, f.binding).authorization).toBe(f.call);
      expect(copyOutputValue({ safe: 'value', __v: 'hidden' }, f.plan, 'payload', construction)).toEqual({
        safe: 'value',
      });
      calls.readServiceAuthorization(f.call, f.binding);
    }
    expect(clone).not.toHaveBeenCalled();
  });

  it.each([1, 2, 7])('prepares ordinary no-virtual output once for %s authenticated row stages', async (rows) => {
    const f = ownedStageFixture({
      configuration: { defaults: { dates: Array.from({ length: 128 }, (_, index) => new Date(index)) } },
    });
    const rules = vi.spyOn(calls, 'readServiceOutputFieldAuthorization');
    const clone = vi.spyOn(Date.prototype, 'getTime');
    const inputs = Array.from({ length: rows }, (_, index) => ({
      name: `row:${index}`,
      value: { safe: `row:${index}` },
    }));
    const outputs = await finalizeModelOutputs({ ...f.args, inputs });
    expect(outputs).toEqual(inputs);
    expect(outputs[0]).not.toBe(inputs[0]);
    expect(outputs[0].value).not.toBe(inputs[0].value);
    expect(rules).toHaveBeenCalledTimes(1);
    expect(clone).not.toHaveBeenCalled();
  });
});
