import type { AnyDocument, CompiledPath, SchemaTypeOptions } from './types';
import {
  applyNormalizedUpdate,
  castValue,
  castDocumentToSchema,
  documentToStorage,
  normalizeUpdatePlan,
} from './converter';
import { Schema } from './schema';
import { MiddlewareEngine, preserveErrorCause } from './middleware';
import type { InternalModelRuntime } from './model';
import type { RxLikeCollection } from './rx-adapter';

const DIRTY = Symbol('dirty');
const ORIGINAL = Symbol('original');
const DATA = Symbol('documentData');
const DOC_ID = Symbol('documentId');
const DOC_SCHEMA = Symbol('documentSchema');
const DOC_MODEL = Symbol('documentModel');
const DOC_MW = Symbol('documentMw');

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
 */
export class Document<T extends object = AnyDocument> {
  declare [DIRTY]: Set<string>;
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
    opts: { isNew?: boolean; id?: string; applyDefaults?: boolean } = {},
  ) {
    assertNoDocumentNameCollisions(schema);
    this[DOC_SCHEMA] = schema;
    this[DOC_MODEL] = model;
    this[DOC_MW] = new MiddlewareEngine(schema);
    this[DIRTY] = new Set();
    this[DATA] = Object.create(null);
    this.isNew = opts.isNew ?? true;
    const applyDefaults = opts.applyDefaults !== false;
    assertSafeTopLevelInput(data, schema);
    const defaults = applyDefaults ? castDocumentToSchema({}, schema) : {};
    const casted = cloneDocumentValue(
      castDocumentToSchema({ ...defaults, ...cloneDocumentValue(data) }, schema, { applyDefaults }),
    );
    for (const [name, path] of schema.paths) {
      Object.defineProperty(this, name, {
        enumerable: true,
        configurable: true,
        get: () => (this[DATA] as Record<string, any>)[name],
        set: (v: any) => {
          const next = cloneDocumentValue(castValue(v, path));
          (this[DATA] as Record<string, any>)[name] = next;
          this.markModified(name);
        },
      });
      (this[DATA] as Record<string, any>)[name] = cloneDocumentValue(casted[name]);
    }
    if (schema.options._id !== false) {
      const id = (data as any)._id ?? opts.id;
      if (id !== undefined) this[DOC_ID] = id;
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
            vt.setter.call(this, cloneDocumentValue(v), vt, this);
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
    this[DIRTY].add(path);
  }

  isModified(path?: string): boolean {
    if (path === undefined) return this.modifiedPaths().length > 0;
    if (this.isNew && this[DIRTY].has(path)) return true;
    const current = this.createSnapshot();
    return !deepEqual(getDottedValue(current, path), getDottedValue(this[ORIGINAL], path));
  }

  modifiedPaths(): string[] {
    if (this.isNew) return Array.from(this[DIRTY]);
    const current = this.createSnapshot();
    const paths = new Set<string>();
    for (const [name] of this.schema.paths) {
      if (!deepEqual(current[name], this[ORIGINAL][name])) paths.add(name);
    }
    for (const path of this[DIRTY]) {
      if (!deepEqual(getDottedValue(current, path), getDottedValue(this[ORIGINAL], path))) paths.add(path);
    }
    return Array.from(paths);
  }

  clearModified(): void {
    this[DIRTY].clear();
  }

  private markModifiedAll(): void {
    for (const [name] of this.schema.paths) this[DIRTY].add(name);
  }

  validate(): Promise<void> {
    return this.mw.exec('validate', this, async () => validateDoc(this));
  }

  validateSync(): ValidationError | undefined {
    const storage = documentToStorage(this.toObject(), this.schema, { applyDefaults: true, allowId: true });
    return validateObjectAgainstSchemaSync(storage, this.schema, this);
  }

  toObject(opts: { virtuals?: boolean; getters?: boolean; transform?: (doc: any, ret: any) => any } = {}): any {
    const out: any = Object.create(null);
    if ((this as any)._id !== undefined) out._id = (this as any)._id;
    for (const [name] of this.schema.paths) {
      const value = (this[DATA] as Record<string, any>)[name];
      if (value !== undefined) out[name] = cloneDocumentValue(value);
    }
    if (opts.virtuals) {
      for (const [name, vt] of this.schema.virtuals) {
        if (vt.getter) out[name] = cloneDocumentValue(vt.getter.call(this, undefined, vt, this));
      }
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
   *   `profile.b`) both survive sequential saves. Arrays are atomic: any
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
   */
  async save(): Promise<this> {
    const collection = await this.resolveCollection();
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
      if (this.schema.options.validateBeforeSave !== false) await this.validate();
      try {
        return await this.mw.exec('save', this, async () => {
          const data = this.toObject();
          const storage = documentToStorage(data, this.schema, { applyDefaults: true, allowId: true });
          const id = (this as any)._id;
          if (this.isNew) {
            await collection.insert(storage);
            this.isNew = false;
          } else {
            const { $set, $unset } = this.changedLeafValues(data);
            if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
              this.clearModified();
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
            await collection.incrementalModify(id, async (current: any) => {
              const candidate = applyNormalizedUpdate(current, plan, schema);
              if (shouldValidate) {
                await validateObjectAgainstSchema(candidate, schema, candidate);
              }
              return candidate;
            });
          }
          this[ORIGINAL] = cloneDocumentValue(data);
          this.clearModified();
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

  set(path: string | Record<string, any>, value?: any): this {
    if (typeof path === 'object' && path !== null && !Array.isArray(path)) {
      const entries = Object.entries(path);
      const prepared = entries.map(([key, entryValue]) => ({
        key,
        value: this.prepareSetValue(key, entryValue),
      }));
      for (const { key, value: preparedValue } of prepared) {
        this.applyPreparedSet(key, preparedValue);
      }
    } else if (typeof path === 'string') {
      this.applyPreparedSet(path, this.prepareSetValue(path, value));
    } else {
      throw new Error('Document set() requires a path string or a plain object of path values');
    }
    return this;
  }

  private prepareSetValue(path: string, value: any): any {
    const kind = this.resolveSetTarget(path);
    if (kind.target === 'virtual') {
      return cloneDocumentValue(value);
    }
    if (kind.segments.length > 1) {
      return cloneDocumentValue(value);
    }
    const casted = castValue(value, kind.compiledPath);
    return cloneDocumentValue(casted);
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
    const out: Record<string, any> = Object.create(null);
    if (this.schema.options._id !== false && this[DOC_ID] !== undefined) out._id = this[DOC_ID];
    for (const [name] of this.schema.paths) out[name] = cloneDocumentValue((this[DATA] as Record<string, any>)[name]);
    return out;
  }

  private changedLeafValues(data: Record<string, any>): { $set: Record<string, any>; $unset: Record<string, any> } {
    const current = documentToStorage(data, this.schema, { applyDefaults: true, allowId: true });
    const original = documentToStorage(this[ORIGINAL], this.schema, { applyDefaults: true, allowId: true });
    const $set: Record<string, any> = {};
    const $unset: Record<string, any> = {};
    const intentional = this[DIRTY] as Set<string>;
    for (const [name] of this.schema.paths) {
      if (deepEqual(current[name], original[name])) continue;
      collectLeafOps(original[name], current[name], name, data, intentional, $set, $unset);
    }
    return { $set, $unset };
  }
}

export async function validateDoc(doc: Document<any>): Promise<void> {
  const storage = documentToStorage(doc.toObject(), doc.schema, { applyDefaults: true, allowId: true });
  await validateObjectAgainstSchema(storage, doc.schema, doc);
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
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((entry) => cloneDocumentValue(entry)) as T;
  const out: Record<string, any> = {};
  for (const [key, nested] of Object.entries(value as Record<string, any>)) {
    assertSafeKey(key, `document value key "${key}"`);
    out[key] = cloneDocumentValue(nested);
  }
  return out as T;
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
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return;
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
  intentional: Set<string>,
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
