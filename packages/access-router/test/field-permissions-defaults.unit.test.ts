import { describe, expect, it, vi } from 'vitest';
import * as fieldOutput from '../src/acl/output-field-filter';
import { ownedStageFixture } from './owned-stage-test-fixture';

describe.each([undefined, true, false])('field permission map default (%s)', (disableFieldPermissions) => {
  it.each(['direct', 'public'] as const)('%s skips field-map computation unless explicitly enabled', async (entry) => {
    const hook = vi.fn(() => ({ owner: true }));
    const options = { includePermissions: true, includeFieldPermissions: true, includeCount: false };
    const f = ownedStageFixture({
      modelOptions: {
        stripPermissionsField: false,
        permissionSchema: { value: 'doc:owner', hidden: false },
        docPermissions: { list: hook },
        defaults: { findOptions: options, publicListOptions: options },
        ...(disableFieldPermissions === undefined ? {} : { disableFieldPermissions }),
      },
    });
    f.adapter.find.mockResolvedValue([{ _id: 'one', value: 'visible', hidden: 'denied' }]);
    const fields = vi.spyOn(fieldOutput, 'requestOutputFieldPaths');
    try {
      const args = { select: ['value', 'hidden', '-_id'] };
      const result =
        entry === 'direct' ? await f.direct.find({}, args, options) : await f.public._list({}, args, options);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(result.data[0]).toMatchObject({ value: 'visible', _permissions: { owner: true } });
      expect(result.data[0]).not.toHaveProperty('hidden');
      expect(hook).toHaveBeenCalledTimes(1);
      if (disableFieldPermissions === false) {
        expect(result.data[0]).toHaveProperty('_permissions._view.value', true);
        expect(result.data[0]).toHaveProperty('_permissions._edit.value', true);
        expect(fields).toHaveBeenCalledTimes(2);
        expect(f.adapter.find).toHaveBeenCalledTimes(3);
      } else {
        expect(result.data[0]._permissions).toEqual({ owner: true });
        expect(fields).not.toHaveBeenCalled();
        expect(f.adapter.find).toHaveBeenCalledTimes(1);
      }
    } finally {
      fields.mockRestore();
    }
  });
});
