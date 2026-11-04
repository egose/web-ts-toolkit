import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ownedStageFixture, stageAccess } from './owned-stage-test-fixture';
import {
  createServiceExecution,
  createWriteServiceExecution,
  deriveServiceExecution,
  deriveWriteOutputExecution,
  readServiceExecution,
} from '../src/acl/service-execution';
import {
  deriveWriteOutputAuthorization,
  isWriteOutputAuthorization,
  readServiceAuthorization,
  readServiceAuthorizationMode,
  resolveServiceAuthorization,
  serviceOutputFieldPolicyOwner,
  ServiceAuthorizationError,
} from '../src/acl/service-authorization';
import { captureRelatedTargets, createRelatedExecution } from '../src/acl/related-execution';
import { prepareSubdocumentOutput } from '../src/acl/subdocument-output';
import { prepareQueryDocumentStage } from '../src/acl/document-stage';
import { resolveOutputDocumentStage } from '../src/acl/output-field-filter';
import { closeOutputPublication, type OutputPublication } from '../src/acl/output-publication';

let serial = 0;
const owners = new Set<OutputPublication>();

function fixture() {
  const Target = mongoose.model(`OamRemediationTarget${++serial}`, new mongoose.Schema({ value: String, when: Date }));
  const ref = { type: String, ref: Target.modelName };
  const f = ownedStageFixture({
    schema: { ref, children: [new mongoose.Schema({ ref, value: String }, { _id: false })] },
    modelOptions: {
      readAuthorizationMode: 'trusted',
      listAuthorizationMode: 'trusted',
      createAuthorizationMode: 'trusted',
      updateAuthorizationMode: 'trusted',
      permissionSchema: { value: true, ref: true, children: { read: true, sub: { ref: true, value: true } } },
    },
  });
  const hook = vi.fn((doc: any) => {
    doc.value = 'hook-change';
    doc.when.setTime(9);
    return {};
  });
  f.runtime.registerModelInstance(Target.modelName, Target);
  f.runtime.setModelOptions(Target.modelName, {
    permissionSchema: { value: true, when: true },
    readAuthorizationMode: 'trusted',
    listAuthorizationMode: 'trusted',
    docPermissions: { read: hook },
  });
  const target = f.request.macl.getPublicService(Target.modelName);
  return { ...f, Target, target, hook };
}

function restorePrototype(key: string, previous: PropertyDescriptor | undefined) {
  if (previous) Object.defineProperty(Object.prototype, key, previous);
  else Reflect.deleteProperty(Object.prototype, key);
}

afterEach(async () => {
  for (const owner of owners) await closeOutputPublication(owner).catch(() => {});
  owners.clear();
  vi.restoreAllMocks();
  mongoose.deleteModel(/^OamRemediationTarget/);
});

describe('F1: only record-owned provenance selects write-output eligibility', () => {
  it.each(
    ['generic-create', 'generic-custom', 'dedicated'].flatMap((origin) =>
      ['value', 'accessor'].flatMap((pollution) => [false, true].map((before) => ({ origin, pollution, before }))),
    ),
  )(
    '$origin ignores $pollution provenance installed before construction=$before',
    async ({ origin, pollution, before }) => {
      const f = fixture();
      const operation = origin === 'generic-create' ? 'create' : origin === 'dedicated' ? 'readSub' : 'custom';
      const path = origin === 'dedicated' ? 'children.ref' : 'ref';
      const makeParent = () => {
        const execution =
          origin === 'dedicated'
            ? prepareSubdocumentOutput(f.direct, 'children', operation, 'read', 'read', undefined, [{ path }]).execution
            : createServiceExecution(
                f.direct,
                { operation, virtualAccess: 'create', outputAccess: 'read', docPermissionsAccess: 'create' },
                undefined,
                'create',
                captureRelatedTargets(f.runtime, f.model.modelName, { populate: path }),
              );
        const state = readServiceExecution(f.direct, execution);
        owners.add(state.publication);
        return state;
      };
      let parent = before ? undefined : makeParent();
      const getter = vi.fn(() => 'create');
      const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'writeOutputBranch');
      let observed: unknown;
      try {
        Object.defineProperty(Object.prototype, 'writeOutputBranch', {
          ...(pollution === 'value' ? { value: 'create' } : { get: getter }),
          configurable: true,
        });
        parent ??= makeParent();
        const child = readServiceExecution(
          f.target,
          createRelatedExecution(f.target, stageAccess(operation, 'read'), parent.authorization, f.binding, path),
        );
        const raw = { value: 'original', when: new Date(1) };
        const admitted = prepareQueryDocumentStage(child.authorization, child.binding, raw);
        await resolveOutputDocumentStage({
          authorization: child.authorization,
          binding: child.binding,
          snapshot: admitted.source,
          stage: admitted.stage,
          context: { operation },
        });
        observed = {
          rootWrite: isWriteOutputAuthorization(parent.authorization, f.binding),
          targetWrite: isWriteOutputAuthorization(child.authorization, child.binding),
          targetMode: readServiceAuthorizationMode(child.authorization, child.binding),
          targetSourceValue: admitted.source.value,
          targetSourceTime: (admitted.source.when as Date).getTime(),
          rawValue: raw.value,
          rawTime: raw.when.getTime(),
        };
      } finally {
        restorePrototype('writeOutputBranch', previous);
      }
      expect(observed).toEqual({
        rootWrite: false,
        targetWrite: false,
        targetMode: 'isolated',
        targetSourceValue: 'original',
        targetSourceTime: 1,
        rawValue: 'original',
        rawTime: 1,
      });
      expect(f.hook).toHaveBeenCalledTimes(1);
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it.each(['value', 'accessor'] as const)(
    'all constructors/derivations own optional slots despite %s pollution',
    (pollution) => {
      const f = fixture();
      const keys = ['queryOrigin', 'writeOrigin', 'writeOutputBranch', 'fieldPolicyOwner', 'view'] as const;
      const previous = keys.map((key) => Object.getOwnPropertyDescriptor(Object.prototype, key));
      const inherited = {
        queryOrigin: 'read',
        writeOrigin: 'upsert',
        writeOutputBranch: 'create',
        fieldPolicyOwner: {},
        view: {},
      };
      const getters = keys.map((key) => vi.fn(() => inherited[key]));
      const records: object[] = [];
      const set = WeakMap.prototype.set;
      vi.spyOn(WeakMap.prototype, 'set').mockImplementation(function (key, value) {
        if (value && Object.hasOwn(value, 'provenance') && Object.hasOwn(value, 'configuration')) records.push(value);
        return Reflect.apply(set, this, [key, value]);
      });
      try {
        keys.forEach((key, index) =>
          Object.defineProperty(Object.prototype, key, {
            ...(pollution === 'value' ? { value: inherited[key] } : { get: getters[index] }),
            configurable: true,
          }),
        );
        const generic = createServiceExecution(
          f.direct,
          { operation: 'create', virtualAccess: 'create', outputAccess: 'read', docPermissionsAccess: 'create' },
          undefined,
          'create',
        );
        const state = readServiceExecution(f.direct, generic);
        owners.add(state.publication);
        expect(isWriteOutputAuthorization(state.authorization, f.binding)).toBe(false);
        expect(() => deriveWriteOutputExecution(f.direct, generic, 'create')).toThrow(ServiceAuthorizationError);
        expect(serviceOutputFieldPolicyOwner(state.authorization, f.binding)).toBe(state.authorization);
        expect(readServiceAuthorization(state.authorization, f.binding).configuration).toBeDefined();
        const read = createServiceExecution(f.direct, stageAccess('read'));
        owners.add(readServiceExecution(f.direct, read).publication);
        const retry = deriveServiceExecution(f.direct, read, stageAccess('read', 'list'));
        const retryState = readServiceExecution(f.direct, retry);
        owners.add(retryState.publication);
        expect(readServiceAuthorizationMode(retryState.authorization, f.binding)).toBe('trusted');
        const entry = createWriteServiceExecution(
          f.direct,
          'upsert',
          undefined,
          'mutation',
          captureRelatedTargets(f.runtime, f.model.modelName, { populate: 'ref' }),
        );
        const input = readServiceExecution(f.direct, entry);
        owners.add(input.publication);
        const update = readServiceExecution(f.direct, deriveWriteOutputExecution(f.direct, entry, 'update'));
        const create = deriveServiceExecution(
          f.direct,
          entry,
          { operation: 'upsert', virtualAccess: 'create', outputAccess: 'read', docPermissionsAccess: 'create' },
          'create',
        );
        const output = readServiceExecution(f.direct, deriveWriteOutputExecution(f.direct, create, 'create'));
        expect(isWriteOutputAuthorization(update.authorization, f.binding)).toBe(true);
        expect(isWriteOutputAuthorization(output.authorization, f.binding)).toBe(true);
        const target = readServiceExecution(
          f.target,
          createRelatedExecution(f.target, stageAccess('upsert', 'read'), output.authorization, f.binding, 'ref'),
        );
        expect(isWriteOutputAuthorization(target.authorization, target.binding)).toBe(true);
        expect(() => deriveWriteOutputAuthorization(target.authorization, target.binding, 'create')).toThrow(
          ServiceAuthorizationError,
        );
        const embeddedBinding = { ...f.binding, scopePath: ['children'] };
        const captured = readServiceAuthorization(output.authorization, f.binding);
        const embedded = resolveServiceAuthorization({
          ...f.input,
          configuration: captured.configuration,
          access: output.access,
          binding: embeddedBinding,
          parent: output.authorization,
          snapshotDerivation: { kind: 'embedded', parentBinding: f.binding },
        });
        expect(isWriteOutputAuthorization(embedded, embeddedBinding)).toBe(true);
        expect(readServiceAuthorizationMode(embedded, embeddedBinding)).toBe('trusted');
        const dedicated = prepareSubdocumentOutput(f.direct, 'children', 'readSub', 'read', 'read');
        owners.add(dedicated.state.publication);
        expect(isWriteOutputAuthorization(dedicated.state.authorization, f.binding)).toBe(false);
        expect(records.length).toBeGreaterThanOrEqual(10);
        for (const record of records) {
          expect(Object.getPrototypeOf(record)).toBeNull();
          for (const key of keys) {
            expect(Object.hasOwn(record, key)).toBe(true);
            expect(Object.getOwnPropertyDescriptor(record, key)).toHaveProperty('value');
          }
        }
        for (const getter of getters) expect(getter).not.toHaveBeenCalled();
      } finally {
        keys.forEach((key, index) => restorePrototype(key, previous[index]));
      }
    },
  );
});
