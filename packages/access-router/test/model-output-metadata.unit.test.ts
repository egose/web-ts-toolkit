import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPublicationRowBudget, outputPublicationFor } from '../src/acl/output-publication';
import { readServiceOutputMetadata } from '../src/acl/service-authorization';
import * as finalizer from '../src/output/finalize-model-output';
import { createModelOutputMetadataCompletion } from '../src/services/model-output-metadata';
import { deferred } from './hook-admission-fixture';
import { ownedStageFixture, sourceModes } from './owned-stage-test-fixture';

afterEach(() => vi.restoreAllMocks());

type CompletionInputs = Parameters<typeof createModelOutputMetadataCompletion>;

describe('private model output metadata completion boundary', () => {
  it('creates the callback synchronously without reading its captured references', () => {
    const read = vi.fn(() => {
      throw new Error('eager metadata input read');
    });
    const input = new Proxy({} as CompletionInputs[0], { get: read });
    const binding = new Proxy({} as CompletionInputs[1], { get: read });
    const configuration = new Proxy({} as CompletionInputs[2], { get: read });
    const readAccess = vi.fn();
    const queryAccess = vi.fn();

    const complete = createModelOutputMetadataCompletion(input, binding, configuration, readAccess, queryAccess);

    expect(typeof complete).toBe('function');
    expect(read).not.toHaveBeenCalled();
    expect(readAccess).not.toHaveBeenCalled();
    expect(queryAccess).not.toHaveBeenCalled();
  });

  it.each(sourceModes)(
    '%s defers original input reads and rereads the source ID after the metadata query',
    async (mode) => {
      const f = ownedStageFixture({
        mode,
        modelOptions: {
          stripPermissionsField: false,
          disableFieldPermissions: false,
          permissionSchema: { value: true },
        },
      });
      const source = { _id: 'before-query', value: 'yes' };
      const stage = await f.stage(source, { owner: true });
      const publication = outputPublicationFor(f.call);
      const budget = createPublicationRowBudget(publication);
      const input: CompletionInputs[0] = {
        doc: { _id: 'before-capture' },
        includePermissions: false,
        includeFieldPermissions: false,
        budget,
        publication,
      };
      const access = deferred<{ readIds: Set<string>; updateIds: Set<string> }>();
      const readAccess = vi.fn(() => undefined);
      const queryAccess = vi.fn(() => access.promise);
      const complete = createModelOutputMetadataCompletion(
        input,
        f.binding,
        readServiceOutputMetadata(f.call, f.binding),
        readAccess,
        queryAccess,
      );
      input.doc = source;
      input.includePermissions = true;
      input.includeFieldPermissions = true;
      input.privateAssociationField = 'privateJoin';
      const output: Record<string, unknown> = { privateJoin: 'not public', _permissions: { stale: true } };
      const pending = complete(output, stage, { budget, depth: 0 });

      expect(output).toEqual({ _permissions: { owner: true } });
      expect(readAccess).toHaveBeenCalledTimes(1);
      expect(queryAccess).toHaveBeenCalledExactlyOnceWith(['before-query'], publication);
      source._id = 'after-query';
      access.resolve({ readIds: new Set(['after-query']), updateIds: new Set() });
      await pending;

      expect(output).toEqual({ _permissions: { owner: true, _view: { value: true }, _edit: { $: '_' } } });
      expect(output.permissions).toBe(output._permissions);
    },
  );

  it.each(sourceModes)(
    '%s returns the existing stripped completion promise without an async trampoline',
    async (mode) => {
      const f = ownedStageFixture({ mode });
      const source = { value: 'yes' };
      const stage = await f.stage(source);
      const publication = outputPublicationFor(f.call);
      const budget = createPublicationRowBudget(publication);
      const readAccess = vi.fn();
      const queryAccess = vi.fn();
      const complete = createModelOutputMetadataCompletion(
        { doc: source, publication, budget },
        f.binding,
        readServiceOutputMetadata(f.call, f.binding),
        readAccess,
        queryAccess,
      );
      const output = { value: 'yes', _permissions: { stale: true } };
      const events: string[] = [];

      const pending = complete(output, stage, { budget, depth: 0 }).then(() => events.push('complete'));
      const queued = Promise.resolve().then(() => events.push('queued'));
      await Promise.all([pending, queued]);

      expect(events).toEqual(['complete', 'queued']);
      expect(output).toEqual({ value: 'yes' });
      expect(readAccess).not.toHaveBeenCalled();
      expect(queryAccess).not.toHaveBeenCalled();
    },
  );

  it.each(sourceModes)('%s resolves field-access methods on the existing receiver at completion', async (mode) => {
    const f = ownedStageFixture({
      mode,
      modelOptions: { stripPermissionsField: false, disableFieldPermissions: false, permissionSchema: { value: true } },
    });
    f.adapter.findOne.mockResolvedValue({ _id: 'one', value: 'yes' });
    const readAccess = vi.fn(() => ({ fieldPermissionAccess: undefined }));
    const queryAccess = vi.fn<CompletionInputs[4]>(async () => ({
      readIds: new Set(['one']),
      updateIds: new Set<string>(),
    }));
    const finalize = finalizer.finalizeModelOutput;
    // Install replacements only after the completion factory has returned, not at service-call capture.
    vi.spyOn(finalizer, 'finalizeModelOutput').mockImplementation((args) => {
      Reflect.set(f.direct, 'asServiceHookContext', readAccess);
      Reflect.set(f.direct, 'getFieldPermissionAccess', queryAccess);
      return finalize(args);
    });

    const result = await f.direct.findOne({}, { select: ['value', '-_id'] }, { includeFieldPermissions: true });

    expect(result).toMatchObject({
      success: true,
      data: { value: 'yes', _permissions: { _view: { value: true }, _edit: { $: '_' } } },
    });
    expect(readAccess).toHaveBeenCalledTimes(1);
    expect(readAccess.mock.contexts).toEqual([f.direct]);
    expect(queryAccess).toHaveBeenCalledTimes(1);
    expect(queryAccess.mock.calls[0][0]).toEqual(['one']);
    expect(queryAccess.mock.contexts).toEqual([f.direct]);
  });
});
