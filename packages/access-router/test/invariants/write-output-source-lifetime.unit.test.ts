import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ownedStageFixture, quietOutput } from '../support/private/owned-stage-test-fixture';
import { writeOutputFixture } from '../support/private/write-output-test-fixture';
import { deferred } from '../support/public/hook-admission-fixture';
import * as stages from '../../src/acl/document-stage';
import {
  createWriteServiceExecution,
  deriveWriteOutputExecution,
  readServiceExecution,
} from '../../src/acl/service-execution';
import {
  isWriteOutputAuthorization,
  resolveServiceAuthorization,
  ServiceAuthorizationError,
} from '../../src/acl/service-authorization';
import {
  assertOutputPublication,
  bindOutputPublication,
  closeOutputPublication,
  createCollectionOutputLedger,
  outputPublicationFor,
  type OutputPublication,
} from '../../src/acl/output-publication';
import { prepareIncludeOutput, getIncludeOriginal } from '../../src/output/include-output';

const owners = new Set<OutputPublication>();
let serial = 0;

afterEach(async () => {
  for (const owner of owners) await closeOutputPublication(owner).catch(() => {});
  owners.clear();
  vi.restoreAllMocks();
  mongoose.deleteModel(/^OamLifetimeTarget/);
});

function fixture() {
  const ref = { type: String, ref: 'unused' };
  const f = ownedStageFixture({
    mode: 'trusted',
    schema: { ref, refs: [ref], links: [new mongoose.Schema({ target: ref }, { _id: false })] },
    modelOptions: { createAuthorizationMode: 'trusted', updateAuthorizationMode: 'trusted' },
  });
  const entry = createWriteServiceExecution(f.direct, 'create');
  const state = readServiceExecution(f.direct, deriveWriteOutputExecution(f.direct, entry, 'create'));
  owners.add(state.publication);
  return { ...f, state };
}

describe('F2: publication-owned root and reference provenance lifetime', () => {
  it.each(['create', 'update'].flatMap((operation) => [false, true].map((failure) => ({ operation, failure }))))(
    'real trusted $operation releases its live original after failure=$failure with retained hook input/call',
    async ({ operation, failure }) => {
      let held: any;
      let during: unknown;
      let call!: Parameters<typeof stages.getQueryOutputOriginal>[1];
      const admissions = vi.spyOn(stages, 'prepareQueryDocumentStage');
      const f = writeOutputFixture('trusted', {
        docPermissions: {
          create: hook,
          update: hook,
        },
      });
      function hook(doc: any) {
        if (doc instanceof mongoose.Document) return {};
        held = doc;
        [call] = admissions.mock.calls.find(([candidate, binding]) => isWriteOutputAuthorization(candidate, binding))!;
        during = stages.getQueryOutputOriginal(doc, call);
        doc.value = 'output-hook';
        return failure ? ({ invalid: 'not-boolean' } as never) : {};
      }
      const result =
        operation === 'create'
          ? await f.direct.create({ value: 'stored' }, { select: ['value', '-_id'] }, quietOutput)
          : await f.direct.updateOne({}, { value: 'stored' }, { select: ['value', '-_id'] }, quietOutput);
      expect(result).toMatchObject({ success: !failure });
      const live = operation === 'create' ? f.docs.at(-1) : f.stored;
      expect(during).toBe(live);
      expect(held).not.toBe(live);
      expect((live as any).value).toBe('stored');
      expect(() => assertOutputPublication(outputPublicationFor(call!))).toThrow(ServiceAuthorizationError);
      expect(stages.getQueryOutputOriginal(held, call)).toBe(held);
      expect(f.saved).toHaveLength(1);
      expect(f.saves).toHaveBeenCalledTimes(operation === 'create' ? 0 : 1);
    },
  );

  it.each(['create', 'update'].flatMap((operation) => [false, true].map((failure) => ({ operation, failure }))))(
    'real populated trusted $operation clears held root/descendant keys after failure=$failure',
    async ({ operation, failure }) => {
      const Target = mongoose.model(`OamLifetimeTarget${++serial}`, new mongoose.Schema({ value: String, when: Date }));
      const rawTarget = { value: 'target', when: new Date(1) };
      let held: any;
      let activeTarget: unknown;
      const hook = (doc: any) => {
        if (doc instanceof mongoose.Document) return {};
        held = doc;
        activeTarget = stages.getQueryReferenceOriginal(doc.ref);
        return failure ? ({ invalid: 1 } as never) : {};
      };
      const populate = (doc: mongoose.Document) => {
        vi.spyOn(doc, 'populate').mockImplementation(async () => {
          (doc as any)._doc.ref = rawTarget;
          return doc;
        });
        return doc;
      };
      const f = writeOutputFixture(
        'trusted',
        {
          permissionSchema: { value: true, ref: true },
          docPermissions: { create: hook, update: hook },
          afterPersist: { create: populate, update: populate },
        },
        { ref: { type: String, ref: Target.modelName } },
      );
      f.runtime.registerModelInstance(Target.modelName, Target);
      f.runtime.setModelOptions(Target.modelName, {
        permissionSchema: { value: true, when: true },
        readAuthorizationMode: 'trusted',
        operationAccess: true,
        baseFilter: true,
      });
      const admissions = vi.spyOn(stages, 'prepareQueryDocumentStage');
      const args = {
        select: ['value', 'ref', '-_id'],
        populate: [{ path: 'ref', select: ['value', 'when', '-_id'] }],
      };
      const result =
        operation === 'create'
          ? await f.direct.create({ value: 'stored', ref: 'target-id' }, args, quietOutput)
          : await f.direct.updateOne({}, { value: 'stored' }, args, quietOutput);
      expect(result).toMatchObject({ success: !failure });
      expect(activeTarget).toBe(rawTarget);
      const [call] = admissions.mock.calls.find(([, binding]) => binding.model === f.model)!;
      expect(() => assertOutputPublication(outputPublicationFor(call))).toThrow(ServiceAuthorizationError);
      expect(held.ref).not.toBe(rawTarget);
      expect(stages.getQueryReferenceOriginal(held.ref)).toBeUndefined();
      expect(stages.getQueryOutputOriginal(held, call)).toBe(held);
      held.ref.when.setTime(99);
      expect(rawTarget.when.getTime()).toBe(1);
      expect(f.saved).toHaveLength(1);
      expect(f.adapter.findOne).toHaveBeenCalledTimes(operation === 'create' ? 0 : 1);
    },
  );

  it.each([false, true].flatMap((collection) => [false, true].map((failure) => ({ collection, failure }))))(
    'releases scalar/array/dotted keys and source reuse on collection=$collection failure=$failure',
    async ({ collection, failure }) => {
      const f = fixture();
      if (collection) createCollectionOutputLedger(f.state.publication);
      const target = { value: 'raw-target', when: new Date(1) };
      const raw = { ref: target, refs: [target, target], links: [{ target }] };
      const admitted = stages.prepareQueryDocumentStage(f.state.authorization, f.binding, raw);
      const held = admitted.source as typeof raw;
      const occurrences = [held.ref, ...held.refs, held.links[0].target];
      expect(stages.prepareQueryOutputSource(f.state.authorization, f.binding, held).source).toBe(held);
      const working = prepareIncludeOutput(held, f.state.authorization, f.binding);
      expect(getIncludeOriginal(working, f.state.authorization)).toBe(raw);
      expect(stages.getQueryOutputOriginal(held, f.state.authorization)).toBe(raw);
      for (const key of occurrences) expect(stages.getQueryReferenceOriginal(key)).toBe(target);
      const error = failure ? new ServiceAuthorizationError('fixture failure') : undefined;
      await closeOutputPublication(f.state.publication, error).catch((caught) => {
        expect(caught).toBe(error);
      });
      expect(() => assertOutputPublication(f.state.publication)).toThrow(ServiceAuthorizationError);
      expect(stages.getQueryOutputOriginal(held, f.state.authorization)).toBe(held);
      expect(getIncludeOriginal(working, f.state.authorization)).toBe(working);
      for (const key of occurrences) expect(stages.getQueryReferenceOriginal(key)).toBeUndefined();
    },
  );

  it('keeps links while admitted callback work drains, then clears them on terminal failure', async () => {
    const f = fixture();
    const raw = { ref: { value: 'target' } };
    const admitted = stages.prepareQueryDocumentStage(f.state.authorization, f.binding, raw);
    const held = admitted.source as typeof raw;
    const release = deferred();
    const pending = stages.resolveDocumentStage(admitted.stage, async () => {
      await release.promise;
      return {};
    });
    const rejected = pending.catch((error) => error);
    const error = new ServiceAuthorizationError('stop');
    let settled = false;
    const closing = closeOutputPublication(f.state.publication, error).catch((caught) => {
      settled = true;
      return caught;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(stages.getQueryOutputOriginal(held, f.state.authorization)).toBe(raw);
    expect(stages.getQueryReferenceOriginal(held.ref)).toBe(raw.ref);
    release.resolve();
    expect(await rejected).toBeInstanceOf(ServiceAuthorizationError);
    expect(await closing).toBe(error);
    expect(stages.getQueryOutputOriginal(held, f.state.authorization)).toBe(held);
    expect(stages.getQueryReferenceOriginal(held.ref)).toBeUndefined();
  });

  it.each(
    [false, true].flatMap((sameTarget) =>
      [0, 1].flatMap((first) => [false, true].map((failure) => ({ sameTarget, first, failure }))),
    ),
  )(
    'overlapping shared source/reference keys retain each active owner (same target=$sameTarget, close first=$first, failure=$failure)',
    async ({ sameTarget, first, failure }) => {
      const f = fixture();
      const targetA = { value: 'target-a' };
      const targetB = sameTarget ? targetA : { value: 'target-b' };
      const shared = { value: 'normalized', ref: { value: 'normalized-target' } };
      const docs = [new f.model(), new f.model()];
      (docs[0] as any)._doc.ref = targetA;
      (docs[1] as any)._doc.ref = targetB;
      for (const doc of docs) vi.spyOn(doc, 'toObject').mockReturnValue(shared as never);
      const calls = docs.map(() => f.ownCall());
      const pubs = calls.map(outputPublicationFor);
      pubs.forEach((pub) => {
        owners.add(pub);
        createCollectionOutputLedger(pub);
      });
      const prepared = calls.map((call, index) => stages.prepareQueryOutputSource(call, f.binding, docs[index]));
      expect(prepared[0].source).toBe(shared);
      expect(prepared[1].source).toBe(shared);
      expect.soft(stages.getQueryOutputOriginal(shared, calls[0])).toBe(docs[0]);
      expect.soft(stages.getQueryOutputOriginal(shared, calls[1])).toBe(docs[1]);
      // Publication-scoped identity never guesses another active owner's raw row.
      expect.soft(stages.getQueryReferenceOriginal(shared.ref, pubs[0])).toBe(targetA);
      expect.soft(stages.getQueryReferenceOriginal(shared.ref, pubs[1])).toBe(targetB);
      expect.soft(stages.getQueryReferenceOriginal(shared.ref)).toBe(sameTarget ? targetA : undefined);
      const error = failure ? new ServiceAuthorizationError('owner failure') : undefined;
      const closing = closeOutputPublication(pubs[first], error);
      if (failure) await expect(closing).rejects.toBe(error);
      else await closing;
      const remaining = 1 - first;
      assertOutputPublication(pubs[remaining]);
      expect(stages.getQueryOutputOriginal(shared, calls[first])).toBe(shared);
      expect(stages.getQueryOutputOriginal(shared, calls[remaining])).toBe(docs[remaining]);
      expect(stages.getQueryReferenceOriginal(shared.ref, pubs[remaining])).toBe(remaining ? targetB : targetA);
      await closeOutputPublication(pubs[remaining]);
      expect(stages.getQueryOutputOriginal(shared, calls[remaining])).toBe(shared);
      expect(stages.getQueryReferenceOriginal(shared.ref)).toBeUndefined();
    },
  );

  it('releases repeated associations owned by one publication without clearing a simultaneous independent owner', async () => {
    const f = fixture();
    const rawTarget = { value: 'target' };
    const shared = { ref: { value: 'normalized' } };
    const pubA = outputPublicationFor(f.ownCall());
    const pubB = outputPublicationFor(f.ownCall());
    owners.add(pubA);
    owners.add(pubB);
    const inputs = [pubA, pubA, pubB].map((pub) => {
      const call = resolveServiceAuthorization({ ...f.input, readResponse: true });
      bindOutputPublication(call, pub);
      const doc = new f.model();
      (doc as any)._doc.ref = rawTarget;
      vi.spyOn(doc, 'toObject').mockReturnValue(shared as never);
      stages.prepareQueryOutputSource(call, f.binding, doc);
      return { call, doc };
    });
    await closeOutputPublication(pubA);
    expect(stages.getQueryOutputOriginal(shared, inputs[0].call)).toBe(shared);
    expect(stages.getQueryOutputOriginal(shared, inputs[1].call)).toBe(shared);
    expect(stages.getQueryOutputOriginal(shared, inputs[2].call)).toBe(inputs[2].doc);
    expect(stages.getQueryReferenceOriginal(shared.ref, pubB)).toBe(rawTarget);
    await closeOutputPublication(pubB);
    expect(stages.getQueryReferenceOriginal(shared.ref)).toBeUndefined();
  });

  it("does not adopt another call's provenance or inspect a borrowed source's unvisited graph on reuse", async () => {
    const f = fixture();
    const rawTarget = { value: 'raw' };
    const getter = vi.fn(() => {
      throw new Error('unvisited');
    });
    const hidden = Object.defineProperty({}, 'unused', { get: getter, enumerable: true });
    const shared = { ref: { value: 'normalized' }, hidden };
    const doc = new f.model();
    (doc as any)._doc.ref = rawTarget;
    vi.spyOn(doc, 'toObject').mockReturnValue(shared as never);
    const callA = f.ownCall(),
      callB = f.ownCall();
    const pubA = outputPublicationFor(callA),
      pubB = outputPublicationFor(callB);
    owners.add(pubA);
    owners.add(pubB);
    stages.prepareQueryOutputSource(callA, f.binding, doc);
    const reused = stages.prepareQueryOutputSource(callB, f.binding, shared);
    expect(reused.source).toBe(shared);
    expect(stages.getQueryOutputOriginal(shared, callA)).toBe(doc);
    expect(stages.getQueryOutputOriginal(shared, callB)).toBe(shared);
    expect(stages.getQueryReferenceOriginal(shared.ref, pubA)).toBe(rawTarget);
    expect(stages.getQueryReferenceOriginal(shared.ref, pubB)).toBeUndefined();
    await closeOutputPublication(pubA);
    assertOutputPublication(pubB);
    expect(stages.prepareQueryOutputSource(callB, f.binding, shared)).toBe(reused);
    expect(stages.getQueryOutputOriginal(shared, callB)).toBe(shared);
    expect(stages.getQueryReferenceOriginal(shared.ref)).toBeUndefined();
    expect(getter).not.toHaveBeenCalled();
  });

  it('does not guess between conflicting identities in one publication or clear an independent owner', async () => {
    const f = fixture();
    const shared = { ref: { value: 'normalized' } };
    const targets = [{ value: 'a' }, { value: 'b' }];
    const pubA = outputPublicationFor(f.ownCall()),
      pubB = outputPublicationFor(f.ownCall());
    owners.add(pubA);
    owners.add(pubB);
    for (const [index, pub] of [pubA, pubA, pubB].entries()) {
      const call = resolveServiceAuthorization({ ...f.input, readResponse: true });
      bindOutputPublication(call, pub);
      const doc = new f.model();
      (doc as any)._doc.ref = targets[index === 1 ? 1 : 0];
      vi.spyOn(doc, 'toObject').mockReturnValue(shared as never);
      stages.prepareQueryOutputSource(call, f.binding, doc);
      expect(stages.getQueryOutputOriginal(shared, call)).toBe(doc);
    }
    expect(stages.getQueryReferenceOriginal(shared.ref, pubA)).toBeUndefined();
    expect(stages.getQueryReferenceOriginal(shared.ref, pubB)).toBe(targets[0]);
    expect(stages.getQueryReferenceOriginal(shared.ref)).toBeUndefined();
    await closeOutputPublication(pubA);
    expect(stages.getQueryReferenceOriginal(shared.ref, pubB)).toBe(targets[0]);
    expect(stages.getQueryReferenceOriginal(shared.ref)).toBe(targets[0]);
    await closeOutputPublication(pubB);
    expect(stages.getQueryReferenceOriginal(shared.ref)).toBeUndefined();
  });

  it('releases every prefix association when reference capture fails partway through traversal', async () => {
    const f = fixture();
    const shared = { ref: { value: 'normalized' }, refs: [] as object[] };
    const targetA = { value: 'a' },
      targetB = { value: 'b' };
    const calls = [f.ownCall(), f.ownCall()];
    const pubs = calls.map(outputPublicationFor);
    pubs.forEach((pub) => owners.add(pub));
    const docs = [new f.model(), new f.model()];
    (docs[0] as any)._doc.ref = targetA;
    (docs[1] as any)._doc.ref = targetB;
    for (const doc of docs) vi.spyOn(doc, 'toObject').mockReturnValue(shared as never);
    stages.prepareQueryOutputSource(calls[1], f.binding, docs[1]);
    shared.refs = Array(10001).fill(shared.ref);
    (docs[0] as any)._doc.refs = Array(10001).fill(targetA);
    expect(() => stages.prepareQueryOutputSource(calls[0], f.binding, docs[0])).toThrow(ServiceAuthorizationError);
    expect(stages.getQueryReferenceOriginal(shared.ref, pubs[0])).toBe(targetA);
    expect(stages.getQueryReferenceOriginal(shared.ref, pubs[1])).toBe(targetB);
    const error = new ServiceAuthorizationError('capture failed');
    await expect(closeOutputPublication(pubs[0], error)).rejects.toBe(error);
    expect(stages.getQueryOutputOriginal(shared, calls[0])).toBe(shared);
    expect(stages.getQueryOutputOriginal(shared, calls[1])).toBe(docs[1]);
    expect(stages.getQueryReferenceOriginal(shared.ref)).toBe(targetB);
    await closeOutputPublication(pubs[1]);
    expect(stages.getQueryReferenceOriginal(shared.ref)).toBeUndefined();
  });
});
