import { Filter } from './base';

export interface DistinctArgs<T = unknown> {
  filter?: Filter<T>;
}
