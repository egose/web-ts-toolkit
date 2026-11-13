import * as fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureAuthorizationFieldCatalog,
  clearCapturedOutputCatalog,
  readOwnedAuthorizationCatalogWork,
} from '../../src/acl/field-catalog';
import { admitModelInput, sanitizePreparedInput } from '../../src/acl/model-input-admission';
import { applyUpdate } from '../../src/helpers/apply-update';

const observations: object[] = [];
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (!process.env.CWO05_PATH_REPORT) return;
  const target = path.resolve(process.env.CWO05_PATH_REPORT);
  expect(target.startsWith(`${path.resolve(process.env.TMPDIR!)}${path.sep}`)).toBe(true);
  await fs.writeFile(target, JSON.stringify(observations));
});

describe('private input grammar/preparation observations, not allocation or timing acceptance', () => {
  it.each([
    { field: 'payload[0].value', boundary: 'payload.0.value', key: '0', array: true },
    { field: 'payload["01"].value', boundary: 'payload.01.value', key: '01', array: false },
    { field: 'payload[4294967295].value', boundary: 'payload.4294967295.value', key: '4294967295', array: false },
  ])('keeps bracket alias $field and index identity', ({ field, boundary, key, array }) => {
    const catalog = captureAuthorizationFieldCatalog(new mongoose.Schema({ payload: mongoose.Schema.Types.Mixed }), {});
    const incoming = { value: 'submitted', sibling: 'denied' };
    const data = { payload: array ? [incoming] : { [key]: incoming } };
    const target: any = {
      payload: array ? [{ value: 'before', sibling: 'kept' }] : { [key]: { value: 'before', sibling: 'kept' } },
    };
    try {
      const admitted = admitModelInput({
        data,
        requestFields: [field, boundary],
        inputFields: { mode: 'request' },
        catalog,
      });
      expect(admitted.allowedFields).toEqual([boundary]);
      expect(Array.isArray(admitted.allowedData.payload)).toBe(array);
      expect((admitted.allowedData.payload as any)[key]).toEqual({ value: 'submitted' });
      applyUpdate(target, admitted.allowedData, admitted.allowedFields);
      expect(target.payload[key]).toEqual({ value: 'submitted', sibling: 'kept' });
      expect(Object.keys(target.payload)).toEqual([key]);
      expect(incoming).toEqual({ value: 'submitted', sibling: 'denied' });
      observations.push({ kind: 'path-alias', field, boundary, key, array, storedValue: target.payload[key] });
    } finally {
      clearCapturedOutputCatalog(catalog);
    }
  });

  it('does not memoize repeated primitive key grammar across a native-installed method observation', () => {
    const catalog = captureAuthorizationFieldCatalog(
      new mongoose.Schema({ items: [mongoose.Schema.Types.Mixed], when: Date }),
      {},
    );
    const input = { items: [{ value: 'first' }, { value: 'second' }], when: new Date(1) };
    const previous = Object.getOwnPropertyDescriptor(String.prototype, 'replace')!;
    const original = previous.value as typeof String.prototype.replace;
    const events: string[] = [];
    let grammarReads = 0;
    const native = vi.spyOn(input.when, 'getTime').mockImplementation(() => {
      events.push('native.install');
      Object.defineProperty(String.prototype, 'replace', {
        ...previous,
        value: function (...args: unknown[]) {
          if (String(this) === 'value') {
            events.push(`grammar:${++grammarReads}`);
            return Reflect.apply(original, grammarReads === 2 ? 'execution' : this, args);
          }
          return Reflect.apply(original, this, args);
        },
      });
      return 7;
    });
    let result;
    try {
      result = sanitizePreparedInput(input, catalog);
    } finally {
      Object.defineProperty(String.prototype, 'replace', previous);
      clearCapturedOutputCatalog(catalog);
    }
    expect(native).toHaveBeenCalledOnce();
    expect(events).toEqual(['native.install', 'grammar:1', 'grammar:2']);
    expect(result).toEqual({ items: [{ value: 'first' }, {}], when: new Date(7) });
    expect(input.items).toEqual([{ value: 'first' }, { value: 'second' }]);
    observations.push({
      kind: 'repeated-key-native-grammar',
      events,
      nativeCalls: native.mock.calls.length,
      grammarReads,
      scrubbedItems: result.items,
      rawItemsUnchanged: true,
    });
  });

  it('catalog construction provenance is own private identity, not freeze, copying or inheritance', () => {
    const catalog = captureAuthorizationFieldCatalog(new mongoose.Schema({ payload: mongoose.Schema.Types.Mixed }), {});
    const inherited = Object.freeze(Object.create(catalog));
    const copied = Object.freeze({ ...catalog });
    const work = readOwnedAuthorizationCatalogWork(catalog);
    expect(work).toBeDefined();
    expect(Object.isFrozen(work)).toBe(true);
    expect(readOwnedAuthorizationCatalogWork(inherited)).toBeUndefined();
    expect(readOwnedAuthorizationCatalogWork(copied)).toBeUndefined();
    clearCapturedOutputCatalog(catalog);
    expect(readOwnedAuthorizationCatalogWork(catalog)).toBeUndefined();
    observations.push({
      kind: 'catalog-own-provenance',
      ownedSlots: work!.slots,
      ownedDepth: work!.depth,
      inheritedProvenance: false,
      copiedProvenance: false,
      explicitClearReleasesProvenance: true,
    });
  });
});
