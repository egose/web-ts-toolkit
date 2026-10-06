/**
 * VIRT-02 projection planner unit tests (fetch plan vs output plan).
 *
 * Pure planner tests: snapshot-based, no Mongo. Verifies selection
 * semantics, definite-denial vs deferred auth, `_id` identity, safe
 * minimal projections, embedded/related provenance, and that getters never
 * run during planning.
 */
import { describe, expect, it, vi } from 'vitest';

import { planVirtualProjection, type VirtualProjectionSnapshot } from '../src/acl/virtual-projection';
import { stripVirtuals, stripVirtualKeysFromPermissionSchema } from '../src/acl/select-resolution';

const READ = 'read' as const;
const LIST = 'list' as const;

const permsWith = (grants: Record<string, boolean>) => ({
  has: (key: string) => grants[key] === true,
  hasKey: (key: string) => key in grants,
});

const nonePerms = permsWith({});

const baseSnapshot = (over: Partial<VirtualProjectionSnapshot> = {}): VirtualProjectionSnapshot => ({
  permissionSchema: {
    name: { read: true, list: true },
    address: { read: true, list: true },
  },
  virtuals: {},
  alwaysSelectFields: [],
  modelPermissionPrefix: '',
  requireExplicitSelect: false,
  documentPermissionField: '_permissions',
  ...over,
});

describe('VIRT-02 virtual projection planner', () => {
  it('omitted select considers applicable virtuals; fetch has deps, output hides unrequested deps', () => {
    const get = vi.fn(async () => 'addr:x');
    const snap = baseSnapshot({
      permissionSchema: {
        name: { read: true },
        address: { read: true },
        fullAddress: { read: true },
      },
      virtuals: {
        fullAddress: { get, dependsOn: ['address'] },
      },
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: undefined,
      scopePath: [],
      globalPermissions: nonePerms,
    });
    expect(plan.selectionMode).toBe('all');
    expect(plan.candidates.map((c) => c.name)).toEqual(['fullAddress']);
    expect(plan.outputVirtualNames).toEqual(['fullAddress']);
    expect(plan.persistedFetchSelection).toEqual(expect.arrayContaining(['name', 'address', '_id']));
    // address is a dep; when omitted-select includes all persisted, it is also
    // output-eligible, so virtualOnlyDeps is empty here. The key assertion is
    // fetch contains the dep and output contains the virtual.
    expect(plan.outputSelection).toEqual(expect.arrayContaining(['name', 'fullAddress']));
    expect(get).not.toHaveBeenCalled();
  });

  it("select ['name','fullAddress'] fetches name+address+system, outputs name+fullAddress only", () => {
    const get = vi.fn(async () => 'v');
    const snap = baseSnapshot({
      permissionSchema: {
        name: { read: true },
        address: { read: true },
        fullAddress: { read: true },
      },
      virtuals: { fullAddress: { get, dependsOn: ['address'] } },
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['name', 'fullAddress'],
      scopePath: [],
      globalPermissions: nonePerms,
    });
    expect(plan.outputPersistedFields).toEqual(['name']);
    expect(plan.outputVirtualNames).toEqual(['fullAddress']);
    expect(plan.outputSelection).toEqual(expect.arrayContaining(['name', 'fullAddress']));
    expect(plan.outputSelection).not.toContain('address');
    expect(plan.persistedFetchSelection).toEqual(expect.arrayContaining(['name', 'address', '_id']));
    expect(plan.virtualOnlyDeps).toEqual(['address']);
    expect(plan.depProvenance).toEqual({ address: ['fullAddress'] });
    expect(plan.internalOnlyFields).toEqual(expect.arrayContaining(['address']));
    expect(get).not.toHaveBeenCalled();
  });

  it('effectively empty selects ([], {}) consider applicable virtuals', () => {
    const get = vi.fn(async () => 'v');
    const snap = baseSnapshot({
      permissionSchema: { name: { read: true }, fullAddress: { read: true } },
      virtuals: { fullAddress: { get, dependsOn: [] } },
    });
    for (const sel of [[], {}] as const) {
      const plan = planVirtualProjection({
        receivingModelName: 'U',
        snapshot: snap,
        virtualAccess: READ,
        outputAccess: READ,
        docPermissionsAccess: READ,
        requestedSelect: sel as never,
        globalPermissions: nonePerms,
      });
      expect(plan.selectionMode).toBe('all');
      expect(plan.candidates.map((c) => c.name)).toEqual(['fullAddress']);
      expect(get).not.toHaveBeenCalled();
    }
  });

  it('explicit exclusion of a virtual skips it; excluding a dep still fetches it', () => {
    const get = vi.fn(async () => 'v');
    const snap = baseSnapshot({
      permissionSchema: {
        name: { read: true },
        address: { read: true },
        fullAddress: { read: true },
      },
      virtuals: { fullAddress: { get, dependsOn: ['address'] } },
    });
    // Exclude the virtual itself.
    const excluded = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['-fullAddress'],
      globalPermissions: nonePerms,
    });
    expect(excluded.selectionMode).toBe('exclude');
    expect(excluded.candidates).toEqual([]);
    expect(excluded.outputVirtualNames).toEqual([]);
    expect(excluded.persistedFetchSelection).not.toContain('fullAddress');

    // Include virtual but exclude its dep: dep still fetched, hidden from output.
    const depExcluded = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['name', 'fullAddress', '-address'] as never,
      globalPermissions: nonePerms,
    });
    // Mixed include+exclude normalizes to include mode; '-address' is ignored
    // for output eligibility but the dep is still fetched for the virtual.
    expect(depExcluded.candidates.map((c) => c.name)).toEqual(['fullAddress']);
    expect(depExcluded.outputPersistedFields).not.toContain('address');
    expect(depExcluded.persistedFetchSelection).toEqual(expect.arrayContaining(['address']));
    expect(get).not.toHaveBeenCalled();
  });

  it('projection-object and string forms preserve inclusion semantics', () => {
    const get = vi.fn(async () => 'v');
    const snap = baseSnapshot({
      permissionSchema: {
        name: { read: true },
        address: { read: true },
        fullAddress: { read: true },
      },
      virtuals: { fullAddress: { get, dependsOn: ['address'] } },
    });
    const fromObject = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: { name: 1, fullAddress: 1 } as never,
      globalPermissions: nonePerms,
    });
    expect(fromObject.outputVirtualNames).toEqual(['fullAddress']);
    expect(fromObject.persistedFetchSelection).toEqual(expect.arrayContaining(['address']));

    const fromString = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: 'name fullAddress' as never,
      globalPermissions: nonePerms,
    });
    expect(fromString.outputVirtualNames).toEqual(['fullAddress']);

    const excludedObject = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: { fullAddress: -1 } as never,
      globalPermissions: nonePerms,
    });
    expect(excludedObject.candidates).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });

  it('virtual-only / no-dep / denied-only selects stay safe (never whole-doc empty)', () => {
    const get = vi.fn(async () => 'v');
    // Virtual-only with no deps.
    const only = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: baseSnapshot({
        permissionSchema: { name: { read: true }, solo: { read: true } },
        virtuals: { solo: { get, dependsOn: [] } },
      }),
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['solo'],
      globalPermissions: nonePerms,
    });
    expect(only.candidates.map((c) => c.name)).toEqual(['solo']);
    expect(only.persistedFetchSelection).toEqual(expect.arrayContaining(['_id']));
    expect(only.persistedFetchSelection).not.toContain('solo');

    // Denied-only: explicit deny fetches nothing virtual-only.
    const deniedGet = vi.fn(async () => 'x');
    const denied = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: baseSnapshot({
        permissionSchema: { name: { read: true }, bad: { read: false } },
        virtuals: { bad: { get: deniedGet, dependsOn: ['name'] } },
      }),
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['bad'],
      globalPermissions: nonePerms,
    });
    expect(denied.candidates).toEqual([]);
    expect(denied.persistedFetchSelection).toEqual(expect.arrayContaining(['_id']));
    expect(denied.persistedFetchSelection).not.toContain('bad');
    expect(deniedGet).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('preserves _id identity: inclusion retains, explicit -_id strips output but retains fetch', () => {
    const get = vi.fn(async () => 'v');
    const snap = baseSnapshot({
      permissionSchema: { name: { read: true }, fullAddress: { read: true } },
      virtuals: { fullAddress: { get, dependsOn: [] } },
    });
    const incl = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['name'],
      globalPermissions: nonePerms,
    });
    expect(incl.outputIdExcluded).toBe(false);
    expect(incl.fetchIdRetained).toBe(true);
    expect(incl.persistedFetchSelection).toEqual(expect.arrayContaining(['_id']));
    expect(incl.outputSelection).not.toContain('-_id');

    const excl = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['name', '-_id'],
      globalPermissions: nonePerms,
    });
    expect(excl.outputIdExcluded).toBe(true);
    expect(excl.outputSelection).toContain('-_id');
    // Fetch never carries `-_id`; identity retained for policy/association.
    expect(excl.persistedFetchSelection).not.toContain('-_id');
    expect(excl.persistedFetchSelection).toEqual(expect.arrayContaining(['_id']));
    expect(excl.internalOnlyFields).toEqual(expect.arrayContaining(['_id']));
    expect(get).not.toHaveBeenCalled();
  });

  it('unknown names follow persisted policy (dropped, never virtual)', () => {
    const get = vi.fn(async () => 'v');
    const snap = baseSnapshot({
      permissionSchema: { name: { read: true }, fullAddress: { read: true } },
      virtuals: { fullAddress: { get, dependsOn: [] } },
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['name', 'nope', 'fullAddress'],
      globalPermissions: nonePerms,
    });
    expect(plan.outputPersistedFields).toEqual(['name']);
    expect(plan.outputVirtualNames).toEqual(['fullAddress']);
    expect(plan.persistedFetchSelection).not.toContain('nope');
    expect(get).not.toHaveBeenCalled();
  });

  it('inapplicable read virtual under list stays virtual, never persisted', () => {
    const readGet = vi.fn(async () => 'r');
    const snap = baseSnapshot({
      permissionSchema: { name: { list: true, read: true }, onlyRead: { list: true, read: true } },
      virtuals: { onlyRead: { read: { get: readGet, dependsOn: [] } } as never },
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: LIST,
      outputAccess: LIST,
      docPermissionsAccess: LIST,
      requestedSelect: ['name', 'onlyRead'],
      globalPermissions: nonePerms,
    });
    expect(plan.candidates).toEqual([]);
    expect(plan.outputVirtualNames).toEqual([]);
    expect(plan.persistedFetchSelection).not.toContain('onlyRead');
    expect(plan.persistedFetchSelection).toEqual(expect.arrayContaining(['name']));
    expect(readGet).not.toHaveBeenCalled();
  });

  it('doc-dependent miss retains deps; explicit deny fetches nothing; getters never run', () => {
    const depGet = vi.fn(async () => 'v');
    const denyGet = vi.fn(async () => 'x');
    // Prefix `doc:` makes bare `needDoc` purely global (denied) vs
    // `doc:allow` document-dependent (deferred).
    const snap: VirtualProjectionSnapshot = {
      permissionSchema: {
        name: { read: true },
        address: { read: true },
        needDoc: { read: 'doc:allow' },
        pureGlobal: { read: 'globalOnly' },
        denied: { read: false },
      },
      virtuals: {
        needDoc: { get: depGet, dependsOn: ['address'] },
        pureGlobal: { get: depGet, dependsOn: ['address'] },
        denied: { get: denyGet, dependsOn: ['address'] },
      },
      alwaysSelectFields: [],
      modelPermissionPrefix: 'doc:',
      requireExplicitSelect: false,
    };
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['needDoc', 'pureGlobal', 'denied'],
      globalPermissions: nonePerms,
    });
    expect(plan.candidates.map((c) => c.name)).toEqual(['needDoc']);
    expect(plan.candidates[0].authState).toBe('deferred');
    expect(plan.persistedFetchSelection).toEqual(expect.arrayContaining(['address']));
    expect(plan.virtualOnlyDeps).toEqual(expect.arrayContaining(['address']));
    // Explicit deny + purely-global miss fetch nothing extra.
    expect(plan.depProvenance).toEqual({ address: ['needDoc'] });
    expect(depGet).not.toHaveBeenCalled();
    expect(denyGet).not.toHaveBeenCalled();
  });

  it('strips virtuals from alwaysSelectFields and trusted overrides without granting', () => {
    const get = vi.fn(async () => 'v');
    const snap = baseSnapshot({
      permissionSchema: { name: { read: true }, fullAddress: { read: false } },
      virtuals: { fullAddress: { get, dependsOn: ['address'] } },
      alwaysSelectFields: ['fullAddress', 'address'],
    });
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['name'],
      internalFetch: { trustedOverrideSelect: ['fullAddress', 'name'] as never },
      globalPermissions: nonePerms,
    });
    // Denied virtual never becomes a candidate even though forced/overridden.
    expect(plan.candidates).toEqual([]);
    expect(plan.persistedFetchSelection).toEqual(expect.arrayContaining(['name', 'address', '_id']));
    expect(plan.persistedFetchSelection).not.toContain('fullAddress');
    expect(stripVirtuals(['fullAddress', '-fullAddress', 'name'], new Set(['fullAddress']))).toEqual(['name']);
    expect(stripVirtualKeysFromPermissionSchema({ name: true, fullAddress: true }, new Set(['fullAddress']))).toEqual({
      name: true,
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('requireExplicitSelect omitted => _id-only; explicit still honors virtuals', () => {
    const get = vi.fn(async () => 'v');
    const snap = baseSnapshot({
      permissionSchema: { name: { read: true }, fullAddress: { read: true } },
      virtuals: { fullAddress: { get, dependsOn: [] } },
      requireExplicitSelect: true,
    });
    const omitted = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: undefined,
      globalPermissions: nonePerms,
    });
    expect(omitted.effectiveSelectNorm).toEqual(['_id']);
    expect(omitted.candidates).toEqual([]);
    expect(omitted.outputVirtualNames).toEqual([]);

    const explicit = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['name', 'fullAddress'],
      globalPermissions: nonePerms,
    });
    expect(explicit.candidates.map((c) => c.name)).toEqual(['fullAddress']);
    expect(get).not.toHaveBeenCalled();
  });

  it('embedded child plans retain containers without .sub DB paths', () => {
    const nickGet = vi.fn(async () => 'nick');
    const snap: VirtualProjectionSnapshot = {
      permissionSchema: {
        name: { read: true },
        contacts: { read: true, sub: { displayName: { read: true }, nick: { read: true } } } as never,
      },
      virtuals: {
        contacts: { sub: { nick: { get: nickGet, dependsOn: ['displayName'] } } },
      } as never,
      alwaysSelectFields: [],
      modelPermissionPrefix: '',
    };
    const plan = planVirtualProjection({
      receivingModelName: 'U',
      snapshot: snap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: undefined,
      globalPermissions: nonePerms,
    });
    expect(Object.keys(plan.childPlans)).toEqual(['contacts']);
    const child = plan.childPlans.contacts;
    expect(child.scopePath).toEqual(['contacts', 'sub']);
    expect(child.candidates.map((c) => c.name)).toEqual(['nick']);
    // Omitted parent considers all persisted, so the dep is also
    // output-eligible (not virtual-only), but provenance is retained
    // relative to the child scope.
    expect(child.depProvenance).toEqual({ displayName: ['nick'] });
    expect(child.outputPersistedFields).toEqual(expect.arrayContaining(['displayName']));
    // Parent fetch uses real DB paths, never definition paths. Container-only
    // retention avoids MongoDB "Path collision" (both `contacts` and
    // `contacts.displayName` cannot coexist in one projection); fetching the
    // container whole already brings child deps (finalizer trims).
    expect(plan.persistedFetchSelection).toEqual(expect.arrayContaining(['contacts']));
    expect(plan.persistedFetchSelection).not.toContain('contacts.displayName');
    for (const token of [...plan.persistedFetchSelection, ...child.persistedFetchSelection]) {
      expect(token).not.toContain('.sub.');
      expect(token).not.toBe('nick');
    }
    expect(nickGet).not.toHaveBeenCalled();
  });

  it('related plans use target own defs/access with provenance', () => {
    const parentGet = vi.fn(async () => 'p');
    const targetGet = vi.fn(async () => 't');
    const parentSnap = baseSnapshot({
      permissionSchema: { name: { read: true }, pv: { read: true } },
      virtuals: { pv: { get: parentGet, dependsOn: ['name'] } },
    });
    const targetSnap: VirtualProjectionSnapshot = {
      permissionSchema: { title: { list: true }, tv: { list: true } },
      virtuals: { tv: { get: targetGet, dependsOn: ['title'] } },
      alwaysSelectFields: [],
      modelPermissionPrefix: '',
    };
    const plan = planVirtualProjection({
      receivingModelName: 'Parent',
      snapshot: parentSnap,
      virtualAccess: READ,
      outputAccess: READ,
      docPermissionsAccess: READ,
      requestedSelect: ['name', 'pv'],
      globalPermissions: nonePerms,
      related: [
        {
          targetModelName: 'Target',
          targetSnapshot: targetSnap,
          virtualAccess: LIST,
          outputAccess: LIST,
          docPermissionsAccess: LIST,
          requestedSelect: ['title', 'tv'],
        },
      ],
    });
    expect(plan.relatedPlans).toHaveLength(1);
    const rel = plan.relatedPlans[0];
    expect(rel.receivingModelName).toBe('Target');
    expect(rel.outputVirtualNames).toEqual(['tv']);
    expect(rel.persistedFetchSelection).toEqual(expect.arrayContaining(['title', '_id']));
    expect(parentGet).not.toHaveBeenCalled();
    expect(targetGet).not.toHaveBeenCalled();
  });
});
