import { describe, expect, it } from 'vitest';

import Permission from '../src/permission';

describe('Permission', () => {
  it('exposes keys without leaking mutable internal state', () => {
    const source = { read: true };
    const permissions = new Permission(source);

    source.read = false;
    source.edit = true;

    expect(permissions.keys).toEqual(['read']);
    expect(permissions.has('read')).toBe(true);
    expect(permissions.has('edit')).toBe(false);
    expect(permissions.hasKey('read')).toBe(true);
    expect(permissions.hasKey('edit')).toBe(false);
  });

  it('supports both variadic and array-based checks', () => {
    const permissions = new Permission({ read: true, edit: false, publish: true });

    expect(permissions.hasAny('edit', 'publish')).toBe(true);
    expect(permissions.hasAny(['edit', 'publish'])).toBe(true);
    expect(permissions.hasAll('read', 'publish')).toBe(true);
    expect(permissions.hasAll(['read', 'edit'])).toBe(false);
  });

  it('treats reserved-looking keys as normal permission names', () => {
    const permissions = new Permission({ has: true, hasAll: true, keys: true, hasOwnProperty: true });

    expect(permissions.has('has')).toBe(true);
    expect(permissions.has('hasAll')).toBe(true);
    expect(permissions.has('keys')).toBe(true);
    expect(permissions.hasKey('hasOwnProperty')).toBe(true);
    expect(permissions.hasAll('has', 'hasAll', 'keys', 'hasOwnProperty')).toBe(true);
  });
});
