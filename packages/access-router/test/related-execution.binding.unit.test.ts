import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { withCapturedPopulateModel } from '../src/model';
import Permission from '../src/permission';
import { PERMISSIONS } from '../src/symbols';
import type { ModelRequest } from '../src/interfaces';
import { captureRelatedTargets, createRelatedExecution } from '../src/acl/related-execution';
import { createServiceExecution, getServiceExecutors, readServiceExecution } from '../src/acl/service-execution';
import { readServiceAuthorization } from '../src/acl/service-authorization';

let sequence = 0;
const connections: mongoose.Connection[] = [];
const access = {
  operation: 'read',
  rowAccess: 'read',
  virtualAccess: 'read',
  outputAccess: 'read',
  docPermissionsAccess: 'read',
};
afterEach(async () => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^MpoIncludeUnit/);
  for (const connection of connections.splice(0)) await connection.destroy();
});

function fixture() {
  const n = ++sequence;
  const name = `MpoIncludeUnitTarget${n}`;
  const connection = mongoose.createConnection();
  connections.push(connection);
  const A = mongoose.model(name, new mongoose.Schema({ before: String }));
  const B = connection.model(name, new mongoose.Schema({ after: String }));
  const Source = mongoose.model(`MpoIncludeUnitSource${n}`, new mongoose.Schema({ name: String }));
  const runtime = new AccessRuntime();
  runtime.registerModelInstance(name, A);
  runtime.setModelOptions(name, { permissionSchema: { before: true }, operationAccess: true });
  runtime.registerModelInstance(Source.modelName, Source);
  runtime.setModelOptions(Source.modelName, { permissionSchema: { name: true } });
  const request = { [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest;
  const source = runWithRuntime(runtime, () => {
    request.macl = new Core(request);
    return request.macl.getService(Source.modelName);
  });
  const targets = captureRelatedTargets(runtime, Source.modelName, {
    include: [{ model: name, path: 'joined', op: 'read', localField: 'name', foreignField: 'before' }],
  });
  return {
    A,
    B,
    Source,
    name,
    request,
    runtime,
    source,
    targets,
    replace() {
      const replacement = runtime.createBootstrapSnapshot();
      replacement.modelInstances[name] = B as mongoose.Model<unknown>;
      runtime.restoreBootstrapSnapshot(replacement);
      runtime.setModelOptions(name, { permissionSchema: { after: true } });
    },
  };
}

describe('MPO-05 related receiver binding authentication', () => {
  it.each([false, true])(
    'rejects a same-named different adapter before dispatch (explicit related policy: %s)',
    (policy) => {
      const f = fixture();
      const parent = createServiceExecution(
        f.source,
        access,
        policy ? { related: { joined: { model: f.name, operation: { mode: 'grant' } } } } : undefined,
        'service',
        f.targets,
      );
      const state = readServiceExecution(f.source, parent);
      f.replace();
      const receiver = f.request.macl.getPublicService(f.name);
      const reads = vi.spyOn(f.B.collection, 'findOne');
      expect(getServiceExecutors(receiver).binding().model).toBe(f.B);
      let failure: unknown;
      try {
        createRelatedExecution(receiver, access, state.authorization, state.binding, 'joined');
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({
        result: { code: 'bad_request', errors: [{ detail: expect.stringContaining('related model mismatch') }] },
      });
      expect(reads).not.toHaveBeenCalled();
    },
  );

  it('pins only explicit related construction; ordinary later configuration captures retain live registry/default behavior', () => {
    const f = fixture();
    const ordinary = f.request.macl.getPublicService(f.name);
    const parent = createServiceExecution(f.source, access, undefined, 'service', f.targets);
    const state = readServiceExecution(f.source, parent);
    f.replace();
    f.runtime.setDefaultModelOption('requireOperationAccessForPopulateDependencies', false);
    const receiver = withCapturedPopulateModel(f.runtime, f.name, f.A as mongoose.Model<unknown>, () =>
      f.request.macl.getPublicService(f.name),
    );
    const child = createRelatedExecution(receiver, access, state.authorization, state.binding, 'joined');
    const held = readServiceExecution(receiver, child);
    const configuration = readServiceAuthorization(held.authorization, held.binding).configuration;
    expect(held.binding.model).toBe(f.A);
    expect(configuration.catalog.paths).toContain('before');
    expect(configuration.catalog.paths).not.toContain('after');
    expect(configuration.permissionSchema).toEqual({ before: true });
    expect(configuration.requireOperationAccessForPopulateDependencies).toBe(true);
    const fresh = createServiceExecution(ordinary, access);
    const next = readServiceExecution(ordinary, fresh);
    const current = readServiceAuthorization(next.authorization, next.binding).configuration;
    expect(current.catalog.paths).toContain('after');
    expect(current.catalog.paths).not.toContain('before');
    expect(current.permissionSchema).toEqual({ after: true });
    expect(current.requireOperationAccessForPopulateDependencies).toBe(false);
    expect(f.runtime.getModelInstance(f.name)).toBe(f.B);
  });
});
