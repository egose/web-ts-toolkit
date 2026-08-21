/**
 * ARR-11: README "Failure handling" block (#12).
 *
 * Demonstrates the failure-handling contract against the published
 * declarations: a resolved `success: false` response surfaces as a
 * `ServiceError` on `error`/`onError`/the rejected `mutate`/`query`/`refetch`
 * promise, never triggers `onSuccess`, and never populates `data` with a
 * failure payload. Runtime behavior is covered by the package test suite;
 * this fixture anchors the documented type surface so the README block
 * typechecks against the installed declarations.
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

const { useRead, useCreate } = createModelHooks({ modelService: organizationService });

// docs-block-start: packages/access-router-react/README.md#12
function FailureExample() {
  const { data, error, refetch } = useRead({
    id: 'org_404',
    onError: (svcErr) => console.error('query failed', svcErr.status, svcErr.message),
  });

  const { mutate, reset } = useCreate({
    onError: (svcErr) => console.error('create failed', svcErr.message),
  });

  async function retryCreate() {
    try {
      await mutate({ name: '' });
    } catch (svcErr) {
      console.error('create rejected', (svcErr as Error).message);
      reset();
    }
  }

  void data;
  void refetch;
  void retryCreate;
}
// docs-block-end: packages/access-router-react/README.md#12

void FailureExample;
