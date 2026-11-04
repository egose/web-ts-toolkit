import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ownedStageFixture, sourceModes, stageAccess } from './owned-stage-test-fixture';
import {
  createServiceExecution,
  createWriteServiceExecution,
  deriveServiceExecution,
  deriveWriteOutputExecution,
  readServiceExecution,
  withExecutionQueryIntent,
} from '../src/acl/service-execution';
import {
  getAuthorizationPermissions,
  deriveWriteOutputAuthorization,
  getAuthorizationProvenance,
  isWriteOutputAuthorization,
  readServiceAuthorization,
  readServiceAuthorizationMode,
  resolveServiceAuthorization,
  ServiceAuthorizationError,
} from '../src/acl/service-authorization';
import type { WriteOperation, WriteOutputBranch } from '../src/acl/service-authorization';
import {
  assertDocumentStage,
  getQueryOutputOriginal,
  getQueryReferenceOriginal,
  prepareQueryDocumentStage,
  prepareQueryOutputSource,
  resolveDocumentStage,
} from '../src/acl/document-stage';
import {
  assertOutputPublication,
  closeOutputPublication,
  bindOutputPublication,
  createOutputPublication,
  outputPublicationFor,
  type OutputPublication,
} from '../src/acl/output-publication';
import * as materialization from '../src/acl/trusted-output-materialization';
import {
  prepareModelQuery,
  readPreparedModelQuery,
  readModelIdentifier,
  resolveModelIdentifier,
} from '../src/acl/prepared-query';
import { captureRelatedTargets, createRelatedExecution } from '../src/acl/related-execution';
import { isolateDocForOutput } from '../src/helpers/document';

const owners = new Set<OutputPublication>();
const B = mongoose.mongo.BSON;

function fixture(mode: 'isolated' | 'trusted', operation: WriteOperation = 'create') {
  const f = ownedStageFixture({
    modelOptions: {
      readAuthorizationMode: 'trusted',
      listAuthorizationMode: 'trusted',
      createAuthorizationMode: mode,
      updateAuthorizationMode: mode,
    },
  });
  const entry = createWriteServiceExecution(f.direct, operation);
  const input = readServiceExecution(f.direct, entry);
  owners.add(input.publication);
  const branch = operation === 'create' ? 'create' : 'update';
  const output = deriveWriteOutputExecution(f.direct, entry, branch);
  const state = readServiceExecution(f.direct, output);
  return { ...f, entry, input, output, state, branch };
}

afterEach(async () => {
  for (const owner of owners) await closeOutputPublication(owner).catch(() => {});
  owners.clear();
  vi.restoreAllMocks();
  mongoose.deleteModel(/^Oam03Target/);
});

describe('authenticated write-output source boundary', () => {
  it.each(
    sourceModes.flatMap((mode) =>
      ['create', 'update'].map((branch) => ({ mode, branch: branch as WriteOutputBranch })),
    ),
  )('$branch/$mode materializes once and omits only the trusted disposable hook view', async ({ mode, branch }) => {
    const f = fixture(mode, branch);
    const raw = { value: 'whole-source-marker', payload: { stamp: new Date(1) } };
    const copy = vi.spyOn(materialization, 'materializeTrustedOutputValue');
    const admitted = prepareQueryDocumentStage(f.state.authorization, f.binding, raw);
    expect(admitted.source).not.toBe(raw);
    expect(admitted.source.payload).not.toBe(raw.payload);
    expect(prepareQueryOutputSource(f.state.authorization, f.binding, admitted.source).source).toBe(admitted.source);
    let view: unknown;
    await resolveDocumentStage(admitted.stage, (doc) => {
      view = doc;
      (doc.payload as typeof raw.payload).stamp.setTime(9);
      return { owner: true };
    });
    expect(view === admitted.source).toBe(mode === 'trusted');
    expect(admitted.borrowed).toBe(mode === 'trusted');
    expect((admitted.source.payload as typeof raw.payload).stamp.getTime()).toBe(mode === 'trusted' ? 9 : 1);
    expect(raw.payload.stamp.getTime()).toBe(1);
    const whole = copy.mock.calls.filter(([value]) => (value as typeof raw)?.value === 'whole-source-marker');
    expect(whole).toHaveLength(mode === 'trusted' ? 1 : 2);
    expect(getQueryOutputOriginal(admitted.source, f.state.authorization)).toBe(raw);
    expect(() => assertDocumentStage(admitted.stage, f.input.authorization, f.binding)).toThrow(
      ServiceAuthorizationError,
    );
  });

  it.each(sourceModes)(
    '%s detaches native storage, including normalization returns and successful live-storage conversion',
    async (mode) => {
      const f = fixture(mode);
      const external = { nested: { bytes: Buffer.from('external'), stamp: new Date(3) } };
      const storage = {
        value: 'stored',
        payload: {
          stamp: new Date(1),
          bytes: Buffer.from('native'),
          regex: /x/g,
          map: new Map([['leaf', { stamp: new Date(2) }]]),
          id: new B.ObjectId(),
          binary: new B.Binary(Buffer.from('binary')),
          decimal: B.Decimal128.fromString('1.25'),
          code: new B.Code('safe', { nested: { value: 'original' } }),
          ref: new B.DBRef('collection', new B.ObjectId(), undefined, { nested: { value: 'original' } }),
          wire: Object.assign(new B.ObjectId(), { toBSON: () => external }),
        },
      };
      const doc = new f.model();
      (doc as any)._doc = storage;
      const convert = vi.spyOn(doc, 'toObject').mockReturnValue((doc as any)._doc);
      const admitted = prepareQueryDocumentStage(f.state.authorization, f.binding, doc);
      expect(convert).toHaveBeenCalledExactlyOnceWith({ virtuals: false, flattenMaps: true });
      const source = admitted.source.payload as any;
      for (const key of Object.keys(storage.payload)) expect(source[key]).not.toBe(storage.payload[key]);
      expect(source.id.equals(storage.payload.id)).toBe(true);
      expect(source.decimal.toString()).toBe('1.25');
      source.stamp.setTime(10);
      source.bytes.fill(0);
      source.regex.lastIndex = 3;
      const originalId = storage.payload.id.toHexString();
      source.map.leaf.stamp.setTime(10);
      source.id.id = new Uint8Array(12);
      source.binary.buffer.fill(0);
      source.decimal.bytes.fill(0);
      source.code.scope.nested.value = 'changed';
      source.ref.fields.nested.value = 'changed';
      source.wire.nested.bytes.buffer.fill(0);
      source.wire.nested.stamp.setTime(10);
      expect(storage.payload.stamp.getTime()).toBe(1);
      expect(storage.payload.bytes.toString()).toBe('native');
      expect(storage.payload.regex.lastIndex).toBe(0);
      expect(storage.payload.map.get('leaf')!.stamp.getTime()).toBe(2);
      expect(storage.payload.binary.buffer.toString()).toBe('binary');
      expect(storage.payload.id.toHexString()).toBe(originalId);
      expect(storage.payload.decimal.toString()).toBe('1.25');
      expect(storage.payload.code.scope!.nested.value).toBe('original');
      expect(storage.payload.ref.fields.nested.value).toBe('original');
      expect(external.nested.bytes.toString()).toBe('external');
      expect(external.nested.stamp.getTime()).toBe(3);

      // A legacy earlier helper may catch conversion failure. Its plain fallback is
      // still a candidate, never an ownership certificate at the mandatory boundary.
      (doc as any)._doc = { value: 'fallback', payload: { stamp: new Date(5) } };
      convert.mockImplementation(() => {
        throw new Error('adapter conversion');
      });
      const fallback = isolateDocForOutput(doc);
      const prepared = prepareQueryOutputSource(f.state.authorization, f.binding, fallback);
      (prepared.source.payload as { stamp: Date }).stamp.setTime(20);
      expect((doc as any)._doc.payload.stamp.getTime()).toBe(5);
    },
  );

  it.each(sourceModes)(
    '%s conversion failure at the output boundary is controlled, terminal and never lends _doc',
    async (mode) => {
      const f = fixture(mode);
      const doc = new f.model({ value: 'stored' });
      const convert = vi.spyOn(doc, 'toObject').mockImplementation(() => {
        throw new Error('private adapter detail');
      });
      expect(() => prepareQueryOutputSource(f.state.authorization, f.binding, doc)).toThrow(ServiceAuthorizationError);
      expect(convert).toHaveBeenCalledTimes(1);
      expect(() => assertOutputPublication(f.input.publication)).toThrow(ServiceAuthorizationError);
      expect(() => prepareQueryOutputSource(f.state.authorization, f.binding, {})).toThrow(ServiceAuthorizationError);
      expect(doc.value).toBe('stored');
    },
  );

  it.each(
    sourceModes.flatMap((mode) =>
      ['proxy', 'accessor', 'exotic', 'cycle', 'hydrated', 'depth', 'slots', 'root-array'].map((kind) => ({
        mode,
        kind,
      })),
    ),
  )(
    '$mode rejects $kind candidates through the existing bounded materializer without accessor/proxy observations',
    ({ mode, kind }) => {
      const f = fixture(mode),
        observe = vi.fn();
      let candidate: any = { value: 'candidate' };
      if (kind === 'proxy') candidate.payload = new Proxy({}, { get: observe, ownKeys: observe });
      if (kind === 'accessor') Object.defineProperty(candidate, 'payload', { enumerable: true, get: observe });
      if (kind === 'exotic')
        candidate.payload = new (class Exotic {
          value = 'live';
        })();
      if (kind === 'cycle') candidate.payload = candidate;
      if (kind === 'hydrated') candidate.payload = new f.model({ value: 'nested' });
      if (kind === 'depth') {
        let cursor = candidate;
        for (let n = 0; n < 102; n++) cursor = cursor.next = {};
      }
      if (kind === 'slots') candidate.payload = Array(21000).fill(1);
      if (kind === 'root-array') candidate = [];
      expect(() => prepareQueryOutputSource(f.state.authorization, f.binding, candidate)).toThrow(
        ServiceAuthorizationError,
      );
      expect(observe).not.toHaveBeenCalled();
    },
  );

  it('retains exact scalar/array/dotted target identity across mandatory occurrence copies', () => {
    const f = ownedStageFixture({
      modelOptions: { createAuthorizationMode: 'trusted' },
      schema: {
        ref: { type: String, ref: 'unused' },
        refs: [{ type: String, ref: 'unused' }],
        links: [{ target: { type: String, ref: 'unused' } }],
      },
    });
    const entry = createWriteServiceExecution(f.direct, 'create');
    const state = readServiceExecution(f.direct, deriveWriteOutputExecution(f.direct, entry, 'create'));
    owners.add(state.publication);
    const target = { value: 'same-target', when: new Date(1) };
    const raw = { ref: target, refs: [target, target], links: [{ target }] };
    const prepared = prepareQueryOutputSource(state.authorization, f.binding, raw).source as typeof raw;
    const occurrences = [prepared.ref, ...prepared.refs, prepared.links[0].target];
    expect(new Set(occurrences).size).toBe(4);
    for (const occurrence of occurrences) {
      expect(occurrence).not.toBe(target);
      expect(getQueryReferenceOriginal(occurrence)).toBe(target);
    }
  });
});

describe('write output execution authentication and exact transport', () => {
  it('preserves actor/config/policy/access/intent/family/publication but not input stages or token identity', async () => {
    const f = fixture('trusted', 'update');
    const intent = { args: { select: ['value'] }, options: {} } as never;
    const entry = withExecutionQueryIntent(f.direct, f.entry, intent);
    const query = await prepareModelQuery(f.direct, entry, { kind: 'mutation-lookup', filter: {} });
    const identifier = await resolveModelIdentifier(f.direct, entry, 'id');
    const output = deriveWriteOutputExecution(f.direct, entry, 'update');
    const state = readServiceExecution(f.direct, output);
    expect(state.family).toBe(f.input.family);
    expect(state.publication).toBe(f.input.publication);
    expect(state.ownsPublication).toBe(false);
    expect(state.queryIntent).toBe(intent);
    expect(state.access).toBe(f.input.access);
    expect(getAuthorizationProvenance(state.authorization)).toBe(f.input.authorization);
    expect(getAuthorizationPermissions(state.authorization, f.binding)).toBe(
      getAuthorizationPermissions(f.input.authorization, f.binding),
    );
    const before = readServiceAuthorization(f.input.authorization, f.binding);
    const after = readServiceAuthorization(state.authorization, f.binding);
    expect(after.configuration).toBe(before.configuration);
    expect(after.authorization).toBe(before.authorization);
    expect(readServiceAuthorizationMode(f.input.authorization, f.binding)).toBe('isolated');
    expect(readServiceAuthorizationMode(state.authorization, f.binding)).toBe('trusted');
    expect(readModelIdentifier(f.direct, output, identifier)).toEqual({ _id: 'id' });
    expect(() => readPreparedModelQuery(f.direct, output, query)).toThrow(ServiceAuthorizationError);
    expect(readPreparedModelQuery(f.direct, entry, query).filter).toEqual({});
  });

  it.each(['create', 'update', 'upsert', 'new', 'delete', 'count', 'distinct', 'custom'] as const)(
    'generic %s tuples/resolution/provenance cannot issue a write output child',
    (operation) => {
      const f = fixture('trusted');
      const access =
        operation === 'create'
          ? { operation, virtualAccess: 'create', outputAccess: 'read', docPermissionsAccess: 'create' }
          : stageAccess(operation, operation === 'upsert' ? 'update' : 'read');
      const generic = createServiceExecution(f.direct, access);
      const state = readServiceExecution(f.direct, generic);
      owners.add(state.publication);
      expect(isWriteOutputAuthorization(state.authorization, f.binding)).toBe(false);
      expect(readServiceAuthorizationMode(state.authorization, f.binding)).toBe('isolated');
      expect(() => deriveWriteOutputExecution(f.direct, generic, 'create')).toThrow(ServiceAuthorizationError);
      const lookalike = resolveServiceAuthorization({
        ...f.input,
        binding: f.binding,
        access,
        configuration: f.configuration,
        requestPermissions: f.request._permissions as never,
        parent: f.state.authorization,
      });
      expect(isWriteOutputAuthorization(lookalike, f.binding)).toBe(false);
    },
  );

  it('rejects wrong receiver, branch, scope, repeated output phase and closed publication', async () => {
    const f = fixture('trusted', 'update');
    expect(() => deriveWriteOutputExecution(f.public, f.entry, 'update')).toThrow(ServiceAuthorizationError);
    expect(() => deriveWriteOutputExecution(f.direct, f.entry, 'create')).toThrow(ServiceAuthorizationError);
    expect(() => deriveWriteOutputExecution(f.direct, f.output, 'update')).toThrow(ServiceAuthorizationError);
    expect(() =>
      deriveWriteOutputAuthorization(f.input.authorization, { ...f.binding, scopePath: ['children'] }, 'update'),
    ).toThrow(ServiceAuthorizationError);
    const wrongOwner = createOutputPublication();
    owners.add(wrongOwner);
    expect(() => bindOutputPublication(f.state.authorization, wrongOwner)).toThrow(ServiceAuthorizationError);
    const scoped = resolveServiceAuthorization({
      ...f.input,
      binding: { ...f.binding, scopePath: ['children'] },
      access: f.input.access,
      configuration: f.configuration,
      requestPermissions: f.request._permissions as never,
      parent: f.input.authorization,
    });
    expect(isWriteOutputAuthorization(scoped, { ...f.binding, scopePath: ['children'] })).toBe(false);
    await closeOutputPublication(f.input.publication);
    expect(() => deriveWriteOutputExecution(f.direct, f.entry, 'update')).toThrow(ServiceAuthorizationError);
  });

  it('captures both UPSERT modes before awaits and retains only the canonical create branch derivation', () => {
    const f = fixture('trusted', 'upsert');
    f.runtime.setModelOptions(f.model.modelName, {
      createAuthorizationMode: 'isolated',
      updateAuthorizationMode: 'isolated',
    });
    const create = deriveServiceExecution(
      f.direct,
      f.entry,
      { operation: 'upsert', virtualAccess: 'create', outputAccess: 'read', docPermissionsAccess: 'create' },
      'create',
    );
    const state = readServiceExecution(f.direct, deriveWriteOutputExecution(f.direct, create, 'create'));
    expect(state.access.operation).toBe('upsert');
    expect(readServiceAuthorizationMode(state.authorization, f.binding)).toBe('trusted');
    const wrong = deriveServiceExecution(f.direct, f.entry, { ...state.access, operation: 'create' }, 'create');
    expect(() => deriveWriteOutputExecution(f.direct, wrong, 'create')).toThrow(ServiceAuthorizationError);
    // Even possession of a genuine parent cannot turn the generic execution
    // constructor into the canonical write-branch issuer.
    const generic = createServiceExecution(
      f.direct,
      state.access,
      undefined,
      'create',
      [],
      f.input.authorization,
      f.configuration,
      undefined,
      'findOne',
      { kind: 'retry', parentBinding: f.binding },
    );
    owners.add(readServiceExecution(f.direct, generic).publication);
    expect(() => deriveWriteOutputExecution(f.direct, generic, 'create')).toThrow(ServiceAuthorizationError);
  });

  it.each(['read', 'list', 'audit'] as const)(
    'related %s has its own mode but always retains mandatory write detachment',
    (effective) => {
      const f = ownedStageFixture({
        schema: { ref: { type: String, ref: 'Oam03Target' } },
        modelOptions: { createAuthorizationMode: 'isolated' },
      });
      const target = mongoose.model('Oam03Target', new mongoose.Schema({ value: String }));
      f.runtime.registerModelInstance(target.modelName, target);
      f.runtime.setModelOptions(target.modelName, {
        readAuthorizationMode: 'trusted',
        listAuthorizationMode: 'isolated',
        permissionSchema: {},
      });
      // Use a real registered target receiver; target construction needs no I/O.
      const svc = f.request.macl.getService(target.modelName);
      const entry = createWriteServiceExecution(
        f.direct,
        'create',
        undefined,
        'create',
        captureRelatedTargets(f.runtime, f.model.modelName, { populate: 'ref' }),
      );
      const state = readServiceExecution(f.direct, deriveWriteOutputExecution(f.direct, entry, 'create'));
      owners.add(state.publication);
      const child = readServiceExecution(
        svc,
        createRelatedExecution(svc, stageAccess('create', effective), state.authorization, f.binding, 'ref'),
      );
      expect(child.access.operation).toBe('create');
      expect(readServiceAuthorizationMode(child.authorization, child.binding)).toBe(
        effective === 'read' ? 'trusted' : 'isolated',
      );
      expect(isWriteOutputAuthorization(child.authorization, child.binding)).toBe(true);
      const raw = { value: 'target', when: new Date(1) };
      const prepared = prepareQueryOutputSource(child.authorization, child.binding, raw);
      expect(prepared.source).not.toBe(raw);
      expect(prepared.source.when).not.toBe(raw.when);
      mongoose.deleteModel(target.modelName);
    },
  );

  it('a count attachment cannot inherit write-output eligibility even with a read-shaped target tuple', async () => {
    const f = fixture('trusted');
    const target = mongoose.model('Oam03TargetCount', new mongoose.Schema({ value: String }));
    f.runtime.registerModelInstance(target.modelName, target);
    f.runtime.setModelOptions(target.modelName, {
      permissionSchema: { value: true },
      readAuthorizationMode: 'trusted',
      listAuthorizationMode: 'trusted',
    });
    const related = captureRelatedTargets(f.runtime, f.model.modelName, {
      include: [{ model: target.modelName, path: 'counted', op: 'count', localField: '_id', foreignField: 'value' }],
    });
    const entry = createWriteServiceExecution(f.direct, 'create', undefined, 'create', related);
    const owner = readServiceExecution(f.direct, deriveWriteOutputExecution(f.direct, entry, 'create'));
    owners.add(owner.publication);
    const svc = f.request.macl.getService(target.modelName);
    const child = readServiceExecution(
      svc,
      createRelatedExecution(svc, stageAccess('create', 'read'), owner.authorization, f.binding, 'counted'),
    );
    expect(isWriteOutputAuthorization(child.authorization, child.binding)).toBe(false);
    expect(readServiceAuthorizationMode(child.authorization, child.binding)).toBe('isolated');
    const admitted = prepareQueryDocumentStage(child.authorization, child.binding, { value: 'ordinary' });
    await resolveDocumentStage(admitted.stage, (doc: any) => {
      doc.value = 'not-borrowed';
      return {};
    });
    expect(admitted.source.value).toBe('ordinary');
  });
});
