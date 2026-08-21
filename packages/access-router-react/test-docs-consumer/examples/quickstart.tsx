/**
 * ARR-11: README "Quick Start" block (#3).
 *
 * Extracted from README "Quick Start" with explicit surrounding setup so the
 * documented component stays verbatim inside scaffold markers. The `setup.ts`
 * fixture supplies the adapter/service factory wiring; this fixture anchors
 * the README block against the published declaration surface.
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

const { useList, useCreate } = createModelHooks({ modelService: organizationService });

// docs-block-start: packages/access-router-react/README.md#3
function OrganizationList() {
  const { data, isLoading, error } = useList({
    listParams: { pageSize: 20 },
  });

  const { mutate, isPending, error: createError, reset } = useCreate();

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div>
      <button disabled={isPending} onClick={() => mutate({ name: 'Northwind Labs' })}>
        Create
      </button>
      {createError && <p role="alert">Create failed: {createError.message}</p>}
      <button onClick={reset}>Clear create error</button>

      <ul>
        {data.map((org) => (
          <li key={org._id}>{org.name}</li>
        ))}
      </ul>
    </div>
  );
}
// docs-block-end: packages/access-router-react/README.md#3

void OrganizationList;
