import type { Schema, SchemaType } from 'mongoose';

import type { DerivedFieldGetter } from './definitions';

// Binary/UUID, BSON Double/Int32, custom kinds, and all containers are outside
// this initial contract. Keep the allowlist explicit for shorthand and views.
export const supportedDerivedFieldTypes = Object.freeze([
  'String',
  'Number',
  'Boolean',
  'Date',
  'ObjectId',
  'Decimal128',
  'BigInt',
] as const);

export interface RegisteredDerivedField {
  readonly targetPath: string;
  readonly mode: 'dependencies' | 'always';
  readonly dependsOn: readonly string[];
  readonly get: DerivedFieldGetter<Record<string, unknown>, unknown>;
}

export interface DerivedFieldsRegistration {
  readonly fields: readonly RegisteredDerivedField[];
  /** Supported root scalar non-derived inputs, excluding the managed version key. */
  readonly inputPaths: readonly string[];
}

type DiscoverableSchemaType = SchemaType & {
  $immutable?: unknown;
  // Mongoose 8's older minors use these instead of getEmbeddedSchemaType().
  caster?: SchemaType;
  $embeddedSchemaType?: SchemaType;
  $__schemaType?: SchemaType;
  /** Mongoose 9 Union members are not returned by getEmbeddedSchemaType(). */
  schemaTypes?: readonly SchemaType[];
};

// Shared by bundled root/grouped/direct entrypoints, not just one module copy.
const registrationKey = Symbol.for('@web-ts-toolkit/moo/derived-fields/registration');
const hasOwn = (object: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(object, key);
const isRootPath = (path: string) => path.length > 0 && !/[.\s$\0]/.test(path);
const isSupportedPath = (path: string, type: SchemaType) =>
  isRootPath(path) && (supportedDerivedFieldTypes as readonly string[]).includes(type.instance);

const configurationError = (targetPath: string, reason: string): never => {
  throw new TypeError(`derivedFieldsPlugin target ${JSON.stringify(targetPath)}: ${reason}`);
};

const parseDefinition = (targetPath: string, value: unknown): RegisteredDerivedField => {
  if (typeof value === 'function') {
    return Object.freeze({
      targetPath,
      mode: 'always',
      dependsOn: Object.freeze([]),
      get: value as RegisteredDerivedField['get'],
    });
  }

  if (
    value === null ||
    typeof value !== 'object' ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    return configurationError(targetPath, 'derived must be a getter function or a plain { dependsOn, get } descriptor');
  }
  if (
    Reflect.ownKeys(value).some((key) => key !== 'dependsOn' && key !== 'get') ||
    !hasOwn(value, 'dependsOn') ||
    !hasOwn(value, 'get')
  ) {
    return configurationError(targetPath, 'derived descriptors require exactly dependsOn and get');
  }

  const descriptor = value as { dependsOn: unknown; get: unknown };
  if (!Array.isArray(descriptor.dependsOn) || typeof descriptor.get !== 'function') {
    return configurationError(targetPath, 'dependsOn must be an array of root path names and get must be a function');
  }
  const dependencies: string[] = [];
  for (const dependency of descriptor.dependsOn) {
    if (typeof dependency !== 'string' || !isRootPath(dependency)) {
      return configurationError(
        targetPath,
        'dependsOn must contain only non-empty root path names (no dots, whitespace, or $)',
      );
    }
    if (dependencies.includes(dependency)) {
      return configurationError(targetPath, `duplicate dependency path ${JSON.stringify(dependency)}`);
    }
    dependencies.push(dependency);
  }

  return Object.freeze({
    targetPath,
    mode: 'dependencies',
    dependsOn: Object.freeze(dependencies),
    get: descriptor.get as RegisteredDerivedField['get'],
  });
};

/**
 * Validate and snapshot once at plugin registration. No middleware or model is
 * created here. A failed configuration may be corrected and registered again;
 * a successful registration cannot be repeated, even when it found no fields.
 */
export function registerDerivedFields(schema: Schema): DerivedFieldsRegistration {
  const markedSchema = schema as Schema & { [registrationKey]?: DerivedFieldsRegistration };
  if (hasOwn(markedSchema, registrationKey)) {
    throw new TypeError('derivedFieldsPlugin is already registered on this schema');
  }

  const fields: RegisteredDerivedField[] = [];
  // Mongoose initializes/increments this after pre-save middleware. It cannot
  // be a derived target or a reliable input, even when explicitly schema-defined.
  const versionKey = schema.options.versionKey;
  const visitSchema = (current: Schema, prefix: string, ancestors: ReadonlySet<Schema>) => {
    // Check local paths even on recursive schemas before stopping recursion.
    current.eachPath((path, type: DiscoverableSchemaType) => {
      const fullPath = `${prefix}${path}`;
      if (!hasOwn(type.options, 'derived')) return;
      if (prefix || !isSupportedPath(path, type)) {
        configurationError(
          fullPath,
          `only root scalar persisted paths are supported (${supportedDerivedFieldTypes.join(', ')})`,
        );
      }
      if (path === versionKey) {
        configurationError(
          fullPath,
          `Mongoose-managed version key ${JSON.stringify(versionKey)} cannot be a derived target`,
        );
      }
      if (path === '_id' || (type.$immutable ?? type.options.immutable)) {
        configurationError(fullPath, 'immutable targets are not supported');
      }
      fields.push(parseDefinition(fullPath, type.options.derived));
    });
    const virtuals = current.virtuals as Record<string, { options: object }>;
    for (const [path, virtual] of Object.entries(virtuals)) {
      if (hasOwn(virtual.options, 'derived')) {
        configurationError(`${prefix}${path}`, 'derived targets must be persisted schema paths, not virtuals');
      }
    }
    if (ancestors.has(current)) return;
    const nextAncestors = new Set([...ancestors, current]);

    const visitEmbedded = (type: DiscoverableSchemaType, path: string) => {
      if (type.schema) {
        visitSchema(type.schema, `${path}.`, nextAncestors);
        return;
      }
      for (const member of type.schemaTypes ?? []) {
        if (hasOwn(member.options, 'derived')) {
          configurationError(path, 'derived targets inside union containers are not supported');
        }
        visitEmbedded(member, path);
      }
      const embedded = type.getEmbeddedSchemaType?.() ?? type.caster ?? type.$embeddedSchemaType ?? type.$__schemaType;
      if (!embedded || embedded === type) return;
      const embeddedPath = `${path}.${type.instance === 'Map' ? '$*' : '$'}`;
      if (hasOwn(embedded.options, 'derived')) {
        configurationError(embeddedPath, 'derived targets inside containers are not supported');
      }
      visitEmbedded(embedded, embeddedPath);
    };
    current.eachPath((path, type) => visitEmbedded(type, `${prefix}${path}`));
  };
  visitSchema(schema, '', new Set());

  const targets = new Set(fields.map((field) => field.targetPath));
  for (const field of fields) {
    for (const dependency of field.dependsOn) {
      if (dependency === versionKey) {
        configurationError(
          field.targetPath,
          `Mongoose-managed version key ${JSON.stringify(versionKey)} cannot be a dependency`,
        );
      }
      if (targets.has(dependency)) {
        configurationError(
          field.targetPath,
          `dependency path ${JSON.stringify(dependency)} is itself a derived target`,
        );
      }
      const type = schema.path(dependency);
      if (!type) {
        configurationError(field.targetPath, `unknown or non-persisted dependency path ${JSON.stringify(dependency)}`);
      }
      if (!isSupportedPath(dependency, type)) {
        configurationError(
          field.targetPath,
          `dependency path ${JSON.stringify(dependency)} must be a supported root scalar persisted path`,
        );
      }
    }
  }

  const inputPaths: string[] = [];
  schema.eachPath((path, type) => {
    if (path !== versionKey && !targets.has(path) && isSupportedPath(path, type)) inputPaths.push(path);
  });
  const registration = Object.freeze({ fields: Object.freeze(fields), inputPaths: Object.freeze(inputPaths) });
  Object.defineProperty(markedSchema, registrationKey, { value: registration });
  return registration;
}
