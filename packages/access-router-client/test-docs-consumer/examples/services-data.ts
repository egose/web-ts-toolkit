/**
 * ARC-20: extracted from website services.mdx "DataService" example. The
 * data service is read-only and returns plain data objects rather than
 * `Model<T>` wrappers. The advanced-read options example documents
 * `DataReadAdvancedOptions.ignoreCache` (in the options position) and the
 * intentional absence of `includePermissions` for data routers — the compile
 * test catches a reintroduction of `includePermissions` here.
 */
import { createAdapter, type ListDataResponse } from '@web-ts-toolkit/access-router-client';

interface Fruit {
  id: string;
  name: string;
  public: boolean;
}

const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
const fruitService = adapter.createDataService<Fruit>({
  dataName: 'fruit',
  basePath: 'fruit',
});

const fruits = await fruitService.listAdvanced(
  { public: true },
  { select: ['id', 'name'], limit: 10 },
  { includeCount: true },
);
void fruits;

const apple = await fruitService.readAdvanced('apple', { select: ['name'] });
void apple;

const freshApple = await fruitService.readAdvanced('apple', { select: ['name'] }, { ignoreCache: true });
void freshApple;

// Sanity: ListDataResponse carries `totalCount` (mirrors
// `ListDataResponse<T> = ArrayDataResponse<T> & { totalCount: number }`).
const list = {} as ListDataResponse<Fruit>;
list.totalCount satisfies number;
void list;
