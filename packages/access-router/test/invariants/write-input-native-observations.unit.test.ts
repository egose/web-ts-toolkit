import * as fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelHookContext, ModelOutputContext } from '../../src/interfaces';
import { writeOutputFixture } from '../support/private/write-output-test-fixture';
import { quietOutput, sourceModes } from '../support/private/owned-stage-test-fixture';

const observations: any[] = [];
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (!process.env.CWO_INPUT_OBSERVATIONS_REPORT) return;
  const target = path.resolve(process.env.CWO_INPUT_OBSERVATIONS_REPORT);
  expect(target.startsWith(`${path.resolve(process.env.TMPDIR!)}${path.sep}`)).toBe(true);
  await fs.writeFile(target, JSON.stringify(observations));
});

const entries = ['update-id', 'update-filter', 'upsert-update', 'public-update', 'public-upsert-update'] as const;
type Fixture = ReturnType<typeof writeOutputFixture>;
function update(f: Fixture, entry: (typeof entries)[number]) {
  const data = { value: 'submitted' },
    args = { select: ['value', '-_id'] };
  return entry === 'update-id'
    ? f.direct.updateById('existing', data, args, quietOutput)
    : entry === 'update-filter'
      ? f.direct.updateOne({ _id: 'existing' }, data, args, quietOutput)
      : entry === 'upsert-update'
        ? f.direct.upsert({ _id: 'existing' }, data, args, quietOutput)
        : entry === 'public-update'
          ? f.public._update('existing', data, args, quietOutput)
          : f.public._upsert({ _id: 'existing', ...data }, args, quietOutput);
}

async function observeNative(f: Fixture, failView = false) {
  const prototype = mongoose.mongo.BSON.Code.prototype;
  const previous = Object.getOwnPropertyDescriptor(prototype, 'toBSON');
  const previousLimit = Error.stackTraceLimit;
  const events: string[] = [];
  f.stored.set('payload.code', new mongoose.mongo.BSON.Code('return 1', { value: 1 }));
  Error.stackTraceLimit = 60;
  Object.defineProperty(prototype, 'toBSON', {
    configurable: true,
    value: function () {
      const beforeSave = f.saves.mock.calls.length === 0;
      const view = new Error().stack!.includes('resolveDocumentStage');
      events.push(`${beforeSave ? 'prewrite' : 'postwrite'}.${view ? 'view' : 'source'}`);
      if (failView && beforeSave && view) throw new Error('native view conversion');
      return this;
    },
  });
  return {
    events,
    restore() {
      if (previous) Object.defineProperty(prototype, 'toBSON', previous);
      else Reflect.deleteProperty(prototype, 'toBSON');
      Error.stackTraceLimit = previousLimit;
    },
  };
}

describe('pre-write native observations remain authorization boundaries, including the unused view', () => {
  it.each(
    sourceModes.flatMap((mode) =>
      entries.flatMap((entry) => (['absent', 'sync', 'async'] as const).map((hookKind) => ({ mode, entry, hookKind }))),
    ),
  )(
    '$mode $entry $hookKind observes a native again before the hydrated UPDATE hook',
    async ({ mode, entry, hookKind }) => {
      const hookInputs: unknown[] = [],
        contexts: ModelOutputContext[] = [];
      const hook = function (this: unknown, doc: any, permissions: any, context: ModelOutputContext) {
        expect(this).toBe(f.request);
        expect(permissions.has('reader')).toBe(true);
        hookInputs.push(doc);
        contexts.push(context);
        if (doc instanceof mongoose.Document) expect(native.events).toContain('prewrite.view');
        return { owner: true };
      };
      const f = writeOutputFixture(mode, {
        docPermissions:
          hookKind === 'absent'
            ? undefined
            : {
                update:
                  hookKind === 'sync'
                    ? hook
                    : async function (...args) {
                        await Promise.resolve();
                        return hook.apply(this, args);
                      },
              },
      });
      const conversion = vi.spyOn(f.stored, 'toObject');
      const native = await observeNative(f);
      let result;
      try {
        result = await update(f, entry);
      } finally {
        native.restore();
      }
      expect(result).toMatchObject({ success: true, data: { value: 'submitted' } });
      expect(native.events.filter((e) => e === 'prewrite.view')).toHaveLength(1);
      expect(native.events.filter((e) => e === 'prewrite.source')).toHaveLength(1);
      expect(native.events.filter((e) => e === 'postwrite.source')).toHaveLength(1);
      expect(native.events.filter((e) => e === 'postwrite.view')).toHaveLength(
        mode === 'isolated' && hookKind !== 'absent' ? 1 : 0,
      );
      expect(hookInputs).toHaveLength(hookKind === 'absent' ? 0 : 2);
      if (hookKind !== 'absent') {
        expect(hookInputs[0]).toBe(f.stored);
        expect(hookInputs[1]).not.toBe(f.stored);
        expect(contexts[0].docPermissionsAccess).toBe('update');
        expect(Object.isFrozen(contexts[0])).toBe(true);
      }
      expect(f.saved).toHaveLength(1);
      expect(f.saved[0].value).toBe('submitted');
      observations.push({
        kind: 'native-prewrite',
        mode,
        entry,
        hookKind,
        events: native.events,
        rootConversionsIncludingAdapter: conversion.mock.calls.length,
        conversionOptions: conversion.mock.calls.map(([options]) => options ?? null),
        saves: f.saves.mock.calls.length,
        finds: f.adapter.findOne.mock.calls.length,
        exists: f.adapter.exists.mock.calls.length,
      });
    },
  );

  it.each(
    sourceModes.flatMap((mode) =>
      ['update-id', 'public-upsert-update'].flatMap((entry) =>
        [false, true].map((present) => ({ mode, entry: entry as (typeof entries)[number], present })),
      ),
    ),
  )(
    '$mode $entry present=$present fails before hook/save when only the pre-write view native throws',
    async ({ mode, entry, present }) => {
      const hook = vi.fn(() => ({ owner: true }));
      const f = writeOutputFixture(mode, { docPermissions: present ? { update: hook } : undefined });
      const native = await observeNative(f, true);
      let result;
      try {
        result = await update(f, entry);
      } finally {
        native.restore();
      }
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
      expect(result).not.toHaveProperty('data');
      expect(native.events).toEqual(['prewrite.source', 'prewrite.view']);
      expect(hook).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
      expect(f.stored.get('value')).toBe('before');
      observations.push({
        kind: 'view-only-native-error',
        mode,
        entry,
        present,
        events: native.events,
        code: result.code,
        saves: 0,
        finds: f.adapter.findOne.mock.calls.length,
        exists: f.adapter.exists.mock.calls.length,
      });
    },
  );
});

describe('input normalization and mutable hook ownership', () => {
  it.each(sourceModes.flatMap((mode) => ['create', 'update'].map((operation) => ({ mode, operation }))))(
    '$mode public $operation rechecks the original input after an earlier native mutates it',
    async ({ mode, operation }) => {
      const f = writeOutputFixture(mode);
      const data: any = { value: 'submitted', when: new Date(1) };
      const native = vi.fn(() => {
        if (native.mock.calls.length === 1) data.hidden = Array(501).fill('discarded');
        return 1;
      });
      data.when.getTime = native;
      const parser = vi.spyOn(f.public as any, 'parseClientData');
      const result =
        operation === 'create'
          ? await f.public._create(data, { select: ['value'] }, quietOutput)
          : await f.public._update('existing', data, { select: ['value'] }, quietOutput);
      expect(result).toMatchObject({ success: false, code: 'bad_request' });
      expect(JSON.stringify(result)).toContain('maximum node budget');
      expect(native).toHaveBeenCalledTimes(2);
      expect(parser).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
      expect(f.adapter.create).not.toHaveBeenCalled();
      expect(f.adapter.findOne).not.toHaveBeenCalled();
      observations.push({
        kind: 'public-to-worker-mutation',
        mode,
        operation,
        nativeCalls: native.mock.calls.length,
        parserCalls: parser.mock.calls.length,
        code: result.code,
        saves: 0,
        creates: 0,
      });
    },
  );

  it.each(sourceModes.flatMap((mode) => ['direct', 'public'].map((entry) => ({ mode, entry }))))(
    '$mode $entry bulk CREATE calls mutable field functions per row with distinct exposed arrays',
    async ({ mode, entry }) => {
      const contexts: ModelHookContext[] = [];
      const rule = vi.fn(function (this: unknown, permissions: any, facts: object) {
        expect(this).toBe(f.request);
        expect(permissions.has('reader')).toBe(true);
        expect(Object.isFrozen(facts)).toBe(true);
        expect(Object.keys(facts)).toEqual([]);
        return rule.mock.calls.length % 2 === 1;
      });
      const f = writeOutputFixture(mode, {
        permissionSchema: { value: { create: rule, read: true }, hidden: false },
        validate: {
          create: (_data, _p, context) => {
            contexts.push(context);
            return true;
          },
        },
      });
      const data = [{ value: 'one' }, { value: 'two' }, { value: 'three' }];
      const result =
        entry === 'direct'
          ? await f.direct.create(data, {}, quietOutput)
          : await f.public._create(data, {}, quietOutput);
      expect(result.success).toBe(true);
      expect(rule).toHaveBeenCalledTimes(3);
      expect(f.saved.map((row) => row.value)).toEqual(['one', undefined, 'three']);
      expect(new Set(contexts.map((context) => context.allowedFields)).size).toBe(3);
      contexts[0].allowedFields!.push('hidden');
      expect(contexts[1].allowedFields).not.toContain('hidden');
      expect(contexts[2].allowedFields).not.toContain('hidden');
      observations.push({
        kind: 'mutable-field-rules',
        mode,
        entry,
        calls: rule.mock.calls.length,
        storedValues: f.saved.map((row) => row.value ?? null),
        distinctFieldArrays: 3,
      });
    },
  );
});
