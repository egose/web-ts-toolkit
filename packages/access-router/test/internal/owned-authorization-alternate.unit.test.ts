import { describe, expect, it, vi } from 'vitest';
import { attachPermissionsAlias } from '../../src/output/permissions-alias';
import { createTrustedOutputBudget, materializeTrustedOutputValue } from '../../src/acl/trusted-output-materialization';

describe('OAR-07B bounded presentation copies', () => {
  it('retains generated metadata DATA aliases on nested per-parent copies without sharing metadata', () => {
    const row = { meta: { grants: { visible: true } } };
    attachPermissionsAlias(row, 'meta.grants');
    const source = [row];
    const copy = () =>
      materializeTrustedOutputValue(source, 'joined', createTrustedOutputBudget(), { keep: () => true }) as any[];
    const first = copy(),
      second = copy();
    for (const output of [first[0], second[0]]) {
      expect(output.permissions).toBe(output.meta.grants);
      expect(Object.getOwnPropertyDescriptor(output, 'permissions')).toMatchObject({
        enumerable: false,
        writable: true,
      });
      expect(Object.getOwnPropertySymbols(output)).toEqual([]);
    }
    first[0].permissions.visible = false;
    expect(second[0].permissions.visible).toBe(true);
    expect(row.meta.grants.visible).toBe(true);
  });

  it('does not read denied metadata values or recreate an alias when the serialized metadata is denied', () => {
    const row: any = { meta: { grants: { visible: true } } };
    attachPermissionsAlias(row, 'meta.grants');
    const read = vi.fn(() => {
      throw new Error('denied value');
    });
    Object.defineProperty(row, 'meta', { enumerable: true, get: read });
    expect(materializeTrustedOutputValue(row, '', createTrustedOutputBudget(), { keep: () => false })).toEqual({});
    expect(read).not.toHaveBeenCalled();
  });

  it('preserves an enumerable business permissions field instead of creating a generated alias', () => {
    const row = { permissions: 'business', meta: { grants: { visible: true } } };
    attachPermissionsAlias(row, 'meta.grants');
    const output = materializeTrustedOutputValue(row, '', createTrustedOutputBudget(), { keep: () => true });
    expect(output).toEqual(row);
    expect(Object.getOwnPropertyDescriptor(output!, 'permissions')?.enumerable).toBe(true);
  });
});
