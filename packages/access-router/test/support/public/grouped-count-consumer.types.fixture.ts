/** ARL-08: installed declarations must describe numeric counts, never target ID sets. */
import type { ModelRouter } from '@web-ts-toolkit/access-router';
import type { ErrorResult, ModelRequest, SingleResult } from '@web-ts-toolkit/access-router/advanced';

type Row = { join: string[]; tenant: string };

export async function countAliases(router: ModelRouter<Row>, req: ModelRequest) {
  const service = router.getService(req);
  const values = ['A', 'a', 'missing'] as const;
  const result: SingleResult<Map<string, number>> | ErrorResult = await service.countByFieldValues(
    'join',
    values,
    { tenant: 'mine' },
    'count',
  );
  if (result.success) {
    const count: number | undefined = result.data.get('A');
    const entries: Array<[string, number]> = [...result.data];
    // @ts-expect-error the removed ID-set return type must not compile
    const ids: Set<string> | undefined = result.data.get('A');
    // @ts-expect-error a numeric count has no Set.size
    result.data.get('A')?.size;
    void [count, entries, ids];
  }
  const inherited = await req.macl.getPublicService<Row>('Target').countByFieldValues('join', ['A']);
  if (inherited.success) {
    const count: number | undefined = inherited.data.get('A');
    void count;
  }
  // @ts-expect-error filter still uses the model's public field types
  service.countByFieldValues('join', values, { tenant: 123 });
  // @ts-expect-error grouped counting does not accept authorization options
  service.countByFieldValues('join', values, {}, { rows: { mode: 'unrestricted' } });
  // @ts-expect-error no fifth authority/prepared argument
  service.countByFieldValues('join', values, {}, 'count', {});
  // @ts-expect-error prepared parent-group execution remains private
  service.countPreparedByFieldValueGroups('join', [['A']], {});
}
