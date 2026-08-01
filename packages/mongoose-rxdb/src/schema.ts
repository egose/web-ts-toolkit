import type {
  CompiledPath,
  PrimitiveType,
  SchemaDefinition,
  SchemaLike,
  SchemaOptions,
  SchemaTypeOptions,
  VirtualType,
} from './types';

const SCHEMA_SYMBOL = Symbol.for('mongoose-rxdb:schema');

export class Schema<TRawDoc = any> {
  declare readonly [SCHEMA_SYMBOL]: true;
  public definition: SchemaDefinition<TRawDoc>;
  public options: SchemaOptions;
  public paths: Map<string, CompiledPath> = new Map();
  public methods: Record<string, (...args: any[]) => any> = {};
  public statics: Record<string, (...args: any[]) => any> = {};
  public virtuals: Map<string, VirtualType> = new Map();
  public preHooks: Map<string, Array<{ fn: any; options?: any }>> = new Map();
  public postHooks: Map<string, Array<{ fn: any; options?: any }>> = new Map();
  public queryHelpers: Record<string, (...args: any[]) => any> = {};
  public obj: any;
  public childSchemas: { schema: Schema }[] = [];

  constructor(definition?: SchemaDefinition<TRawDoc> | TRawDoc, options?: SchemaOptions) {
    this.definition = (definition ?? {}) as SchemaDefinition<TRawDoc>;
    this.options = options ?? {};
    this.obj = definition;
    this.compile();
  }

  private compile(): void {
    for (const [name, prop] of Object.entries(this.definition as Record<string, any>)) {
      this.paths.set(name, compilePath(name, prop, this));
    }
  }

  path(name: string): CompiledPath | undefined {
    return this.paths.get(name);
  }

  add(obj: SchemaDefinition, prefix = ''): this {
    for (const [k, v] of Object.entries(obj as Record<string, any>)) {
      const full = prefix ? `${prefix}.${k}` : k;
      this.paths.set(full, compilePath(full, v, this));
    }
    return this;
  }

  method(name: string | Record<string, (...args: any[]) => any>, fn?: (...args: any[]) => any): this {
    if (typeof name === 'string') this.methods[name] = fn as any;
    else Object.assign(this.methods, name);
    return this;
  }

  static(name: string | Record<string, (...args: any[]) => any>, fn?: (...args: any[]) => any): this {
    if (typeof name === 'string') this.statics[name] = fn as any;
    else Object.assign(this.statics, name);
    return this;
  }

  virtual<T = any>(name: string, options: any = {}): VirtualType<T> {
    const vt: VirtualType<T> = {
      name,
      options,
      get(fn) {
        this.getter = fn;
        return this;
      },
      set(fn) {
        this.setter = fn;
        return this;
      },
    };
    this.virtuals.set(name, vt as any);
    return vt;
  }

  pre(method: string | string[], fnOrOptions: any, maybeFn?: any): this {
    const methods = Array.isArray(method) ? method : [method];
    const opts = typeof fnOrOptions === 'function' ? undefined : fnOrOptions;
    const fn = typeof fnOrOptions === 'function' ? fnOrOptions : maybeFn;
    for (const m of methods) {
      if (!this.preHooks.has(m)) this.preHooks.set(m, []);
      this.preHooks.get(m)!.push({ fn, options: opts });
    }
    return this;
  }

  post(method: string | string[], fnOrOptions: any, maybeFn?: any): this {
    const methods = Array.isArray(method) ? method : [method];
    const opts = typeof fnOrOptions === 'function' ? undefined : fnOrOptions;
    const fn = typeof fnOrOptions === 'function' ? fnOrOptions : maybeFn;
    for (const m of methods) {
      if (!this.postHooks.has(m)) this.postHooks.set(m, []);
      this.postHooks.get(m)!.push({ fn, options: opts });
    }
    return this;
  }

  plugin(fn: (schema: Schema, opts?: any) => void, opts?: any): this {
    fn(this, opts);
    return this;
  }

  clone(): this {
    const c = new Schema(this.definition, { ...this.options }) as this;
    c.paths = new Map(Array.from(this.paths.entries()).map(([k, v]) => [k, { ...v }]));
    c.methods = { ...this.methods };
    c.statics = { ...this.statics };
    c.virtuals = new Map(this.virtuals);
    c.preHooks = new Map(Array.from(this.preHooks.entries()).map(([k, v]) => [k, [...v]]));
    c.postHooks = new Map(Array.from(this.postHooks.entries()).map(([k, v]) => [k, [...v]]));
    return c;
  }

  toJSONSchema(): any {
    const properties: Record<string, any> = {};
    for (const [name, path] of this.paths) {
      properties[name] = pathTypeToJsonIgnore(path);
    }
    return {
      type: 'object',
      properties,
    };
  }
}

function compilePath(name: string, prop: any, parent: Schema): CompiledPath {
  let options: SchemaTypeOptions = {};
  let typeDef: any = prop;

  if (prop && typeof prop === 'object' && !Array.isArray(prop) && prop instanceof Schema) {
    return {
      name,
      type: 'object',
      options: {},
      definition: prop,
      nested: true,
      isArray: false,
      subSchema: prop,
    };
  }

  if (prop && typeof prop === 'object' && !Array.isArray(prop) && 'type' in prop) {
    options = prop as SchemaTypeOptions;
    typeDef = prop.type;
  }

  const { type, arrayItemType, subSchema } = detectType(typeDef, parent);

  return {
    name,
    type,
    options,
    definition: prop,
    nested: false,
    isArray: type === 'array',
    arrayItemType,
    subSchema,
  };
}

function detectType(
  typeDef: any,
  parent: Schema,
): {
  type: PrimitiveType;
  arrayItemType?: PrimitiveType;
  subSchema?: SchemaLike;
} {
  if (Array.isArray(typeDef)) {
    if (typeDef.length === 0) return { type: 'array' };
    const inner = typeDef[0];
    if (inner instanceof Schema) return { type: 'array', subSchema: inner, arrayItemType: 'object' };
    const item = compilePath('item', inner, parent);
    return { type: 'array', arrayItemType: item.type, subSchema: item.subSchema };
  }
  if (typeDef instanceof Schema) return { type: 'object', subSchema: typeDef };
  if (typeDef === String) return { type: 'string' };
  if (typeDef === Number) return { type: 'number' };
  if (typeDef === Boolean) return { type: 'boolean' };
  if (typeDef === Date || typeDef === Date) return { type: 'date' };
  if (typeDef === Object || typeDef === (Object as any)) return { type: 'mixed' };
  if (typeof typeDef === 'object' && typeDef !== null) return { type: 'object' };
  return { type: 'mixed' };
}

function pathTypeToJsonIgnore(path: CompiledPath): any {
  switch (path.type) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'date':
      return { type: 'string', format: 'date-time' };
    case 'array':
      return {
        type: 'array',
        items: path.subSchema
          ? path.subSchema.toJSONSchema()
          : { type: (path.arrayItemType ?? 'string') === 'number' ? 'number' : 'string' },
      };
    case 'object':
      return path.subSchema ? path.subSchema.toJSONSchema() : { type: 'object' };
    default:
      return {};
  }
}

export default Schema;
