import { set } from '@web-ts-toolkit/utils';
import type { DataRouterOptions, ExtendedDataRouterOptions } from '../interfaces';
import { OptionsManager } from './manager';
import { copyDataValue, createDataSnapshot, getOwnedDataSnapshot } from './data-values';

const admitData = <T>(options: DataRouterOptions<T>): DataRouterOptions<T> => {
  if (!Object.hasOwn(options, 'data')) return options;
  const { data, ...otherOptions } = options;
  return { ...otherOptions, data: createDataSnapshot(data) };
};

/** Data-only ownership; all other option values keep the generic manager's contract. */
export class DataOptionsManager<T = unknown> extends OptionsManager<
  DataRouterOptions<T>,
  ExtendedDataRouterOptions<T>
> {
  override assign(options: DataRouterOptions<T>): void {
    // Validate before generic assignment can publish any of this update's keys.
    super.assign(admitData(options));
  }

  override set<K extends keyof ExtendedDataRouterOptions<T>>(
    key: K | string,
    value: ExtendedDataRouterOptions<T>[K],
  ): void {
    const path = String(key);
    if (path === 'data') {
      super.set('data', createDataSnapshot(value as T[] | undefined));
    } else if (path.startsWith('data.')) {
      // Configuration-time copy-on-write preserves arrays and in-flight versions.
      // Mutating a native's properties is rejected by admission; replace that value.
      const next = copyDataValue(getOwnedDataSnapshot(super.get('data') as T[] | undefined));
      set(next, path.slice('data.'.length), value);
      super.set('data', createDataSnapshot(next as T[]));
    } else {
      super.set(key, value);
    }
  }

  override restore(snapshot: DataRouterOptions<T>): void {
    super.restore(admitData(snapshot));
  }
}
