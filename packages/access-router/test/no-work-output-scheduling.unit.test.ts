/** Observable no-work boundaries, not promise/allocation counts or timing probes. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceAuthorizationError } from '../src/acl/authorization-snapshot';
import { EMPTY_DOCUMENT_GRANTS } from '../src/acl/document-grants';
import {
  closeDocumentStage,
  documentStageSource,
  prepareEmbeddedDocumentStage,
  prepareQueryDocumentStage,
  readDocumentStage,
  resolveDocumentStage,
} from '../src/acl/document-stage';
import { authorizeEmbeddedOutputPlan, resolveOutputDocumentStage } from '../src/acl/output-field-filter';
import {
  closeOutputPublication,
  createCollectionOutputLedger,
  createPublicationRowBudget,
  outputPublicationFor,
} from '../src/acl/output-publication';
import { debitOutputWork } from '../src/acl/output-work-ledger';
import { visitTrustedOutput } from '../src/acl/trusted-output-materialization';
import { mapWithConcurrencyLimit } from '../src/helpers/concurrency';
import { getRequestWorkState } from '../src/helpers/request-work';
import { finalizeModelOutput } from '../src/output/finalize-model-output';
import { deferred, turn } from './hook-admission-fixture';
import { ownedStageFixture, quietOutput, sourceModes } from './owned-stage-test-fixture';

afterEach(() => vi.restoreAllMocks());

const cases = sourceModes.flatMap((mode) => [1, 3].map((limit) => ({ mode, limit })));

describe('no-work output scheduling and admission', () => {
  it.each([1, 3])('empty maps preserve queued microtask ordering at limit %i without invoking work', async (limit) => {
    const events: string[] = [];
    const iteratee = vi.fn(async () => 'unexpected');
    const onError = vi.fn();
    const pending = mapWithConcurrencyLimit([], limit, iteratee, onError);
    const completed = pending.then((result) => {
      events.push('map');
      return result;
    });
    const queued = Promise.resolve().then(() => {
      events.push('queued:first');
      return Promise.resolve().then(() => {
        events.push('queued:second');
      });
    });

    expect(events).toEqual([]);
    const [result] = await Promise.all([completed, queued]);
    expect(events).toEqual(['queued:first', 'queued:second', 'map']);
    expect(result).toEqual([]);
    expect(Object.keys(result)).toEqual([]);
    expect(iteratee).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(await mapWithConcurrencyLimit([], limit, iteratee)).not.toBe(result);
  });

  it.each(cases)('$mode absent root hook yields and accounts EMPTY (limit $limit)', async ({ mode, limit }) => {
    const f = ownedStageFixture({ mode, maxHookConcurrency: limit });
    const ledger = createCollectionOutputLedger(outputPublicationFor(f.call));
    const { stage, source } = prepareQueryDocumentStage(f.call, f.binding, { value: 'visible' });
    // Exactly one fact-normalization debit remains, even for the owned EMPTY singleton.
    debitOutputWork(ledger, 199999 - ledger.work);
    const gate = vi.spyOn(getRequestWorkState(f.request, f.runtime).hookGate, 'run');
    const events: string[] = [];
    const pending = resolveOutputDocumentStage({
      authorization: f.call,
      binding: f.binding,
      snapshot: source,
      stage,
      context: { operation: 'read' },
    });
    const ignored = vi.fn(() => ({ unexpected: true }));
    const facts = resolveDocumentStage(stage, ignored);
    expect(resolveDocumentStage(stage, ignored)).toBe(facts);
    expect(pending).toBeInstanceOf(Promise);
    expect(() => readDocumentStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
    expect(ledger.work).toBe(199999);

    const completed = pending.then((result) => {
      events.push('resolver');
      return result;
    });
    const queued = Promise.resolve().then(() => {
      expect(readDocumentStage(stage, f.binding).grants).toBe(EMPTY_DOCUMENT_GRANTS);
      expect(ledger.work).toBe(200000);
      events.push('queued:ready');
      return Promise.resolve().then(() => {
        events.push('queued:second');
      });
    });
    const [resolved] = await Promise.all([completed, queued]);
    expect(resolved).toBe(stage);
    expect(await facts).toBe(EMPTY_DOCUMENT_GRANTS);
    expect(events).toEqual(['queued:ready', 'queued:second', 'resolver']);
    expect(Object.isFrozen(EMPTY_DOCUMENT_GRANTS)).toBe(true);
    expect(Object.getPrototypeOf(EMPTY_DOCUMENT_GRANTS)).toBe(null);
    expect(ledger.work).toBe(200000);
    expect(ignored).not.toHaveBeenCalled();
    expect(gate).not.toHaveBeenCalled();
  });

  it.each(sourceModes)('%s absent hooks cannot skip exhausted fact accounting', async (mode) => {
    const f = ownedStageFixture({ mode });
    const owner = outputPublicationFor(f.call);
    const ledger = createCollectionOutputLedger(owner);
    const { stage, source } = prepareQueryDocumentStage(f.call, f.binding, {});
    debitOutputWork(ledger, 200000 - ledger.work);
    await expect(
      resolveOutputDocumentStage({
        authorization: f.call,
        binding: f.binding,
        snapshot: source,
        stage,
        context: {},
      }),
    ).rejects.toBeInstanceOf(ServiceAuthorizationError);
    expect(ledger.work).toBe(200000);
    expect(() => readDocumentStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
    await expect(closeOutputPublication(owner)).rejects.toBeInstanceOf(ServiceAuthorizationError);
  });

  it.each(sourceModes)('%s closes pending absent-hook work before draining it', async (mode) => {
    const f = ownedStageFixture({ mode });
    const { stage, source } = prepareQueryDocumentStage(f.call, f.binding, {});
    const pending = resolveOutputDocumentStage({
      authorization: f.call,
      binding: f.binding,
      snapshot: source,
      stage,
      context: {},
    }).catch((error: unknown) => error);
    const closing = closeOutputPublication(outputPublicationFor(f.call)).catch((error: unknown) => error);
    expect(() => readDocumentStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
    expect(await pending).toBeInstanceOf(ServiceAuthorizationError);
    expect(await closing).toBeInstanceOf(ServiceAuthorizationError);
    expect(() => documentStageSource(stage, f.binding)).toThrow(ServiceAuthorizationError);
  });

  it.each(cases)('$mode empty candidates yield before field rules (limit $limit)', async ({ mode, limit }) => {
    const events: string[] = [];
    let allowed = false;
    const rule = vi.fn(() => {
      events.push('field');
      return allowed;
    });
    const f = ownedStageFixture({
      mode,
      maxHookConcurrency: limit,
      modelOptions: { permissionSchema: { value: rule } },
      select: ['value', '-_id'],
    });
    const input = { value: 'visible' };
    const stage = await f.stage(input);
    expect(f.plan.candidates ?? []).toEqual([]);
    // Reuse already-ready facts so this characterizes the later empty-virtual
    // boundary independently of absent-hook fact resolution.
    const pending = finalizeModelOutput({
      ...f.args,
      input,
      documentStage: stage,
      onFinalized: () => {
        expect(() => readDocumentStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
        events.push('finalized');
      },
    });
    const queued = Promise.resolve().then(() =>
      Promise.resolve().then(() => {
        allowed = true;
        events.push('queued:change');
      }),
    );
    const [output] = await Promise.all([pending, queued]);
    expect(output).toEqual({ value: 'visible' });
    expect(rule).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['queued:change', 'field', 'finalized']);
    expect(() => readDocumentStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
  });

  it.each(sourceModes)('%s cannot publish empty output with a depleted row budget', async (mode) => {
    const f = ownedStageFixture({ mode });
    const stage = await f.stage({});
    const budget = createPublicationRowBudget(outputPublicationFor(f.call));
    visitTrustedOutput(budget, 0, 20000);
    const finalized = vi.fn();
    await expect(
      finalizeModelOutput({
        ...f.args,
        input: {},
        documentStage: stage,
        outputBudget: budget,
        onFinalized: finalized,
      }),
    ).rejects.toBeInstanceOf(ServiceAuthorizationError);
    expect(finalized).not.toHaveBeenCalled();
    expect(() => readDocumentStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
  });

  it.each(sourceModes)('%s embedded facts inherit synchronously, not EMPTY', async (mode) => {
    const f = ownedStageFixture({
      mode,
      modelOptions: { permissionSchema: { children: { read: true, sub: { value: 'doc:owner' } } } },
      select: ['children.value', '-_id'],
    });
    const parent = await f.stage({ children: [{ value: 'visible' }] }, { owner: true });
    const scoped = authorizeEmbeddedOutputPlan(f.plan, f.plan.childPlans.children);
    const binding = scoped.authorizationBinding!;
    const children = documentStageSource(parent, f.binding).children as Record<string, unknown>[];
    const { stage, source } = prepareEmbeddedDocumentStage(scoped.authorization!, binding, children[0], {
      stage: parent,
      binding: f.binding,
    });
    const pending = resolveOutputDocumentStage({
      authorization: scoped.authorization!,
      binding,
      snapshot: source,
      stage,
      owningDocument: parent,
      owningBinding: f.binding,
      context: {},
    });
    expect(readDocumentStage(stage, binding).grants).toBe(readDocumentStage(parent, f.binding).grants);
    expect(readDocumentStage(stage, binding).grants.owner).toBe(true);
    expect(await pending).toBe(stage);
    closeDocumentStage(parent);
    expect(() => readDocumentStage(stage, binding)).toThrow(ServiceAuthorizationError);
  });

  it.each(cases.flatMap((entry) => ['absent', 'present-empty'].map((kind) => ({ ...entry, kind }))))(
    '$mode real LIST distinguishes $kind hooks under a saturated limit-$limit gate',
    async ({ mode, limit, kind }) => {
      const hook = vi.fn(() => ({}));
      const f = ownedStageFixture({
        mode,
        maxHookConcurrency: limit,
        modelOptions: {
          permissionSchema: { value: true },
          docPermissions: kind === 'absent' ? undefined : hook,
        },
      });
      const row = { value: 'visible', hidden: 'never' };
      f.adapter.find.mockResolvedValue([row, row]);
      const gate = getRequestWorkState(f.request, f.runtime).hookGate;
      const release = deferred();
      const holds = Array.from({ length: limit }, () => gate.run(() => release.promise));
      const admission = vi.spyOn(gate, 'run');
      let returned = false;
      const pending = f.direct.find({}, { select: ['value', '-_id'] }, quietOutput).then((result) => {
        returned = true;
        return result;
      });
      try {
        await turn();
        expect(returned).toBe(kind === 'absent');
        expect(hook).not.toHaveBeenCalled();
        if (kind === 'absent') expect(admission).not.toHaveBeenCalled();
        else expect(admission).toHaveBeenCalled();
      } finally {
        release.resolve();
        await Promise.all(holds);
        await pending;
      }
      const result = await pending;
      expect(result).toMatchObject({ success: true, data: [{ value: 'visible' }, { value: 'visible' }] });
      if (!result.success) throw new Error('expected successful LIST');
      expect(new Set(result.contexts).size).toBe(2);
      expect(result.contexts.map((context) => context.docPermissions)).toEqual([
        EMPTY_DOCUMENT_GRANTS,
        EMPTY_DOCUMENT_GRANTS,
      ]);
      for (const context of result.contexts) expect(context.docPermissions).toBe(EMPTY_DOCUMENT_GRANTS);
      expect(hook).toHaveBeenCalledTimes(kind === 'absent' ? 0 : 2);
      expect(admission).toHaveBeenCalledTimes(kind === 'absent' ? 0 : 2);
    },
  );
});
