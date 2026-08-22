/**
 * ARR-11: README "Concurrent Mutations" block (#13).
 *
 * Anchors the documented `useUpdate` overlap example against the published
 * `mutate` promise + `data` shape. The block exercises the
 * latest-invocation-wins contract (Task ARR-07 req 2) and the active-count
 * `isPending` contract (Task ARR-07 req 1) at the type level — runtime
 * settlement order is covered by the package test suite.
 */
import type { Document } from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '@web-ts-toolkit/access-router-react';
import { adapter } from './setup.js';

interface Organization extends Document {
  _id?: string;
  name: string;
  status?: 'active' | 'archived';
}

const organizationService = adapter.createModelService<Organization>({
  modelName: 'Organization',
  basePath: 'organizations',
});

const { useUpdate } = createModelHooks({ modelService: organizationService });

{
  // docs-block-start: packages/access-router-react/README.md#14
  function Save() {
    const { mutate, isPending } = useUpdate({ advanced: true, select: ['name'] as const });

    const saveTwice = async () => {
      const [firstResult, secondResult] = await Promise.all([
        mutate('org_1', { name: 'A' }),
        mutate('org_1', { name: 'B' }),
      ]);
      // Promise.all preserves invocation order. Hook state still follows the latest invocation.
      console.log(firstResult.data?.name, secondResult.data?.name);
      return secondResult.data;
    };

    return (
      <button disabled={isPending} onClick={saveTwice}>
        Save twice
      </button>
    );
  }
  // docs-block-end: packages/access-router-react/README.md#14

  void Save;
}

{
  // docs-block-start: website/docs/packages/access-router-react.md#12
  function Save() {
    const { mutate, isPending } = useUpdate({ advanced: true, select: ['name'] as const });

    const saveTwice = async () => {
      const [firstResult, secondResult] = await Promise.all([
        mutate('org_1', { name: 'A' }),
        mutate('org_1', { name: 'B' }),
      ]);
      // Promise.all preserves invocation order. Hook state still follows the latest invocation.
      console.log(firstResult.data?.name, secondResult.data?.name);
      return secondResult.data;
    };

    return (
      <button disabled={isPending} onClick={saveTwice}>
        Save twice
      </button>
    );
  }
  // docs-block-end: website/docs/packages/access-router-react.md#12

  void Save;
}
