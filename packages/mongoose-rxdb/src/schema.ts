import type {
  CompiledSchemaRepresentation,
  CompiledPath,
  Hook,
  PrimitiveType,
  ErrorHookFn,
  PostHookFn,
  PreHookFn,
  SchemaDefinition,
  SchemaLike,
  SchemaOptions,
  SchemaTypeOptions,
  VirtualType,
  AnyDocument,
  HydratedDocument,
  ModelMethods,
  ModelStatics,
  ModelVirtuals,
} from './types';

const SCHEMA_SYMBOL = Symbol.for('mongoose-rxdb:schema');
const SUPPORTED_SCHEMA_OPTIONS = new Set(['_id', 'collection', 'validateBeforeSave']);
const SUPPORTED_PATH_OPTIONS = new Set([
  'type',
  'required',
  'default',
  'enum',
  'min',
  'max',
  'match',
  'validate',
  'immutable',
  'index',
]);
const UNSUPPORTED_PATH_OPTION_MESSAGES: Record<string, string> = {
  alias: 'Schema path option "alias" is not supported. Define an explicit virtual instead.',
  auto: 'Schema path option "auto" is not supported. _id generation is handled automatically.',
  expires: 'Schema path option "expires" is not supported because TTL index synchronization is not implemented.',
  get: 'Schema path option "get" is not supported. Use schema.virtual() for computed values.',
  ref: 'Schema path option "ref" is not supported because populate is outside this package scope.',
  select: 'Schema path option "select" is not supported. Use query select() projections explicitly.',
  set: 'Schema path option "set" is not supported. Normalize values before assignment or use custom validation.',
  sparse: 'Schema path option "sparse" is not supported because index synchronization is not implemented.',
  unique:
    'Schema path option "unique" is not supported as a uniqueness guarantee. Use index: true only as a lookup hint.',
};

export class SchemaConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaConfigurationError';
  }
}

/**
 * Defines the supported Mongoose-shaped schema contract for a model.
 *
 * Parameterize `Schema<RawDoc, Methods, Statics, Virtuals>` in strict TypeScript
 * consumers so compiled models infer hydrated document fields, instance methods,
 * statics, and virtual properties. Schema structure is snapshotted when compiled
 * into a model; later structural changes are rejected or isolated from that model.
 */
export class Schema<
  TRawDoc extends object = AnyDocument,
  TMethods extends ModelMethods = {},
  TStatics extends ModelStatics = {},
  TVirtuals extends ModelVirtuals = {},
> {
  declare readonly [SCHEMA_SYMBOL]: true;
  public definition: SchemaDefinition<TRawDoc>;
  public options: SchemaOptions;
  public paths: Map<string, CompiledPath> = new Map();
  public methods: TMethods & Record<string, (...args: any[]) => any> = {} as TMethods &
    Record<string, (...args: any[]) => any>;
  public statics: TStatics & Record<string, (...args: any[]) => any> = {} as TStatics &
    Record<string, (...args: any[]) => any>;
  public virtuals: Map<string, VirtualType<any, any>> = new Map();
  public preHooks: Map<string, Array<{ fn: any; options?: any }>> = new Map();
  public postHooks: Map<string, Array<{ fn: any; options?: any }>> = new Map();
  public queryHelpers: Record<string, (...args: any[]) => any> = {};
  public obj: any;
  public childSchemas: { schema: Schema }[] = [];
  private compiled?: CompiledSchemaRepresentation;
  private locked = false;

  constructor(definition?: SchemaDefinition<TRawDoc> | TRawDoc, options?: SchemaOptions) {
    this.definition = (definition ?? {}) as SchemaDefinition<TRawDoc>;
    validateSchemaOptions(options ?? {});
    this.options = { ...(options ?? {}) };
    this.obj = definition;
    this.compile();
  }

  private compile(): void {
    this.paths.clear();
    this.childSchemas = [];
    for (const [name, prop] of Object.entries(this.definition as Record<string, any>)) {
      assertValidPathName(name);
      this.paths.set(name, compilePath(name, prop, this));
    }
    this.compiled = undefined;
  }

  path(name: string): CompiledPath | undefined {
    return this.paths.get(name);
  }

  /**
   * Adds top-level paths to the schema.
   *
   * BMRX-14: the `prefix` argument is not supported. Prefixed `add()` would
   * create literal dotted path names (`profile.name`) that disagree across
   * casting, storage conversion, validation, and generated schemas, so any
   * non-empty prefix is rejected with `SchemaConfigurationError`. Define
   * nested structure with an explicit child `Schema` instead.
   * Dotted keys are likewise rejected; only top-level field names are accepted.
   */
  add(obj: SchemaDefinition, prefix = ''): this {
    this.assertNotLocked('add paths');
    if (prefix) {
      throw new SchemaConfigurationError(
        'Schema.add() with a prefix is not supported because it creates literal dotted fields that disagree with nested validation and storage. Define nested structure with an explicit child Schema instead.',
      );
    }
    for (const [k, v] of Object.entries(obj as Record<string, any>)) {
      assertValidPathName(k);
      this.paths.set(k, compilePath(k, v, this));
    }
    this.compiled = undefined;
    return this;
  }

  method<
    TName extends string,
    TFn extends (this: HydratedDocument<TRawDoc, TMethods, TVirtuals>, ...args: any[]) => any,
  >(name: TName, fn: TFn): Schema<TRawDoc, TMethods & Record<TName, TFn>, TStatics, TVirtuals>;
  method<TNewMethods extends ModelMethods>(
    name: TNewMethods,
  ): Schema<TRawDoc, TMethods & TNewMethods, TStatics, TVirtuals>;
  method(name: string | Record<string, (...args: any[]) => any>, fn?: (...args: any[]) => any): any {
    if (typeof name === 'string') (this.methods as Record<string, (...args: any[]) => any>)[name] = fn as any;
    else Object.assign(this.methods, name);
    return this;
  }

  static<TName extends string, TFn extends (...args: any[]) => any>(
    name: TName,
    fn: TFn,
  ): Schema<TRawDoc, TMethods, TStatics & Record<TName, TFn>, TVirtuals>;
  static<TNewStatics extends ModelStatics>(
    name: TNewStatics,
  ): Schema<TRawDoc, TMethods, TStatics & TNewStatics, TVirtuals>;
  static(name: string | Record<string, (...args: any[]) => any>, fn?: (...args: any[]) => any): any {
    if (typeof name === 'string') (this.statics as Record<string, (...args: any[]) => any>)[name] = fn as any;
    else Object.assign(this.statics, name);
    return this;
  }

  virtual<TName extends string, TValue = unknown>(
    name: TName,
    options: any = {},
  ): VirtualType<HydratedDocument<TRawDoc, TMethods, TVirtuals>, TValue> {
    const vt: VirtualType<HydratedDocument<TRawDoc, TMethods, TVirtuals>, TValue> = {
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

  pre(method: Hook | Hook[], fnOrOptions: PreHookFn | any, maybeFn?: PreHookFn): this {
    const methods = Array.isArray(method) ? method : [method];
    const opts = typeof fnOrOptions === 'function' ? undefined : fnOrOptions;
    const fn = typeof fnOrOptions === 'function' ? fnOrOptions : maybeFn;
    for (const m of methods) {
      if (!this.preHooks.has(m)) this.preHooks.set(m, []);
      this.preHooks.get(m)!.push({ fn, options: opts });
    }
    return this;
  }

  post(
    method: Hook | Hook[],
    fnOrOptions: PostHookFn | { errorHandler?: boolean } | any,
    maybeFn?: PostHookFn | ErrorHookFn,
  ): this {
    const methods = Array.isArray(method) ? method : [method];
    const opts = typeof fnOrOptions === 'function' ? undefined : fnOrOptions;
    const fn = typeof fnOrOptions === 'function' ? fnOrOptions : maybeFn;
    for (const m of methods) {
      if (!this.postHooks.has(m)) this.postHooks.set(m, []);
      this.postHooks.get(m)!.push({ fn, options: opts });
    }
    return this;
  }

  plugin(fn: (schema: this, opts?: any) => void, opts?: any): this {
    fn(this, opts);
    return this;
  }

  clone(): this {
    const c = new Schema(cloneDefinition(this.definition), clonePlain(this.options)) as this;
    c.paths = new Map(Array.from(this.paths.entries()).map(([k, v]) => [k, clonePath(v)]));
    c.methods = { ...this.methods };
    c.statics = { ...this.statics };
    c.virtuals = new Map(Array.from(this.virtuals.entries()).map(([k, v]) => [k, cloneVirtual(v)]));
    c.preHooks = new Map(Array.from(this.preHooks.entries()).map(([k, v]) => [k, v.map(cloneHook)]));
    c.postHooks = new Map(Array.from(this.postHooks.entries()).map(([k, v]) => [k, v.map(cloneHook)]));
    c.queryHelpers = { ...this.queryHelpers };
    c.childSchemas = this.childSchemas.map(({ schema }) => ({ schema: schema.clone() }));
    return c;
  }

  compileForModel(): this {
    // BMRX-12: one authoritative immutable structural representation.
    // Structural state is paths (including path options/arrayItemOptions),
    // schema options, definition top level, child schemas/subSchemas, virtuals,
    // and the cached compiled representation. Freezing both the source and the
    // snapshot keeps later structural edits rejected (not silently isolated)
    // while the snapshot stays the runtime authority. Nonstructural behavior
    // (methods, statics, pre/post hooks, queryHelpers) is intentionally left
    // mutable so existing hook/method registration keeps working.
    this.locked = true;
    this.getCompiledSchema();
    const snapshot = this.clone();
    snapshot.locked = true;
    snapshot.getCompiledSchema();
    freezeStructuralSchema(snapshot);
    freezeStructuralSchema(this);
    return snapshot;
  }

  getCompiledSchema(): CompiledSchemaRepresentation {
    if (!this.compiled) this.compiled = compileSchemaRepresentation(this.paths);
    return this.compiled;
  }

  toJSONSchema(): any {
    return clonePlain(this.getCompiledSchema().jsonSchema);
  }

  private assertNotLocked(action: string): void {
    if (this.locked)
      throw new SchemaConfigurationError(`Cannot ${action} after the schema has been compiled into a model.`);
  }
}

function compilePath(name: string, prop: any, parent: Schema<any, any, any, any>): CompiledPath {
  let options: SchemaTypeOptions = {};
  let typeDef: any = prop;

  if (prop && typeof prop === 'object' && !Array.isArray(prop) && prop instanceof Schema) {
    parent.childSchemas.push({ schema: prop });
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
    validatePathOptions(name, prop);
    options = prop as SchemaTypeOptions;
    typeDef = prop.type;
  } else if (isInlineNestedDefinition(prop)) {
    // BMRX-14: inline nested plain objects (for example
    // `{ profile: { name: String } }`) would compile to an unstructured
    // `object` without child casts, required checks, or generated properties,
    // contradicting validation and storage. Reject early instead of silently
    // accepting a shape that bypasses child semantics. Use an explicit child
    // `Schema` (`{ profile: childSchema }` or `{ profile: { type: childSchema } }`)
    // or explicit mixed (`{ profile: { type: Object } }`).
    throw new SchemaConfigurationError(
      `Inline nested definition for schema path "${name}" is not supported. Use an explicit child Schema (for example "{ ${name}: childSchema }") or explicit mixed ("{ ${name}: { type: Object } }").`,
    );
  }

  const { type, arrayItemType, arrayItemOptions, subSchema } = detectType(typeDef, parent);

  return {
    name,
    type,
    options,
    definition: prop,
    nested: false,
    isArray: type === 'array',
    arrayItemType,
    arrayItemOptions,
    subSchema,
  };
}

function detectType(
  typeDef: any,
  parent: Schema<any, any, any, any>,
): {
  type: PrimitiveType;
  arrayItemType?: PrimitiveType;
  arrayItemOptions?: SchemaTypeOptions;
  subSchema?: SchemaLike;
} {
  if (Array.isArray(typeDef)) {
    if (typeDef.length === 0) return { type: 'array' };
    const inner = typeDef[0];
    if (inner instanceof Schema) {
      parent.childSchemas.push({ schema: inner });
      return { type: 'array', subSchema: inner, arrayItemType: 'object' };
    }
    const item = compilePath('item', inner, parent);
    return { type: 'array', arrayItemType: item.type, arrayItemOptions: item.options, subSchema: item.subSchema };
  }
  if (typeDef instanceof Schema) {
    parent.childSchemas.push({ schema: typeDef });
    return { type: 'object', subSchema: typeDef };
  }
  if (typeDef === String) return { type: 'string' };
  if (typeDef === Number) return { type: 'number' };
  if (typeDef === Boolean) return { type: 'boolean' };
  if (typeDef === Date || typeDef === Date) return { type: 'date' };
  if (typeDef === Object || typeDef === (Object as any)) return { type: 'mixed' };
  if (typeof typeDef === 'object' && typeDef !== null) {
    // BMRX-14: a plain object in `type` position (for example
    // `{ profile: { type: { name: String } } }`) has the same unstructured
    // bypass as an inline nested definition. Reject instead of emitting an
    // unshaped `object` that skips child casts and required checks.
    if (isInlineNestedDefinition(typeDef)) {
      throw new SchemaConfigurationError(
        'Inline nested definition in schema "type" position is not supported. Use an explicit child Schema or explicit mixed ("{ type: Object }").',
      );
    }
    return { type: 'object' };
  }
  return { type: 'mixed' };
}

function compileSchemaRepresentation(paths: ReadonlyMap<string, CompiledPath>): CompiledSchemaRepresentation {
  const properties: Record<string, any> = {};
  const required: string[] = [];
  const indexes: string[][] = [];
  for (const [name, path] of paths) {
    properties[name] = pathTypeToJson(path, 'public');
    if (isPathRequired(path)) required.push(name);
    if (path.options.index === true) indexes.push([name]);
  }
  const jsonSchema: any = { type: 'object', properties: clonePlain(properties) };
  if (required.length) jsonSchema.required = [...required];
  return deepFreeze({
    paths,
    jsonSchema,
    rxProperties: Object.fromEntries(Array.from(paths, ([name, path]) => [name, pathTypeToJson(path, 'rx')])),
    required,
    indexes,
  });
}

function pathTypeToJson(path: CompiledPath, target: 'public' | 'rx'): any {
  switch (path.type) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'date':
      return target === 'rx'
        ? { type: 'string', format: 'date-time', maxLength: 50 }
        : { type: 'string', format: 'date-time' };
    case 'array':
      return {
        type: 'array',
        items: path.subSchema
          ? childSchemaJson(path.subSchema, target)
          : primitiveItemSchema(path.arrayItemType, target),
      };
    case 'object':
      return path.subSchema ? childSchemaJson(path.subSchema, target) : { type: 'object' };
    default:
      return { type: ['string', 'number', 'boolean', 'object', 'array', 'null'] };
  }
}

function childSchemaJson(schema: SchemaLike, target: 'public' | 'rx'): any {
  const compiled = schema.getCompiledSchema?.();
  if (!compiled) return schema.toJSONSchema?.() ?? { type: 'object' };
  const out: any = {
    type: 'object',
    properties: target === 'rx' ? clonePlain(compiled.rxProperties) : clonePlain(compiled.jsonSchema.properties),
  };
  if (compiled.required.length) out.required = [...compiled.required];
  return out;
}

function primitiveItemSchema(type: PrimitiveType | undefined, target: 'public' | 'rx'): any {
  switch (type) {
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'date':
      return target === 'rx'
        ? { type: 'string', format: 'date-time', maxLength: 50 }
        : { type: 'string', format: 'date-time' };
    case 'object':
      return { type: 'object' };
    case 'array':
      return { type: 'array' };
    case 'mixed':
    case undefined:
      return { type: ['string', 'number', 'boolean', 'object', 'array', 'null'] };
    default:
      return { type: 'string' };
  }
}

/**
 * BMRX-14 static required policy.
 *
 * Document validation evaluates `required` functions dynamically against the
 * owning document (root paths) or subdocument (nested paths), so absence is
 * allowed whenever the function returns false. A static JSON Schema / RxDB
 * `required` list cannot represent that condition, so function-valued
 * `required` (including `[fn, message]` form) is never emitted as an
 * unconditional storage requirement. Only static truthy requirements appear
 * in `required`.
 */
function isPathRequired(path: CompiledPath): boolean {
  const req = path.options.required;
  if (Array.isArray(req)) {
    const first = req[0];
    if (typeof first === 'function') return false;
    return !!first;
  }
  if (typeof req === 'function') return false;
  return !!req;
}

function isInlineNestedDefinition(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value instanceof Schema || value instanceof Date || value instanceof RegExp) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertValidPathName(name: string): void {
  if (typeof name !== 'string' || name.length === 0 || name.includes('.')) {
    throw new SchemaConfigurationError(
      `Unsupported schema path "${name}": dotted or empty path names are not supported. Define nested structure with an explicit child Schema.`,
    );
  }
}

function validateSchemaOptions(options: Record<string, any>): void {
  for (const key of Object.keys(options)) {
    if (!SUPPORTED_SCHEMA_OPTIONS.has(key)) {
      const detail =
        key === 'timestamps'
          ? 'Timestamps are not implemented; add createdAt/updatedAt fields and set them explicitly.'
          : key === 'versionKey'
            ? 'Version key behavior is not implemented.'
            : `Unsupported schema option: ${key}.`;
      throw new SchemaConfigurationError(detail);
    }
  }
}

function validatePathOptions(pathName: string, options: Record<string, any>): void {
  for (const key of Object.keys(options)) {
    if (!SUPPORTED_PATH_OPTIONS.has(key)) {
      throw new SchemaConfigurationError(
        UNSUPPORTED_PATH_OPTION_MESSAGES[key] ?? `Unsupported option "${key}" for schema path "${pathName}".`,
      );
    }
  }
}

function clonePath(path: CompiledPath): CompiledPath {
  return {
    ...path,
    options: clonePlain(path.options),
    subSchema: path.subSchema instanceof Schema ? path.subSchema.clone() : path.subSchema,
    arrayItemOptions: path.arrayItemOptions ? clonePlain(path.arrayItemOptions) : undefined,
  };
}

function cloneVirtual<T = any>(virtual: VirtualType<T>): VirtualType<T> {
  const copy: VirtualType<T> = {
    name: virtual.name,
    options: clonePlain(virtual.options),
    getter: virtual.getter,
    setter: virtual.setter,
    get(fn) {
      this.getter = fn;
      return this;
    },
    set(fn) {
      this.setter = fn;
      return this;
    },
  };
  return copy;
}

function cloneHook<T extends { fn: any; options?: any }>(hook: T): T {
  return { fn: hook.fn, options: hook.options ? clonePlain(hook.options) : hook.options } as T;
}

function cloneDefinition<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (value instanceof Schema) return value.clone() as T;
  if (Array.isArray(value)) return value.map(cloneDefinition) as T;
  if (value && typeof value === 'object') {
    if (value instanceof RegExp) return new RegExp(value.source, value.flags) as T;
    const out: Record<string, any> = {};
    for (const [key, nested] of Object.entries(value as Record<string, any>)) out[key] = cloneDefinition(nested);
    return out as T;
  }
  return value;
}

function clonePlain<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(clonePlain) as T;
  if (value && typeof value === 'object') {
    if (value instanceof RegExp) return new RegExp(value.source, value.flags) as T;
    const out: Record<string, any> = {};
    for (const [key, nested] of Object.entries(value as Record<string, any>)) out[key] = clonePlain(nested);
    return out as T;
  }
  return value;
}

function deepFreeze<T>(value: T, seen: Set<object> = new Set()): T {
  if (!value || typeof value !== 'object') return value;
  if (value instanceof RegExp || value instanceof Date) return value;
  // BMRX-12: never freeze live Schema instances via the compiled
  // representation. Structural freezing is owned by freezeStructuralSchema
  // (which keeps methods/hooks mutable); deepFreeze only handles the plain
  // JSON-ish compiled payload and must not make schema maps non-extensible
  // before throwing mutators are installed.
  if (value instanceof Schema) return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);
  if (value instanceof Map) {
    // Live path maps are frozen by freezeStructuralSchema (throwing mutators
    // + frozen entries). Object.freeze(map) would only make the map
    // non-extensible and block installing those mutators, so skip it here.
    return value;
  }
  if (value instanceof Set) {
    Object.freeze(value);
    for (const v of value as Set<unknown>) deepFreeze(v as unknown, seen);
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, any>)) deepFreeze(nested, seen);
  return value;
}

/**
 * BMRX-12 structural freeze.
 *
 * Makes the compiled (and source-after-compile) schema genuinely immutable
 * for structure: path entries, path options/enum, array item options,
 * schema options, definition top level, child schemas, virtuals, and the
 * paths map mutators. `Object.freeze` alone neither blocks `Map.set/delete`
 * nor freezes entries, so map mutators are replaced with throwing stubs and
 * property reassignment (`schema.paths = ...`, `schema.options = ...`) is
 * locked via non-writable instance properties. Methods, statics, hooks, and
 * queryHelpers stay mutable as intended nonstructural behavior.
 */
function freezeStructuralSchema(schema: Schema<any, any, any, any>, seen: Set<object> = new Set()): void {
  if (seen.has(schema)) return;
  seen.add(schema);
  for (const [, path] of schema.paths) freezeCompiledPath(path, seen);
  freezeMapMutators(schema.paths, 'schema paths');
  for (const [, virtual] of schema.virtuals) {
    if (virtual && typeof virtual === 'object') {
      if ((virtual as any).options && typeof (virtual as any).options === 'object') {
        Object.freeze((virtual as any).options);
      }
      Object.freeze(virtual);
    }
  }
  freezeMapMutators(schema.virtuals as unknown as Map<string, any>, 'schema virtuals');
  if (schema.options && typeof schema.options === 'object') Object.freeze(schema.options);
  if (schema.definition && typeof schema.definition === 'object') Object.freeze(schema.definition);
  if (Array.isArray(schema.childSchemas)) {
    for (const entry of schema.childSchemas) {
      const child = (entry as { schema?: unknown }).schema;
      if (child instanceof Schema) freezeStructuralSchema(child, seen);
    }
    Object.freeze(schema.childSchemas);
  }
  if ((schema as unknown as { compiled?: unknown }).compiled)
    deepFreeze((schema as unknown as { compiled?: unknown }).compiled, seen);
  lockSchemaProperty(schema, 'paths');
  lockSchemaProperty(schema, 'options');
  lockSchemaProperty(schema, 'definition');
  lockSchemaProperty(schema, 'childSchemas');
  lockSchemaProperty(schema, 'virtuals');
  lockSchemaProperty(schema as object, 'compiled');
}

function freezeCompiledPath(path: CompiledPath, seen: Set<object>): void {
  if (!path || typeof path !== 'object' || seen.has(path as object)) return;
  seen.add(path as object);
  if (path.options && typeof path.options === 'object') {
    const enumValue = (path.options as { enum?: unknown }).enum;
    if (Array.isArray(enumValue)) Object.freeze(enumValue);
    Object.freeze(path.options);
  }
  if (path.arrayItemOptions && typeof path.arrayItemOptions === 'object') {
    const enumValue = (path.arrayItemOptions as { enum?: unknown }).enum;
    if (Array.isArray(enumValue)) Object.freeze(enumValue);
    Object.freeze(path.arrayItemOptions);
  }
  const sub = (path as { subSchema?: unknown }).subSchema;
  if (sub instanceof Schema) freezeStructuralSchema(sub, seen);
  Object.freeze(path);
}

function freezeMapMutators(map: Map<string, any>, label: string): void {
  const existing = Object.getOwnPropertyDescriptor(map, 'set');
  if (existing && existing.configurable === false) return;
  const reject = () => {
    throw new SchemaConfigurationError(`Cannot modify ${label} after the schema has been compiled into a model.`);
  };
  Object.defineProperty(map, 'set', { value: reject, writable: false, configurable: false, enumerable: false });
  Object.defineProperty(map, 'delete', { value: reject, writable: false, configurable: false, enumerable: false });
  Object.defineProperty(map, 'clear', { value: reject, writable: false, configurable: false, enumerable: false });
}

function lockSchemaProperty(schema: object, prop: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(schema, prop);
  if (!descriptor || descriptor.configurable === false) return;
  Object.defineProperty(schema, prop, { writable: false, configurable: false });
}

export default Schema;
