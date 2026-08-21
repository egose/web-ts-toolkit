/* eslint-disable react-hooks/rules-of-hooks */
/**
 * ARR-11: website quick-start + useCreate/useDistinct/website Listing
 * examples (#2 OrganizationList block, #6 useDistinct, #7 useCreate with plain
 * array `select`, #8 cancellation-but-no wait no — depends on what arrives).
 *
 * The website uses plain arrays (`['_id', 'name']`, not `as const`) for some
 * examples; the published `select` option accepts the broad `Projection`
 * sentinel so the plain-array form typechecks without literal narrowing.
 */
import type { Document } from '@web-ts-toolkit/access-router-client';
import { createAdapter } from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '@web-ts-toolkit/access-router-react';
import { adapter as sharedAdapter } from './setup.js';

interface Organization extends Document {
  _id?: string;
  name: string;
  status?: 'active' | 'archived';
  organizationId?: string;
}

// website block #1 — uses createAdapter from the client package directly
const adapter = createAdapter({ baseURL: 'https://api.example.com' });

const organizationService = adapter.createModelService<Organization>({
  modelName: 'Organization',
  basePath: 'organizations',
});

const {
  useList,
  useRead,
  useCreate,
  useUpdate,
  useDelete,
  useDistinct,
  useCount: _useCount,
  useUpsert: _useUpsert,
} = createModelHooks({
  modelService: organizationService,
});

// website block #2 uses a 5-hook destructure (useList, useRead, useCreate,
// useUpdate, useDelete). Wrap the same destructure in a block scope so the
// executable fragment from the website block matches this fixture without
// redeclaring the outer-scope `const useList`.
{
  const { useList, useRead, useCreate, useUpdate, useDelete } = createModelHooks({
    modelService: organizationService,
  });
  void [useList, useRead, useCreate, useUpdate, useDelete];
}

// website block #1 uses the canonical 8-hook order
// (`useRead, useList, useCount, useDistinct, useCreate, useUpdate, useUpsert,
//  useDelete`). Wrap in a block scope so the website's exact destructure
// executable fragment matches without redeclaring the outer-scope hooks.
{
  const { useRead, useList, useCount, useDistinct, useCreate, useUpdate, useUpsert, useDelete } = createModelHooks({
    modelService: organizationService,
  });
  void [useRead, useList, useCount, useDistinct, useCreate, useUpdate, useUpsert, useDelete];
}

void adapter;
void sharedAdapter;

// docs-block-start: website/docs/packages/access-router-react.md#2
function OrganizationList() {
  const { data, isLoading, error } = useList({
    listParams: { pageSize: 20 },
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {data.map((org) => (
        <li key={org._id}>{org.name}</li>
      ))}
    </ul>
  );
}
// docs-block-end: website/docs/packages/access-router-react.md#2

void OrganizationList;
void useRead;
void useUpdate;
void useDelete;

async function CreateExample() {
  // docs-block-start: website/docs/packages/access-router-react.md#7
  const { data, isPending, error, mutate, reset } = useCreate({
    advanced: true,
    select: ['_id', 'name'],
  });

  await mutate({ name: 'Northwind Labs' });
  // docs-block-end: website/docs/packages/access-router-react.md#7

  void data;
  void isPending;
  void error;
  void reset;
}

void CreateExample;

function DistinctExample() {
  // docs-block-start: website/docs/packages/access-router-react.md#6
  const { data, isLoading, error, query, refetch, reset } = useDistinct({
    field: 'status',
    conditions: { organizationId: 'org_123' },
  });
  // docs-block-end: website/docs/packages/access-router-react.md#6

  void data;
  void isLoading;
  void error;
  void query;
  void refetch;
  void reset;
  return null;
}

void DistinctExample;
