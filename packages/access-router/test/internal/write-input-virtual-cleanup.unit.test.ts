import * as fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { captureAuthorizationFieldCatalog, clearCapturedOutputCatalog } from '../../src/acl/field-catalog';
import { stripDocumentInputVirtuals } from '../../src/acl/model-input-admission';

const observations: object[] = [];
let serial = 0;
afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Cwo06Cleanup/);
});
afterAll(async () => {
  if (!process.env.CWO06_CLEANUP_REPORT) return;
  const target = path.resolve(process.env.CWO06_CLEANUP_REPORT);
  expect(target.startsWith(`${path.resolve(process.env.TMPDIR!)}${path.sep}`)).toBe(true);
  await fs.writeFile(target, JSON.stringify(observations));
});

function cleanupFixture() {
  const nativeSetters: Array<[unknown, unknown]> = [];
  const child = new mongoose.Schema(
    { _id: String, value: String, badge: String, backing: String },
    { id: false, strict: false },
  );
  child.virtual('nativeAlias').set(function (value) {
    nativeSetters.push([this.get('_id'), value ?? null]);
    this.set('backing', value);
  });
  child.set('toObject', {
    transform(_doc, output) {
      // The materialized path need not exist in hydrated _doc/get storage.
      output.nativeAlias = output.backing;
      return output;
    },
  });
  const schema = new mongoose.Schema(
    {
      _id: String,
      value: String,
      rootGhost: String,
      profile: child,
      rows: [child],
      labels: { type: Map, of: child },
      mixed: mongoose.Schema.Types.Mixed,
    },
    { id: false, strict: false, versionKey: false },
  );
  const model = mongoose.model(`Cwo06Cleanup${++serial}`, schema);
  const doc = model.hydrate({
    _id: 'root',
    value: 'before',
    rootGhost: 'historical-root',
    profile: { _id: 'profile', value: 'old', badge: 'historical-profile', backing: 'keep-profile' },
    rows: [
      { _id: 'first', value: 'one', badge: 'historical-first', backing: 'keep-first' },
      { _id: 'second', value: 'two', badge: 'historical-second', backing: 'keep-second' },
    ],
    labels: {
      work: { _id: 'work', value: 'old', backing: 'keep-work' },
      home: { _id: 'home', value: 'old', backing: 'keep-home' },
    },
    mixed: { value: 'old', ghost: 'historical-mixed', native: new Date(17) },
  });
  const catalog = captureAuthorizationFieldCatalog(schema, {
    rootGhost: {},
    profile: { sub: { badge: {} } },
    rows: { sub: { badge: {} } },
    mixed: { sub: { ghost: {} } },
  });
  return { doc, catalog, nativeSetters };
}

describe('virtual cleanup uses the full conversion and concrete current isModified decisions', () => {
  it.each(['leaf', 'container', 'array-push'] as const)(
    '%s retains native/schema/Mixed/Map/array scope and historical sibling semantics',
    (kind) => {
      const { doc, catalog, nativeSetters } = cleanupFixture();
      try {
        doc.set('value', 'submitted');
        doc.set('profile.value', 'submitted');
        doc.set('rows.0.value', 'submitted');
        doc.set('labels.work.value', 'submitted');
        doc.set('mixed.value', 'submitted');
        doc.set('rows.0.badge', 'introduced');
        if (kind === 'container')
          for (const field of ['profile', 'rows.0', 'labels.work', 'mixed']) doc.markModified(field);
        if (kind === 'array-push') doc.get('rows').push({ _id: 'third', value: 'three', backing: 'keep-third' });
        const beforeModifiedPaths = doc.modifiedPaths();
        const beforeDirectModifiedPaths = doc.directModifiedPaths();
        expect(beforeModifiedPaths).toEqual(expect.arrayContaining(['rows', 'rows.0', 'labels', 'profile', 'mixed']));
        const normalConversion = doc.toObject.bind(doc);
        const normalModified = doc.isModified.bind(doc);
        const decisions: Array<[string, boolean]> = [];
        const isModified = vi.spyOn(doc, 'isModified').mockImplementation((field) => {
          const result = normalModified(field);
          decisions.push([String(field), result]);
          return result;
        });
        const modifiedPaths = vi.spyOn(doc, 'modifiedPaths');
        const conversions = vi.spyOn(doc, 'toObject');
        const setters = vi.spyOn(doc, 'set');
        expect(catalog.schemaVirtualPaths).toContain('labels.$*.nativeAlias');
        expect(Object.hasOwn((doc.get('labels.work') as any)._doc, 'nativeAlias')).toBe(false);
        stripDocumentInputVirtuals(doc, catalog);
        expect(conversions).toHaveBeenCalledExactlyOnceWith({ virtuals: false, flattenMaps: true });
        expect(modifiedPaths).not.toHaveBeenCalled();
        const expectedDecisions: Array<[string, boolean]> = [
          ['rootGhost', false],
          ['profile.badge', kind === 'container'],
          ['profile.nativeAlias', kind === 'container'],
          ['rows.0.badge', true],
          ['rows.0.nativeAlias', kind !== 'leaf'],
          ['rows.1.badge', kind === 'array-push'],
          ['rows.1.nativeAlias', kind === 'array-push'],
          ...(kind === 'array-push' ? ([['rows.2.nativeAlias', true]] as Array<[string, boolean]>) : []),
          ['labels.work.nativeAlias', kind === 'container'],
          ['labels.home.nativeAlias', false],
          ['mixed.ghost', kind === 'container'],
        ];
        expect(decisions).toEqual(expectedDecisions);
        expect(isModified).toHaveBeenCalledTimes(expectedDecisions.length);
        const cleanupSetters = setters.mock.calls.map(([field, value]) => [field, value ?? null]);
        expect(cleanupSetters).toEqual(
          expectedDecisions.filter(([, modified]) => modified).map(([field]) => [field, null]),
        );
        const expectedNativeSetters =
          kind === 'leaf'
            ? []
            : kind === 'container'
              ? [['first', null]]
              : [
                  ['first', null],
                  ['second', null],
                  ['third', null],
                ];
        expect(nativeSetters).toEqual(expectedNativeSetters);
        const output = normalConversion({ virtuals: false, flattenMaps: true }) as any;
        expect(output.rootGhost).toBe('historical-root');
        expect(output.profile.badge).toBe(kind === 'container' ? undefined : 'historical-profile');
        expect(output.profile.backing).toBe('keep-profile');
        expect(output.rows[0].badge).toBeUndefined();
        expect(output.rows[1].badge).toBe(kind === 'array-push' ? undefined : 'historical-second');
        expect(output.rows[0].backing).toBe(kind === 'leaf' ? 'keep-first' : undefined);
        expect(output.labels.work.backing).toBe('keep-work');
        expect(output.labels.home.backing).toBe('keep-home');
        expect(output.mixed.ghost).toBe(kind === 'container' ? undefined : 'historical-mixed');
        expect(output.mixed.native).toEqual(new Date(17));
        expect(output.rows).toHaveLength(kind === 'array-push' ? 3 : 2);
        observations.push({
          kind: 'cleanup-dirty-scopes',
          modification: kind,
          beforeModifiedPaths,
          beforeDirectModifiedPaths,
          conversionOptions: { virtuals: false, flattenMaps: true },
          decisions,
          cleanupSetters,
          nativeSetters,
          publicModifiedPathsCallsInCleanup: modifiedPaths.mock.calls.length,
          historicalRoot: output.rootGhost,
          historicalSecondBadge: output.rows[1].badge ?? null,
          mapBacking: [output.labels.work.backing, output.labels.home.backing],
          arrayLength: output.rows.length,
        });
      } finally {
        clearCapturedOutputCatalog(catalog);
      }
    },
  );

  it('visits unmodified virtuals in serialized order and honors a live isModified override', () => {
    const schema = new mongoose.Schema({ _id: String, firstVirtual: String, secondVirtual: String }, { id: false });
    const model = mongoose.model(`Cwo06Cleanup${++serial}`, schema);
    const doc = model.hydrate({ _id: 'root', firstVirtual: 'historical', secondVirtual: 'initial' });
    const catalog = captureAuthorizationFieldCatalog(schema, { firstVirtual: {}, secondVirtual: {} });
    try {
      expect(doc.modifiedPaths()).toEqual([]);
      const normalModified = doc.isModified.bind(doc);
      const decisions: Array<[string, boolean]> = [];
      const modifiedPaths = vi.spyOn(doc, 'modifiedPaths');
      const conversions = vi.spyOn(doc, 'toObject');
      const isModified = vi.spyOn(doc, 'isModified').mockImplementation((field) => {
        if (field === 'firstVirtual') doc.set('secondVirtual', 'introduced-by-earlier-check');
        const modified = normalModified(field);
        decisions.push([String(field), modified]);
        return modified;
      });
      stripDocumentInputVirtuals(doc, catalog);
      expect(conversions).toHaveBeenCalledExactlyOnceWith({ virtuals: false, flattenMaps: true });
      expect(modifiedPaths).not.toHaveBeenCalled();
      expect(isModified).toHaveBeenCalledTimes(2);
      expect(decisions).toEqual([
        ['firstVirtual', false],
        ['secondVirtual', true],
      ]);
      expect(doc.get('firstVirtual')).toBe('historical');
      expect(doc.get('secondVirtual')).toBeUndefined();
      observations.push({
        kind: 'cleanup-live-dirty-override',
        initialModifiedPaths: [],
        decisions,
        publicModifiedPathsCallsInCleanup: 0,
        historicalFirstVirtual: doc.get('firstVirtual'),
        secondVirtualRemoved: doc.get('secondVirtual') === undefined,
      });
    } finally {
      clearCapturedOutputCatalog(catalog);
    }
  });
});
