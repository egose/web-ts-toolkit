import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../../src/core';
import { AccessRuntime } from '../../src/runtime';
import { runWithRuntime } from '../../src/runtime-context';
import Permission from '../../src/permission';
import { PERMISSIONS } from '../../src/symbols';
import type { ModelRequest, ModelRouterOptions } from '../../src/interfaces';
import {
  captureModelAuthorizationConfiguration,
  selectCapturedOperationAccessGuard,
} from '../../src/acl/model-output-planning';
import { withCapturedModelOperationGuard } from '../../src/acl/model-service-owner';
import { prepareSubdocumentCall, subdocumentGateAllowed } from '../../src/acl/subdocument-authorization';

let serial = 0;
afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Noa03Capture/);
});

function fixture(stored: unknown, defaults: unknown) {
  const runtime = new AccessRuntime();
  const model = mongoose.model(
    `Noa03Capture${++serial}`,
    new mongoose.Schema({ name: String, children: [{ name: String }] }),
  );
  runtime.registerModelInstance(model.modelName, model);
  runtime.setDefaultModelOption('operationAccess', defaults as never);
  runtime.setModelOptions(model.modelName, {
    operationAccess: stored as ModelRouterOptions['operationAccess'],
    permissionSchema: { name: true, children: { sub: { name: true } } },
  });
  const req = { [PERMISSIONS]: new Permission({ reader: true, changed: false }) } as unknown as ModelRequest;
  runWithRuntime(runtime, () => (req.macl = new Core(req)));
  return { runtime, model, req, capture: () => captureModelAuthorizationConfiguration(runtime, model.modelName) };
}

const cases = [
  {
    name: 'operation default, not transport members',
    stored: { read: { default: true, basic: false, advanced: false, root: false } },
    defaults: false,
    access: 'read',
    allowed: true,
  },
  {
    name: 'defined empty operation blocks runtime nested default',
    stored: { read: {} },
    defaults: { read: { default: true } },
    access: 'read',
    allowed: false,
  },
  {
    name: 'defined empty operation can use model outer default',
    stored: { default: true, read: {} },
    defaults: { read: { default: false } },
    access: 'read',
    allowed: true,
  },
  {
    name: 'whole undefined allows exact runtime operation',
    stored: undefined,
    defaults: { read: { default: true } },
    access: 'read',
    allowed: true,
  },
  {
    name: 'whole undefined blocks runtime outer default',
    stored: undefined,
    defaults: { default: true },
    access: 'read',
    allowed: false,
  },
  {
    name: 'whole undefined blocks runtime bare grant',
    stored: undefined,
    defaults: true,
    access: 'read',
    allowed: false,
  },
  {
    name: 'closed field missing read uses runtime exact field operation',
    stored: { default: false, read: false, subs: { children: {} } },
    defaults: { subs: { children: { read: { default: true } } } },
    access: 'subs.children.read',
    allowed: true,
  },
  {
    name: 'closed field never uses top-level grant',
    stored: { default: true, read: true, subs: { children: {} } },
    defaults: { read: true },
    access: 'subs.children.read',
    allowed: false,
  },
  {
    name: 'defined empty field operation blocks runtime nested default',
    stored: { read: true, subs: { children: { read: {} } } },
    defaults: { subs: { children: { read: { default: true } } } },
    access: 'subs.children.read',
    allowed: false,
  },
  {
    name: 'defined field default wins',
    stored: { subs: { children: { read: { default: true, root: false } } } },
    defaults: { subs: { children: { read: false } } },
    access: 'subs.children.read',
    allowed: true,
  },
  {
    name: 'terminal false before allowed defaults',
    stored: {
      default: true,
      subs: { children: { read: { default: false, basic: true, advanced: true, root: true } } },
    },
    defaults: { subs: { children: { read: true } } },
    access: 'subs.children.read',
    allowed: false,
  },
  {
    name: 'field scalar fallback after empty exact default operation',
    stored: { subs: { children: true } },
    defaults: { subs: { children: { read: {} } } },
    access: 'subs.children.read',
    allowed: true,
  },
  {
    name: 'exact runtime field operation precedes field scalar',
    stored: { subs: { children: true } },
    defaults: { subs: { children: { read: { default: false } } } },
    access: 'subs.children.read',
    allowed: false,
  },
  {
    name: 'absent field uses top-level default',
    stored: { read: { default: true, root: false } },
    defaults: false,
    access: 'subs.children.read',
    allowed: true,
  },
  {
    name: 'subs scalar is not a new wildcard',
    stored: { read: false, subs: true },
    defaults: false,
    access: 'subs.children.read',
    allowed: false,
  },
];

describe('NOA-03 owned raw defaults and context-free captured gates', () => {
  it.each(cases)('$name', async ({ stored, defaults, access, allowed }) => {
    const f = fixture(stored, defaults);
    const configuration = f.capture();
    expect(await f.req.macl.isAllowed(f.model.modelName, access)).toBe(allowed);
    expect(Object.isFrozen(configuration)).toBe(true);
    f.runtime.setDefaultModelOption('operationAccess', !allowed);
    f.runtime.setModelOption(f.model.modelName, 'operationAccess', !allowed);
    const live = vi.spyOn(f.runtime, 'getModelOptions').mockImplementation(() => {
      throw new Error('live model read');
    });
    const liveDefaults = vi.spyOn(f.runtime, 'getDefaultModelOption').mockImplementation(() => {
      throw new Error('live default read');
    });
    const guard = selectCapturedOperationAccessGuard(configuration, access);
    expect(
      await withCapturedModelOperationGuard(
        f.req.macl,
        f.model.modelName,
        access,
        guard,
        new Permission({ reader: true }),
        () => f.req.macl.isAllowed(f.model.modelName, access),
      ),
    ).toBe(allowed);
    expect(live).not.toHaveBeenCalled();
    expect(liveDefaults).not.toHaveBeenCalled();
  });

  it('consumes the selected captured guard before hooks, without ambient actor or policy authority', async () => {
    const f = fixture(false, false);
    const permissions = new Permission({ reader: true });
    const guard = vi.fn(async function (this: ModelRequest, captured) {
      await Promise.resolve();
      expect(this).toBe(f.req);
      expect(captured.has('reader')).toBe(true);
      expect(await this.macl.isAllowed(f.model.modelName, 'read')).toBe(false);
      return true;
    });
    f.runtime.setModelOption(f.model.modelName, 'operationAccess.read', { default: guard, root: false });
    const selected = selectCapturedOperationAccessGuard(f.capture(), 'read');
    f.runtime.setModelOption(f.model.modelName, 'operationAccess.read.default', false);
    f.req[PERMISSIONS] = new Permission({ reader: false });
    expect(
      await withCapturedModelOperationGuard(f.req.macl, f.model.modelName, 'read', selected, permissions, () =>
        f.req.macl.isAllowed(f.model.modelName, 'read'),
      ),
    ).toBe(true);
    expect(await f.req.macl.isAllowed(f.model.modelName, 'read')).toBe(false);
    expect(f.req.macl.getPermissions().has('reader')).toBe(false);
    expect(guard).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'subdocument visibility retains exact field defaults and actor (%s), fresh gates update',
    async (initial) => {
      const f = fixture(
        { read: { default: 'reader', root: false }, subs: { children: { create: true } } },
        { subs: { children: { read: { default: initial ? 'reader' : false, root: !initial }, list: true } } },
      );
      const service = f.req.macl.getService(f.model.modelName);
      const call = prepareSubdocumentCall(service, 'children', 'create', {});
      const other = new AccessRuntime();
      other.registerModelInstance(f.model.modelName, f.model);
      other.setModelOptions(f.model.modelName, { operationAccess: { subs: { children: { read: !initial } } } });
      await Promise.resolve();
      f.runtime.setDefaultModelOption('operationAccess.subs.children.read.default', !initial);
      f.req[PERMISSIONS] = new Permission({ reader: false });
      expect(await subdocumentGateAllowed(service, call.visibility!.parent)).toBe(true);
      expect(await subdocumentGateAllowed(service, call.visibility!.child)).toBe(initial);
      expect(await subdocumentGateAllowed(service, call.visibility!.list!)).toBe(true);
      expect(await f.req.macl.isAllowed(f.model.modelName, 'subs.children.read')).toBe(!initial);
      const next = prepareSubdocumentCall(service, 'children', 'create', {});
      expect(await subdocumentGateAllowed(service, next.visibility!.parent)).toBe(false);
      expect(await subdocumentGateAllowed(service, next.visibility!.child)).toBe(!initial);
      expect(
        selectCapturedOperationAccessGuard(
          captureModelAuthorizationConfiguration(other, f.model.modelName),
          'subs.children.read',
        ),
      ).toBe(!initial);
    },
  );
});
