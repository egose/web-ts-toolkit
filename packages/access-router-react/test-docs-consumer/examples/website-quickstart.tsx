// docs-block-start: website/docs/packages/access-router-react.md#2
import { createAdapter } from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '@web-ts-toolkit/access-router-react';

const adapter = createAdapter({ baseURL: 'https://api.example.com' });

const organizationService = adapter.createModelService<Organization>({
  modelName: 'Organization',
  basePath: 'organizations',
});

const { useList, useRead, useCreate, useUpdate, useDelete } = createModelHooks({
  modelService: organizationService,
});

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

import type { Document } from '@web-ts-toolkit/access-router-client';

interface Organization extends Document {
  _id?: string;
  name: string;
  status?: 'active' | 'archived';
}

void adapter;
void organizationService;
void useList;
void useRead;
void useCreate;
void useUpdate;
void useDelete;
void OrganizationList;
