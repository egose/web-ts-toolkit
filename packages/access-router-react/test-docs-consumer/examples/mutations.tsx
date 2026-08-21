/* eslint-disable react-hooks/rules-of-hooks */
/**
 * ARR-11: README mutation blocks (#8 useCreate, #9 useUpdate, #10 useUpsert,
 * #11 useDelete).
 *
 * Each block is intentionally partial (a top-level destructure plus a top-level
 * `await`) and is exercised through this aggregate fixture so every documented
 * option key, result field, and `mutate(...)` signature fails the compile if
 * the public contract drifts.
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

const { useCreate, useUpdate, useUpsert, useDelete } = createModelHooks({
  modelService: organizationService,
});

async function CreateExample() {
  // docs-block-start: packages/access-router-react/README.md#8
  const { data, isPending, error, mutate, reset } = useCreate({
    advanced: true,
    select: ['_id', 'name'] as const,
    onSuccess: (result) => console.log('created', result.data?._id),
  });

  await mutate({ name: 'Northwind Labs' });
  // docs-block-end: packages/access-router-react/README.md#8

  void data;
  void isPending;
  void error;
  void reset;
}

async function UpdateExample() {
  // docs-block-start: packages/access-router-react/README.md#9
  const { data, isPending, error, mutate } = useUpdate();

  await mutate('org_123', { status: 'active' });
  // docs-block-end: packages/access-router-react/README.md#9

  void data;
  void isPending;
  void error;
}

async function UpsertExample() {
  // docs-block-start: packages/access-router-react/README.md#10
  const { data, isPending, error, mutate } = useUpsert();

  await mutate({ _id: 'org_123', name: 'Northwind Labs' });
  // docs-block-end: packages/access-router-react/README.md#10

  void data;
  void isPending;
  void error;
}

async function DeleteExample() {
  // docs-block-start: packages/access-router-react/README.md#11
  const { isPending, error, mutate } = useDelete();

  await mutate('org_123');
  // docs-block-end: packages/access-router-react/README.md#11

  void isPending;
  void error;
}

async function UpdateWebsiteExample() {
  // docs-block-start: website/docs/packages/access-router-react.md#8
  const { data, isPending, error, mutate } = useUpdate();

  await mutate('org_123', { status: 'active' });
  // docs-block-end: website/docs/packages/access-router-react.md#8

  void data;
  void isPending;
  void error;
}

async function UpsertWebsiteExample() {
  // docs-block-start: website/docs/packages/access-router-react.md#9
  const { data, isPending, error, mutate } = useUpsert();

  await mutate({ _id: 'org_123', name: 'Northwind Labs' });
  // docs-block-end: website/docs/packages/access-router-react.md#9

  void data;
  void isPending;
  void error;
}

async function DeleteWebsiteExample() {
  // docs-block-start: website/docs/packages/access-router-react.md#10
  const { isPending, error, mutate } = useDelete();

  await mutate('org_123');
  // docs-block-end: website/docs/packages/access-router-react.md#10

  void isPending;
  void error;
}

void CreateExample;
void UpdateExample;
void UpsertExample;
void DeleteExample;
void UpdateWebsiteExample;
void UpsertWebsiteExample;
void DeleteWebsiteExample;
