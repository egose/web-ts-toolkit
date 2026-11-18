import * as fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentGrants, ModelHookContext } from '../../src/interfaces';
import Permission, { type AccessRouterPermissions } from '../../src/permission';
import { PERMISSIONS } from '../../src/symbols';
import { EMPTY_DOCUMENT_GRANTS } from '../../src/acl/document-grants';
import {
  captureAuthorizationFieldCatalog,
  clearCapturedOutputCatalog,
  isCatalogInputPath,
  isCatalogOutputPath,
  readOwnedAuthorizationCatalogWork,
} from '../../src/acl/field-catalog';
import { admitModelInput } from '../../src/acl/model-input-admission';
import { readServiceAuthorization, readServiceOutputPolicy } from '../../src/acl/service-authorization';
import { applyUpdate } from '../../src/helpers/apply-update';
import { ownedStageFixture, quietOutput, sourceModes } from '../support/private/owned-stage-test-fixture';
import { writeOutputFixture } from '../support/private/write-output-test-fixture';

const observations: object[] = [];
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (!process.env.CWO05_STRUCTURAL_REPORT) return;
  const target = path.resolve(process.env.CWO05_STRUCTURAL_REPORT);
  expect(target.startsWith(`${path.resolve(process.env.TMPDIR!)}${path.sep}`)).toBe(true);
  await fs.writeFile(target, JSON.stringify(observations));
});

const entries = sourceModes.flatMap((mode) => (['direct', 'public'] as const).map((entry) => ({ mode, entry })));
const catalogKinds = ['omitted', 'own-undefined', 'owned-empty'] as const;

describe('structural preparation never memoizes mutable row decisions or exposed write boundaries', () => {
  it.each(entries)('$mode $entry keeps per-row CREATE decisions', async ({ mode, entry }) => {
    let row = 0;
    const events: string[] = [];
    const actors: AccessRouterPermissions[] = [];
    const factsSeen: DocumentGrants[] = [];
    const contexts: ModelHookContext[] = [];
    const first = vi.fn(function (this: unknown, permissions: AccessRouterPermissions, facts: DocumentGrants) {
      expect(this).toBe(f.request);
      expect(permissions.has('reader')).toBe(true);
      expect(permissions.has('admin')).toBe(false);
      expect(facts).toBe(EMPTY_DOCUMENT_GRANTS);
      expect(Object.isFrozen(facts)).toBe(true);
      actors.push(permissions);
      factsSeen.push(facts);
      events.push(`first:${++row}`);
      f.request[PERMISSIONS] = new Permission({ reader: false, admin: true });
      return true;
    });
    const last = vi.fn(async function (this: unknown, permissions: AccessRouterPermissions, facts: DocumentGrants) {
      expect(this).toBe(f.request);
      expect(permissions).toBe(actors[0]);
      expect(facts).toBe(EMPTY_DOCUMENT_GRANTS);
      events.push(`last:${row}`);
      await Promise.resolve();
      return row !== 2;
    });
    const f = writeOutputFixture(mode, {
      permissionSchema: {
        when: { create: first, read: true },
        value: { create: 'reader', read: true },
        payload: { create: ['reader reader'], read: true },
        owner: { create: last, read: true },
        hidden: false,
      },
      validate: {
        create(data, _permissions, context) {
          contexts.push(context);
          events.push(`validate:${contexts.length}`);
          if (contexts.length === 1) {
            context.allowedFields!.push('hidden');
            (data as { payload: { items: string[] } }).payload.items.push('first-only');
          }
          return true;
        },
      },
    });
    // The fixture already owns its request pool. Use the supported service seam
    // to bound this observation's traversal; late global changes cannot resize it.
    const limits = f.direct.getRequestComplexity();
    for (const service of [f.direct, f.public])
      vi.spyOn(service, 'getRequestComplexity').mockReturnValue({ ...limits, maxBulkConcurrency: 1 });
    const original = String.prototype.split;
    const split = vi.spyOn(String.prototype, 'split').mockImplementation(function (...args) {
      const text = String(this);
      if (args[0] === ' ' && (text === 'reader' || text === 'reader reader')) {
        events.push(`${text === 'reader' ? 'string' : 'array'}:${row}`);
        // The first field function changes the native grammar's row-local meaning.
        // Even a frozen primitive static rule is not a reusable permission decision.
        if (row === 2 && text === 'reader') return ['admin'];
      }
      return Reflect.apply(original, this, args);
    });
    const sharedPayload = { items: ['business'] };
    const data = ['one', 'two', 'three'].map((value, index) => ({
      value,
      payload: sharedPayload,
      when: new Date(index + 1),
      owner: true,
      hidden: 'denied',
    }));
    let result;
    try {
      result =
        entry === 'direct'
          ? await f.direct.create(data, {}, quietOutput)
          : await f.public._create(data, {}, quietOutput);
    } finally {
      split.mockRestore();
    }
    expect(result.success).toBe(true);
    expect(first).toHaveBeenCalledTimes(3);
    expect(last).toHaveBeenCalledTimes(3);
    expect(events).toEqual(
      [1, 2, 3].flatMap((index) => [
        `first:${index}`,
        `string:${index}`,
        `array:${index}`,
        `last:${index}`,
        `validate:${index}`,
      ]),
    );
    expect(new Set(actors).size).toBe(1);
    expect(new Set(factsSeen)).toEqual(new Set([EMPTY_DOCUMENT_GRANTS]));
    expect(new Set(contexts.map((context) => context.allowedFields)).size).toBe(3);
    expect(new Set(contexts.map((context) => context.allowedData)).size).toBe(3);
    expect(contexts.slice(1).every((context) => !context.allowedFields!.includes('hidden'))).toBe(true);
    expect(f.saved.map((saved) => saved.value)).toEqual(['one', undefined, 'three']);
    expect(f.saved.map((saved) => saved.owner)).toEqual([true, undefined, true]);
    expect(f.saved.map((saved) => (saved.payload as typeof sharedPayload).items)).toEqual([
      ['business', 'first-only'],
      ['business'],
      ['business'],
    ]);
    expect(f.saved.every((saved) => saved.hidden === undefined)).toBe(true);
    expect(sharedPayload.items).toEqual(['business']);
    observations.push({
      kind: 'mixed-create-rules',
      mode,
      entry,
      events,
      functionCalls: first.mock.calls.length + last.mock.calls.length,
      actorIdentities: new Set(actors).size,
      frozenEmptyFacts: factsSeen.every((facts) => facts === EMPTY_DOCUMENT_GRANTS && Object.isFrozen(facts)),
      distinctAllowedFields: new Set(contexts.map((context) => context.allowedFields)).size,
      distinctAllowedData: new Set(contexts.map((context) => context.allowedData)).size,
      values: f.saved.map((saved) => saved.value ?? null),
      payloads: f.saved.map((saved) => (saved.payload as typeof sharedPayload).items),
      callerPayloadUnchanged: sharedPayload.items.length === 1,
    });
  });

  it.each(entries)('$mode $entry uses mutated UPDATE boundaries', async ({ mode, entry }) => {
    const f = writeOutputFixture(mode, {
      permissionSchema: { branch: { read: true, update: false }, 'branch.value': { read: true, update: true } },
    });
    f.stored.set('branch', { value: 'before', sibling: 'preserved-unless-replaced' });
    const service = entry === 'direct' ? f.direct : f.public;
    let held: ModelHookContext | undefined;
    const prepare = vi.spyOn(service as any, 'prepare').mockImplementation(async function (
      this: unknown,
      data,
      access,
      context,
    ) {
      expect(this).toBe(service);
      expect(access).toBe('update');
      held = context as ModelHookContext;
      expect(held.allowedFields).toEqual(['branch.value']);
      expect(data).toEqual({ branch: { value: 'submitted' } });
      await Promise.resolve();
      held.allowedFields!.push('branch');
      return data;
    });
    const result =
      entry === 'direct'
        ? await f.direct.updateById('existing', { branch: { value: 'submitted' } }, {}, quietOutput)
        : await f.public._update('existing', { branch: { value: 'submitted' } }, {}, quietOutput);
    expect(result.success).toBe(true);
    expect(prepare).toHaveBeenCalledOnce();
    expect(held!.allowedFields).toEqual(['branch.value', 'branch']);
    expect(f.saved).toHaveLength(1);
    expect(f.saved[0].branch).toEqual({ value: 'submitted' });
    observations.push({
      kind: 'prepare-field-boundaries',
      mode,
      entry,
      prepareCalls: prepare.mock.calls.length,
      finalAllowedFields: held!.allowedFields,
      storedBranch: f.saved[0].branch,
      saves: f.saves.mock.calls.length,
    });
  });

  it('expands the same descendant grant from current own existing indices, never a prior row result', () => {
    const catalog = captureAuthorizationFieldCatalog(
      new mongoose.Schema({
        rows: [new mongoose.Schema({ _id: String, value: String, sibling: String }, { id: false })],
      }),
      {},
    );
    const data = {
      rows: Array.from({ length: 5 }, (_, index) => ({
        _id: `forged-${index}`,
        value: `next-${index}`,
        sibling: 'container-only',
      })),
    };
    const existing = {
      rows: [
        { _id: 'first', value: 'old', sibling: 'kept' },
        null,
        'scalar',
        { _id: 'last', value: 'old', sibling: 'kept' },
      ],
    };
    const target = structuredClone(existing);
    try {
      const admit = (before: Record<string, unknown>) =>
        admitModelInput({
          data,
          existing: before,
          requestFields: [],
          inputFields: { mode: 'grant', paths: ['rows.value'] },
          catalog,
        });
      const patch = admit(existing);
      const empty = admit({ rows: [] });
      const scalarSlots = admit({ rows: [null, 'scalar'] });
      expect(patch.allowedFields).toEqual(['rows.0.value', 'rows.3.value']);
      expect(empty).toEqual({ allowedData: {}, allowedFields: [] });
      expect(scalarSlots).toEqual({ allowedData: {}, allowedFields: [] });
      applyUpdate(target, patch.allowedData, patch.allowedFields);
      expect(target.rows).toEqual([
        { _id: 'first', value: 'next-0', sibling: 'kept' },
        null,
        'scalar',
        { _id: 'last', value: 'next-3', sibling: 'kept' },
      ]);
      const replacement = admitModelInput({
        data,
        existing,
        requestFields: [],
        inputFields: { mode: 'grant', paths: ['rows'] },
        catalog,
      });
      applyUpdate(target, replacement.allowedData, replacement.allowedFields);
      expect(target.rows).toEqual(data.rows.map(({ value, sibling }) => ({ value, sibling })));
      expect(data.rows[0]._id).toBe('forged-0');
      observations.push({
        kind: 'existing-index-expansion',
        patchFields: patch.allowedFields,
        emptyFields: empty.allowedFields,
        scalarFields: scalarSlots.allowedFields,
        patchCardinality: existing.rows.length,
        replacementCardinality: target.rows.length,
        replacementField: replacement.allowedFields,
        elevatedIdsOmitted: target.rows.every((row) => !row || typeof row !== 'object' || !Object.hasOwn(row, '_id')),
      });
    } finally {
      clearCapturedOutputCatalog(catalog);
    }
  });
});

describe('input catalog ownership is separate from prepared output eligibility', () => {
  it.each(catalogKinds)('%s input slots retain their observations', (kind) => {
    const raw =
      kind === 'owned-empty'
        ? captureAuthorizationFieldCatalog(
            new mongoose.Schema({ payload: mongoose.Schema.Types.Mixed }, { id: false }),
            {},
          )
        : {
            paths: ['payload'],
            opaquePaths: ['payload'],
            ...(kind === 'own-undefined' ? { schemaVirtualPaths: undefined } : {}),
          };
    const f = ownedStageFixture({ configuration: { catalog: raw } });
    const catalog = readServiceAuthorization(f.call, f.binding).configuration.catalog;
    const outputCatalog = readServiceOutputPolicy(f.call, f.binding).catalog;
    expect(Boolean(readOwnedAuthorizationCatalogWork(catalog))).toBe(kind === 'owned-empty');
    expect(Object.hasOwn(catalog, 'schemaVirtualPaths')).toBe(kind !== 'omitted');
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'schemaVirtualPaths');
    let deny = false;
    const get = vi.fn(() => (deny ? ['payload.safe'] : []));
    let eligible: boolean | undefined;
    let admitted: ReturnType<typeof admitModelInput> | undefined;
    let before: number;
    try {
      Object.defineProperty(Object.prototype, 'schemaVirtualPaths', { configurable: true, get });
      for (let index = 0; index < 40; index++) {
        expect(isCatalogOutputPath(outputCatalog, 'payload.safe')).toBe(true);
        expect(isCatalogInputPath(catalog, 'payload.safe')).toBe(true);
      }
      before = get.mock.calls.length;
      deny = true;
      expect(isCatalogOutputPath(outputCatalog, 'payload.safe')).toBe(true);
      eligible = isCatalogInputPath(catalog, 'payload.safe');
      admitted = admitModelInput({
        data: { payload: { safe: 'submitted' } },
        requestFields: ['payload'],
        inputFields: { mode: 'request' },
        catalog,
      });
    } finally {
      if (previous) Object.defineProperty(Object.prototype, 'schemaVirtualPaths', previous);
      else Reflect.deleteProperty(Object.prototype, 'schemaVirtualPaths');
    }
    expect(eligible).toBe(kind !== 'omitted');
    expect(admitted!.allowedData).toEqual({ payload: kind === 'omitted' ? {} : { safe: 'submitted' } });
    if (kind !== 'omitted') expect(get).not.toHaveBeenCalled();
    else expect(get.mock.calls.length).toBeGreaterThan(before);
    observations.push({
      kind: 'optional-input-catalog-slot',
      source: kind,
      ownSchemaVirtualSlot: Object.hasOwn(catalog, 'schemaVirtualPaths'),
      sharedInputOutputCatalog: catalog === outputCatalog,
      outputEligible: true,
      inputEligibleAfterMutation: eligible,
      inheritedReadsBeforeMutation: before,
      inheritedReadsTotal: get.mock.calls.length,
      allowedData: admitted!.allowedData,
    });
  });
});
