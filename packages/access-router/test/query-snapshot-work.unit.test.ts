import mongoose from 'mongoose';
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

const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
let serial = 0;

function fixture(operation: 'read' | 'list', root: boolean, nested: boolean, output: boolean) {
  const childSchema = new mongoose.Schema({ value: String, hidden: String, childNative: Date }, { _id: false });
  const model = mongoose.model(
    `QuerySnapshotWork${++serial}`,
    new mongoose.Schema(
      {
        value: String,
        hidden: String,
        rootNative: Date,
        children: [childSchema],
      },
      { versionKey: false },
    ),
  );
  const mode = operation === 'read' ? 'Read' : 'List';
  const runtime = new AccessRuntime();
  runtime.setGlobalOptions({ logger: { warn: vi.fn() } });
  runtime.registerModelInstance(model.modelName, model);
  const hook = vi.fn(() => ({ reader: true }));
  runtime.setModelOptions(model.modelName, {
    permissionSchema: {
      value: 'doc:reader',
      hidden: false,
      children: { read: true, list: true, sub: { value: 'doc:reader', hidden: false } },
    },
    virtuals: { children: { sub: {} } },
    modelPermissionPrefix: 'doc:',
    docPermissions: { read: hook, list: hook },
    stripPermissionsField: true,
    alwaysSelectFields: ['rootNative', 'children.childNative'],
    [`unsafeSkip${mode}DocumentSnapshotChecks`]: root,
    [`unsafeSkip${mode}NestedDocumentSnapshotChecks`]: nested,
    [`unsafeSkip${mode}OutputSnapshotChecks`]: output,
  });
  const rows = [
    {
      value: 'root',
      hidden: 'never',
      rootNative: new Date(1),
      children: [
        { value: 'first', hidden: 'never', childNative: new Date(2) },
        { value: 'second', hidden: 'never', childNative: new Date(3) },
      ],
    },
  ];
  const adapter = {
    mongooseModel: model,
    find: vi.fn().mockResolvedValue(rows),
    findOne: vi.fn().mockResolvedValue(rows[0]),
    countDocuments: vi.fn(),
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
  return { ...services, adapter, hook };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^QuerySnapshotWork/);
});

describe('real query/finalizer/helper snapshot comparisons', () => {
  it.each(
    ['read', 'list'].flatMap((operation) =>
      ['direct', 'public'].flatMap((entry) =>
        Array.from({ length: 8 }, (_, mask) => ({
          operation: operation as 'read' | 'list',
          entry,
          root: !!(mask & 1),
          nested: !!(mask & 2),
          output: !!(mask & 4),
        })),
      ),
    ),
  )(
    '$operation/$entry: root=$root nested=$nested output=$output',
    async ({ operation, entry, root, nested, output }) => {
      const f = fixture(operation, root, nested, output);
      const counts = { root: 0, nested: 0, output: 0 };
      const matches = snapshots.matchesAuthorizationSnapshot;
      vi.spyOn(snapshots, 'matchesAuthorizationSnapshot').mockImplementation((value, snapshot) => {
        const kind = Object.hasOwn(value as object, 'rootNative')
          ? 'root'
          : Object.hasOwn(value as object, 'childNative')
            ? 'nested'
            : 'output';
        counts[kind]++;
        return matches(value, snapshot);
      });
      const args = { select: ['value', 'hidden', 'children.value', 'children.hidden', '-_id'] };
      const result =
        entry === 'public'
          ? operation === 'list'
            ? await f.public._list({}, args, quiet)
            : await f.public._readFilter({}, args, quiet)
          : operation === 'list'
            ? await f.direct.find({}, args, quiet)
            : await f.direct.findOne({}, args, quiet);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      const data = operation === 'list' ? (result.data as unknown[])[0] : result.data;
      const expected = { value: 'root', children: [{ value: 'first' }, { value: 'second' }] };
      expect(data).toEqual(expected);
      expect(f.hook).toHaveBeenCalledTimes(1); // Embedded stages still reuse owning grants.
      expect(f.adapter[operation === 'list' ? 'find' : 'findOne']).toHaveBeenCalledTimes(1);
      expect(f.adapter.countDocuments).not.toHaveBeenCalled();
      expect(counts.root === 0).toBe(root);
      expect(counts.nested === 0).toBe(nested);
      expect(counts.output === 0).toBe(output);
      const context =
        operation === 'list'
          ? (result as unknown as { contexts: ServiceOutputContext[] }).contexts[0]
          : (result as unknown as { context: ServiceOutputContext }).context;
      for (const child of (data as typeof expected).children)
        expect(context.getDocumentAuthorization(child)).toBeDefined();
      expect(
        await f.direct.pickAllowedFields(data, operation, { documentAuthorization: context.documentAuthorization }),
      ).toEqual(expected);
    },
  );
});
