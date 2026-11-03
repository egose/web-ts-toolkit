import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_DOCUMENT_GRANTS } from '../src/acl/document-grants';
import { DataCore } from '../src/core-data';
import type { DataRequest, FieldPermissionHook, GuardHook } from '../src/interfaces';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { PERMISSIONS } from '../src/symbols';

const readme = readFileSync(path.resolve(__dirname, '../README.md'), 'utf8').replace(/\s+/g, ' ');
const section = (start: string, end: string) => readme.slice(readme.indexOf(start), readme.indexOf(end));

describe('installed authorization guidance', () => {
  it('binds private calls/stages, not published DTOs or contexts, to the originating runtime', () => {
    const text = section('Model services and public services retain', 'Route-shape keys');
    expect(text).toContain('private in-flight document stages');
    expect(text).toContain('originating request/runtime/model/scope');
    expect(text).toContain('Published DTOs and diagnostic contexts are ordinary data, not reusable authority');
    expect(readme).not.toContain('Output handles remain bound to their original request/runtime/model/scope');
  });

  it('requires a fresh normal query rather than retaining decisions after private inputs are trimmed', () => {
    const text = section(
      '**Ordinary document-grant behavior also changes',
      'Output grants cannot write protected fields',
    );
    expect(text).toContain('`docPermissions.dependsOn`');
    expect(text).toContain('published DTO is data, not an authorization certificate');
    expect(text).toContain('raw helper pick uses captured global permissions, frozen empty document facts');
    expect(text).toContain('explicit output-only server policy, not retained document decisions');
    expect(text).toContain('new normal read/list with suitable selection/private hook inputs');
    expect(text).toContain('adds read/hook work; raw picks perform no hidden refresh');
    expect(readme).not.toContain('same-execution handle picks retain the original decisions');
  });

  it('keeps target construction private and attached include DTOs non-authoritative', () => {
    const text = section('Include output is tracked separately', '## Correlated Includes');
    expect(text).toContain(
      "target's own captured policy, facts and output filtering during private in-flight construction",
    );
    expect(text).toContain('Attached results are ordinary DTO data, not reusable target authority');
    expect(text).toContain('still requires source selection and permission');
    expect(text).toContain('include output does not mutate fetched persistence documents');
    expect(readme).not.toContain("with the target's own authorization and document handle");
  });

  it('describes cleanup before publication, without reviving output handles', () => {
    const text = section(
      'The original query includes resolved server defaults.',
      '#### Supported declarations and validation',
    );
    expect(text).toContain('retain their own admission and target-owned output authority');
    expect(text).toContain('Cleanup runs before output publication and presentation hooks/tasks');
    expect(readme).not.toContain('output copying/handles');
    const privateInputs = section(
      'Argument one remains the ordinary persisted/local-dependency',
      '#### Target authority, selection and reconstruction',
    );
    expect(privateInputs).toContain(
      'not implicitly attached to response DTOs, contexts, lifecycle snapshots, public permission hooks/metadata, or ordinary',
    );
    expect(privateInputs).not.toContain('document handles');
    // Removed-name rejection guidance is intentional, not a blanket ban on historical terminology.
    expect(readme).toContain(
      'Model output policies/handles, positional arrays/booleans, unknown options and extra arguments reject',
    );
  });

  it('distinguishes two-argument EMPTY data field predicates from one-argument operation guards', () => {
    const text = section('#### Request-only data helpers', 'Data `genSelect` returns');
    expect(text).toContain('original request as `this` and `(permissions, grants)`');
    expect(text).toContain('`grants` is the built-in frozen empty document-facts record');
    expect(text).toContain('Request-only means no model document facts, not a one-argument field callback');
    expect(text).toContain('Operation `GuardHook` remains separate: it receives only `permissions`');
    expect(readme).not.toContain(
      'Permission functions receive the original request as `this` and only its permissions argument',
    );
  });
});

const methods = ['genAllowedFields', 'pickAllowedFields', 'genSelect', 'genQuerySelect', 'trimOutputFields'] as const;
const receivers = ['core', 'getService', 'service', 'svc'] as const;
const cases = receivers.flatMap((receiver) =>
  methods
    .filter((method) => receiver !== 'core' || (method !== 'genQuerySelect' && method !== 'trimOutputFields'))
    .map((method) => ({ receiver, method })),
);

describe('request-only data callback contract documented for installed consumers', () => {
  it.each(cases)(
    '$receiver / $method passes original this, permissions and frozen EMPTY facts',
    async ({ receiver, method }) => {
      const runtime = new AccessRuntime();
      const actor = new Permission({ reader: true });
      const request = { _permissions: { reader: true }, [PERMISSIONS]: actor } as unknown as DataRequest;
      const field = vi.fn<FieldPermissionHook>(function (permissions, grants) {
        return permissions.has('reader') && !grants.suspended;
      });
      const documentField = vi.fn<FieldPermissionHook>(function (_permissions, grants) {
        return grants.owner === true;
      });
      runtime.setDataOptions('DocumentedData', { permissionSchema: { name: field, privateName: documentField } });
      const core = runWithRuntime(runtime, () => new DataCore(request));
      request.dacl = core;
      const row = { name: 'visible', privateName: 'secret', _permissions: { owner: true } };

      const result = await runWithRuntime(runtime, async () => {
        if (receiver === 'core') {
          if (method === 'genAllowedFields') return core.genAllowedFields('DocumentedData', row, 'read');
          if (method === 'pickAllowedFields') return core.pickAllowedFields('DocumentedData', row, 'read');
          return core.genSelect('DocumentedData', 'read', ['name', 'privateName']);
        }
        const service = core[receiver]('DocumentedData');
        if (method === 'genSelect' || method === 'genQuerySelect')
          return service[method]('read', ['name', 'privateName']);
        return service[method](row, 'read');
      });

      expect(result).toEqual(
        method === 'pickAllowedFields' || method === 'trimOutputFields' ? { name: 'visible' } : ['name'],
      );
      for (const callback of [field, documentField]) {
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback.mock.contexts[0]).toBe(request);
        const args = callback.mock.calls[0]!;
        expect(args).toHaveLength(2);
        expect(args[0]).toBe(actor);
        expect(args[1]).toBe(EMPTY_DOCUMENT_GRANTS);
        expect(Object.isFrozen(args[1])).toBe(true);
        expect(Object.keys(args[1])).toEqual([]);
      }
    },
  );

  it('keeps the data operation guard separate with only original this and permissions', async () => {
    const runtime = new AccessRuntime();
    const actor = new Permission({ reader: true });
    const request = { _permissions: { reader: true }, [PERMISSIONS]: actor } as unknown as DataRequest;
    const guard = vi.fn<GuardHook>(function (permissions) {
      return permissions.has('reader');
    });
    runtime.setDataOptions('DocumentedData', { operationAccess: { read: guard } });
    const core = runWithRuntime(runtime, () => new DataCore(request));
    expect(await runWithRuntime(runtime, () => core.isAllowed('DocumentedData', 'read'))).toBe(true);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(guard.mock.contexts[0]).toBe(request);
    expect(guard.mock.calls[0]).toHaveLength(1);
    expect(guard.mock.calls[0]![0]).toBe(actor);
  });
});
