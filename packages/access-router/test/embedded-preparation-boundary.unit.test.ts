import { afterEach, describe, expect, it, vi } from 'vitest';
import Permission from '../src/permission';
import type { AccessRouterRequest } from '../src/interfaces';
import { resolveServiceAuthorization } from '../src/acl/service-authorization';
import { createDocumentAuthorizationStage, resolveDocumentAuthorization } from '../src/acl/document-authorization';
import { authorizeEmbeddedOutputPlan, evaluateAuthorizedOutputField } from '../src/acl/output-field-filter';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';

function fixture(rule: unknown, skip: boolean, copy: boolean) {
  const binding = { request: {} as AccessRouterRequest, runtime: {}, model: {}, modelName: 'EmbeddedPreparation' };
  const authorization = resolveServiceAuthorization({
    binding,
    access: {
      operation: 'list',
      rowAccess: 'list',
      outputAccess: 'list',
      virtualAccess: 'list',
      docPermissionsAccess: 'list',
    },
    configuration: {
      catalog: { paths: ['children', 'children.value'], containerPaths: ['children'] },
      permissionSchema: { children: { list: true, sub: { value: rule } } },
      unsafeSkipListDocumentSnapshotChecks: skip,
      unsafeSkipListNestedDocumentSnapshotChecks: skip,
      unsafeSkipListOutputSnapshotChecks: skip,
      unsafeSkipListInitialOutputSnapshotCopy: copy,
    },
    requestPermissions: new Permission({}),
    listResponse: true,
  });
  const parent = planAuthorizedModelProjection({ authorization, binding });
  const child = parent.childPlans.children;
  const derive = () => authorizeEmbeddedOutputPlan(parent, child);
  return { parent, child, derive, binding };
}

afterEach(() => vi.restoreAllMocks());

describe('PIPE-05 embedded preparation cannot reuse resolved child calls', () => {
  it.each([false, true].flatMap((skip) => [false, true].map((copy) => ({ skip, copy }))))(
    'retains normalization observations even on ordinary configuration (skip: $skip, copy: $copy)',
    async ({ skip, copy }) => {
      let observations = 0;
      const rule = vi.fn(() => observations === 0);
      const f = fixture(rule, skip, copy);
      const first = f.derive();
      const descriptor = Object.getOwnPropertyDescriptor(Date, Symbol.hasInstance);
      const original = Date[Symbol.hasInstance];
      const observe = <T>(derive: () => T) => {
        observations = 0;
        try {
          Object.defineProperty(Date, Symbol.hasInstance, {
            configurable: true,
            value(value: unknown) {
              observations++;
              return original.call(Date, value);
            },
          });
          return derive();
        } finally {
          if (descriptor) Object.defineProperty(Date, Symbol.hasInstance, descriptor);
          else Reflect.deleteProperty(Date, Symbol.hasInstance);
        }
      };
      const evaluate = async (plan: ReturnType<typeof f.derive>) => {
        const handle = await resolveDocumentAuthorization(
          createDocumentAuthorizationStage(plan.authorization!, plan.authorizationBinding!, { value: 'private' }),
          () => ({}),
        );
        return evaluateAuthorizedOutputField(handle, plan.authorizationBinding!, 'value');
      };
      const fresh = observe(f.derive);
      const freshCount = observations;
      expect(fresh.authorization).not.toBe(first.authorization);
      expect(freshCount).toBeGreaterThan(0);
      expect(await evaluate(fresh)).toBe(false);
      // Diagnostic rejected alternative, not a production cache: reusing the
      // first resolved child omits even ordinary-object normalization and grants
      // a field the fresh derivation denied. Primitive catalog memoization cannot
      // establish a certificate for this broader boundary.
      const reused = observe(() => first);
      expect(observations).toBe(0);
      expect(await evaluate(reused)).toBe(true);
      expect(rule).toHaveBeenCalledTimes(2);
    },
  );

  it('keeps same-ID child grants, actor and field decisions independent after repeated derivations', async () => {
    const actors: unknown[] = [];
    const rule = vi.fn(function (this: unknown, _permissions: Permission, grants: Record<string, unknown>) {
      actors.push(this);
      return grants.owner === true;
    });
    const f = fixture(rule, false, false);
    const plans = [f.derive(), f.derive()];
    const handles = await Promise.all(
      plans.map((plan, index) =>
        resolveDocumentAuthorization(
          createDocumentAuthorizationStage(plan.authorization!, plan.authorizationBinding!, {
            _id: 'same',
            value: 'value',
          }),
          () => ({ owner: index === 0 }),
        ),
      ),
    );
    expect(handles[0]).not.toBe(handles[1]);
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(await evaluateAuthorizedOutputField(handles[0], plans[0].authorizationBinding!, 'value')).toBe(true);
      expect(await evaluateAuthorizedOutputField(handles[1], plans[1].authorizationBinding!, 'value')).toBe(false);
    }
    expect(rule).toHaveBeenCalledTimes(2);
    expect(actors).toEqual([f.binding.request, f.binding.request]);
  });
});
