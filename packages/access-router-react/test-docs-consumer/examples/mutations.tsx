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

function CreateExample() {
  // README block #8
  const { data, isPending, error, mutate, reset } = useCreate({
    advanced: true,
    select: ['_id', 'name'] as const,
    onSuccess: (result) => console.log('created', result.data?._id),
  });

  async function run() {
    await mutate({ name: 'Northwind Labs' });
  }

  void data;
  void isPending;
  void error;
  void reset;
  void run;
  return null;
}

function UpdateExample() {
  // README block #9
  const { data, isPending, error, mutate } = useUpdate();

  async function run() {
    await mutate('org_123', { status: 'active' });
  }

  void data;
  void isPending;
  void error;
  void run;
  return null;
}

function UpsertExample() {
  // README block #10
  const { data, isPending, error, mutate } = useUpsert();

  async function run() {
    await mutate({ _id: 'org_123', name: 'Northwind Labs' });
  }

  void data;
  void isPending;
  void error;
  void run;
  return null;
}

function DeleteExample() {
  // README block #11
  const { isPending, error, mutate } = useDelete();

  async function run() {
    await mutate('org_123');
  }

  void isPending;
  void error;
  void run;
  return null;
}

void CreateExample;
void UpdateExample;
void UpsertExample;
void DeleteExample;
