import { AxiosRequestConfig } from 'axios';
import {
  assign as assignObject,
  cloneDeep,
  get as getValue,
  hasOwn,
  isEqual,
  omit,
  pick,
  set as setValue,
} from '@web-ts-toolkit/utils';
import { Document, ModelResponse } from './types';
import { ModelService } from './services';

/**
 * Thrown by {@link Model.save} when the wrapper cannot determine whether
 * to create or update. This is the "no silent create from a projected
 * read" guarantee (ARC-21): when a read projection omits `_id` AND no
 * persistence identity was captured at read time (the case for
 * `readAdvancedFilter` and other list/filter reads that do not know a
 * single document id), `save()` refuses to POST a new document the
 * caller may not have meant to create. Callers can recover by reading the
 * document with `read(id)` / `readAdvanced(id, ...)` (both capture a
 * persistence identity), or by including `_id` in the projection.
 */
export class MissingPersistenceIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingPersistenceIdentityError';
  }
}

/**
 * A dirty-tracking wrapper around a model document. Constructed via
 * {@link ModelService.create}, {@link ModelService.read},
 * {@link ModelService.findOne}, or the list methods that return
 * `Model<T>[]`. Property access through the wrapper directly reads/writes
 * the underlying data; `save()` persists only the paths flagged dirty
 * since the last save and merges the server response per the documented
 * concurrency contract.
 *
 * `Model.create<T>(data, service)` is typed as `Model<T, TData> & TData` so
 * callers can read/write fields directly on the wrapper (`user.role =
 * 'owner'`) while still calling `save()`/`reset()`/`isDirty(...)`. The
 * returned wrapper is a fresh snapshot of the post-operation local state;
 * mutating it does not affect sibling wrappers created from the same
 * underlying document.
 *
 * Persistence identity (ARC-21): identity is stored SEPARATELY from the
 * projected document data. When a service reads a single document by id
 * (`read`, `readAdvanced`), it threads an explicit `persistenceId` into
 * `Model.create(...)` so that `save()` resolves the create-vs-update
 * branch from that captured identity, not from `_data._id`. This means a
 * read projection that deliberately omits `_id` (e.g. `select: { name: 1,
 * _id: 0 }`) cannot silently cause a subsequent `save()` to create a
 * duplicate — `save()` updates the same document the wrapper was read
 * from. When neither a `persistenceId` nor an `_id` is present (e.g. an
 * `readAdvancedFilter` projection that strips `_id`), `save()` throws an
 * explicit `MissingPersistenceIdentityError` rather than POSTing a new
 * document the user did not mean to create.
 */
export class Model<T extends Document, TData extends Partial<T> = T> {
  private _data!: TData;
  private _snapshot!: TData;
  private readonly _service!: ModelService<T>;
  private modifiedPaths!: Set<string>;
  // ARC-21: persistence identity, captured at read time and decoupled from
  // the projected `_data` payload so a projection that strips `_id` cannot
  // cause `save()` to silently create a duplicate of the source document.
  private _persistenceId: string | undefined;
  // ARC-21: service-level instruction that the wrapper represents an already-
  // persisted document (read/list/filter/refresh) rather than a draft for
  // create. When set, save() refuses to silently POST a new document if no
  // identity is resolvable. Defaults to `false` so a direct
  // `new Model({ ... }, service)` is treated as a create intent (the historic
  // drafting API), matching the existing draft tests.
  private readonly _fromExisting: boolean;

  constructor(data: TData, adapter: ModelService<T>, persistenceId?: string, fromExisting?: boolean) {
    this.modifiedPaths = new Set();
    this._persistenceId = persistenceId;
    this._fromExisting = fromExisting ?? false;
    this._snapshot = cloneDeep(data);
    this.defineHiddenDataProp(cloneDeep(data));
    this.defineHiddenAdapterProp(adapter);
    this.definePublicDataProps();
    this.initializeDirtyState();
  }

  static create<T extends Document, TData extends Partial<T> = T>(
    data: TData,
    adapter: ModelService<T>,
    persistenceId?: string,
    fromExisting?: boolean,
  ) {
    return new Model<T, TData>(data, adapter, persistenceId, fromExisting) as Model<T, TData> & TData;
  }

  /**
   * Persists the currently dirty paths to the server, then merges the
   * server's response back into local state.
   *
   * Concurrency contract:
   *
   * 1. Submitted paths and their values are snapshotted before the request
   *    starts, so an in-flight response cannot wipe edits that were made
   *    while the request was pending.
   * 2. On success, a submitted path is cleared from `modifiedPaths` only if
   *    its current local value still equals the submitted value — i.e. the
   *    user has not concurrently re-edited it to a different value.
   * 3. Server-returned values overwrite local values for paths the user did
   *    NOT concurrently re-modify during the in-flight save; for paths the
   *    user did concurrently re-modify, the local value is preserved and
   *    the dirty flag is retained so the concurrent edit is resubmitted on
   *    the next `save()`. (Deterministic conflict rule: the newer local
   *    edit wins for the same path; the server value is discarded for that
   *    path.)
   * 4. On failure, no dirty state is cleared and no local value is
   *    overwritten; the caller can retry `save()` with the same set.
   * 5. The return value echoes `{ ...result, data }` where `data` is a
   *    refreshed `Model` snapshot of the post-save local state (or `null`
   *    on failure), matching `ModelResponse<T, TData>`.
   *
   * Persistence identity (ARC-21): create-vs-update is resolved from a
   * captured persistence identity rather than from the projected `_data`
   * payload alone, so a read that strips `_id` (e.g. `select: { name: 1,
   * _id: 0 }`) cannot turn a subsequent `save()` into a silent create of
   * a duplicate. When `_data._id` is present it takes precedence so callers
   * can still deliberately aim `_id` at a bogus id to observe a failing
   * save. When neither `_data._id` nor a captured persistence identity is
   * available (e.g. `readAdvancedFilter` with an `_id`-excluding
   * projection), `save()` throws `MissingPersistenceIdentityError` instead
   * of POSTing a new document.
   */
  async save(reqConfig?: AxiosRequestConfig): Promise<ModelResponse<T, TData>> {
    // 1. Snapshot submitted paths and their values BEFORE the request.
    const submittedPaths = new Set(this.modifiedPaths);
    const submittedValues: Record<string, unknown> = {};
    for (const path of submittedPaths) {
      submittedValues[path] = cloneDeep(getValue(this._data, path));
    }
    const submittedData = this.prepareData();

    // ARC-21: resolve persistence identity OUTSIDE the projected `_data`
    // payload. When `_data._id` is present (the common case — mutation paths
    // and default-inclusion projections) it takes precedence so callers can
    // still deliberately point `_id` at a bogus id to observe a failing save
    // (see `Model integration` suite's "supports Model helper methods and
    // preserves dirty state on failed save" test). When a read projection
    // deliberately omits `_id` (e.g. `select: { name: 1, _id: 0 }`), the
    // identity captured at `read`/`readAdvanced` time — `_persistenceId` —
    // is used so the save targets the original document instead of silently
    // POSTing a duplicate. When neither `_data._id` nor `_persistenceId` is
    // available AND the wrapper was built from an existing-document read
    // (`_fromExisting === true`, e.g. `readAdvancedFilter` or list/filter
    // items with an `_id`-excluding projection), `save()` throws rather than
    // becoming a silent create. When neither identity is available but the
    // wrapper is a draft (`_fromExisting === false`, the historic direct
    // `new Model({ ... }, service)` / `ModelService.new()` drafting API),
    // save() treats the call as an intentional create — matching the existing
    // "supports creating a new unsaved Model instance via save()" test.
    const persistenceId = this._data._id ?? this._persistenceId;
    if (persistenceId == null && this._fromExisting) {
      throw new MissingPersistenceIdentityError(
        'Model.save() cannot determine create-vs-update without a persistence identity. ' +
          'A read of an existing document produced a Model whose projection strips `_id` and no identity was captured at read time. ' +
          'Use `read(id)` / `readAdvanced(id, ...)` (which capture the identifier as a persistence identity), or include `_id` in the projection.',
      );
    }

    const isCreate = persistenceId == null;
    const result: ModelResponse<T, TData> = isCreate
      ? await this._service.create<TData>(submittedData, null, reqConfig)
      : await this._service.update<TData>(String(persistenceId), submittedData, { returningAll: false }, reqConfig);

    if (!result.success) {
      // 4. Preserve all dirty state on failure.
      return { ...result, data: null } as ModelResponse<T, TData>;
    }

    // Helper: did the user re-modify `path` to a value different from what
    // we submitted? If so, the local edit is newer than the server's view
    // for that path and must not be overwritten.
    const isConcurrentEdit = (path: string): boolean => {
      const current = getValue(this._data, path);
      const submitted = submittedValues[path];
      return !isEqual(current, submitted);
    };

    // Merge server-returned values. Only overwrite local values for paths
    // that were NOT concurrently re-modified during the in-flight save.
    const serverData = ((result.raw as unknown) ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(serverData)) {
      const normKey = this.normalizePath(key);
      if (normKey === '_id') continue;
      if (isConcurrentEdit(normKey)) {
        // User concurrently edited this path; keep local value + dirty flag.
        continue;
      }
      const serverValue = serverData[key];
      const before = getValue(this._data, normKey);
      if (!isEqual(before, serverValue)) {
        // Apply server value. The proxy set trap will re-track this path;
        // we then clear the re-tracked dirty flag because the server is now
        // the source of truth for this path.
        (this._data as Record<string, unknown>)[normKey] = serverValue;
      }
      this.modifiedPaths.delete(normKey);
    }

    // Clear submitted paths whose current value still equals the submitted
    // value (server may not echo every field back, but the field was
    // accepted and is no longer dirty).
    for (const path of submittedPaths) {
      if (!isConcurrentEdit(path)) {
        this.modifiedPaths.delete(path);
      }
    }

    // On create, the server assigns `_id`. `_id` is excluded from
    // `modifiedPaths` by `initializeDirtyState`, so apply it directly and
    // ensure it is not flagged dirty.
    if (isCreate && serverData._id != null) {
      (this._data as { _id?: string })._id = String(serverData._id as string);
      this.modifiedPaths.delete('_id');
    }

    // ARC-21: refresh the persistence identity so the next save() resolves
    // create-vs-update against the post-save state. On create, the server's
    // new `_id` becomes the persistence identity. On update, an unchanged
    // persistence identity stays; a server-returned `_id` (or a freshly-set
    // `_data._id` if the projection re-included it) refreshes it.
    const latestId =
      (this._data._id as string | undefined) ?? (serverData._id != null ? String(serverData._id as string) : undefined);
    if (latestId != null) {
      this._persistenceId = latestId;
    }

    // Refresh the snapshot to the post-save baseline for paths that are not
    // still dirty, so a later `reset()` rewinds to this point rather than
    // to the pre-save state (leaving concurrent edits reversible too).
    const nextSnapshot = (Array.isArray(this._snapshot) ? [] : {}) as Record<string, unknown>;
    const dataRecord = this._data as unknown as Record<string, unknown>;
    for (const key of Object.keys(dataRecord)) {
      const normKey = this.normalizePath(key);
      if (this.modifiedPaths.has(normKey)) {
        // Preserve the pre-save baseline for concurrently-edited paths so a
        // later reset() — pending the user deciding whether to keep or
        // discard the concurrent edit — rewinds them to the prior baseline.
        nextSnapshot[key] = cloneDeep((this._snapshot as unknown as Record<string, unknown>)[key]);
      } else {
        nextSnapshot[key] = cloneDeep(dataRecord[key]);
      }
    }
    this._snapshot = nextSnapshot as TData;

    this.definePublicDataProps();

    return {
      ...result,
      // The post-save snapshot is always an existing document, so propagate
      // `_fromExisting=true` plus the refreshed persistence identity so the
      // returned wrapper cannot later silently create a duplicate. (If the
      // caller intends a fresh draft, they construct `new Model({...}, s)`
      // directly — `${_fromExisting}` defaults to `false` there.)
      data: Model.create<T, TData>(this._data, this._service, this._persistenceId, true),
    } as ModelResponse<T, TData>;
  }

  isDirty(path?: keyof TData | string) {
    return path ? this.modifiedPaths.has(this.normalizePath(String(path))) : this.modifiedPaths.size > 0;
  }

  /**
   * Marks a path dirty and skips snapshot reconciliation. This is the
   * explicit "include this path on the next save()" escape hatch: even when
   * the effective value still equals the snapshot, the path stays dirty so
   * callers can force a field to be re-sent to the server (e.g., to retrigger
   * server-side defaults or to re-submit a value that another client may
   * have reverted).
   *
   * For implicit writes that reconcile against the snapshot automatically
   * (reverting a field to its baseline clears the dirty flag), use `set()`,
   * `assign(...)`, or direct property assignment — those entry points all
   * run `reconcilePath` after the write.
   */
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
    this.reconcilePath(this.normalizePath(path));
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
    // Reconcile each assigned key against the snapshot so reverting a field
    // to its baseline cleans its dirty flag uniformly with `set()`.
    for (let x = 0; x < keys.length; x++) {
      this.reconcilePath(this.normalizePath(String(keys[x])));
    }
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

  private replaceData(data: TData) {
    const nextData = cloneDeep(data);

    const currentKeys = Object.keys(this._data);
    for (let x = 0; x < currentKeys.length; x++) {
      const key = currentKeys[x] as keyof TData;
      if (!hasOwn(nextData, key)) {
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
          this.reconcilePath(this.normalizePath(keystr));
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
        get: () => (hasOwn(this._data, key) ? this._data[key as keyof TData] : null),
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

  /**
   * Removes `path` from the dirty set when its current top-level value deeply
   * equals the snapshot baseline. Used uniformly by `set()`, `assign()`,
   * public property setters (via the proxy), and `markModified()` so all
   * entry points share the same tracking rule.
   *
   * Note: `_id` is intentionally never reconciled away here — it is excluded
   * from `initializeDirtyState` and managed explicitly during `save()`
   * reconciliation.
   */
  private reconcilePath(path: string) {
    if (path === '_id') return;
    if (!this.modifiedPaths.has(path)) return;
    const current = (this._data as unknown as Record<string, unknown>)[path];
    const base = (this._snapshot as unknown as Record<string, unknown>)[path];
    if (isEqual(current, base)) {
      this.modifiedPaths.delete(path);
    }
  }
}
