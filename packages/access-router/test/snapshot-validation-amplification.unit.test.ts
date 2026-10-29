import mongoose, { mongo } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { Service } from '../src/services/service';
import { PublicService } from '../src/services/public-service';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest, ServiceOutputContext } from '../src/interfaces';
import * as snapshots from '../src/acl/authorization-snapshot';
import { evaluateAuthorizedOutputField, requestOutputFieldPaths } from '../src/acl/output-field-filter';
import {
  associateDocumentAuthorization,
  createDocumentAuthorizationStage,
  readDocumentAuthorizationAccess,
  resolveDocumentAuthorization,
} from '../src/acl/document-authorization';

const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
const entries = ['direct', 'public'] as const;
let serial = 0;

function fixture(width: number, nativeLeaves: number, count: number) {
  const fields = Array.from({ length: width }, (_, index) => `field${index}`);
  const model = mongoose.model(
    `Snapcpu01${++serial}`,
    new mongoose.Schema(
      {
        ...Object.fromEntries(fields.map((field) => [field, String])),
        hidden: String,
        native: [mongoose.Schema.Types.ObjectId],
      },
      { versionKey: false },
    ),
  );
  const runtime = new AccessRuntime();
  runtime.setGlobalOptions({ requestComplexity: { maxHookConcurrency: 10 } });
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, {
    permissionSchema: { ...Object.fromEntries(fields.map((field) => [field, true])), hidden: false },
    stripPermissionsField: true,
    alwaysSelectFields: ['native'],
  });
  // String fields match the ordinary benchmark payload. This extra fetch-only
  // native array makes each *whole-stage* wire-copy observable independently of
  // config reads, selected width, output association checks and native leaf count.
  const rows = Array.from({ length: count }, (_, row) => ({
    ...Object.fromEntries(fields.map((field, index) => [field, `${row}:${index}:${'x'.repeat(32)}`])),
    hidden: 'never output',
    native: Array.from(
      { length: nativeLeaves },
      (_, index) => new mongo.BSON.ObjectId((index + 1).toString(16).padStart(24, '0')),
    ),
  }));
  const adapter = { mongooseModel: model, find: vi.fn().mockResolvedValue(rows), countDocuments: vi.fn() };
  const req = { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest;
  const { service, publicService } = runWithRuntime(runtime, () => {
    req.macl = new Core(req);
    return {
      service: new (class extends Service {
        protected createModelAdapter() {
          return adapter;
        }
      })(req, model.modelName),
      publicService: new (class extends PublicService {
        protected createModelAdapter() {
          return adapter;
        }
      })(req, model.modelName),
    };
  });
  return {
    fields,
    rows,
    adapter,
    service,
    publicService,
    binding: { request: req, runtime, model, modelName: model.modelName },
  };
}

function counters() {
  // BSON's namespace is frozen; use its configurable driver getter, retaining
  // the real serializer/constructors and normalization (same seam as snapshot tests).
  vi.spyOn(mongo, 'BSON', 'get').mockReturnValue({ ...mongo.BSON });
  const serialize = mongo.BSON.serialize;
  const matches = snapshots.matchesAuthorizationSnapshot;
  let validating = false;
  const work = {
    fullValidations: 0,
    stageValidations: 0,
    outputValidations: 0,
    validationNativeClones: 0,
    totalNativeClones: 0,
  };
  vi.spyOn(mongo.BSON, 'serialize').mockImplementation((...args) => {
    work.totalNativeClones++;
    if (validating) work.validationNativeClones++;
    return serialize(...args);
  });
  vi.spyOn(snapshots, 'matchesAuthorizationSnapshot').mockImplementation((value, snapshot) => {
    work.fullValidations++;
    if (Object.prototype.hasOwnProperty.call(value, 'native')) work.stageValidations++;
    else work.outputValidations++;
    const previous = validating;
    validating = true;
    try {
      return matches(value, snapshot);
    } finally {
      validating = previous;
    }
  });
  return {
    work,
    reset: () => {
      for (const key of Object.keys(work) as Array<keyof typeof work>) work[key] = 0;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Snapcpu01/);
});

describe('real-list snapshot validation work (no virtuals)', () => {
  for (const entry of entries) {
    it.each(
      [1, 10].flatMap((count) =>
        [4, 24].flatMap((width) => [0, 1, 24].map((nativeLeaves) => ({ count, width, nativeLeaves }))),
      ),
    )(
      `${entry}: $count rows / $width selected fields / $nativeLeaves fetch-only BSON leaves`,
      async ({ count, width, nativeLeaves }) => {
        const f = fixture(width, nativeLeaves, count);
        const observed = counters();
        const args = { select: [...f.fields, 'hidden', '-_id'] };
        const result =
          entry === 'direct' ? await f.service.find({}, args, quiet) : await f.publicService._list({}, args, quiet);
        expect(result.success).toBe(true);
        if (!result.success) throw new Error(result.code);
        expect(result.data).toEqual(
          f.rows.map((row) => Object.fromEntries(f.fields.map((field) => [field, row[field]]))),
        );
        expect(f.adapter.find).toHaveBeenCalledTimes(1);
        expect(f.adapter.countDocuments).not.toHaveBeenCalled();
        // Closed static decisions amortize the walks across a whole row, including
        // native-bearing stages. Every owner read retains both observations:
        // ordinary shape does not prove normalization/equality passive.
        const perField = 14;
        const hit = 5;
        const stageWalks = 37;
        expect(observed.work).toEqual({
          fullValidations: count * (stageWalks + 3),
          stageValidations: count * stageWalks,
          outputValidations: count * 3,
          validationNativeClones: count * nativeLeaves * stageWalks,
          totalNativeClones: count * nativeLeaves * (stageWalks + 6),
        });
        const handle = (result as unknown as { contexts: readonly ServiceOutputContext[] }).contexts[0]
          .documentAuthorization;
        observed.reset();
        for (let repeat = 0; repeat < 2; repeat++) {
          expect(await evaluateAuthorizedOutputField(handle, f.binding, f.fields[0])).toBe(true);
        }
        expect(observed.work).toEqual({
          fullValidations: 2 * hit,
          stageValidations: 2 * hit,
          outputValidations: 0,
          validationNativeClones: 10 * nativeLeaves,
          totalNativeClones: 10 * nativeLeaves,
        });
        observed.reset();
        // A denied, non-selected field has no output memo yet. Its first cold
        // decision still nests the request memo; its second lookup is a hit.
        expect(await evaluateAuthorizedOutputField(handle, f.binding, 'hidden')).toBe(false);
        expect(observed.work).toEqual({
          fullValidations: perField,
          stageValidations: perField,
          outputValidations: 0,
          validationNativeClones: 14 * nativeLeaves,
          totalNativeClones: 14 * nativeLeaves,
        });
        observed.reset();
        expect(await evaluateAuthorizedOutputField(handle, f.binding, 'hidden')).toBe(false);
        expect(observed.work).toEqual({
          fullValidations: hit,
          stageValidations: hit,
          outputValidations: 0,
          validationNativeClones: 5 * nativeLeaves,
          totalNativeClones: 5 * nativeLeaves,
        });
        for (const helper of ['pickAllowedFields', 'trimOutputFields', 'genAllowedFields'] as const) {
          for (const cold of [false, true]) {
            const call = readDocumentAuthorizationAccess(handle, f.binding).authorization;
            const helperHandle = cold
              ? await resolveDocumentAuthorization(
                  createDocumentAuthorizationStage(call, f.binding, f.rows[0]),
                  () => ({}),
                )
              : handle;
            const source = cold ? { ...result.data[0] } : result.data[0];
            if (cold) associateDocumentAuthorization(helperHandle, f.binding, source);
            observed.reset();
            const options = { documentAuthorization: helperHandle, purpose: 'output' as const };
            const picked =
              helper === 'genAllowedFields'
                ? await f.service.genAllowedFields(source, 'list', options)
                : await f.service[helper](source, 'list', { documentAuthorization: helperHandle });
            expect(picked).toEqual(helper === 'genAllowedFields' ? f.fields : source);
            const helperWalks = 16;
            expect(observed.work).toEqual({
              fullValidations: helperWalks + 3,
              stageValidations: helperWalks,
              outputValidations: 3,
              validationNativeClones: nativeLeaves * helperWalks,
              totalNativeClones: nativeLeaves * helperWalks,
            });
          }
        }
        observed.reset();
        expect(await requestOutputFieldPaths(handle, f.binding, 'read')).toEqual(f.fields);
        const metadataWalks = 6;
        expect(observed.work).toEqual({
          fullValidations: metadataWalks,
          stageValidations: metadataWalks,
          outputValidations: 0,
          validationNativeClones: nativeLeaves * metadataWalks,
          totalNativeClones: nativeLeaves * metadataWalks,
        });
      },
    );
  }
});
