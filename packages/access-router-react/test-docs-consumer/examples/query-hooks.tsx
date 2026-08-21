/**
 * ARR-11: README query-hooks blocks (#4 useRead, #5 useList, #6 useCount,
 * #7 useDistinct).
 *
 * Each block is intentionally partial (a top-level destructure that cannot
 * compile on its own) and is exercised through this aggregate fixture so
 * every documented option key and result field fails the compile if the
 * public contract drifts. The setup context (adapter/service/factory +
 * Organization interface) is supplied by `./setup` so the destructure of
 * each hook references the published signature.
 */
import type { Document } from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '@web-ts-toolkit/access-router-react';
import { adapter } from './setup.js';

interface Organization extends Document {
  _id?: string;
  name: string;
  status?: 'active' | 'archived';
  organizationId?: string;
}

const organizationService = adapter.createModelService<Organization>({
  modelName: 'Organization',
  basePath: 'organizations',
});

const { useRead, useList, useCount, useDistinct } = createModelHooks({
  modelService: organizationService,
});

function ReadExample() {
  // docs-block-start: packages/access-router-react/README.md#4
  const { data, isLoading, isFetching, error, query, refetch, reset } = useRead({
    id: 'org_123',
    advanced: true,
    select: ['name', 'status'] as const,
    onSuccess: (result) => console.log(result.data?.name),
    onSettled: (result, err) => console.log({ result, err }),
  });
  // docs-block-end: packages/access-router-react/README.md#4

  void data;
  void isLoading;
  void isFetching;
  void error;
  void query;
  void refetch;
  void reset;
  return null;
}

function ListExample() {
  // docs-block-start: packages/access-router-react/README.md#5
  const { data, previousData, totalCount, isLoading, isFetching, error, query, refetch, reset } = useList({
    listParams: { pageSize: 20 },
    filter: { status: 'active' },
    advanced: true,
    sort: { name: 1 },
    select: ['name', 'status'] as const,
    keepPreviousData: true,
  });
  // docs-block-end: packages/access-router-react/README.md#5

  void data;
  void previousData;
  void totalCount;
  void isLoading;
  void isFetching;
  void error;
  void query;
  void refetch;
  void reset;
  return null;
}

function CountExample() {
  // docs-block-start: packages/access-router-react/README.md#6
  const { data, isLoading, error, query, refetch, reset } = useCount({
    advanced: true,
    filter: { status: 'active' },
  });
  // docs-block-end: packages/access-router-react/README.md#6

  void data;
  void isLoading;
  void error;
  void query;
  void refetch;
  void reset;
  return null;
}

function DistinctExample() {
  // docs-block-start: packages/access-router-react/README.md#7
  const { data, error } = useDistinct({
    field: 'status',
    conditions: { organizationId: 'org_123' },
  });
  // docs-block-end: packages/access-router-react/README.md#7

  void data;
  void error;
  return null;
}

function ReadPlainSelectExample() {
  // docs-block-start: website/docs/packages/access-router-react.md#3
  const { data, isLoading, isFetching, error, query, refetch, reset } = useRead({
    id: 'org_123',
    advanced: true,
    select: ['name', 'status'],
  });
  // docs-block-end: website/docs/packages/access-router-react.md#3

  void data;
  void isLoading;
  void isFetching;
  void error;
  void query;
  void refetch;
  void reset;
  return null;
}

function ListNoSelectExample() {
  // docs-block-start: website/docs/packages/access-router-react.md#4
  const { data, previousData, totalCount, isLoading, isFetching, error, query, refetch, reset } = useList({
    listParams: { pageSize: 20 },
    filter: { status: 'active' },
    advanced: true,
    sort: { name: 1 },
    keepPreviousData: true,
  });
  // docs-block-end: website/docs/packages/access-router-react.md#4

  void data;
  void previousData;
  void totalCount;
  void isLoading;
  void isFetching;
  void error;
  void query;
  void refetch;
  void reset;
  return null;
}

function CountWebsiteExample() {
  // docs-block-start: website/docs/packages/access-router-react.md#5
  const { data, isLoading, error, query, refetch, reset } = useCount({
    advanced: true,
    filter: { status: 'active' },
  });
  // docs-block-end: website/docs/packages/access-router-react.md#5

  void data;
  void isLoading;
  void error;
  void query;
  void refetch;
  void reset;
  return null;
}

void ReadExample;
void ListExample;
void CountExample;
void DistinctExample;
void ReadPlainSelectExample;
void ListNoSelectExample;
void CountWebsiteExample;
