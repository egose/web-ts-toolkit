// docs-block-start: website/docs/packages/access-router-react.md#1
import { createAdapter } from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '@web-ts-toolkit/access-router-react';

const adapter = createAdapter({ baseURL: 'https://api.example.com' });

const organizationService = adapter.createModelService<Organization>({
  modelName: 'Organization',
  basePath: 'organizations',
});

const { useRead, useList, useCount, useDistinct, useCreate, useUpdate, useUpsert, useDelete } = createModelHooks({
  modelService: organizationService,
});
// docs-block-end: website/docs/packages/access-router-react.md#1

import type { Document } from '@web-ts-toolkit/access-router-client';

interface Organization extends Document {
  _id?: string;
  name: string;
  status?: 'active' | 'archived';
}

void adapter;
void organizationService;
void useRead;
void useList;
void useCount;
void useDistinct;
void useCreate;
void useUpdate;
void useUpsert;
void useDelete;
