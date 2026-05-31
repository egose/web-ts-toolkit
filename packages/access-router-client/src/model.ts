import { AxiosRequestConfig } from 'axios';
import { assign as assignObject, cloneDeep, get as getValue, omit, pick, set as setValue } from '@web-ts-toolkit/utils';
import { Document } from './types';
import { ModelService } from './services';

export class Model<T extends Document, TData extends Partial<T> = T> {
  private _data!: TData;
  private _snapshot!: TData;
  private readonly _service!: ModelService<T>;
  private modifiedPaths!: Set<string>;

  constructor(data: TData, adapter: ModelService<T>) {
    this.modifiedPaths = new Set();
    this._snapshot = cloneDeep(data);
    this.defineHiddenDataProp(cloneDeep(data));
    this.defineHiddenAdapterProp(adapter);
    this.definePublicDataProps();
    this.initializeDirtyState();
  }

  static create<T, TData extends Partial<T> = T>(data: TData, adapter: ModelService<T>) {
    return new Model<T, TData>(data, adapter) as Model<T, TData> & TData;
  }

  async save(reqConfig?: AxiosRequestConfig) {
    let result;
    if (this._data._id) {
      result = await this._service.update(this._data._id, this.prepareData(), { returningAll: false }, reqConfig);
    } else {
      result = await this._service.create(this.prepareData(), null, reqConfig);
    }

    if (result.success) {
      this.updateModel(result.raw);
      this._snapshot = cloneDeep(this._data);
      this.modifiedPaths.clear();
    }

    return {
      ...result,
      data: result.success ? Model.create<T, TData>(this._data, this._service) : null,
    };
  }

  isDirty(path?: keyof TData | string) {
    return path ? this.modifiedPaths.has(this.normalizePath(String(path))) : this.modifiedPaths.size > 0;
  }

  markModified(path: keyof TData | string) {
    this.trackModified(String(path));
    return this;
  }

  get<TKey extends keyof TData>(path: TKey): TData[TKey];
  get(path: string): unknown;
  get(path: string) {
    return getValue(this._data, path);
  }

  set<TKey extends keyof TData>(path: TKey, value: TData[TKey]): this;
  set(path: string, value: unknown): this;
  set(path: string, value: unknown) {
    const currentValue = getValue(this._data, path);
    if (Object.is(currentValue, value)) {
      return this;
    }

    setValue(this._data as object, path, value);
    this.trackModified(path);
    this.definePublicDataProps();
    return this;
  }

  assign(partial: Partial<TData>) {
    const keys = Object.keys(partial) as (keyof TData)[];

    for (let x = 0; x < keys.length; x++) {
      const key = keys[x];
      const nextValue = partial[key] as TData[keyof TData];
      if (!Object.is(this._data[key], nextValue)) {
        this._data[key] = nextValue;
      }
    }

    this.definePublicDataProps();
    return this;
  }

  reset() {
    this.replaceData(this._snapshot);
    this.modifiedPaths.clear();
    return this;
  }

  toObject() {
    return cloneDeep(this._data);
  }

  toJSON() {
    return this.toObject();
  }

  private updateModel(data: Partial<TData>) {
    assignObject(this._data, data);
    this.definePublicDataProps();
  }

  private replaceData(data: TData) {
    const nextData = cloneDeep(data);

    const currentKeys = Object.keys(this._data);
    for (let x = 0; x < currentKeys.length; x++) {
      const key = currentKeys[x] as keyof TData;
      if (!Object.prototype.hasOwnProperty.call(nextData, key)) {
        delete this._data[key];
      }
    }

    assignObject(this._data, nextData);
    this.definePublicDataProps();
  }

  private initializeDirtyState() {
    if (this._data._id) {
      return;
    }

    const keys = Object.keys(this._data);
    for (let x = 0; x < keys.length; x++) {
      const key = keys[x];
      if (key !== '_id') {
        this.trackModified(key);
      }
    }
  }

  private prepareData() {
    return omit(pick(this._data, Array.from(this.modifiedPaths).map(String)), ['_id']);
  }

  private defineHiddenDataProp(initialValue: TData) {
    Object.defineProperty(this, '_data', {
      value: new Proxy(initialValue, {
        set: (target, key, value) => {
          const keystr = String(key);
          if (Object.is(target[key as keyof TData], value)) {
            return true;
          }

          this.trackModified(keystr);
          target[key as keyof TData] = value as TData[keyof TData];
          return true;
        },
      }),
      enumerable: false,
      writable: true,
      configurable: false,
    });
  }

  private defineHiddenAdapterProp(initialValue: ModelService<T>) {
    Object.defineProperty(this, '_service', {
      value: initialValue,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  private definePublicDataProps() {
    const keys = Object.keys(this._data);
    const keycnt = keys.length;

    for (let x = 0; x < keycnt; x++) {
      const key = keys[x];
      if (key in this) continue;

      Object.defineProperty(this, key, {
        enumerable: true,
        get: () => (Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key as keyof TData] : null),
        set: (value) => (this._data[key as keyof TData] = value),
      });
    }
  }

  private trackModified(path: string) {
    this.modifiedPaths.add(this.normalizePath(path));
  }

  private normalizePath(path: string) {
    return path.split('.')[0];
  }
}
