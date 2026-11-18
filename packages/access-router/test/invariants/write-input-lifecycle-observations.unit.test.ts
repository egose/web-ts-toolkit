import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelHookContext } from '../../src/interfaces';
import { writeOutputFixture } from '../support/private/write-output-test-fixture';
import { quietOutput, sourceModes } from '../support/private/owned-stage-test-fixture';

afterEach(() => vi.restoreAllMocks());

describe('UPDATE conversions and retained lifecycle contexts are not reusable immutable certificates', () => {
  it.each(sourceModes)(
    '%s exposes distinct native snapshot/diff/change/output conversions and live onChange effects',
    async (mode) => {
      let context!: ModelHookContext;
      let changed!: { before: unknown; after: unknown; final: unknown; diffValue: unknown };
      const f = writeOutputFixture(mode, {
        validate: {
          update: (_data, _permissions, lifecycle) => {
            context = lifecycle;
            lifecycle.originalDocumentSnapshot!.value = 'retained-original';
            return true;
          },
        },
        onChange: {
          value: (before, after, changes, lifecycle) => {
            changed = {
              before,
              after,
              final: lifecycle.finalDocumentSnapshot!.value,
              diffValue: (changes[0] as any).value,
            };
            lifecycle.finalDocumentSnapshot!.value = 'retained-final';
            lifecycle.currentDocument!.set('value', 'after-change-hook');
          },
        },
      });
      let serial = 0;
      const normal = f.stored.toObject.bind(f.stored);
      const conversions = vi.spyOn(f.stored, 'toObject').mockImplementation((options) => {
        const output = normal(options) as any;
        output.value = `${f.stored.get('value')}@${++serial}`;
        return output;
      });
      const result = await f.direct.updateById(
        'existing',
        { value: 'submitted' },
        { select: ['value', '-_id'] },
        quietOutput,
      );
      expect(result).toMatchObject({ success: true, data: { value: 'after-change-hook@8' } });
      expect(changed).toEqual({
        before: 'retained-original',
        after: 'submitted@7',
        final: 'submitted@5',
        diffValue: 'submitted@6',
      });
      expect(context.finalDocumentSnapshot!.value).toBe('retained-final');
      expect(context.originalDocumentSnapshot!.value).toBe('retained-original');
      expect(f.saved[0].value).toBe('submitted@4'); // The adapter's own conversion is separate from seven library sites.
      expect(f.stored.get('value')).toBe('after-change-hook');
      expect(conversions.mock.calls.map(([options]) => options?.flattenMaps === true)).toEqual([
        false,
        true,
        true,
        false,
        false,
        false,
        false,
        true,
      ]);
      expect(f.saves).toHaveBeenCalledTimes(1);
      expect(f.adapter.findOne).toHaveBeenCalledTimes(1);
      expect(f.adapter.create).not.toHaveBeenCalled();
      expect(Object.keys(f.model.schema.virtuals)).toContain('id'); // No registered virtuals does not mean no excluded schema virtuals.
    },
  );
});
