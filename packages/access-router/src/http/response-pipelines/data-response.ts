import type { DataHookContext, ListResult, SingleResult } from '../../interfaces';
import type { DataService } from '../../services';

type QueryContext = Pick<DataHookContext, 'dataName' | 'resolvedQuery'>;

export async function decorateDataListResult<TData, TResult>(
  svc: DataService<TData>,
  result: ListResult<TResult>,
  context: QueryContext = {},
): Promise<ListResult<TResult>> {
  const decorateContext: DataHookContext = {
    ...context,
    operation: 'list',
    resolvedQuery: result.query,
  };
  const decoratedDocs = await Promise.all(result.data.map((doc) => svc.decorate(doc, 'list', decorateContext)));
  const data = await svc.decorateAll(decoratedDocs, 'list', decorateContext);

  return {
    ...result,
    data,
  };
}

export async function decorateDataSingleResult<TData, TResult>(
  svc: DataService<TData>,
  result: SingleResult<TResult>,
  context: QueryContext = {},
): Promise<SingleResult<TResult>> {
  const data = await svc.decorate(result.data, 'read', {
    ...context,
    operation: 'read',
    resolvedQuery: result.query,
  });

  return {
    ...result,
    data,
  };
}
