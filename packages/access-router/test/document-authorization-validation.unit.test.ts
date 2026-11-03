import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceAuthorizationError } from '../src/acl/service-authorization';
import {
  assertDocumentStage,
  closeDocumentStage,
  createDocumentStage,
  documentStageSource,
  memoizeStageFieldDecision,
  readDocumentStage,
  readDocumentStageAccess,
  resolveDocumentStage,
} from '../src/acl/document-stage';
import { closeOutputPublication, outputPublicationFor } from '../src/acl/output-publication';
import { deferred } from './hook-admission-fixture';
import { ownedStageFixture, sourceModes } from './owned-stage-test-fixture';

afterEach(() => vi.restoreAllMocks());

describe('owned stage validation at real receiving and asynchronous boundaries', () => {
  it.each(sourceModes)('%s owner reads share immutable facts without observing source natives again', async (mode) => {
    const f = ownedStageFixture({ mode });
    const source = { value: 'original', when: new Date(1) };
    const stage = await f.stage(source, { owner: true });
    const facts = readDocumentStage(stage, f.binding).grants;
    const observe = vi.spyOn(Date.prototype, 'getTime');
    for (let repeat = 0; repeat < 8; repeat++) {
      expect(readDocumentStageAccess(stage, f.binding).authorization).toBe(f.call);
      expect(readDocumentStage(stage, f.binding).grants).toBe(facts);
      expect(memoizeStageFieldDecision(stage, f.binding, 'value', () => true)).toBe(true);
    }
    expect(observe).not.toHaveBeenCalled();
    expect(Object.getPrototypeOf(facts)).toBeNull();
    expect(Object.isFrozen(facts)).toBe(true);
  });

  it.each(sourceModes)(
    '%s source identity is private stage input, not an equal-ID output certificate',
    async (mode) => {
      const f = ownedStageFixture({ mode });
      const source = { _id: 'same', value: 'original' };
      const stage = await f.stage(source, { owner: true });
      const owned = documentStageSource(stage, f.binding);
      expect(() => assertDocumentStage(stage, f.call, f.binding, owned)).not.toThrow();
      expect(() => assertDocumentStage(stage, f.call, f.binding, { ...owned })).toThrow(ServiceAuthorizationError);
      expect(() => assertDocumentStage(stage, f.ownCall(), f.binding, owned)).toThrow(ServiceAuthorizationError);
      if (mode === 'isolated') expect(owned).not.toBe(source);
      else expect(owned).toBe(source);
    },
  );

  it.each(
    sourceModes.flatMap((mode) =>
      ['request', 'runtime', 'model', 'modelName', 'scopePath'].map((key) => ({ mode, key })),
    ),
  )('$mode rejects changed $key before cold or settled memo work', async ({ mode, key }) => {
    const f = ownedStageFixture({ mode });
    const stage = await f.stage({ value: 'original' }, { owner: true });
    const evaluate = vi.fn(() => true);
    expect(memoizeStageFieldDecision(stage, f.binding, 'warm', evaluate)).toBe(true);
    const binding = { ...f.binding, [key]: key === 'modelName' ? 'wrong' : key === 'scopePath' ? ['children'] : {} };
    expect(() => readDocumentStageAccess(stage, binding)).toThrow(ServiceAuthorizationError);
    expect(() => readDocumentStage(stage, binding)).toThrow(ServiceAuthorizationError);
    expect(() => memoizeStageFieldDecision(stage, binding, 'warm', evaluate)).toThrow(ServiceAuthorizationError);
    expect(() => memoizeStageFieldDecision(stage, binding, 'cold', evaluate)).toThrow(ServiceAuthorizationError);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    'retains a synchronous %s memo without inventing an asynchronous validation window',
    async (allowed) => {
      const f = ownedStageFixture();
      const stage = await f.stage({ value: 'original' }, { owner: true });
      const binding = { ...f.binding };
      const evaluate = vi.fn(function (this: unknown, permissions, facts) {
        expect(this).toBe(f.request);
        expect(permissions.has('reader')).toBe(true);
        expect(facts.owner).toBe(true);
        queueMicrotask(() => {
          binding.modelName = 'changed after synchronous commit';
        });
        return allowed;
      });
      expect(memoizeStageFieldDecision(stage, binding, 'value', evaluate)).toBe(allowed);
      await Promise.resolve();
      expect(() => memoizeStageFieldDecision(stage, binding, 'value', evaluate)).toThrow(ServiceAuthorizationError);
      expect(evaluate).toHaveBeenCalledTimes(1);
    },
  );

  it('checks a synchronous evaluator binding change immediately before memo commit', async () => {
    const f = ownedStageFixture();
    const stage = await f.stage({ value: 'original' });
    const binding = { ...f.binding };
    const evaluate = vi.fn(() => {
      binding.modelName = 'wrong';
      return true;
    });
    await expect(memoizeStageFieldDecision(stage, binding, 'value', evaluate)).rejects.toBeInstanceOf(
      ServiceAuthorizationError,
    );
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(() => readDocumentStage(stage, f.binding)).toThrow(ServiceAuthorizationError);
  });

  it.each(
    sourceModes.flatMap((mode) =>
      ['request', 'runtime', 'model', 'modelName', 'scopePath'].map((key) => ({ mode, key })),
    ),
  )('$mode shares pending consumers but rejects changed $key on actual async resume', async ({ mode, key }) => {
    const f = ownedStageFixture({ mode });
    const stage = await f.stage({ _id: 'same', value: 'original' }, { owner: true });
    const binding = { ...f.binding };
    const release = deferred();
    const evaluate = vi.fn(async () => {
      await release.promise;
      return true;
    });
    const first = memoizeStageFieldDecision(stage, binding, 'value', evaluate);
    const second = memoizeStageFieldDecision(stage, binding, 'value', evaluate);
    expect(second).toBe(first);
    Object.assign(binding, { [key]: key === 'modelName' ? 'wrong' : key === 'scopePath' ? ['children'] : {} });
    const failures = Promise.allSettled([first, second]);
    release.resolve();
    const results = await failures;
    expect(
      results.every((result) => result.status === 'rejected' && result.reason instanceof ServiceAuthorizationError),
    ).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(() => memoizeStageFieldDecision(stage, f.binding, 'value', () => true)).toThrow(ServiceAuthorizationError);
  });

  it.each(sourceModes)(
    '%s captures facts after a suspended hook without revalidating application source graphs',
    async (mode) => {
      const f = ownedStageFixture({ mode });
      const source = { value: 'original', when: new Date(1) };
      const stage = createDocumentStage(f.call, f.binding, source);
      const release = deferred();
      const hook = vi.fn(async (doc) => {
        await release.promise;
        return { owner: doc.value === 'original' };
      });
      const pending = resolveDocumentStage(stage, hook);
      expect(resolveDocumentStage(stage, hook)).toBe(pending);
      source.value = 'changed';
      source.when.setTime(9);
      release.resolve();
      expect(await pending).toEqual({ owner: mode === 'isolated' });
      expect(hook).toHaveBeenCalledTimes(1);
    },
  );

  it('does not mark a reentrant decision fulfilled before its original evaluator returns', async () => {
    const f = ownedStageFixture();
    const stage = await f.stage({ value: 'original' });
    let nested: unknown;
    const alternative = vi.fn(() => false);
    const evaluate = vi.fn(() => {
      nested = memoizeStageFieldDecision(stage, f.binding, 'value', alternative);
      expect(nested).toBeInstanceOf(Promise);
      return true;
    });
    expect(memoizeStageFieldDecision(stage, f.binding, 'value', evaluate)).toBe(true);
    expect(await nested).toBe(true);
    expect(memoizeStageFieldDecision(stage, f.binding, 'value', alternative)).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(alternative).not.toHaveBeenCalled();
  });

  it.each(['facts', 'decision'] as const)(
    'pending %s rejection closes and drains the owner, never reruns failed work',
    async (kind) => {
      const f = ownedStageFixture();
      const stage = createDocumentStage(f.call, f.binding, { value: 'original' });
      const release = deferred();
      const error = new Error('retained application failure');
      const fail = vi.fn(async () => {
        await release.promise;
        throw error;
      });
      if (kind === 'decision') await resolveDocumentStage(stage, () => ({}));
      const start = () =>
        kind === 'facts'
          ? resolveDocumentStage(stage, fail)
          : memoizeStageFieldDecision(stage, f.binding, 'value', fail);
      const first = start();
      expect(start()).toBe(first);
      const rejected = Promise.resolve(first).catch((failure) => failure);
      release.resolve();
      expect(await rejected).toBe(error);
      expect(fail).toHaveBeenCalledTimes(1);
      expect(() => start()).toThrow(ServiceAuthorizationError);
      await expect(closeOutputPublication(outputPublicationFor(f.call))).rejects.toBe(error);
    },
  );

  it('rejects native fulfilled grants before any native method and never freezes the application map', async () => {
    const f = ownedStageFixture();
    const stage = createDocumentStage(f.call, f.binding, { value: 'original' });
    const getTime = vi.fn(() => 1);
    const rich = { when: Object.assign(new Date(1), { getTime }) };
    const hook = vi.fn(() => rich);
    await expect(resolveDocumentStage(stage, hook as never)).rejects.toMatchObject({ result: { code: 'bad_request' } });
    expect(() => resolveDocumentStage(stage, hook as never)).toThrow(ServiceAuthorizationError);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(getTime).not.toHaveBeenCalled();
    expect(Object.isFrozen(rich)).toBe(false);
  });

  it('native source reentry cannot confer authority on a different closed stage', async () => {
    const f = ownedStageFixture();
    const closed = await f.stage({ value: 'stale' });
    closeDocumentStage(closed);
    const bindingRead = vi.fn();
    const wrongBinding = Object.defineProperty({ ...f.binding }, 'request', { get: bindingRead });
    const getTime = vi.fn(() => {
      expect(() => readDocumentStageAccess(closed, wrongBinding)).toThrow(ServiceAuthorizationError);
      return 1;
    });
    const current = await f.stage({ value: 'current', when: Object.assign(new Date(1), { getTime }) });
    expect(readDocumentStage(current, f.binding).authorization).toBe(f.call);
    expect(getTime).toHaveBeenCalled();
    expect(bindingRead).not.toHaveBeenCalled();
  });
});
