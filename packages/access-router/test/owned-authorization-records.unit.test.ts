import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocumentStage, readDocumentStage, resolveDocumentStage } from '../src/acl/document-stage';
import { readServiceAuthorization, ServiceAuthorizationError } from '../src/acl/service-authorization';
import { authorizeEmbeddedOutputPlan } from '../src/acl/output-field-filter';
import {
  assertOutputPublication,
  closeOutputPublication,
  failOutputPublication,
  outputPublicationFor,
} from '../src/acl/output-publication';
import {
  assertTrustedOutputBudget,
  createReceivingOutputBudget,
  createTrustedOutputBudget,
  materializeTrustedOutputValue,
  visitTrustedOutput,
} from '../src/acl/trusted-output-materialization';
import { ownedStageFixture, sourceModes } from './owned-stage-test-fixture';

afterEach(() => vi.restoreAllMocks());

function installSlot(key: string, descriptor: PropertyDescriptor) {
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
  Object.defineProperty(Object.prototype, key, Object.assign(Object.create(null), { configurable: true }, descriptor));
  return () => {
    if (previous) Object.defineProperty(Object.prototype, key, previous);
    else Reflect.deleteProperty(Object.prototype, key);
  };
}

describe('private authority records own lazy slots before application/native work', () => {
  it.each(sourceModes.flatMap((mode) => ['result', 'grants'].map((key) => ({ mode, key }))))(
    '$mode resolves facts once without observing an inherited $key slot',
    async ({ mode, key }) => {
      const f = ownedStageFixture({ mode });
      const stage = createDocumentStage(f.call, f.binding, { value: 'original' });
      const setter = vi.fn();
      const hook = vi.fn(() => ({ owner: true }));
      const restore = installSlot(key, { set: setter });
      let facts: unknown, held: unknown, failure: unknown;
      try {
        facts = await resolveDocumentStage(stage, hook);
        held = readDocumentStage(stage, f.binding).grants;
      } catch (error) {
        failure = error;
      } finally {
        restore();
      }
      expect(failure).toBeUndefined();
      expect(facts).toEqual({ owner: true });
      expect(held).toBe(facts);
      expect(hook).toHaveBeenCalledTimes(1);
      expect(setter).not.toHaveBeenCalled();
    },
  );

  it('publication poison remains the exact failure despite an inherited failure setter', async () => {
    const f = ownedStageFixture();
    const owner = outputPublicationFor(f.call);
    await f.stage({ value: 'original' });
    const failure = new ServiceAuthorizationError('controlled original failure');
    const setter = vi.fn();
    const restore = installSlot('failure', { set: setter });
    let assertion: unknown, closing: unknown;
    try {
      failOutputPublication(owner, failure);
      try {
        assertOutputPublication(owner);
      } catch (error) {
        assertion = error;
      }
      closing = await closeOutputPublication(owner).catch((error) => error);
    } finally {
      restore();
    }
    expect(assertion).toBe(failure);
    expect(closing).toBe(failure);
    expect(setter).not.toHaveBeenCalled();
  });

  it('a caught selected overflow poisons its budget even with an inherited failure setter', () => {
    const budget = createTrustedOutputBudget();
    const setter = vi.fn();
    const restore = installSlot('failure', { set: setter });
    let first: unknown, second: unknown;
    try {
      try {
        visitTrustedOutput(budget, 0, 20001);
      } catch (error) {
        first = error;
      }
      try {
        assertTrustedOutputBudget(budget);
      } catch (error) {
        second = error;
      }
    } finally {
      restore();
    }
    expect(first).toBeInstanceOf(ServiceAuthorizationError);
    expect(second).toBe(first);
    expect(setter).not.toHaveBeenCalled();
  });

  it('related construction cannot lose its receiving depleted budget to an inherited recipients setter', () => {
    const parent = createTrustedOutputBudget();
    visitTrustedOutput(parent, 0, 19999);
    const setter = vi.fn(),
      policy = vi.fn(() => true);
    const restore = installSlot('recipients', { set: setter });
    let failure: unknown;
    try {
      const receiving = createReceivingOutputBudget([{ budget: parent, depth: 1 }]);
      try {
        materializeTrustedOutputValue({ selected: 'value' }, 'child', receiving, { keep: policy });
      } catch (error) {
        failure = error;
      }
    } finally {
      restore();
    }
    expect(failure).toBeInstanceOf(ServiceAuthorizationError);
    expect(policy).not.toHaveBeenCalled();
    expect(setter).not.toHaveBeenCalled();
    expect(() => assertTrustedOutputBudget(parent)).toThrow(ServiceAuthorizationError);
  });

  it.each(['root', 'embedded'] as const)(
    '%s private call preparation cannot be replaced by an inherited view getter',
    async (entry) => {
      const f = ownedStageFixture({
        modelOptions: { permissionSchema: { children: { read: true, sub: { value: true } } } },
      });
      const child = entry === 'embedded' ? authorizeEmbeddedOutputPlan(f.plan, f.plan.childPlans.children) : undefined;
      const call = child?.authorization ?? f.ownCall();
      const binding = child?.authorizationBinding ?? f.binding;
      const foreign = Object.freeze({
        configuration: { permissionSchema: { value: false } },
        authorization: { outputFields: { mode: 'unrestricted' } },
      });
      const get = vi.fn(() => foreign);
      const restore = installSlot('view', { get });
      let view: ReturnType<typeof readServiceAuthorization> | undefined;
      try {
        view = readServiceAuthorization(call!, binding!);
      } finally {
        restore();
      }
      expect(view).not.toBe(foreign);
      expect(view!.authorization.outputFields).toEqual({ mode: 'request' });
      expect(get).not.toHaveBeenCalled();
    },
  );
});
