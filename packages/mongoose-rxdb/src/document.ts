import type { AnyDocument, CompiledPath, SchemaTypeOptions } from './types';
import {
  applyNormalizedUpdate,
  castValue,
  castDocumentToSchema,
  documentToStorage,
  normalizeUpdatePlan,
} from './converter';
import { Schema } from './schema';
import { MiddlewareEngine } from './middleware';
import type { InternalModelRuntime } from './model';
import type { RxLikeCollection } from './rx-adapter';

const DIRTY = Symbol('dirty');
const ORIGINAL = Symbol('original');

/**
 * Hydrated document base with schema casting, validation, middleware, dirty
 * tracking, and persistence helpers. Consumer model results are usually typed
 * with `HydratedDocument<T, Methods, Virtuals>` rather than this class alone.
 */
export class Document<T extends object = AnyDocument> {
  declare [DIRTY]: Set<string>;
  declare [ORIGINAL]: Record<string, any>;
  public isNew: boolean = true;
  public schema: Schema<T, any, any, any>;
  protected mw: MiddlewareEngine;
  protected modelRef: any;
  protected idGenerator = () =>
    (globalThis.crypto?.randomUUID?.() as string) ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

  constructor(
    data: Partial<T> = {},
    schema: Schema<T, any, any, any>,
    model: any,
    opts: { isNew?: boolean; id?: string; applyDefaults?: boolean } = {},
  ) {
    this.schema = schema;
    this.modelRef = model;
    this.mw = new MiddlewareEngine(schema);
    this[DIRTY] = new Set();
    this.isNew = opts.isNew ?? true;
    const applyDefaults = opts.applyDefaults !== false;
    const defaults = applyDefaults ? castDocumentToSchema({}, schema) : {};
    const casted = cloneDocumentValue(
      castDocumentToSchema({ ...defaults, ...cloneDocumentValue(data) }, schema, { applyDefaults }),
    );
    for (const [name, path] of schema.paths) {
      Object.defineProperty(this, name, {
        enumerable: true,
        configurable: true,
        get: () => (this as any)[`_${name}`],
        set: (v: any) => {
          const casted = castValue(v, path);
          (this as any)[`_${name}`] = cloneDocumentValue(casted);
          this.markModified(name);
        },
      });
      (this as any)[`_${name}`] = cloneDocumentValue(casted[name]);
    }
    if (schema.options._id !== false) {
      const id = (data as any)._id ?? opts.id;
      if (id !== undefined) this.__idRaw = id;
      else if (this.isNew) this.__idRaw = this.idGenerator();
    }
    this[ORIGINAL] = this.createSnapshot();
    for (const [name, vt] of schema.virtuals) {
      Object.defineProperty(this, name, {
        enumerable: true,
        configurable: true,
        get() {
          return vt.getter ? vt.getter.call(this, undefined as any, vt, this) : undefined;
        },
        set(v: any) {
          if (vt.setter) {
            vt.setter.call(this, v, vt, this);
          }
        },
      });
    }
    for (const [name, fn] of Object.entries(schema.methods as Record<string, (...args: any[]) => any>)) {
      (this as any)[name] = fn.bind(this);
    }
    if (!this.isNew) this.clearModified();
    else this.markModifiedAll();
  }

  get _id(): string {
    return this.__idRaw;
  }

  private __idRaw!: string;

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
    const out: any = {};
    if ((this as any)._id !== undefined) out._id = (this as any)._id;
    for (const [name] of this.schema.paths) {
      const value = (this as any)[`_${name}`];
      if (value !== undefined) out[name] = cloneDocumentValue(value);
    }
    if (opts.virtuals) {
      for (const [name, vt] of this.schema.virtuals) {
        if (vt.getter) out[name] = vt.getter.call(this, undefined, vt, this);
      }
    }
    if (opts.transform) return opts.transform(this, out);
    return out;
  }

  toJSON(): any {
    return this.toObject({ virtuals: true });
  }

  async save(): Promise<this> {
    const collection = await this.resolveCollection();
    try {
      if (this.schema.options.validateBeforeSave !== false) await this.validate();
      return await this.mw.exec('save', this, async () => {
        const data = this.toObject();
        const storage = documentToStorage(data, this.schema, { applyDefaults: true, allowId: true });
        const id = (this as any)._id;
        if (this.isNew) {
          await collection.insert(storage);
          this.isNew = false;
        } else {
          const set = this.changedStorageValues(data);
          if (Object.keys(set).length === 0) {
            this.clearModified();
            return this;
          }
          const plan = normalizeUpdatePlan({ $set: set }, this.schema);
          await collection.incrementalModify(id, (doc: any) => applyNormalizedUpdate(doc, plan, this.schema));
        }
        this[ORIGINAL] = cloneDocumentValue(data);
        this.clearModified();
        return this;
      });
    } catch (error) {
      if ((error as any)?.__mongooseRxdbsavePostErrorHandled !== true) {
        await this.mw.runPostError('save', this, error as Error);
        Object.defineProperty(error as object, '__mongooseRxdbsavePostErrorHandled', {
          value: true,
          configurable: true,
        });
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
    const runtime = this.modelRef as InternalModelRuntime<T>;
    if (typeof runtime.resolveCollection === 'function') return runtime.resolveCollection();
    const collection = runtime.collection;
    if (!collection)
      throw new Error(`Model "${this.modelRef?.modelName ?? 'unknown'}" is not attached to a collection.`);
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
    if (typeof path === 'object') {
      for (const [k, v] of Object.entries(path)) {
        this.set(k, v);
      }
    } else {
      if (path.includes('.')) {
        setDottedValue(this, path, value);
        this.markModified(path);
      } else {
        (this as any)[path] = value;
      }
    }
    return this;
  }

  private createSnapshot(): Record<string, any> {
    const out: Record<string, any> = {};
    if (this.schema.options._id !== false && this.__idRaw !== undefined) out._id = this.__idRaw;
    for (const [name] of this.schema.paths) out[name] = cloneDocumentValue((this as any)[`_${name}`]);
    return out;
  }

  private changedStorageValues(data: Record<string, any>): Record<string, any> {
    const current = documentToStorage(data, this.schema, { applyDefaults: true, allowId: true });
    const original = documentToStorage(this[ORIGINAL], this.schema, { applyDefaults: true, allowId: true });
    const set: Record<string, any> = {};
    for (const [name] of this.schema.paths) {
      if (!deepEqual(current[name], original[name])) set[name] = data[name];
    }
    return set;
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
  if (opts.match && typeof pathValue === 'string' && !opts.match.test(pathValue)) {
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
  if (opts.match && typeof pathValue === 'string' && !opts.match.test(pathValue)) {
    addValidationError(errors, name, 'match', `\`${name}\` did not match pattern`);
  }
  if (opts.validate) {
    const validator = typeof opts.validate === 'function' ? opts.validate : opts.validate.validator;
    const msg = typeof opts.validate === 'object' ? opts.validate.message : undefined;
    const ok = validator.call(context, pathValue);
    if (isPromiseLike(ok)) {
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
    cursor = cursor[segment];
  }
  return cursor;
}

function setDottedValue(target: any, path: string, value: any): void {
  const segments = splitPath(path);
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (cursor[`_${segment}`] !== undefined) cursor = cursor[`_${segment}`];
    else {
      if (!cursor[segment] || typeof cursor[segment] !== 'object') cursor[segment] = {};
      cursor = cursor[segment];
    }
  }
  cursor[segments[segments.length - 1]] = value;
}

function splitPath(path: string): string[] {
  const segments = path.split('.');
  for (const segment of segments) {
    if (!segment || segment === '__proto__' || segment === 'prototype' || segment === 'constructor') {
      throw new Error(`Invalid document path: ${path}`);
    }
  }
  return segments;
}

function requiredMissing(opts: SchemaTypeOptions, value: any, context: any): boolean {
  const req = opts.required;
  const needed = Array.isArray(req) ? !!req[0] : typeof req === 'function' ? !!req.call(context) : !!req;
  return needed && (value === undefined || value === null || (typeof value === 'string' && value.length === 0));
}

function cloneDocumentValue<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((entry) => cloneDocumentValue(entry)) as T;
  const out: Record<string, any> = Object.create(Object.getPrototypeOf(value) === null ? null : Object.prototype);
  for (const [key, nested] of Object.entries(value as Record<string, any>)) out[key] = cloneDocumentValue(nested);
  return out as T;
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
