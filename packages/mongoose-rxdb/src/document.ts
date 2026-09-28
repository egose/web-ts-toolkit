import type { AnyDocument, CompiledPath, SchemaTypeOptions } from './types';
import {
  applyNormalizedUpdate,
  assertDocumentValueStructure,
  castDocumentSetValues,
  castDocumentToSchema,
  cloneDocumentData,
  MAX_STORAGE_DEPTH,
  documentToStorage,
  normalizeUpdatePlan,
  WriteNormalizationError,
} from './converter';
import { Schema } from './schema';
import { MiddlewareEngine, preserveErrorCause } from './middleware';
import type { InternalModelRuntime } from './model';
import type { RxLikeCollection } from './rx-adapter';
import type { NormalizedProjection } from './query-compiler';

const DIRTY = Symbol('dirty');
const ORIGINAL = Symbol('original');
const DATA = Symbol('documentData');
const DOC_ID = Symbol('documentId');
const DOC_SCHEMA = Symbol('documentSchema');
const DOC_MODEL = Symbol('documentModel');
const DOC_MW = Symbol('documentMw');

// Selection is provenance, not document data. Keep an owned, frozen copy behind
// a WeakMap boundary so public properties, symbols, and query option changes
// cannot turn a redacted subtree into a complete one. Never retain hidden data.
type DocumentProjection = Readonly<Omit<NormalizedProjection, 'fields'>> & {
  readonly fields: Readonly<NormalizedProjection['fields']>;
};
const documentProjections = new WeakMap<Document<any>, DocumentProjection>();
const savingDocuments = new WeakSet<Document<any>>();

/** A save is already active on this document instance. Await its settlement
 * before saving again, including from hooks. Rejected overlaps run no hooks. */
export class ParallelSaveError extends Error {
  constructor() {
    super('Cannot save the same document in parallel; await the active save before saving again.');
    this.name = 'ParallelSaveError';
  }
}

const DANGEROUS_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

// Document runtime members that schema paths, virtuals, or methods must not
// shadow. Underscore-prefixed data fields (e.g. `_name`) are intentionally NOT
// in this set: field state lives in a private symbol store, so `name` and
// `_name` coexist as independent keys.
const RESERVED_DOCUMENT_MEMBERS = new Set([
  '__idRaw',
  '_id',
  'isNew',
  'schema',
  'mw',
  'modelRef',
  'idGenerator',
  'markModified',
  'isModified',
  'modifiedPaths',
  'clearModified',
  'validate',
  'validateSync',
  'toObject',
  'toJSON',
  'save',
  'remove',
  'deleteOne',
  'get',
  'set',
]);

/**
 * Hydrated document base with schema casting, validation, middleware, dirty
 * tracking, and persistence helpers. Consumer model results are usually typed
 * with `HydratedDocument<T, Methods, Virtuals>` rather than this class alone.
 * Data ingress and live-value snapshots reject unsafe values with
 * WriteNormalizationError. Structural limits are 50 levels (root depth zero)
 * and 2,000 visited values per whole input/result, including defaults; these
 * are not byte limits or limits on application callback execution.
 */
export class Document<T extends object = AnyDocument> {
  declare [DIRTY]: Map<string, symbol>;
  declare [ORIGINAL]: Record<string, any>;
  declare [DATA]: Record<string, any>;
  declare [DOC_ID]: string | undefined;
  declare [DOC_SCHEMA]: Schema<T, any, any, any>;
  declare [DOC_MODEL]: any;
  declare [DOC_MW]: MiddlewareEngine;
  public isNew: boolean = true;
  protected idGenerator = () =>
    (globalThis.crypto?.randomUUID?.() as string) ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

  public get schema(): Schema<T, any, any, any> {
    return this[DOC_SCHEMA];
  }

  protected get mw(): MiddlewareEngine {
    return this[DOC_MW];
  }

  protected get modelRef(): any {
    return this[DOC_MODEL];
  }

  constructor(
    data: Partial<T> = {},
    schema: Schema<T, any, any, any>,
    model: any,
    opts: { isNew?: boolean; id?: string; applyDefaults?: boolean; projection?: NormalizedProjection } = {},
  ) {
    assertNoDocumentNameCollisions(schema);
    this[DOC_SCHEMA] = schema;
    this[DOC_MODEL] = model;
    this[DOC_MW] = new MiddlewareEngine(schema);
    this[DIRTY] = new Map();
    this[DATA] = Object.create(null);
    this.isNew = opts.isNew ?? true;
    if (opts.projection) {
      documentProjections.set(
        this,
        Object.freeze({
          ...opts.projection,
          fields: Object.freeze({ ...opts.projection.fields }),
        }),
      );
    }
    const applyDefaults = opts.applyDefaults !== false && !documentProjections.has(this);
    assertDocumentValueStructure(data);
    assertSafeTopLevelInput(data, schema);
    const casted = castDocumentToSchema(data, schema, { applyDefaults });
    for (const [name] of schema.paths) {
      Object.defineProperty(this, name, {
        enumerable: true,
        configurable: true,
        get: () => (this[DATA] as Record<string, any>)[name],
        set: (v: any) => {
          this.set(name, v);
        },
      });
      if (Object.prototype.hasOwnProperty.call(casted, name)) this[DATA][name] = casted[name];
    }
    if (schema.options._id !== false) {
      const id = casted._id ?? opts.id;
      if (id !== undefined) this[DOC_ID] = String(id);
      else if (this.isNew) this[DOC_ID] = this.idGenerator();
    }
    this[ORIGINAL] = this.createSnapshot();
    for (const [name, vt] of schema.virtuals) {
      Object.defineProperty(this, name, {
        enumerable: true,
        configurable: true,
        get: () => (vt.getter ? cloneDocumentValue(vt.getter.call(this, undefined as any, vt, this)) : undefined),
        set: (v: any) => {
          if (vt.setter) {
            this.set(name, v);
          }
        },
      });
    }
    for (const [name, fn] of Object.entries(schema.methods as Record<string, (...args: any[]) => any>)) {
      Object.defineProperty(this, name, {
        enumerable: true,
        configurable: true,
        writable: false,
        value: (fn as (...args: any[]) => any).bind(this),
      });
    }
    if (!this.isNew) this.clearModified();
    else this.markModifiedAll();
  }

  get _id(): string {
    return this[DOC_ID] as string;
  }

  markModified(path: string): void {
    // A fresh token even for an already-marked, equal-value path prevents an
    // older save from consuming intent recorded after its capture.
    this[DIRTY].set(path, Symbol());
  }

  isModified(path?: string): boolean {
    if (path === undefined) return this.modifiedPaths().length > 0;
    if (this.isNew && this[DIRTY].has(path)) return true;
    const current = this.createSnapshot();
    return !deepEqual(getDottedValue(current, path), getDottedValue(this[ORIGINAL], path));
  }

  modifiedPaths(): string[] {
    if (this.isNew) return Array.from(this[DIRTY].keys());
    const current = this.createSnapshot();
    const paths = new Set<string>();
    for (const [name] of this.schema.paths) {
      if (!deepEqual(current[name], this[ORIGINAL][name])) paths.add(name);
    }
    for (const path of this[DIRTY].keys()) {
      if (!deepEqual(getDottedValue(current, path), getDottedValue(this[ORIGINAL], path))) paths.add(path);
    }
    return Array.from(paths);
  }

  clearModified(): void {
    this[DIRTY].clear();
  }

  private markModifiedAll(): void {
    for (const [name] of this.schema.paths) this.markModified(name);
  }

  /**
   * Full-record validation. Partial reads reject with ValidationError kind
   * `projection`; save() instead validates the merged storage candidate.
   */
  validate(): Promise<void> {
    return this.mw.exec('validate', this, async () => validateDoc(this));
  }

  /** Synchronous full-record validation; projected reads return kind `projection`. */
  validateSync(): ValidationError | undefined {
    if (documentProjections.has(this)) return partialValidationError();
    const storage = documentToStorage(this.toObject(), this.schema, { applyDefaults: this.isNew, allowId: true });
    return validateObjectAgainstSchemaSync(storage, this.schema, this);
  }

  toObject(opts: { virtuals?: boolean; getters?: boolean; transform?: (doc: any, ret: any) => any } = {}): any {
    const out = this.createSnapshot();
    for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
    if (opts.virtuals) {
      for (const [name, vt] of this.schema.virtuals) {
        if (vt.getter) out[name] = cloneDocumentValue(vt.getter.call(this, undefined, vt, this));
      }
      assertDocumentValueStructure(out);
    }
    if (opts.transform) return opts.transform(this, out);
    return out;
  }

  toJSON(): any {
    return this.toObject({ virtuals: true });
  }

  /**
   * BMRX-08 save semantics:
   * - Leaf-level intent: nested plain-object edits merge by dotted leaf path,
   *   so two stale documents changing disjoint leaves (`profile.a` vs
   *   `profile.b`) both survive sequential saves. Arrays are whole-value writes: any
   *   change replaces the whole array (last-writer-wins); element-level
   *   merging is never guessed.
   * - Intentional whole-object replacement: an explicit top-level assignment
   *   (`doc.profile = {...}`), `set('profile', {...})`, `set('profile.nested',
   *   {...})`, or `markModified('profile')` opts that subtree into
   *   whole-object replacement (last-writer-wins for the subtree). A leaf save
   *   that runs after a replacement merges into the replaced object; a
   *   replacement that runs after a leaf overwrites that subtree. Same-leaf
   *   concurrent edits are last-writer-wins.
   * - Final-candidate validation: when `validateBeforeSave` is enabled, the
   *   merged candidate (current storage + this save's leaf delta) is validated
   *   inside the native `incrementalModify` retry boundary with the candidate
   *   as validation context, so stale cross-field state (e.g. another writer
   *   lowered `limit` after this document loaded) cannot commit an invalid
   *   candidate. `validate`/`save` middleware still runs exactly once per
   *   save outside the retry boundary; the in-retry check is raw schema
   *   validation without hooks.
   * - Projected reads: only writes to fully selected paths/subtrees are safe.
   *   Incomplete array or explicit object replacements throw
   *   WriteNormalizationError before mutation. Missing _id also rejects, even
   *   on unchanged saves. Partial saves run validation hooks on the redacted
   *   document and schema validators only on the full merged storage candidate;
   *   that candidate is never copied back to the public document.
   * - In-flight saves: data and intent are captured after pre-save hooks.
   *   Successful writes consume only captured intent; later edits remain for
   *   the next save. Failed writes retain intent for retry. A post-hook failure
   *   does not undo a successful write or its snapshot advancement.
   * - Same-instance overlaps reject with ParallelSaveError before collection
   *   resolution or hooks. The guard lasts through success/error post hooks
   *   and releases on settlement. Await save() before starting another save.
   */
  async save(): Promise<this> {
    if (savingDocuments.has(this)) throw new ParallelSaveError();
    savingDocuments.add(this);
    // BMRX-16: operation-local save error-hook completion. The inner
    // `mw.exec('save', ...)` already runs `save` error hooks exactly once for
    // body/pre/post failures; the outer catch runs them only for failures
    // that happened before the inner exec (e.g. `validate()`). The flag is a
    // per-save() local — never a marker on the thrown value — so frozen
    // Errors, primitive throws, and reused Errors cannot double-run or
    // suppress handling. A throwing save error hook supersedes (with
    // best-effort `cause` preservation); remaining hooks are skipped and the
    // outer catch never reruns them.
    let saveErrorHandled = false;
    try {
      const collection = await this.resolveCollection();
      if (!this.isNew && this[DOC_ID] === undefined) {
        throw new WriteNormalizationError('Cannot save a loaded document without _id; reload with _id selected.');
      }
      if (this.schema.options.validateBeforeSave !== false) {
        if (documentProjections.has(this)) {
          // A partial record cannot supply required/custom validator context.
          // Hooks retain the redacted document; raw validation happens below
          // on the full candidate inside the adapter retry boundary.
          await this.mw.exec('validate', this, async () => undefined);
        } else await this.validate();
      }
      try {
        return await this.mw.exec('save', this, async () => {
          const data = this.toObject();
          const capturedIntent = new Map(this[DIRTY]);
          const snapshot = cloneDocumentData(data, this.schema);
          const id = this[DOC_ID];
          if (this.isNew) {
            const storage = documentToStorage(data, this.schema, { applyDefaults: true, allowId: true });
            await collection.insert(storage);
            this.isNew = false;
          } else {
            const { $set, $unset } = this.changedLeafValues(data, capturedIntent);
            if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
              clearCapturedIntent(this[DIRTY], capturedIntent);
              return this;
            }
            const update: Record<string, Record<string, any>> = {};
            if (Object.keys($set).length > 0) update.$set = $set;
            if (Object.keys($unset).length > 0) {
              update.$unset = {};
              for (const path of Object.keys($unset)) update.$unset[path] = true;
            }
            const plan = normalizeUpdatePlan(update, this.schema);
            const schema = this.schema;
            const shouldValidate = schema.options.validateBeforeSave !== false;
            await collection.incrementalModify(id!, async (current: any) => {
              const candidate = applyNormalizedUpdate(current, plan, schema);
              if (shouldValidate) {
                await validateObjectAgainstSchema(candidate, schema, candidate);
              }
              return candidate;
            });
          }
          this[ORIGINAL] = snapshot;
          clearCapturedIntent(this[DIRTY], capturedIntent);
          return this;
        });
      } catch (inner) {
        // Inner `exec('save')` already ran `save` error hooks once for this
        // operation (including the throwing-hook supersede policy).
        saveErrorHandled = true;
        throw inner;
      }
    } catch (error) {
      if (!saveErrorHandled) {
        try {
          await this.mw.runPostError('save', this, error);
        } catch (handlerError) {
          throw preserveErrorCause(handlerError, error);
        }
      }
      throw error;
    } finally {
      savingDocuments.delete(this);
    }
  }

  async remove(): Promise<this> {
    const collection = await this.resolveCollection();
    return this.mw.exec('remove', this, async () => {
      await collection.remove((this as any)._id);
      return this;
    });
  }

  private async resolveCollection(): Promise<RxLikeCollection> {
    const runtime = this[DOC_MODEL] as InternalModelRuntime<T>;
    if (typeof runtime.resolveCollection === 'function') return runtime.resolveCollection();
    const collection = runtime.collection;
    if (!collection)
      throw new Error(`Model "${(this[DOC_MODEL] as any)?.modelName ?? 'unknown'}" is not attached to a collection.`);
    return collection;
  }

  async deleteOne(): Promise<this> {
    const collection = await this.resolveCollection();
    return this.mw.exec('deleteOne', this, async () => {
      await collection.remove((this as any)._id);
      return this;
    });
  }

  get(path: string): any {
    return getDottedValue(this.toObject(), path);
  }

  /** Cast bounded input against its schema path and atomically publish data/
   * dirty changes. Unsafe values throw WriteNormalizationError before changes. */
  set(path: string | Record<string, any>, value?: any): this {
    let entries: Array<[string, any]>;
    if (typeof path === 'object' && path !== null && !Array.isArray(path)) {
      const prototype = Object.getPrototypeOf(path);
      if (prototype !== Object.prototype && prototype !== null)
        throw new WriteNormalizationError('Document set() requires a plain object of path values');
      assertDocumentValueStructure(path);
      entries = Object.entries(path);
    } else if (typeof path === 'string') {
      entries = [[path, value]];
    } else {
      throw new Error('Document set() requires a path string or a plain object of path values');
    }
    const prepared = castDocumentSetValues(
      entries.map(([key, entry]) => ({ key, value: entry, virtual: this.resolveSetTarget(key).target === 'virtual' })),
      this.schema,
      { applyDefaults: !documentProjections.has(this) },
    );
    // Stage every write (including dotted traversal and virtual setter writes)
    // against owned state. Publish only once the complete candidate is safe.
    const previous = this[DATA];
    const dirty = this[DIRTY];
    this[DATA] = cloneDocumentData(previous, this.schema);
    this[DIRTY] = new Map(dirty);
    try {
      for (const { key, value: entry } of prepared) this.applyPreparedSet(key, entry);
      this.createSnapshot();
      // Keep live references to unchanged fields useful across unrelated sets.
      // Both sides were bounded above, before this recursive comparison.
      for (const key of Object.keys(previous)) {
        if (deepEqual(previous[key], this[DATA][key])) this[DATA][key] = previous[key];
      }
    } catch (error) {
      this[DATA] = previous;
      this[DIRTY] = dirty;
      throw error;
    }
    return this;
  }

  private applyPreparedSet(path: string, preparedValue: any): void {
    const kind = this.resolveSetTarget(path);
    if (kind.target === 'virtual') {
      const vt: any = this.schema.virtuals.get(kind.name);
      vt.setter.call(this, preparedValue, vt, this);
      return;
    }
    if (kind.segments.length > 1) {
      setDottedValueOnRecord(this[DATA] as Record<string, any>, kind.segments, kind.compiledPath, preparedValue);
      this.markModified(path);
      return;
    }
    (this[DATA] as Record<string, any>)[kind.name] = preparedValue;
    this.markModified(kind.name);
  }

  private resolveSetTarget(
    path: string,
  ):
    | { target: 'path'; name: string; segments: string[]; compiledPath: any }
    | { target: 'virtual'; name: string; segments: string[] } {
    const segments = splitPath(path);
    const top = segments[0];
    const direct = this.schema.paths.get(top);
    if (direct && segments.length === 1) return { target: 'path', name: top, segments, compiledPath: direct };
    if (direct) return { target: 'path', name: top, segments, compiledPath: direct };
    const vt = this.schema.virtuals.get(top);
    if (vt && segments.length === 1) {
      if (!vt.setter) throw new Error(`Virtual "${top}" has no setter`);
      return { target: 'virtual', name: top, segments };
    }
    throw new Error(
      `Cannot set unknown or reserved document path: ${path}. Only schema paths and settable virtuals are supported.`,
    );
  }

  private createSnapshot(): Record<string, any> {
    const out: Record<string, any> = { ...this[DATA] };
    if (this.schema.options._id !== false && this[DOC_ID] !== undefined) out._id = this[DOC_ID];
    return cloneDocumentData(out, this.schema);
  }

  private changedLeafValues(
    data: Record<string, any>,
    intentional: ReadonlyMap<string, symbol>,
  ): { $set: Record<string, any>; $unset: Record<string, any> } {
    // Defaults belong to insertion/explicit casting, never to a loaded diff.
    // toObject omits undefined while snapshots may retain it; both must mean
    // absent here, including records inserted with setDefaultsOnInsert:false.
    const projection = documentProjections.get(this);
    // Projected snapshots are already bounded and schema-cast. Their redacted
    // array slots are null, not complete storage subdocuments. Diff these views
    // directly and check completeness before normalizing only the permitted
    // delta in save(). Never certify or persist a redacted array as a full value.
    const current = projection ? data : documentToStorage(data, this.schema, { applyDefaults: false, allowId: true });
    const original = projection
      ? this[ORIGINAL]
      : documentToStorage(this[ORIGINAL], this.schema, { applyDefaults: false, allowId: true });
    const $set: Record<string, any> = {};
    const $unset: Record<string, any> = {};
    for (const [name] of this.schema.paths) {
      if (deepEqual(current[name], original[name])) continue;
      collectLeafOps(original[name], current[name], name, data, intentional, $set, $unset);
    }
    if (projection) {
      for (const path of [...Object.keys($set), ...Object.keys($unset)]) {
        if (!isCompleteProjectedPath(path, projection)) {
          throw new WriteNormalizationError(
            `Cannot save incomplete projected path "${path}"; reload the whole subtree before replacing it.`,
          );
        }
      }
    }
    return { $set, $unset };
  }
}

function clearCapturedIntent(current: Map<string, symbol>, captured: ReadonlyMap<string, symbol>): void {
  for (const [path, generation] of captured) {
    if (current.get(path) === generation) current.delete(path);
  }
}

export async function validateDoc(doc: Document<any>): Promise<void> {
  if (documentProjections.has(doc)) throw partialValidationError();
  const storage = documentToStorage(doc.toObject(), doc.schema, { applyDefaults: doc.isNew, allowId: true });
  await validateObjectAgainstSchema(storage, doc.schema, doc);
}

function partialValidationError(): ValidationError {
  return new ValidationError(
    '',
    'projection',
    'Cannot validate a projected document in isolation; reload without select() or use save() to validate the merged record.',
  );
}

function isCompleteProjectedPath(path: string, projection: DocumentProjection): boolean {
  const within = (child: string, parent: string) => child === parent || child.startsWith(`${parent}.`);
  if (projection.mode === 'include') {
    return Object.entries(projection.fields).some(([selected, flag]) => flag === 1 && within(path, selected));
  }
  return !Object.entries(projection.fields).some(
    ([excluded, flag]) => flag === 0 && (within(path, excluded) || within(excluded, path)),
  );
}

export async function validateObjectAgainstSchema(
  value: Record<string, any>,
  schema: Schema<any>,
  context: any = value,
): Promise<void> {
  const errors: Record<string, ValidationError> = {};
  await collectValidationErrors(value, schema, context, '', errors);
  const paths = Object.keys(errors).sort();
  if (paths.length) {
    throw new ValidationError(
      paths[0],
      'validation',
      `Validation failed: ${paths.map((path) => `${path}: ${errors[path].message}`).join(', ')}`,
      errors,
    );
  }
}

export function validateObjectAgainstSchemaSync(
  value: Record<string, any>,
  schema: Schema<any>,
  context: any = value,
): ValidationError | undefined {
  const errors: Record<string, ValidationError> = {};
  collectValidationErrorsSync(value, schema, context, '', errors);
  const paths = Object.keys(errors).sort();
  if (!paths.length) return undefined;
  return new ValidationError(
    paths[0],
    'validation',
    `Validation failed: ${paths.map((path) => `${path}: ${errors[path].message}`).join(', ')}`,
    errors,
  );
}

async function collectValidationErrors(
  value: Record<string, any>,
  schema: Schema<any>,
  context: any,
  prefix: string,
  errors: Record<string, ValidationError>,
): Promise<void> {
  for (const [name, path] of schema.paths as Map<string, CompiledPath>) {
    const pathValue = getDottedValue(value, name);
    const fullPath = prefix ? `${prefix}.${name}` : name;
    const opts = path.options;
    await validateValue(fullPath, pathValue, opts, context, errors);
    if (pathValue === undefined || pathValue === null) continue;
    if (path.subSchema && Array.isArray(pathValue)) {
      for (let index = 0; index < pathValue.length; index++) {
        const subdoc = pathValue[index];
        if (subdoc && typeof subdoc === 'object')
          await collectValidationErrors(subdoc, path.subSchema as Schema<any>, subdoc, `${fullPath}.${index}`, errors);
      }
    } else if (path.subSchema && typeof pathValue === 'object') {
      await collectValidationErrors(pathValue, path.subSchema as Schema<any>, pathValue, fullPath, errors);
    } else if (path.isArray && Array.isArray(pathValue) && path.arrayItemOptions) {
      for (let index = 0; index < pathValue.length; index++) {
        await validateValue(`${fullPath}.${index}`, pathValue[index], path.arrayItemOptions, context, errors);
      }
    }
  }
}

function collectValidationErrorsSync(
  value: Record<string, any>,
  schema: Schema<any>,
  context: any,
  prefix: string,
  errors: Record<string, ValidationError>,
): void {
  for (const [name, path] of schema.paths as Map<string, CompiledPath>) {
    const pathValue = getDottedValue(value, name);
    const fullPath = prefix ? `${prefix}.${name}` : name;
    const opts = path.options;
    validateValueSync(fullPath, pathValue, opts, context, errors);
    if (pathValue === undefined || pathValue === null) continue;
    if (path.subSchema && Array.isArray(pathValue)) {
      for (let index = 0; index < pathValue.length; index++) {
        const subdoc = pathValue[index];
        if (subdoc && typeof subdoc === 'object')
          collectValidationErrorsSync(subdoc, path.subSchema as Schema<any>, subdoc, `${fullPath}.${index}`, errors);
      }
    } else if (path.subSchema && typeof pathValue === 'object') {
      collectValidationErrorsSync(pathValue, path.subSchema as Schema<any>, pathValue, fullPath, errors);
    } else if (path.isArray && Array.isArray(pathValue) && path.arrayItemOptions) {
      for (let index = 0; index < pathValue.length; index++) {
        validateValueSync(`${fullPath}.${index}`, pathValue[index], path.arrayItemOptions, context, errors);
      }
    }
  }
}

async function validateValue(
  name: string,
  pathValue: any,
  opts: SchemaTypeOptions,
  context: any,
  errors: Record<string, ValidationError>,
): Promise<void> {
  if (requiredMissing(opts, pathValue, context)) {
    addValidationError(errors, name, 'required', `Path \`${name}\` is required.`);
    return;
  }
  if (pathValue === undefined || pathValue === null) return;
  if (opts.enum && !opts.enum.includes(pathValue)) {
    addValidationError(errors, name, 'enum', `\`${name}\` must be one of ${opts.enum.join(', ')}`);
  }
  if (opts.min !== undefined && typeof pathValue === 'number' && pathValue < opts.min) {
    addValidationError(errors, name, 'min', `\`${name}\` must be >= ${opts.min}`);
  }
  if (opts.max !== undefined && typeof pathValue === 'number' && pathValue > opts.max) {
    addValidationError(errors, name, 'max', `\`${name}\` must be <= ${opts.max}`);
  }
  if (opts.match && typeof pathValue === 'string' && !testMatchPattern(opts.match, pathValue)) {
    addValidationError(errors, name, 'match', `\`${name}\` did not match pattern`);
  }
  if (opts.validate) {
    const validator = typeof opts.validate === 'function' ? opts.validate : opts.validate.validator;
    const msg = typeof opts.validate === 'object' ? opts.validate.message : undefined;
    const ok = await validator.call(context, pathValue);
    if (!ok) addValidationError(errors, name, 'validate', msg ?? `\`${name}\` failed validation`);
  }
}

function validateValueSync(
  name: string,
  pathValue: any,
  opts: SchemaTypeOptions,
  context: any,
  errors: Record<string, ValidationError>,
): void {
  if (requiredMissing(opts, pathValue, context)) {
    addValidationError(errors, name, 'required', `Path \`${name}\` is required.`);
    return;
  }
  if (pathValue === undefined || pathValue === null) return;
  if (opts.enum && !opts.enum.includes(pathValue)) {
    addValidationError(errors, name, 'enum', `\`${name}\` must be one of ${opts.enum.join(', ')}`);
  }
  if (opts.min !== undefined && typeof pathValue === 'number' && pathValue < opts.min) {
    addValidationError(errors, name, 'min', `\`${name}\` must be >= ${opts.min}`);
  }
  if (opts.max !== undefined && typeof pathValue === 'number' && pathValue > opts.max) {
    addValidationError(errors, name, 'max', `\`${name}\` must be <= ${opts.max}`);
  }
  if (opts.match && typeof pathValue === 'string' && !testMatchPattern(opts.match, pathValue)) {
    addValidationError(errors, name, 'match', `\`${name}\` did not match pattern`);
  }
  if (opts.validate) {
    const validator = typeof opts.validate === 'function' ? opts.validate : opts.validate.validator;
    const msg = typeof opts.validate === 'object' ? opts.validate.message : undefined;
    const ok = validator.call(context, pathValue);
    if (isPromiseLike(ok)) {
      // BMRX-15: keep validateSync synchronous and report its documented
      // async-validator error, but never abandon the returned promise. A
      // rejecting async (or promise-returning sync) validator would otherwise
      // surface as an unhandledRejection and can terminate Node. Attaching a
      // no-op rejection handler marks the original promise handled while the
      // derived promise resolves successfully.
      try {
        (ok as PromiseLike<unknown>).then(undefined, () => undefined);
      } catch {
        // Ignore then-access failures; the controlled sync error below stands.
      }
      addValidationError(
        errors,
        name,
        'validate',
        msg ?? `\`${name}\` uses an async validator that cannot run during validateSync()`,
      );
    } else if (!ok) {
      addValidationError(errors, name, 'validate', msg ?? `\`${name}\` failed validation`);
    }
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  );
}

/**
 * BMRX-15: stateless `match` check shared by sync and async validation.
 * Clones the schema regex so shared `/g` or `/y` patterns are evaluated from
 * index 0 every time. This keeps repeated validation deterministic without
 * mutating the shared pattern's `lastIndex` (which also keeps frozen patterns
 * safe), while preserving sticky (`/y`) anchoring semantics from the start.
 */
function testMatchPattern(pattern: RegExp, value: string): boolean {
  const clone = new RegExp(pattern.source, pattern.flags);
  return clone.test(value);
}

function addValidationError(
  errors: Record<string, ValidationError>,
  path: string,
  kind: string,
  message: string,
): void {
  errors[path] = new ValidationError(path, kind, message);
}

function getDottedValue(target: any, path: string): any {
  let cursor = target;
  for (const segment of splitPath(path)) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function setDottedValueOnRecord(record: Record<string, any>, segments: string[], _compiledPath: any, value: any): void {
  let cursor: any = record;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (Array.isArray(cursor)) {
      if (!/^\d+$/.test(segment)) {
        throw new Error(`Cannot set non-index path "${segments.join('.')}" through array "${segments[0]}"`);
      }
      const index = Number(segment);
      const entry = cursor[index];
      if (entry !== undefined && entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
        cursor = entry;
      } else if (entry !== undefined && entry !== null && typeof entry !== 'object') {
        throw new Error(`Cannot set nested path "${segments.join('.')}" through scalar "${segments[0]}"`);
      } else {
        const created: Record<string, any> = Object.create(null);
        cursor[index] = created;
        cursor = created;
      }
      continue;
    }
    const owned = Object.prototype.hasOwnProperty.call(cursor, segment) ? cursor[segment] : undefined;
    if (owned instanceof Date) {
      throw new Error(`Cannot set nested path "${segments.join('.')}" through scalar "${segments[0]}"`);
    }
    if (owned !== undefined && owned !== null && typeof owned === 'object') {
      cursor = owned;
    } else {
      if (owned !== undefined && owned !== null) {
        throw new Error(`Cannot set nested path "${segments.join('.')}" through scalar "${segments[0]}"`);
      }
      const created: Record<string, any> = Object.create(null);
      cursor[segment] = created;
      cursor = created;
    }
  }
  const leaf = segments[segments.length - 1];
  assertSafeKey(leaf, segments.join('.'));
  if (Array.isArray(cursor)) {
    if (!/^\d+$/.test(leaf)) {
      throw new Error(`Cannot set non-index path "${segments.join('.')}" through array "${segments[0]}"`);
    }
    cursor[Number(leaf)] = value;
    return;
  }
  cursor[leaf] = value;
}

function splitPath(path: string): string[] {
  if (typeof path !== 'string' || path.length === 0) throw new Error(`Invalid document path: ${path}`);
  const segments = path.split('.');
  if (segments.length > MAX_STORAGE_DEPTH)
    throw new WriteNormalizationError('Document path exceeds the supported nesting depth');
  for (const segment of segments) {
    assertSafeKey(segment, path);
  }
  return segments;
}

function assertSafeKey(segment: string, fullPath: string): void {
  if (!segment || DANGEROUS_SEGMENTS.has(segment)) {
    throw new Error(`Invalid document path: ${fullPath}`);
  }
}

function requiredMissing(opts: SchemaTypeOptions, value: any, context: any): boolean {
  const req = opts.required;
  // BMRX-14: evaluate function-valued required dynamically (including the
  // `[fn, message]` array form) so conditional-required true/false cases agree
  // with validation while static schemas omit dynamic requirements.
  const needed = Array.isArray(req)
    ? typeof req[0] === 'function'
      ? !!req[0].call(context)
      : !!req[0]
    : typeof req === 'function'
      ? !!req.call(context)
      : !!req;
  return needed && (value === undefined || value === null || (typeof value === 'string' && value.length === 0));
}

function cloneDocumentValue<T>(value: T): T {
  return cloneDocumentData(value);
}

function assertNoDocumentNameCollisions(schema: Schema<any, any, any, any>): void {
  for (const [name] of schema.paths) {
    if (RESERVED_DOCUMENT_MEMBERS.has(name) || DANGEROUS_SEGMENTS.has(name)) {
      throw new Error(
        `Schema path "${name}" collides with a reserved document member. ` +
          `Rename the field (underscore-prefixed data fields such as "_${name}" remain supported) ` +
          `or use a virtual instead.`,
      );
    }
  }
  for (const [name] of schema.virtuals) {
    if (schema.paths.has(name)) {
      throw new Error(`Virtual "${name}" collides with a schema path. Rename the virtual or the path.`);
    }
    if (RESERVED_DOCUMENT_MEMBERS.has(name) || DANGEROUS_SEGMENTS.has(name)) {
      throw new Error(`Virtual "${name}" collides with a reserved document member. Rename the virtual.`);
    }
  }
  for (const name of Object.keys(schema.methods as Record<string, unknown>)) {
    if (schema.paths.has(name) || schema.virtuals.has(name) || RESERVED_DOCUMENT_MEMBERS.has(name)) {
      throw new Error(`Method "${name}" collides with a schema path, virtual, or reserved document member.`);
    }
  }
}

function assertSafeTopLevelInput(data: unknown, schema: Schema<any, any, any, any>): void {
  if (
    data == null ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    (Object.getPrototypeOf(data) !== Object.prototype && Object.getPrototypeOf(data) !== null)
  )
    throw new WriteNormalizationError('Document input must be a plain object');
  for (const key of Object.keys(data as Record<string, unknown>)) {
    assertSafeKey(key, `document input key "${key}"`);
    if (key === '_id') continue;
    if (schema.paths.has(key)) continue;
    if (RESERVED_DOCUMENT_MEMBERS.has(key)) {
      throw new Error(`Document input key "${key}" is reserved and cannot be set from input data.`);
    }
  }
}

function isPlainMergeObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function collectLeafOps(
  originalNode: any,
  currentNode: any,
  basePath: string,
  dataRoot: Record<string, any>,
  intentional: ReadonlyMap<string, symbol>,
  $set: Record<string, any>,
  $unset: Record<string, any>,
): void {
  if (deepEqual(originalNode, currentNode)) return;
  if (intentional.has(basePath)) {
    const raw = getDottedValue(dataRoot, basePath);
    if (raw === undefined) $unset[basePath] = true;
    else $set[basePath] = raw;
    return;
  }
  if (Array.isArray(originalNode) || Array.isArray(currentNode)) {
    const raw = getDottedValue(dataRoot, basePath);
    if (raw === undefined) $unset[basePath] = true;
    else $set[basePath] = raw;
    return;
  }
  if (isPlainMergeObject(originalNode) && isPlainMergeObject(currentNode)) {
    const keys = new Set([...Object.keys(originalNode), ...Object.keys(currentNode)]);
    for (const key of keys) {
      collectLeafOps(originalNode[key], currentNode[key], `${basePath}.${key}`, dataRoot, intentional, $set, $unset);
    }
    return;
  }
  if (currentNode === undefined) {
    $unset[basePath] = true;
    return;
  }
  $set[basePath] = getDottedValue(dataRoot, basePath);
}

function deepEqual(left: any, right: any): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => deepEqual(entry, right[index]));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index++) {
    const key = leftKeys[index];
    if (key !== rightKeys[index] || !deepEqual(left[key], right[key])) return false;
  }
  return true;
}

export class ValidationError extends Error {
  public kind: string;
  public path: string;
  declare public errors: Record<string, ValidationError>;
  constructor(path: string, kind: string, message: string, errors: Record<string, ValidationError> = {}) {
    super(message);
    this.name = 'ValidationError';
    this.kind = kind;
    this.path = path;
    this.errors = errors;
  }
}
