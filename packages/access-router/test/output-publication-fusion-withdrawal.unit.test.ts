/** Retained regression evidence after the unsafe publication prototype was withdrawn. */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import { Service } from '../src/services/service';
import { PublicService } from '../src/services/public-service';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import Permission from '../src/permission';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest, ModelRouterOptions } from '../src/interfaces';
import * as documents from '../src/acl/document-authorization';
import * as helpers from '../src/helpers/document';
import { unsafeSnapshotOptions } from '../src/acl/unsafe-snapshot-options';

const originalFlags = Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, true]));
const formerFlags = { unsafeFuseListOutputPublication: true, unsafeFuseReadOutputPublication: true };
const quiet = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
let serial = 0;

function fixture(options: ModelRouterOptions = {}) {
  const model = mongoose.model(
    `PublicationWithdrawal${++serial}`,
    new mongoose.Schema({ name: String, hidden: String }),
  );
  const runtime = new AccessRuntime();
  runtime.setGlobalOptions({ logger: { warn() {} }, requestComplexity: { maxHookConcurrency: 1 } });
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, {
    ...originalFlags,
    operationAccess: { list: true, read: true },
    permissionSchema: { name: true, hidden: false },
    stripPermissionsField: true,
    hydration: { find: 'lean', findOne: 'lean', publicList: 'lean', publicRead: 'lean' },
    ...options,
  });
  const req = {
    _permissions: { reader: true },
    [PERMISSIONS]: new Permission({ reader: true }),
  } as unknown as ModelRequest;
  const adapter = { mongooseModel: model, find: vi.fn(), findOne: vi.fn() };
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
  return { model, runtime, adapter, ...services };
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^PublicationWithdrawal/);
});

it('does not ship the former flags or private completion in declarations or installed documentation', () => {
  const root = path.resolve(__dirname, '..');
  const files = readdirSync(path.resolve(root, 'dist')).filter((file) => /\.d\.(?:ts|mts)$/.test(file));
  expect(files).toHaveLength(8);
  for (const file of [...files.map((file) => `dist/${file}`), 'README.md', 'llms.txt']) {
    const text = readFileSync(path.resolve(root, file), 'utf8');
    expect(text).not.toMatch(
      /unsafeFuse(?:List|Read)OutputPublication|finalizeServiceModelOutput|tryAssociateServiceOutputPublication|assertServiceOutputPublication/,
    );
  }
  expect(readFileSync(path.resolve(root, 'README.md'), 'utf8')).toContain(
    'No publication-fusion options are available',
  );
  const defaults = new AccessRuntime().getDefaultModelOptions();
  for (const key of Object.keys(formerFlags)) expect(defaults).not.toHaveProperty(key);
});

describe('original private publication remains for direct and public READ/LIST', () => {
  it.each(['direct-list', 'public-list', 'direct-read', 'public-read'] as const)(
    '%s keeps both publications even if JavaScript supplies the former unknown names',
    async (entry) => {
      const hook = vi.fn(() => ({}));
      const f = fixture({ ...formerFlags, docPermissions: { list: hook, read: hook } });
      const inputs = Array.from({ length: entry.endsWith('list') ? 3 : 1 }, (_, index) => ({
        _id: 'same',
        name: `row:${index}`,
        hidden: 'denied',
      }));
      f.adapter.find.mockResolvedValue(inputs);
      f.adapter.findOne.mockResolvedValue(inputs[0]);
      const contexts = vi.spyOn(documents, 'createServiceOutputContext');
      const isolate = vi.spyOn(helpers, 'deepIsolateValue');
      const args = { select: ['name', 'hidden', '-_id'], limit: inputs.length };
      const result =
        entry === 'direct-list'
          ? await f.direct.find({}, args, quiet)
          : entry === 'public-list'
            ? await f.public._list({}, args, quiet)
            : entry === 'direct-read'
              ? await f.direct.findOne({}, args, quiet)
              : await f.public._readFilter({}, args, { ...quiet, tryList: false });
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(Array.isArray(result.data) ? result.data : [result.data]).toEqual(inputs.map(({ name }) => ({ name })));
      expect(contexts).toHaveBeenCalledTimes(inputs.length * 2);
      const roots = contexts.mock.calls.map(([, , use]) => use.output);
      const copies = isolate.mock.calls.filter(([value]) => roots.includes(value as object)).length;
      expect(copies).toBe(inputs.length);
      expect(hook).toHaveBeenCalledTimes(inputs.length);
      expect(f.adapter.find.mock.calls.length + f.adapter.findOne.mock.calls.length).toBe(1);
      console.log(
        `FUSE05_WITHDRAWN_WORK ${JSON.stringify({ entry, rows: inputs.length, contexts: contexts.mock.calls.length, copies, hooks: hook.mock.calls.length, reads: 1 })}`,
      );
    },
  );
});

it.each([false, true])(
  'retains the third Date observation and later same-ID denial (former names supplied=%s)',
  async (supplied) => {
    const sentinel = 1_777_777_777_777;
    const original = Date.prototype.getTime;
    let armed = false,
      observations = 0,
      normalizedByPublication = false;
    vi.spyOn(Date.prototype, 'getTime').mockImplementation(function (this: Date) {
      const time = original.call(this);
      if (armed && time === sentinel && ++observations >= 3) normalizedByPublication = true;
      return time;
    });
    const hook = vi.fn((doc) => ({
      first: doc.name === 'first',
      allow: doc.name === 'first' || !normalizedByPublication,
    }));
    const nameRule = vi.fn((permissions, grants) =>
      grants === undefined ? permissions.has('reader') : grants.allow === true,
    );
    const virtualRule = vi.fn((_permissions, grants) => grants === undefined || grants.first === true);
    const getter = vi.fn(() => {
      armed = true;
      return new Date(sentinel);
    });
    const f = fixture({
      ...(supplied ? formerFlags : {}),
      permissionSchema: { name: nameRule, v: virtualRule },
      docPermissions: { list: hook },
      alwaysSelectFields: ['name'],
      virtuals: { v: { dependsOn: [], list: getter } },
    });
    f.adapter.find.mockResolvedValue([
      { _id: 'same', name: 'first' },
      { _id: 'same', name: 'second' },
    ]);
    const result = await f.direct.find({}, { select: ['name', 'v', '-_id'] }, quiet);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    expect(observations).toBe(3);
    expect(Object.hasOwn(result.data[1] as object, 'name')).toBe(false);
    expect(hook).toHaveBeenCalledTimes(2);
    expect(getter).toHaveBeenCalledTimes(1);
    expect(nameRule.mock.calls.filter(([, grants]) => grants !== undefined)).toHaveLength(2);
    expect(virtualRule.mock.calls.filter(([, grants]) => grants !== undefined)).toHaveLength(2);
    console.log(
      `FUSE05_WITHDRAWN_NATIVE ${JSON.stringify({ supplied, observations, hooks: 2, getters: 1, nameRuleRowDecisions: 2, virtualRuleRowDecisions: 2, laterSameIdName: false })}`,
    );
  },
);
