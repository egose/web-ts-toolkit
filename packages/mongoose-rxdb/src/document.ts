import type { CompiledPath, SchemaTypeOptions } from './types';
import { castValue, castDocumentToSchema } from './converter';
import { Schema } from './schema';
import { MiddlewareEngine } from './middleware';

const DIRTY = Symbol('dirty');
const ORIGINAL = Symbol('original');

export class Document<T = any> {
  declare [DIRTY]: Set<string>;
  declare [ORIGINAL]: Record<string, any>;
  public isNew: boolean = true;
  public schema: Schema<T>;
  protected mw: MiddlewareEngine;
  protected modelRef: any;
  protected idGenerator = () =>
    (globalThis.crypto?.randomUUID?.() as string) ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

  constructor(data: Partial<T> = {}, schema: Schema<T>, model: any, opts: { isNew?: boolean; id?: string } = {}) {
    this.schema = schema;
    this.modelRef = model;
    this.mw = new MiddlewareEngine(schema);
    this[DIRTY] = new Set();
    this.isNew = opts.isNew ?? true;
    const defaults = castDocumentToSchema({}, schema);
    const casted = castDocumentToSchema({ ...defaults, ...data }, schema);
    this[ORIGINAL] = { ...casted };
    for (const [name, path] of schema.paths) {
      Object.defineProperty(this, name, {
        enumerable: true,
        configurable: true,
        get: () => (this as any)[`_${name}`],
        set: (v: any) => {
          const casted = castValue(v, path);
          (this as any)[`_${name}`] = casted;
          this.markModified(name);
        },
      });
      (this as any)[`_${name}`] = casted[name];
    }
    if (schema.options._id !== false) {
      this[ORIGINAL]._id = (data as any)._id ?? opts.id ?? this.idGenerator();
      this.__idRaw = this[ORIGINAL]._id;
    }
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
    for (const [name, fn] of Object.entries(schema.methods)) {
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
    if (path === undefined) return this[DIRTY].size > 0;
    return this[DIRTY].has(path);
  }

  modifiedPaths(): string[] {
    return Array.from(this[DIRTY]);
  }

  clearModified(): void {
    this[DIRTY].clear();
  }

  private markModifiedAll(): void {
    for (const [name] of this.schema.paths) this[DIRTY].add(name);
  }

  validate(): Promise<void> {
    return validateDoc(this);
  }

  async validateSync(): Promise<void> {
    await this.validate();
  }

  toObject(opts: { virtuals?: boolean; getters?: boolean; transform?: (doc: any, ret: any) => any } = {}): any {
    const out: any = { _id: (this as any)._id };
    for (const [name] of this.schema.paths) out[name] = (this as any)[`_${name}`];
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
    await this.validate();
    const collection = await this.resolveCollection();
    return this.mw.exec('save', this, async () => {
      const id = (this as any)._id;
      const data = this.toObject();
      if (this.isNew) {
        await collection.insert(data);
        this.isNew = false;
      } else {
        const set: any = {};
        for (const path of this[DIRTY]) set[path] = data[path];
        await collection.incrementalModify(id, (doc: any) => ({ ...doc, ...set }));
      }
      this[ORIGINAL] = { ...data };
      this.clearModified();
      return this;
    });
  }

  async remove(): Promise<this> {
    const collection = await this.resolveCollection();
    return this.mw.exec('remove', this, async () => {
      await collection.remove((this as any)._id);
      return this;
    });
  }

  private async resolveCollection() {
    if ((this.modelRef as any).collection) return (this.modelRef as any).collection;
    const ready = (this.modelRef as any).collectionReady as Promise<any> | undefined;
    return ready ? await ready : (this.modelRef as any).collection;
  }

  async deleteOne(): Promise<this> {
    return this.remove();
  }

  get(path: string): any {
    return (this as any)[path];
  }

  set(path: string | Record<string, any>, value?: any): this {
    if (typeof path === 'object') {
      for (const [k, v] of Object.entries(path)) {
        (this as any)[k] = v;
      }
    } else {
      (this as any)[path] = value;
    }
    return this;
  }
}

export async function validateDoc(doc: Document<any>): Promise<void> {
  for (const [name, path] of doc.schema.paths as Map<string, CompiledPath>) {
    const value = (doc as any)[`_${name}`];
    const opts = path.options;
    if (requiredMissing(opts, value)) {
      throw new ValidationError(name, 'required', `Path \`${name}\` is required.`);
    }
    if (value === undefined || value === null) continue;
    if (opts.enum && !opts.enum.includes(value)) {
      throw new ValidationError(name, 'enum', `\`${name}\` must be one of ${opts.enum.join(', ')}`);
    }
    if (opts.min !== undefined && typeof value === 'number' && value < opts.min) {
      throw new ValidationError(name, 'min', `\`${name}\` must be >= ${opts.min}`);
    }
    if (opts.max !== undefined && typeof value === 'number' && value > opts.max) {
      throw new ValidationError(name, 'max', `\`${name}\` must be <= ${opts.max}`);
    }
    if (opts.match && typeof value === 'string' && !opts.match.test(value)) {
      throw new ValidationError(name, 'match', `\`${name}\` did not match pattern`);
    }
    if (opts.validate) {
      const validator = typeof opts.validate === 'function' ? opts.validate : opts.validate.validator;
      const msg = typeof opts.validate === 'object' ? opts.validate.message : undefined;
      const ok = await validator(value);
      if (!ok) throw new ValidationError(name, 'validate', msg ?? `\`${name}\` failed validation`);
    }
  }
}

function requiredMissing(opts: SchemaTypeOptions, value: any): boolean {
  const req = opts.required;
  const needed = Array.isArray(req) ? !!req[0] : typeof req === 'function' ? !!req.call(undefined) : !!req;
  return needed && (value === undefined || value === null || (typeof value === 'string' && value.length === 0));
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
