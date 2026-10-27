/** Package-private D2 validation/capture. Terminal persisted inputs, never output grants or target I/O. */
import type { Model, Schema, SchemaType } from 'mongoose';
import { get, isPlainObject } from '@web-ts-toolkit/utils';
import type { AccessRuntime } from '../runtime';
import type { GlobalOptions, ModelRouterOptions, Projection } from '../interfaces';
import { normalizeSelect } from '../helpers/query';
import { resolveNestedOption } from '../options/manager';
import { copyAuthorizationValue } from './authorization-snapshot';
import { captureAuthorizationFieldCatalog, isSafeInputPath } from './field-catalog';
import type { AuthorizationConfiguration } from './service-authorization';
import { isVirtualContainerValue, resolveSnapshotDescriptor } from './virtual-descriptor';
import { capturePopulateTargetConfiguration } from './populate-target-configuration';

type StoredType = SchemaType & {
  schema?: Schema;
  caster?: StoredType;
  $embeddedSchemaType?: StoredType;
  embeddedSchemaType?: StoredType;
};
type ScopedSchema = Schema & {
  aliases?: Record<string, string>;
  discriminators?: Record<string, Schema>;
  discriminatorMapping?: { isRoot: boolean };
};
const elementType = (type: StoredType) => type.$embeddedSchemaType ?? type.embeddedSchemaType ?? type.caster;
const join = (prefix: string, path: string) => (prefix ? `${prefix}.${path}` : path);
const within = (path: string, parent: string) => path === parent || path.startsWith(`${parent}.`);
const accesses = ['default', 'list', 'create', 'read', 'update'] as const;
const fail = (label: string, message: string): never => {
  throw new Error(`Virtual ${label}: dependsOnPopulate ${message}`);
};
const varyingSchema = (schema: ScopedSchema) =>
  Object.keys(schema.discriminators ?? {}).length > 0 || schema.discriminatorMapping?.isRoot === false;
const varyingModel = (model: Model<unknown>) =>
  !!model.baseModelName || Object.keys(model.discriminators ?? {}).length > 0 || varyingSchema(model.schema);

export interface VirtualPopulateTarget {
  /** Stable per-capture identity for grouping even when native policy values are copied on read. */
  readonly identity: object;
  readonly runtime: AccessRuntime;
  readonly modelName: string;
  readonly model: Model<unknown>;
  /** Binding identity only. Execution uses the owned catalog/selections, not live schema inspection. */
  readonly schema: Schema;
  /** Terminal read policy: no target virtual registry or private dependency graph. */
  readonly configuration: AuthorizationConfiguration;
}

export interface CapturedVirtualPopulateDependency {
  /** Scope-local path and absolute persisted source path (no `.sub` markers). */
  readonly path: string;
  readonly sourcePath: string;
  readonly cardinality: 'scalar' | 'array';
  readonly target: VirtualPopulateTarget;
  /** Eligible leaf mask for this getter only; never a public output selection. */
  readonly selection: readonly string[];
  /** Positive persisted paths, including association identity even for `-_id`. */
  readonly fetchSelection: readonly string[];
  readonly includeId: boolean;
}

interface CapturedVirtualPopulateScope {
  readonly scopePath: readonly string[];
  readonly virtualName: string;
  readonly byAccess: Readonly<Record<string, readonly CapturedVirtualPopulateDependency[]>>;
}
export interface VirtualPopulateSnapshot {
  readonly scopes: readonly CapturedVirtualPopulateScope[];
}

/**
 * An opaque function identity survives configuration copying without copying a
 * Mongoose schema/runtime graph. Bindings live only here, not on DTOs or handles.
 */
export type VirtualPopulateSnapshotToken = () => void;
const snapshots = new WeakMap<VirtualPopulateSnapshotToken, VirtualPopulateSnapshot>();

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) return fail(label, 'entries must be plain { path, select? } objects');
  // Do not allow getters/symbol keys to change a declaration between validation and capture.
  for (const key of Reflect.ownKeys(value as object)) {
    const property = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !property.enumerable || !('value' in property))
      fail(label, 'requires enumerable data properties');
  }
  return value as Record<string, unknown>;
}

/** Only static persisted leaves can be copied. Containers are expanded, never copied wholesale. */
function targetSelectionCatalog(schema: Schema, options: ModelRouterOptions) {
  const leaves = new Set<string>();
  const containers = new Set<string>();
  const forbidden = new Set<string>([options.documentPermissionField ?? '_permissions']);
  const visit = (current: Schema, prefix: string, active: Set<Schema>) => {
    const version = current.options.versionKey;
    if (typeof version === 'string') forbidden.add(join(prefix, version));
    for (const name of Object.keys(current.virtuals)) forbidden.add(join(prefix, name));
    for (const name of Object.keys((current as ScopedSchema).aliases ?? {})) forbidden.add(join(prefix, name));
    for (const [name, raw] of Object.entries(current.paths)) {
      const path = join(prefix, name);
      if (!isSafeInputPath(path, true)) continue;
      const parts = path.split('.');
      for (let n = 1; n < parts.length; n++) containers.add(parts.slice(0, n).join('.'));
      let type = raw as StoredType;
      while (type.instance === 'Array' && elementType(type)) type = elementType(type)!;
      if (type.instance === 'Mixed' || type.instance === 'Map') {
        forbidden.add(path);
        continue;
      }
      const child = type.schema ?? (raw as StoredType).schema;
      if (
        raw.options?.ref !== undefined ||
        raw.options?.refPath !== undefined ||
        type.options?.ref !== undefined ||
        type.options?.refPath !== undefined
      ) {
        // References are identity leaves. A schema-bearing ref container cannot
        // be copied as an ID and must not become an implicit ref traversal.
        if (child) forbidden.add(path);
        else leaves.add(path);
        continue;
      }
      if (child) {
        if (active.has(child) || varyingSchema(child)) forbidden.add(path);
        else {
          containers.add(path);
          visit(child, path, new Set([...active, child]));
        }
      } else leaves.add(path); // Includes stored refs as identity values, never traversed.
    }
  };
  visit(schema, '', new Set([schema]));
  const visitVirtuals = (virtuals: Record<string, unknown>, prefix: string) => {
    for (const [name, entry] of Object.entries(virtuals)) {
      if (entry === undefined) continue;
      const path = join(prefix, name);
      if (isVirtualContainerValue(entry)) visitVirtuals(entry.sub, path);
      else forbidden.add(path);
    }
  };
  visitVirtuals((options.virtuals ?? {}) as Record<string, unknown>, '');
  const allowed = (path: string) => ![...forbidden].some((blocked) => within(path, blocked));
  return {
    leaves: [...leaves].filter(allowed).sort(),
    paths: new Set([...leaves, ...containers].filter(allowed)),
  };
}

function normalizeSelection(select: unknown, catalog: ReturnType<typeof targetSelectionCatalog>, label: string) {
  if (select !== undefined && typeof select !== 'string') {
    if (Array.isArray(select)) {
      if (Array.from(select).some((token) => typeof token !== 'string')) fail(label, 'select arrays require strings');
    } else {
      const projection = record(select, label);
      for (const [path, value] of Object.entries(projection)) {
        if (!isSafeInputPath(path, true) || (value !== 1 && value !== -1))
          fail(label, 'select objects require safe persisted paths with 1/-1 values');
      }
    }
  }
  const tokens = normalizeSelect(select as Projection);
  for (const token of tokens) {
    const path = token.startsWith('-') ? token.slice(1) : token;
    if (!isSafeInputPath(path, true) || !catalog.paths.has(path))
      fail(label, `select path "${path}" is not an eligible static persisted target path`);
  }
  const positive = tokens.filter((token) => !token.startsWith('-'));
  const negative = tokens.filter((token) => token.startsWith('-')).map((token) => token.slice(1));
  const selection = catalog.leaves.filter(
    (path) =>
      (path === '_id' || positive.length === 0 || positive.some((included) => within(path, included))) &&
      !negative.some((excluded) => within(path, excluded)),
  );
  return {
    selection: Object.freeze(selection),
    fetchSelection: Object.freeze([...new Set(['_id', ...selection])].sort()),
    includeId: selection.includes('_id'),
  };
}

/** Shared by eager option validation and synchronous operation capture; never follows target declarations. */
export function captureVirtualPopulateDependencies(
  runtime: AccessRuntime,
  modelName: string,
  options: ModelRouterOptions,
  globalOptions: GlobalOptions = runtime.getGlobalOptions(),
): VirtualPopulateSnapshot {
  // Normalize once for every target/scope. Only an explicit false is an opt-in.
  const requireOperationAccessForPopulateDependencies =
    globalOptions.requireOperationAccessForPopulateDependencies !== false;
  const requireOperationAccessForPopulateQueries = globalOptions.requireOperationAccessForPopulateQueries !== false;
  const model = runtime.getModelInstance(modelName);
  const targets = new Map<
    string,
    { target: VirtualPopulateTarget; catalog: ReturnType<typeof targetSelectionCatalog> }
  >();
  const scopes: CapturedVirtualPopulateScope[] = [];
  const visit = (
    virtuals: Record<string, unknown>,
    schema: Schema | undefined,
    schemaPrefix: string,
    scopePath: string[],
    unsupportedScope: boolean,
  ) => {
    const sourcePrefix = scopePath.filter((_, index) => index % 2 === 0).join('.');
    const captureList = (value: unknown, label: string): readonly CapturedVirtualPopulateDependency[] => {
      if (value === undefined) return Object.freeze([]);
      if (!Array.isArray(value)) return fail(label, 'must be an array');
      const seen = new Set<string>();
      return Object.freeze(
        Array.from(value, (entry) => {
          const dependency = record(entry, label);
          if (Object.keys(dependency).some((key) => key !== 'path' && key !== 'select'))
            fail(label, 'accepts only path/select');
          const path = dependency.path;
          if (typeof path !== 'string' || path.includes('.') || !isSafeInputPath(path, true))
            return fail(label, 'path must be a safe scope-local persisted reference key');
          if (seen.has(path)) fail(label, `duplicate path "${path}"`);
          seen.add(path);
          if (
            within(join(sourcePrefix, path), options.documentPermissionField ?? '_permissions') ||
            path === schema?.options.versionKey
          )
            fail(label, 'source permission metadata/version paths are not reference inputs');
          if (!model || !schema || unsupportedScope)
            return fail(label, 'requires a static embedded, non-discriminator source scope');
          const type = schema.path(join(schemaPrefix, path)) as StoredType | undefined;
          const isArray = type?.instance === 'Array';
          const scalar = type && (isArray ? elementType(type) : type);
          const ref = type?.options?.ref ?? scalar?.options?.ref;
          if (
            !scalar ||
            scalar.instance !== 'ObjectId' ||
            typeof ref !== 'string' ||
            !ref ||
            type?.options?.refPath !== undefined ||
            scalar.options?.refPath !== undefined
          )
            return fail(label, `path "${path}" requires a static string ref on an ObjectId scalar or 1D array`);
          let captured = targets.get(ref);
          if (!captured) {
            if (ref !== modelName && !runtime.hasModel(ref))
              return fail(label, `target "${ref}" must be configured first in this runtime`);
            const targetModel = runtime.getModelInstance(ref);
            if (
              !targetModel ||
              targetModel.db !== model.db ||
              model.db.models[ref] !== targetModel ||
              varyingModel(targetModel) ||
              targetModel.schema.path('_id')?.instance !== 'ObjectId'
            )
              return fail(
                label,
                `target "${ref}" requires a registered same-connection non-discriminator ObjectId model bound to the source ref`,
              );
            const { options: targetOptions } = capturePopulateTargetConfiguration(
              runtime,
              ref,
              `dependsOnPopulate virtual "${label}"`,
              ref === modelName ? options : undefined,
            );
            const defaults = runtime.getDefaultModelOptions();
            const readOption = (key: string) =>
              resolveNestedOption((path, fallback) => get(targetOptions, path, fallback), key, get(defaults, key));
            const documentPermissionField = targetOptions.documentPermissionField ?? defaults.documentPermissionField;
            const catalog = captureAuthorizationFieldCatalog(targetModel.schema, undefined, documentPermissionField);
            const configuration = copyAuthorizationValue(
              {
                catalog,
                documentPermissionField,
                requireOperationAccessForPopulateDependencies,
                requireOperationAccessForPopulateQueries,
                permissionSchema: targetOptions.permissionSchema,
                operationAccess: { read: readOption('operationAccess.read') },
                baseFilter: { read: readOption('baseFilter.read') },
                overrideFilter: { read: readOption('overrideFilter.read') },
                hydration: targetOptions.hydration,
              },
              true,
            );
            captured = {
              target: Object.freeze({
                identity: Object.freeze({}),
                runtime,
                modelName: ref,
                model: targetModel,
                schema: targetModel.schema,
                configuration,
              }),
              catalog: targetSelectionCatalog(targetModel.schema, { ...targetOptions, documentPermissionField }),
            };
            targets.set(ref, captured);
          }
          return Object.freeze({
            path,
            sourcePath: join(sourcePrefix, path),
            cardinality: isArray ? ('array' as const) : ('scalar' as const),
            target: captured.target,
            ...normalizeSelection(dependency.select, captured.catalog, label),
          });
        }),
      );
    };
    for (const [name, raw] of Object.entries(virtuals)) {
      if (isVirtualContainerValue(raw)) {
        const path = join(schemaPrefix, name);
        const type = schema?.path(path) as StoredType | undefined;
        const element = type && elementType(type);
        const child = type?.schema ?? element?.schema;
        const nonEmbedded = [type, element].some(
          (entry) =>
            entry &&
            (entry.options?.ref !== undefined ||
              entry.options?.refPath !== undefined ||
              entry.instance === 'Map' ||
              entry.instance === 'Mixed'),
        );
        visit(
          raw.sub,
          child ?? schema,
          child ? '' : path,
          [...scopePath, name, 'sub'],
          unsupportedScope || nonEmbedded || !!(child && varyingSchema(child)),
        );
        continue;
      }
      if (!isPlainObject(raw)) continue;
      const entry = raw as Record<string, unknown>;
      const label = join(sourcePrefix, name);
      // Shared and every access leaf are validated, even when an override makes one unused.
      captureList(entry.dependsOnPopulate, label);
      if (!('get' in entry))
        for (const access of accesses) {
          if (isPlainObject(entry[access]))
            captureList((entry[access] as Record<string, unknown>).dependsOnPopulate, `${label}.${access}`);
        }
      const byAccess: Record<string, readonly CapturedVirtualPopulateDependency[]> = {};
      let declared = false;
      for (const access of accesses) {
        const descriptor = resolveSnapshotDescriptor(virtuals, name, access);
        if (descriptor) {
          // An exact getter without a declaration must not fall through to the
          // default getter's private inputs. Record its explicit empty plan.
          byAccess[access] = captureList(descriptor.dependsOnPopulate, `${label}.${access}`);
          declared ||= descriptor.dependsOnPopulate !== undefined;
        }
      }
      if (declared)
        scopes.push(
          Object.freeze({
            scopePath: Object.freeze([...scopePath]),
            virtualName: name,
            byAccess: Object.freeze(byAccess),
          }),
        );
    }
  };
  visit((options.virtuals ?? {}) as Record<string, unknown>, model?.schema, '', [], !!model && varyingModel(model));
  return Object.freeze({ scopes: Object.freeze(scopes) });
}

export function captureVirtualPopulateSnapshot(
  runtime: AccessRuntime,
  modelName: string,
  options: ModelRouterOptions,
  globalOptions: GlobalOptions = runtime.getGlobalOptions(),
): VirtualPopulateSnapshotToken {
  const snapshot = captureVirtualPopulateDependencies(runtime, modelName, options, globalOptions);
  const token = () => {};
  snapshots.set(token, snapshot);
  return token;
}

/** Resolve only captured data. No registry lookups, target finalization or recursive capture. */
export function resolveVirtualPopulateDependencies(
  configuration: AuthorizationConfiguration,
  scopePath: readonly string[],
  virtualName: string,
  access: string,
): readonly CapturedVirtualPopulateDependency[] {
  const snapshot = configuration.virtualPopulateSnapshot && snapshots.get(configuration.virtualPopulateSnapshot);
  const scope = snapshot?.scopes.find(
    (entry) =>
      entry.virtualName === virtualName &&
      entry.scopePath.length === scopePath.length &&
      entry.scopePath.every((part, index) => part === scopePath[index]),
  );
  const dependencies = scope?.byAccess[access] ?? scope?.byAccess.default ?? [];
  // Detach native-valued policy inputs on reads, while retaining exact model/schema bindings.
  return Object.freeze(
    dependencies.map((dependency) =>
      Object.freeze({
        ...dependency,
        target: Object.freeze({
          ...dependency.target,
          configuration: copyAuthorizationValue(dependency.target.configuration, true),
        }),
      }),
    ),
  );
}
