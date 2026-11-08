/** Real-service contracts/work characterization; never part of the timing bundle.
 * ARPC-02's unaccepted optimization and exact cache-specific regressions are
 * preserved in docs/task-artifacts/access-router/20261105-084939-performance-cleanup/arpc-02/withdrawal/.
 */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as calls from '../src/acl/service-authorization';
import * as fields from '../src/acl/output-field-filter';
import { createTrustedOutputBudget } from '../src/acl/trusted-output-materialization';
import { finalizeModelOutput } from '../src/output/finalize-model-output';
import { caseId, createCrudFixture, type CrudCase } from './access-router-crud-fixture';
import { ownedStageFixture, quietOutput, sourceModes } from './owned-stage-test-fixture';
import { writeOutputFixture } from './write-output-test-fixture';

afterEach(() => vi.restoreAllMocks());
const observations: unknown[] = [];
afterAll(async () => {
  if (!process.env.ARPC_OUTPUT_PREPARATION_REPORT) return;
  const target = path.resolve(process.env.ARPC_OUTPUT_PREPARATION_REPORT);
  expect(target.startsWith(`${path.resolve(process.env.TMPDIR!)}${path.sep}`)).toBe(true);
  await fs.writeFile(target, JSON.stringify(observations));
});

describe('selected output preparation contracts on actual service paths', () => {
  it.each(sourceModes)('%s records row/copy work without sharing row facts', async (mode) => {
    for (const entry of ['direct', 'public'] as const)
      for (const operation of ['list-many', 'create-bulk', 'read-hit', 'update-id'] as const)
        for (const rows of [1, 16]) {
          const spec = {
            modes: Array(4).fill(mode),
            entry,
            shape: 'hooks' as const,
            rows,
            width: rows === 1 ? 4 : 16,
            operation,
          };
          const c: CrudCase = { ...spec, id: caseId(spec) };
          const f = createCrudFixture(c, true);
          const copies = vi.spyOn(fields, 'copyOutputValue');
          const finalizer = vi.spyOn(calls, 'readServiceFinalizerConfiguration');
          try {
            const result = await f.invoke();
            f.check(result);
            const outputRows = operation === 'list-many' || operation === 'create-bulk' ? rows : 1;
            // Characterize work without pinning the withdrawn repeated setup as
            // an API requirement or pretending an optimization is still present.
            expect(finalizer.mock.calls.length).toBeGreaterThan(0);
            expect(finalizer.mock.calls.length).toBeLessThanOrEqual(outputRows);
            expect(copies).toHaveBeenCalledTimes(outputRows * (c.width + 1));
            const contexts = result.contexts ?? [result.context];
            expect(new Set(contexts).size).toBe(outputRows);
            expect(new Set(contexts.map((context: any) => context.docPermissions)).size).toBe(outputRows);
            observations.push({
              id: c.id,
              outputRows,
              finalizerPreparations: finalizer.mock.calls.length,
              selectedCopies: copies.mock.calls.length,
              resolvedModes: f.resolvedModes(),
              counts: { ...f.counts },
              trace: [...f.trace],
            });
          } finally {
            vi.restoreAllMocks();
            f.dispose();
          }
        }
  });

  it('revalidates mutable selection contents, replacement plans and bindings on each copy', () => {
    const f = ownedStageFixture({
      configuration: {
        catalog: { paths: ['payload'], opaquePaths: ['payload'], protectedPaths: ['payload.protected'] },
        permissionSchema: { payload: true },
      },
    });
    const copy = fields.copyOutputValue;
    const value = { safe: 'yes', denied: 'no', protected: 'never' };
    const construction = () => ({ budget: createTrustedOutputBudget(), depth: 0 });
    expect(copy(value, f.plan, 'payload', construction())).toEqual({ safe: 'yes', denied: 'no' });
    f.plan.effectiveSelectNorm.push('-payload.denied');
    expect(copy(value, f.plan, 'payload', construction())).toEqual({ safe: 'yes' });
    expect(copy(value, { ...f.plan, effectiveSelectNorm: ['-payload.safe'] }, 'payload', construction())).toEqual({
      denied: 'no',
    });
    const invalid = { ...f.plan, authorizationBinding: { ...f.binding, modelName: 'wrong' } };
    const selectionRead = vi.fn(() => []);
    Object.defineProperty(invalid, 'effectiveSelectNorm', { get: selectionRead });
    expect(() => copy(value, invalid, 'payload', construction())).toThrow(calls.ServiceAuthorizationError);
    expect(selectionRead).not.toHaveBeenCalled();
    const empty = { ...f.plan, effectiveSelectNorm: [] };
    const fromEmpty = fields.copyOutputValue;
    empty.effectiveSelectNorm = undefined as never;
    expect(() => fromEmpty(value, empty, 'payload', construction())).toThrow(TypeError);
  });

  it.each(sourceModes)('%s sees selection mutation by an awaited rule after an earlier selected copy', async (mode) => {
    const f = ownedStageFixture({
      mode,
      configuration: {
        catalog: { paths: ['first', 'payload'], opaquePaths: ['payload'] },
        permissionSchema: {
          first: true,
          payload: async () => {
            await Promise.resolve();
            f.plan.effectiveSelectNorm.push('-payload.hidden');
            return true;
          },
        },
      },
      select: ['first', 'payload', '-_id'],
    });
    expect(
      await finalizeModelOutput({ ...f.args, input: { first: 'yes', payload: { safe: 'yes', hidden: 'no' } } }),
    ).toEqual({ first: 'yes', payload: { safe: 'yes' } });
  });

  it.each(sourceModes)('%s never takes copy work from a process-prototype lazy slot', async (mode) => {
    const f = ownedStageFixture({ mode });
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'copyValue');
    const inherited = vi.fn(() => () => 'inherited replacement');
    Object.defineProperty(Object.prototype, 'copyValue', { configurable: true, get: inherited });
    try {
      expect(await finalizeModelOutput({ ...f.args, input: { name: 'yes', value: 'yes', hidden: 'no' } })).toEqual({
        name: 'yes',
        value: 'yes',
      });
      expect(inherited).not.toHaveBeenCalled();
    } finally {
      if (previous) Object.defineProperty(Object.prototype, 'copyValue', previous);
      else Reflect.deleteProperty(Object.prototype, 'copyValue');
    }
  });

  it.each(sourceModes.flatMap((mode) => ['direct', 'public'].map((entry) => ({ mode, entry }))))(
    '$mode $entry keeps callable invocation lookup and in-flight hook capture per LIST/CREATE row',
    async ({ mode, entry }) => {
      for (const operation of ['list', 'create'] as const) {
        const contexts: any[] = [];
        const replacement = vi.fn(() => ({ owner: false }));
        const hook = vi.fn(function (this: unknown, doc, _permissions, context) {
          expect(this).toBe(f.request);
          contexts.push(context);
          f.runtime.setModelOption(f.model.modelName, 'docPermissions', replacement);
          return { owner: doc.owner === true };
        });
        const attached = vi.fn(() => {
          throw new Error('not a lookup parent');
        });
        const invocation = vi.fn(() => Function.prototype.call);
        Object.defineProperty(hook, operation, { get: attached });
        Object.defineProperty(hook, 'get', { get: attached });
        Object.defineProperty(hook, 'call', { get: invocation });
        const f = writeOutputFixture(mode, {
          listAuthorizationMode: mode,
          permissionSchema: {
            owner: true,
            value: { create: true, read: 'doc:owner', list: 'doc:owner' },
            payload: true,
          },
          docPermissions: hook,
        });
        const data = [true, false, true].map((owner) => ({ owner, value: 'yes', payload: { when: new Date(1) } }));
        f.adapter.find.mockResolvedValue(data);
        const args = { select: ['value', 'payload', '-_id'] };
        const invoke = () =>
          operation === 'list'
            ? entry === 'direct'
              ? f.direct.find({}, args, quietOutput)
              : f.public._list({}, args, quietOutput)
            : entry === 'direct'
              ? f.direct.create(data, args, quietOutput)
              : f.public._create(data, args, quietOutput);
        const result = await invoke();
        expect(result).toMatchObject({
          success: true,
          data: data.map(({ owner, payload }) => ({ payload, ...(owner ? { value: 'yes' } : {}) })),
        });
        expect(invocation).toHaveBeenCalledTimes(3);
        expect(attached).not.toHaveBeenCalled();
        expect(hook).toHaveBeenCalledTimes(3);
        expect(replacement).not.toHaveBeenCalled();
        expect(new Set(contexts).size).toBe(3);
        expect(new Set(contexts.map((context) => context.docPermissions)).size).toBe(1); // empty pre-hook facts only
        const next = await invoke();
        expect(next).toMatchObject({ success: true, data: data.map(({ payload }) => ({ payload })) });
        expect(replacement).toHaveBeenCalledTimes(3);
      }
    },
  );

  it.each(sourceModes)('%s leaves empty LIST and bulk CREATE empty without eager preparation', async (mode) => {
    const f = writeOutputFixture(mode, { listAuthorizationMode: mode });
    f.adapter.find.mockResolvedValue([]);
    const copies = vi.spyOn(fields, 'copyOutputValue');
    const finalizer = vi.spyOn(calls, 'readServiceFinalizerConfiguration');
    expect(await f.direct.find({}, {}, quietOutput)).toMatchObject({ success: true, data: [] });
    expect(await f.direct.create([], {}, quietOutput)).toMatchObject({ success: true, data: [] });
    expect(copies).not.toHaveBeenCalled();
    expect(finalizer).not.toHaveBeenCalled();
  });
});
