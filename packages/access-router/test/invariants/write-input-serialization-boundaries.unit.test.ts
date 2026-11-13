import * as fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelHookContext } from '../../src/interfaces';
import * as admission from '../../src/acl/model-input-admission';
import { quietOutput, sourceModes } from '../support/private/owned-stage-test-fixture';
import { writeOutputFixture } from '../support/private/write-output-test-fixture';

const observations: object[] = [];
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (!process.env.CWO06_SERIALIZATION_REPORT) return;
  const target = path.resolve(process.env.CWO06_SERIALIZATION_REPORT);
  expect(target.startsWith(`${path.resolve(process.env.TMPDIR!)}${path.sep}`)).toBe(true);
  await fs.writeFile(target, JSON.stringify(observations));
});

type Fixture = ReturnType<typeof writeOutputFixture>;
const entries = ['update-id', 'update-filter', 'upsert-update', 'public-update', 'public-upsert-update'] as const;
type Entry = (typeof entries)[number];
const pairedEntries = sourceModes.flatMap((mode) =>
  (['update-id', 'public-upsert-update'] as const).map((entry) => ({ mode, entry })),
);
const conversionOptions = [
  { virtuals: false },
  { virtuals: false, flattenMaps: true },
  { virtuals: false, flattenMaps: true },
  null,
  { virtuals: false },
  { virtuals: false },
  { virtuals: false },
  { virtuals: false, flattenMaps: true },
];

function update(f: Fixture, entry: Entry) {
  const data = { value: 'submitted' };
  const args = { select: ['value', '-_id'] };
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

/** Configure only this fresh fixture's schema, before the write captures its catalog. */
function emptySchemaVirtuals(f: Fixture) {
  const schemas = new Set<mongoose.Schema>();
  const visit = (schema: mongoose.Schema) => {
    if (schemas.has(schema)) return;
    schemas.add(schema);
    schema.set('id', false);
    if (Object.hasOwn(schema.virtuals, 'id')) schema.removeVirtual('id');
    expect(Object.keys(schema.virtuals)).toEqual([]);
    for (const child of schema.childSchemas) visit(child.schema);
  };
  visit(f.model.schema);
  return schemas;
}

describe('a genuinely empty captured excluded-virtual set does not make cleanup observation-free', () => {
  it.each(sourceModes.flatMap((mode) => entries.map((entry) => ({ mode, entry }))))(
    '$mode $entry still converts an id:false/empty-catalog document before save',
    async ({ mode, entry }) => {
      const f = writeOutputFixture(mode);
      const schemas = emptySchemaVirtuals(f);
      const cleanup = vi.spyOn(admission, 'stripDocumentInputVirtuals');
      const conversions = vi.spyOn(f.stored, 'toObject');
      let serial = 0;
      f.model.schema.set('toObject', {
        transform(doc, output) {
          expect(doc).toBe(f.stored);
          if (++serial === 3) doc.set('value', 'cleanup-observed');
          output.value = `${doc.get('value')}@${serial}`;
          return output;
        },
      });
      const result = await update(f, entry);
      expect(result).toMatchObject({ success: true, data: { value: 'cleanup-observed@8' } });
      expect(cleanup).toHaveBeenCalledOnce();
      const catalog = cleanup.mock.calls[0][1];
      expect(catalog.virtualPaths).toEqual([]);
      expect(catalog.schemaVirtualPaths).toEqual([]);
      expect(Object.hasOwn(catalog, 'schemaVirtualPaths')).toBe(true);
      expect(Object.isFrozen(catalog)).toBe(true);
      expect([...schemas].every((schema) => schema.options.id === false)).toBe(true);
      expect(serial).toBe(8);
      expect(conversions.mock.calls.map(([options]) => options ?? null)).toEqual(conversionOptions);
      expect(f.saved[0].value).toBe('cleanup-observed@4');
      expect(f.stored.get('value')).toBe('cleanup-observed');
      expect(f.saves).toHaveBeenCalledOnce();
      expect(f.adapter.create).not.toHaveBeenCalled();
      observations.push({
        kind: 'empty-catalog-conversion',
        mode,
        entry,
        idFalseInAllSchemas: true,
        excludedVirtualPaths: 0,
        rootConversionsIncludingAdapter: serial,
        libraryRootConversionSites: 7,
        cleanupConversionIndex: 3,
        savedValue: f.saved[0].value,
        outputValue: 'cleanup-observed@8',
        finds: f.adapter.findOne.mock.calls.length,
        exists: f.adapter.exists.mock.calls.length,
        saves: 1,
      });
    },
  );

  it.each(
    pairedEntries.flatMap((item) =>
      (['conversion-error', 'traversal-error', 'traversal-effect'] as const).map((failure) => ({ ...item, failure })),
    ),
  )('$mode $entry empty catalog retains $failure before save', async ({ mode, entry, failure }) => {
    const f = writeOutputFixture(mode);
    emptySchemaVirtuals(f);
    const cleanup = vi.spyOn(admission, 'stripDocumentInputVirtuals');
    const conversions = vi.spyOn(f.stored, 'toObject');
    const error = new Error(`empty cleanup ${failure}`);
    let serial = 0;
    let getterCalls = 0;
    f.model.schema.set('toObject', {
      transform(doc, output) {
        if (++serial !== 3) return output;
        if (failure === 'conversion-error') throw error;
        // A supported schema conversion may create a new enumerable getter.
        // It is not caller input or an already-admitted immutable graph.
        Object.defineProperty(output, 'cleanupProbe', {
          enumerable: true,
          get() {
            getterCalls++;
            if (failure === 'traversal-error') throw error;
            doc.set('value', 'traversal-observed');
            return 'ephemeral';
          },
        });
        return output;
      },
    });
    if (failure === 'traversal-effect') {
      expect(await update(f, entry)).toMatchObject({ success: true, data: { value: 'traversal-observed' } });
      expect(f.saved[0].value).toBe('traversal-observed');
      expect(serial).toBe(8);
      expect(f.saves).toHaveBeenCalledOnce();
    } else {
      await expect(update(f, entry)).rejects.toBe(error);
      expect(serial).toBe(3);
      expect(f.saves).not.toHaveBeenCalled();
      expect(f.saved).toEqual([]);
      expect(f.stored.get('value')).toBe('submitted');
    }
    expect(getterCalls).toBe(failure === 'conversion-error' ? 0 : 1);
    expect(cleanup.mock.calls[0][1].virtualPaths).toEqual([]);
    expect(cleanup.mock.calls[0][1].schemaVirtualPaths).toEqual([]);
    expect(conversions.mock.calls.map(([options]) => options ?? null)).toEqual(conversionOptions.slice(0, serial));
    expect(f.adapter.create).not.toHaveBeenCalled();
    observations.push({
      kind: 'empty-catalog-boundary',
      mode,
      entry,
      failure,
      rootConversionsIncludingAdapter: serial,
      getterCalls,
      errorIdentityPreserved: failure !== 'traversal-effect',
      saves: f.saves.mock.calls.length,
      liveValue: f.stored.get('value'),
    });
  });
});

describe('final/diff/change/output conversions preserve separate failures and mutable lifecycle observations', () => {
  it.each(pairedEntries.flatMap((item) => [5, 6, 7, 8].map((failAt) => ({ ...item, failAt }))))(
    '$mode $entry conversion @$failAt fails after one save without fallback or retry',
    async ({ mode, entry, failAt }) => {
      const onChange = vi.fn((_before, _after, _changes, context: ModelHookContext) => {
        context.currentDocument!.set('value', 'onchange-live');
      });
      const f = writeOutputFixture(mode, { onChange: { value: onChange } });
      const service = entry === 'public-upsert-update' ? f.public : f.direct;
      const afterPersist = vi.spyOn(service, 'afterPersist');
      const changes = vi.spyOn(service, 'changes');
      const normal = f.stored.toObject.bind(f.stored);
      const error = new Error(`conversion @${failAt}`);
      let serial = 0;
      const conversions = vi.spyOn(f.stored, 'toObject').mockImplementation((options) => {
        if (++serial === failAt) throw error;
        return normal(options);
      });
      if (failAt === 8) {
        const result = await update(f, entry);
        expect(result).toMatchObject({ success: false, code: 'bad_request' });
        expect(JSON.stringify(result)).toContain('write output conversion failed');
        expect(result).not.toHaveProperty('data');
      } else {
        await expect(update(f, entry)).rejects.toBe(error);
      }
      expect(conversions).toHaveBeenCalledTimes(failAt);
      expect(conversions.mock.calls.map(([options]) => options ?? null)).toEqual(conversionOptions.slice(0, failAt));
      expect(f.saves).toHaveBeenCalledOnce();
      expect(f.saved).toHaveLength(1);
      expect(f.saved[0].value).toBe('submitted');
      expect(f.stored.get('value')).toBe(failAt === 8 ? 'onchange-live' : 'submitted');
      expect(afterPersist).toHaveBeenCalledOnce();
      expect(changes).toHaveBeenCalledTimes(failAt === 8 ? 1 : 0);
      expect(onChange).toHaveBeenCalledTimes(failAt === 8 ? 1 : 0);
      expect(f.adapter.create).not.toHaveBeenCalled();
      observations.push({
        kind: 'post-save-conversion-error',
        mode,
        entry,
        failAt,
        result: failAt === 8 ? 'bad_request: write output conversion failed' : 'rejected original Error',
        rootConversionsIncludingAdapter: serial,
        saves: 1,
        afterPersistCalls: afterPersist.mock.calls.length,
        changesCalls: changes.mock.calls.length,
        onChangeCalls: onChange.mock.calls.length,
        savedValue: f.saved[0].value,
        liveValue: f.stored.get('value'),
      });
    },
  );

  it.each(pairedEntries)(
    '$mode $entry honors service diff/changes overrides without lending retained snapshots',
    async ({ mode, entry }) => {
      let context!: ModelHookContext;
      let earlyChanges: any[];
      let changeInput!: Record<string, unknown>;
      let changed!: object;
      const f = writeOutputFixture(mode, {
        validate: {
          update(_data, _permissions, lifecycle) {
            context = lifecycle;
            lifecycle.originalDocumentSnapshot!.value = 'retained-original';
            return true;
          },
        },
        onChange: {
          value: function (before, after, changes, lifecycle) {
            expect(this).toBe(f.request);
            expect(lifecycle).toBe(context);
            changed = {
              before,
              after,
              final: lifecycle.finalDocumentSnapshot!.value,
              diffValue: (changes[0] as any).value,
            };
            lifecycle.finalDocumentSnapshot!.value = 'onchange-final';
            lifecycle.currentDocument!.set('value', 'onchange-live');
          },
        },
      });
      const service = entry === 'public-upsert-update' ? f.public : f.direct;
      const normalAfter = service.afterPersist.bind(service);
      const afterPersist = vi
        .spyOn(service, 'afterPersist')
        .mockImplementation(async function (doc, access, lifecycle) {
          expect(this).toBe(service);
          expect(lifecycle).toBe(context);
          const output = await normalAfter(doc, access, lifecycle);
          const privateContext = lifecycle as ModelHookContext & { diff: (doc: unknown) => void };
          expect(lifecycle.finalDocumentSnapshot).toBeUndefined();
          privateContext.diff(output);
          earlyChanges = lifecycle.changes!;
          const diff = privateContext.diff;
          privateContext.diff = (current) => {
            expect(lifecycle.finalDocumentSnapshot!.value).toBe('submitted@6');
            lifecycle.finalDocumentSnapshot!.value = 'diff-override-final';
            diff(current);
          };
          return output;
        });
      const normalChanges = service.changes.bind(service);
      const changes = vi.spyOn(service, 'changes').mockImplementation(async function (data, lifecycle) {
        expect(this).toBe(service);
        expect(lifecycle).toBe(context);
        expect(data.value).toBe('submitted@8');
        expect(data).not.toBe(lifecycle.finalDocumentSnapshot);
        expect(data).not.toBe(lifecycle.originalDocumentSnapshot);
        expect(data).not.toBe((f.stored as any)._doc);
        changeInput = data;
        data.value = 'changes-override';
        await normalChanges(data, lifecycle);
        data.value = 'retained-change';
      });
      let serial = 0;
      const normal = f.stored.toObject.bind(f.stored);
      const conversions = vi.spyOn(f.stored, 'toObject').mockImplementation((options) => {
        const output = normal(options) as any;
        output.value = `${f.stored.get('value')}@${++serial}`;
        return output;
      });
      const result = await update(f, entry);
      expect(result).toMatchObject({ success: true, data: { value: 'onchange-live@9' } });
      expect(changed).toEqual({
        before: 'retained-original',
        after: 'changes-override',
        final: 'diff-override-final',
        diffValue: 'submitted@7',
      });
      expect(earlyChanges!.find((change) => change.path[0] === 'value').value).toBe('submitted@5');
      expect(context.changes).not.toBe(earlyChanges!);
      expect(context.originalDocumentSnapshot!.value).toBe('retained-original');
      expect(context.finalDocumentSnapshot!.value).toBe('onchange-final');
      expect(changeInput.value).toBe('retained-change');
      expect(f.saved[0].value).toBe('submitted@4');
      expect(f.stored.get('value')).toBe('onchange-live');
      expect(conversions.mock.calls.map(([options]) => options ?? null)).toEqual([
        ...conversionOptions.slice(0, 7),
        { virtuals: false },
        { virtuals: false, flattenMaps: true },
      ]);
      expect(afterPersist).toHaveBeenCalledOnce();
      expect(changes).toHaveBeenCalledOnce();
      expect(f.saves).toHaveBeenCalledOnce();
      expect(f.adapter.create).not.toHaveBeenCalled();
      // Mutating the live row again cannot change the already-published write output.
      f.stored.set('value', 'after-publication');
      expect(result).toMatchObject({ data: { value: 'onchange-live@9' } });
      observations.push({
        kind: 'retained-service-lifecycle',
        mode,
        entry,
        rootConversionsIncludingAdapter: serial,
        extraEarlyDiffConversions: 1,
        originalValue: context.originalDocumentSnapshot!.value,
        finalValue: context.finalDocumentSnapshot!.value,
        changeInputValue: changeInput.value,
        earlyDiffValue: 'submitted@5',
        finalDiffValue: 'submitted@7',
        onChange: changed,
        outputValue: 'onchange-live@9',
        afterPersistCalls: 1,
        changesCalls: 1,
        saves: 1,
        snapshotsAndChangeInputDistinct: true,
        outputDetached: true,
      });
    },
  );
});
