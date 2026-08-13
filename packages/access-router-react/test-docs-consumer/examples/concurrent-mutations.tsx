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

// README block #13
function Save() {
  const { mutate, isPending } = useUpdate({ advanced: true, select: ['name'] as const });

  const saveTwice = async () => {
    const [second] = await Promise.all([mutate('org_1', { name: 'A' }), mutate('org_1', { name: 'B' })]);
    // `second.data` reflects whoever settled last as the latest-invocation.
    return second.data;
  };

  return (
    <button disabled={isPending} onClick={saveTwice}>
      Save twice
    </button>
  );
}

void Save;
