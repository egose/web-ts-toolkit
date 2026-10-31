import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../src/core';
import type { ModelRequest } from '../src/interfaces';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { PERMISSIONS } from '../src/symbols';
import * as snapshots from '../src/acl/authorization-snapshot';
import { captureRelatedTargets, createRelatedExecution } from '../src/acl/related-execution';
import * as calls from '../src/acl/service-authorization';
import {
  createServiceExecution,
  deriveServiceExecution,
  getServiceExecutors,
  readServiceExecution,
} from '../src/acl/service-execution';
import { authorizationFastPathPrerequisites, unsafeSnapshotOptions } from '../src/acl/unsafe-snapshot-options';

const originalOn = Object.fromEntries(unsafeSnapshotOptions.map((key) => [key, true]));
const selections = (['list', 'read'] as const).flatMap((origin) =>
  (['off', 'dormant', 'active'] as const).map((mode) => ({ origin, mode })),
);
const entries = {
  resolve: calls.resolveServiceAuthorization,
  derive: calls.deriveTrustedQueryAuthorization,
};
const access = (operation: string, effective = operation) => ({
  operation,
  rowAccess: effective,
  outputAccess: effective,
  virtualAccess: effective,
  docPermissionsAccess: effective,
});
let sequence = 0;

function services(runtime: AccessRuntime, source: string, target: string, request?: ModelRequest) {
  const req =
    request ??
    ({ _permissions: { reader: true }, [PERMISSIONS]: new Permission({ reader: true }) } as unknown as ModelRequest);
  const previous = req.macl;
  try {
    return runWithRuntime(runtime, () => {
      req.macl = new Core(req);
      return { source: req.macl.getService(source), target: req.macl.getPublicService(target) };
    });
  } finally {
    // Existing services retain their own registered core/runtime even if the
    // same request temporarily constructs another runtime's genuine receiver.
    if (previous) req.macl = previous;
  }
}

function fixture(origin: 'list' | 'read', mode: 'off' | 'dormant' | 'active') {
  const n = ++sequence;
  const Target = mongoose.model(`FastOwnerTarget${n}`, new mongoose.Schema({ name: String, hidden: String }));
  const Source = mongoose.model(
    `FastOwnerSource${n}`,
    new mongoose.Schema({ name: String, ref: { type: mongoose.Schema.Types.ObjectId, ref: Target.modelName } }),
  );
  const runtime = new AccessRuntime();
  runtime.setGlobalOptions({ logger: { warn: vi.fn() } });
  for (const model of [Source, Target]) runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(Source.modelName, {
    ...originalOn,
    [origin === 'list' ? 'unsafeUseListAuthorizationFastPath' : 'unsafeUseReadAuthorizationFastPath']: mode !== 'off',
    [authorizationFastPathPrerequisites(origin)[2]]: mode !== 'dormant',
    permissionSchema: { name: true, ref: true },
  });
  runtime.setModelOptions(Target.modelName, {
    permissionSchema: { name: 'reader', hidden: false },
    operationAccess: { read: true, list: true },
  });
  const owned = services(runtime, Source.modelName, Target.modelName);
  const targets = captureRelatedTargets(runtime, Source.modelName, { populate: 'ref' });
  const execution = createServiceExecution(
    owned.source,
    access(origin),
    {
      related: {
        ref: {
          model: Target.modelName,
          rows: { mode: 'scope', filter: { name: 'allowed' } },
          outputFields: { mode: 'grant', paths: ['name'] },
        },
      },
    },
    'service',
    targets,
  );
  const state = readServiceExecution(owned.source, execution);
  expect(calls.readAuthorizationFastPath(state.authorization, state.binding)?.mode).toBe(mode);
  return { ...owned, Source, Target, runtime, execution, state, targets };
}

function relatedInput(f: ReturnType<typeof fixture>): calls.ResolveServiceAuthorizationInput {
  return {
    binding: getServiceExecutors(f.target).binding(),
    access: access('read'),
    configuration: f.targets[0].configuration,
    requestPermissions: new Permission({}),
    parent: f.state.authorization,
    snapshotDerivation: { kind: 'related', parentBinding: f.state.binding, path: 'ref' },
  };
}

function expectOwnerRejection(run: () => unknown) {
  let failure: unknown;
  try {
    run();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(calls.ServiceAuthorizationError);
  expect(failure).toMatchObject({
    result: {
      code: 'bad_request',
      errors: [{ detail: 'Service authorization: derived call request/runtime mismatch' }],
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  mongoose.deleteModel(/^FastOwner/);
});

describe('trusted related derivation retains cheap parent ownership (FP06-R1)', () => {
  it.each(
    selections.flatMap((selection) =>
      (['request', 'runtime'] as const).flatMap((changed) =>
        (['resolve', 'derive'] as const).map((entry) => ({ ...selection, changed, entry })),
      ),
    ),
  )('checks receiving $changed for $origin/$mode through $entry', ({ origin, mode, changed, entry }) => {
    const f = fixture(origin, mode);
    const input = relatedInput(f);
    const foreign = { ...input, binding: { ...input.binding, [changed]: {} } };
    // Keep the legitimate parent binding and exact captured target; only the
    // receiving request/runtime differs, so target/source authentication is not
    // a substitute for comparing the receiving owner with its parent.
    if (entry === 'derive' && mode !== 'active') {
      expect(entries[entry](foreign)).toBeUndefined(); // Existing strict fallback, never shared issuance.
    } else expectOwnerRejection(() => entries[entry](foreign));
    expect(calls.getAuthorizationPermissions(f.state.authorization, f.state.binding).has('reader')).toBe(true);
  });

  it.each(selections)('authenticates the supplied source owner for $origin/$mode', ({ origin, mode }) => {
    const f = fixture(origin, mode);
    const input = relatedInput(f);
    for (const key of ['request', 'runtime', 'model', 'modelName', 'scopePath'] as const) {
      const parentBinding = {
        ...f.state.binding,
        [key]: key === 'modelName' ? 'Other' : key === 'scopePath' ? ['child'] : {},
      };
      for (const entry of Object.values(entries))
        expect(() => entry({ ...input, snapshotDerivation: { kind: 'related', path: 'ref', parentBinding } })).toThrow(
          calls.ServiceAuthorizationError,
        );
    }
    for (const entry of Object.values(entries))
      expect(() => entry({ ...input, parent: { ...f.state.authorization } })).toThrow(calls.ServiceAuthorizationError);
  });

  it.each(['list', 'read'] as const)('does not trust a different target model/name/scope/path for %s', (origin) => {
    const f = fixture(origin, 'active');
    const input = relatedInput(f);
    for (const binding of [
      { ...input.binding, model: {} },
      { ...input.binding, modelName: f.Source.modelName },
      { ...input.binding, scopePath: ['child'] },
    ])
      expect(calls.deriveTrustedQueryAuthorization({ ...input, binding })).toBeUndefined();
    expect(
      calls.deriveTrustedQueryAuthorization({
        ...input,
        snapshotDerivation: { ...input.snapshotDerivation!, path: 'missing' },
      }),
    ).toBeUndefined();
  });

  it.each(
    selections.flatMap((selection) => (['request', 'runtime'] as const).map((changed) => ({ ...selection, changed }))),
  )('rejects a registered foreign $changed receiver for $origin/$mode before dispatch', ({ origin, mode, changed }) => {
    const f = fixture(origin, mode);
    const runtime = changed === 'runtime' ? new AccessRuntime() : f.runtime;
    if (runtime !== f.runtime) {
      runtime.setGlobalOptions({ logger: { warn: vi.fn() } });
      for (const model of [f.Source, f.Target]) runtime.registerModelInstance(model.modelName, model);
    }
    const foreign = services(
      runtime,
      f.Source.modelName,
      f.Target.modelName,
      changed === 'runtime' ? (f.state.binding.request as ModelRequest) : undefined,
    ).target;
    const receiving = getServiceExecutors(foreign).binding();
    const legitimate = getServiceExecutors(f.target).binding();
    expect(receiving.model).toBe(legitimate.model);
    expect(receiving.modelName).toBe(legitimate.modelName);
    expect(receiving[changed]).not.toBe(legitimate[changed]);
    expect(receiving[changed === 'request' ? 'runtime' : 'request']).toBe(
      legitimate[changed === 'request' ? 'runtime' : 'request'],
    );
    const reads = vi.spyOn(f.Target.collection, 'findOne');
    expectOwnerRejection(() =>
      createRelatedExecution(foreign, access('read'), f.state.authorization, f.state.binding, 'ref'),
    );
    expect(reads).not.toHaveBeenCalled();
  });

  it.each(selections)('keeps genuine related/retry capture and target policy for $origin/$mode', ({ origin, mode }) => {
    const f = fixture(origin, mode);
    const parent =
      origin === 'read'
        ? readServiceExecution(f.source, deriveServiceExecution(f.source, f.execution, access('read', 'list')))
        : f.state;
    const captured = calls.readServiceAuthorization(parent.authorization, parent.binding);
    const capture = calls.readAuthorizationFastPath(parent.authorization, parent.binding);
    f.runtime.setModelOptions(f.Source.modelName, {
      unsafeUseListAuthorizationFastPath: false,
      unsafeUseReadAuthorizationFastPath: false,
    });
    f.runtime.setModelOptions(f.Target.modelName, { permissionSchema: { name: false, hidden: true } });
    const copies = vi.spyOn(snapshots, 'copyAuthorizationValue');
    const child = readServiceExecution(
      f.target,
      createRelatedExecution(
        f.target,
        access(origin === 'list' ? 'read' : 'list'),
        parent.authorization,
        parent.binding,
        'ref',
      ),
    );
    const view = calls.readServiceAuthorization(child.authorization, child.binding);
    expect(calls.readAuthorizationFastPath(child.authorization, child.binding)).toBe(capture);
    expect(calls.getAuthorizationProvenance(child.authorization)).toBe(
      calls.getAuthorizationProvenance(parent.authorization),
    );
    expect(calls.getAuthorizationPermissions(child.authorization, child.binding).has('reader')).toBe(true);
    expect(view.configuration.permissionSchema).toEqual({ name: 'reader', hidden: false });
    expect(view.authorization.rows).toEqual(captured.authorization.related.ref.rows);
    expect(view.authorization.outputFields).toEqual({ mode: 'grant', paths: ['name'] });
    if (mode === 'active') {
      expect(view.configuration).toBe(captured.relatedTargets[0].configuration);
      expect(calls.serviceOutputFieldPolicyOwner(child.authorization, child.binding)).toBe(child.authorization);
      for (const entry of Object.values(entries)) {
        const direct = entry({
          ...relatedInput(f),
          parent: parent.authorization,
          snapshotDerivation: { kind: 'related', parentBinding: parent.binding, path: 'ref' },
          configuration: { catalog: { paths: ['hidden'] }, permissionSchema: { hidden: true } },
          authorization: { outputFields: { mode: 'unrestricted' } },
        })!;
        const directView = calls.readServiceAuthorization(direct, child.binding);
        expect(directView.configuration).toBe(view.configuration);
        expect(directView.authorization).toBe(view.authorization);
        expect(calls.getAuthorizationPermissions(direct, child.binding).has('reader')).toBe(true);
      }
      expect(copies).not.toHaveBeenCalled();
    }
  });
});
