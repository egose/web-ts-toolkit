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
  // README block #4
  const { data, isLoading, isFetching, error, query, refetch, reset } = useRead({
    id: 'org_123',
    advanced: true,
    select: ['name', 'status'] as const,
    onSuccess: (result) => console.log(result.data?.name),
    onSettled: (result, err) => console.log({ result, err }),
  });

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
  // README block #5
  const { data, previousData, totalCount, isLoading, isFetching, error, query, refetch, reset } = useList({
    listParams: { pageSize: 20 },
    filter: { status: 'active' },
    advanced: true,
    sort: { name: 1 },
    select: ['name', 'status'] as const,
    keepPreviousData: true,
  });

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
  // README block #6
  const { data, isLoading, error, query, refetch, reset } = useCount({
    advanced: true,
    filter: { status: 'active' },
  });

  void data;
  void isLoading;
  void error;
  void query;
  void refetch;
  void reset;
  return null;
}

function DistinctExample() {
  // README block #7
  const { data, error } = useDistinct({
    field: 'status',
    conditions: { organizationId: 'org_123' },
  });

  void data;
  void error;
  return null;
}

// Website variant of useRead (block #3): plain-array `select` (no `as const`).
// The broad `Projection` sentinel accepts the plain-array form without
// literal narrowing, so `data.status` retains its base-model type.
function ReadPlainSelectExample() {
  const { data, isLoading, isFetching, error, query, refetch, reset } = useRead({
    id: 'org_123',
    advanced: true,
    select: ['name', 'status'],
  });

  void data;
  void isLoading;
  void isFetching;
  void error;
  void query;
  void refetch;
  void reset;
  return null;
}

// Website variant of useList (block #4): no `select`, plain object traffic.
function ListNoSelectExample() {
  const { data, previousData, totalCount, isLoading, isFetching, error, query, refetch, reset } = useList({
    listParams: { pageSize: 20 },
    filter: { status: 'active' },
    advanced: true,
    sort: { name: 1 },
    keepPreviousData: true,
  });

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

void ReadExample;
void ListExample;
void CountExample;
void DistinctExample;
void ReadPlainSelectExample;
void ListNoSelectExample;
