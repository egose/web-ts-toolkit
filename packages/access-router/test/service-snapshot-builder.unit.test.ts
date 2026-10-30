import { isDeepStrictEqual } from 'node:util';
import mongoose, { mongo } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { Service } from '../src/services/service';
import { PublicService } from '../src/services/public-service';
import { PERMISSIONS } from '../src/symbols';
import { unsafeSnapshotCheckOptions, unsafeInitialOutputCopyOptions } from '../src/acl/unsafe-snapshot-options';
import type { ModelRequest, ModelRouterOptions } from '../src/interfaces';
import * as snapshots from '../src/acl/authorization-snapshot';
import { legacyCopyAuthorizationValue } from './authorization-snapshot-copy.reference';

let serial = 0;
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Pipe02Service/);
});

async function run(
  entry: 'direct' | 'public',
  operation: 'list' | 'read',
  checks: boolean,
  initial: boolean,
  legacy: boolean,
) {
  const model = mongoose.model(
    `Pipe02Service${++serial}`,
    new mongoose.Schema({
      value: Number,
      owner: Boolean,
      when: Date,
      bytes: Buffer,
      id: mongoose.Schema.Types.ObjectId,
    }),
  );
  const runtime = new AccessRuntime();
  runtime.setGlobalOptions({ logger: { warn: () => {} }, requestComplexity: { maxHookConcurrency: 1 } });
  runtime.registerModelInstance(model.modelName, model);
  const events: string[] = [];
  const hook = (doc: { value: number; owner: boolean; when: Date; bytes: Buffer }) => {
    events.push(`hook:${doc.value}`);
    doc.when.setTime(99);
    doc.bytes[0] = 99;
    return { owner: doc.owner, when: new Date(5), bytes: Buffer.from([5]) };
  };
  const decision = (_permissions, grants: { owner: boolean; when: Date }) => {
    events.push(`field:${grants.owner}`);
    grants.when.setTime(100);
    return grants.owner;
  };
  runtime.setModelOptions(model.modelName, {
    permissionSchema: { value: decision, when: true, bytes: true, id: true },
    alwaysSelectFields: ['owner'],
    stripPermissionsField: true,
    docPermissions: { list: hook, read: hook },
    ...Object.fromEntries(unsafeSnapshotCheckOptions.map((key) => [key, checks])),
    ...Object.fromEntries(unsafeInitialOutputCopyOptions.map((key) => [key, initial])),
  } as ModelRouterOptions);
  const rows = [true, false].map((owner, index) => ({
    value: index,
    owner,
    when: new Date(1),
    bytes: Buffer.from([1]),
    id: new mongo.BSON.ObjectId('0123456789abcdef01234567'),
  }));
  const adapter = {
    mongooseModel: model,
    find: vi.fn().mockResolvedValue(rows),
    findOne: vi.fn().mockResolvedValue(rows[0]),
  };
  const req = { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest;
  const services = runWithRuntime(runtime, () => {
    req.macl = new Core(req);
    return {
      direct: new (class extends Service {
        protected createModelAdapter() {
          return adapter;
        }
      })(req, model.modelName),
      public: new (class extends PublicService {
        protected createModelAdapter() {
          return adapter;
        }
      })(req, model.modelName),
    };
  });

  const actualCopy = snapshots.copyAuthorizationValue;
  const copy = legacy ? legacyCopyAuthorizationValue : actualCopy;
  const work = { copies: 0, validations: 0, definitions: 0, dateCopies: 0, wireCopies: 0 };
  let copying = false;
  const observedCopy: typeof actualCopy = (value, mode) => {
    work.copies++;
    const previous = copying;
    copying = true;
    try {
      return copy(value, mode);
    } finally {
      copying = previous;
    }
  };
  const copySpy = vi.spyOn(snapshots, 'copyAuthorizationValue').mockImplementation(observedCopy);
  const matchesSpy = vi.spyOn(snapshots, 'matchesAuthorizationSnapshot').mockImplementation((value, snapshot) => {
    work.validations++;
    try {
      return isDeepStrictEqual(observedCopy(value, 'document'), snapshot);
    } catch {
      return false;
    }
  });
  const define = Object.defineProperty;
  const defineSpy = vi.spyOn(Object, 'defineProperty').mockImplementation((...args) => {
    if (copying) work.definitions++;
    return define(...args);
  });
  const getTime = Date.prototype.getTime;
  const timeSpy = vi.spyOn(Date.prototype, 'getTime').mockImplementation(function (this: Date) {
    work.dateCopies++;
    return getTime.call(this);
  });
  const bsonSpy = vi.spyOn(mongo, 'BSON', 'get').mockReturnValue({ ...mongo.BSON });
  const serialize = mongo.BSON.serialize;
  const wireSpy = vi.spyOn(mongo.BSON, 'serialize').mockImplementation((...args) => {
    work.wireCopies++;
    return serialize(...args);
  });
  try {
    const args = { select: ['value', 'when', 'bytes', 'id', '-_id'] };
    const result =
      operation === 'list'
        ? entry === 'direct'
          ? await services.direct.find({}, args, quiet)
          : await services.public._list({}, args, quiet)
        : entry === 'direct'
          ? await services.direct.findOne({}, args, quiet)
          : await services.public._readFilter({}, args, quiet);
    const observed = { ...work };
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    expect(rows.map((row) => [row.when.getTime(), row.bytes[0]])).toEqual([
      [1, 1],
      [1, 1],
    ]);
    return { data: result.data, events, work: observed };
  } finally {
    wireSpy.mockRestore();
    bsonSpy.mockRestore();
    timeSpy.mockRestore();
    defineSpy.mockRestore();
    matchesSpy.mockRestore();
    copySpy.mockRestore();
  }
}

describe('PIPE-02 real query paths preserve observations with fewer record definitions', () => {
  it.each(
    ['direct', 'public'].flatMap((entry) =>
      ['list', 'read'].flatMap((operation) =>
        [false, true].flatMap((checks) =>
          [false, true].map((initial) => ({
            entry: entry as 'direct' | 'public',
            operation: operation as 'list' | 'read',
            checks,
            initial,
          })),
        ),
      ),
    ),
  )(
    '$entry/$operation comparison-skips=$checks initial-copy-skips=$initial',
    async ({ entry, operation, checks, initial }) => {
      const before = await run(entry, operation, checks, initial, true);
      const after = await run(entry, operation, checks, initial, false);
      expect(after.data).toEqual(before.data);
      expect(after.events).toEqual(before.events);
      expect(after.work).toEqual({ ...before.work, definitions: after.work.definitions });
      expect(after.work.definitions).toBeLessThan(before.work.definitions);
      expect(after.work.wireCopies).toBeGreaterThan(0);
      expect(after.events).toEqual(
        operation === 'list' ? ['hook:0', 'field:true', 'hook:1', 'field:false'] : ['hook:0', 'field:true'],
      );
    },
  );
});
