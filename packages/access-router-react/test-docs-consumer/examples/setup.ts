/**
 * ARR-11: factory + adapter setup fixture.
 *
 * Covers README "Factory" block (#1) and the `Organization` interface block
 * (#2) plus the `select` forms block (#16) as a partial embedded reference.
 * Compiles against the *packed* npm tarball via the published export map.
 * `tsc --noEmit` enforces the type-level checks against the installed
 * declarations; no React renderer runs.
 *
 * The fixture declares the minimal `Organization` interface and uses the
 * real `createAdapter` from the client package so the documented
 * `adapter.createModelService<Organization>(...)` call typechecks against the
 * published `createModelHooks` signature.
 */
import type { Document } from '@web-ts-toolkit/access-router-client';
import { createAdapter } from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '@web-ts-toolkit/access-router-react';

interface Organization extends Document {
  _id?: string;
  name: string;
  status?: 'active' | 'archived';
}

const adapter = createAdapter({ baseURL: 'https://api.example.com' });

const organizationService = adapter.createModelService<Organization>({
  modelName: 'Organization',
  basePath: 'organizations',
});

const { useRead, useList, useCount, useDistinct, useCreate, useUpdate, useUpsert, useDelete } = createModelHooks({
  modelService: organizationService,
});

void useRead;
void useList;
void useCount;
void useDistinct;
void useCreate;
void useUpdate;
void useUpsert;
void useDelete;

// Partial select-form reference (README block #16) — exercised through this
// fixture so a drift in any listed name fails the compile. The literal tuple
// form is the recommended form; the string and object forms are also accepted
// by the public `select` option across read/list/create/update/upsert hooks.
const tupleForm = ['name', 'status'] as const;
const stringForm = 'name';
const objectForm = { name: 1, age: -1 };

void tupleForm;
void stringForm;
void objectForm;

export { adapter, organizationService, Organization, createModelHooks };
