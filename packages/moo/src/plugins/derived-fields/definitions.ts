/**
 * A partial plain persisted-model view, not a hydrated document. Only available,
 * supported root scalar inputs are supplied; virtuals, populated documents,
 * containers, derived targets, and Mongoose's managed version key are not inputs.
 * Use the raw model type for `TModel`. Selected defaults are available; genuine
 * selected absence is `undefined` and stored `null` is known. Defaults applied to
 * unselected fields never prove availability, even when pending a write.
 * Dates/ObjectIds/Decimal128s are copied per invocation; property getters/
 * transforms are bypassed.
 * Never mutate the hydrated document through a captured reference.
 */
export type DerivedFieldInput<TModel> = Readonly<Partial<TModel>>;

/** Sync/async computation with no document `this`; `undefined` clears the target. */
export type DerivedFieldGetter<TModel, TValue> = (
  this: void,
  doc: DerivedFieldInput<TModel>,
) => TValue | undefined | Promise<TValue | undefined>;

/**
 * Declare every source read by `get`. Existing documents skip when no dependency
 * modification/default write or target assignment/default write requests work.
 * Pending non-null defaults count even without Mongoose modification flags;
 * null/undefined defaults alone do not write. Every requested computation requires
 * all dependencies selected or fully replaced; excluded defaults are not replacements.
 * The Mongoose-managed version key is not a supported dependency or target.
 */
export interface DerivedFieldDescriptor<TModel, TValue> {
  readonly dependsOn: readonly Extract<keyof TModel, string>[];
  readonly get: DerivedFieldGetter<TModel, TValue>;
}

/**
 * The `derived` schema-path option. A bare getter recomputes on every operation
 * and requires every supported non-derived schema input to be available.
 */
export type DerivedFieldDefinition<TModel, TValue> =
  | DerivedFieldDescriptor<TModel, TValue>
  | DerivedFieldGetter<TModel, TValue>;

/**
 * Contextually types a `derived` option without augmenting Mongoose globally.
 * The second type argument is the target's key in the raw persisted model, so
 * dependency names, getter input, and the target's result type are checked.
 * Schema registration separately checks runtime path eligibility.
 *
 * @example
 * type User = { firstName: string; lastName: string; fullName: string };
 * const derived = defineDerivedField<User, 'fullName'>({
 *   dependsOn: ['firstName', 'lastName'],
 *   get: (doc) => `${doc.firstName ?? ''} ${doc.lastName ?? ''}`.trim(),
 * });
 */
export function defineDerivedField<TModel, TTargetKey extends Extract<keyof TModel, string>>(
  definition: DerivedFieldDescriptor<TModel, TModel[TTargetKey]>,
): DerivedFieldDescriptor<TModel, TModel[TTargetKey]>;
export function defineDerivedField<TModel, TTargetKey extends Extract<keyof TModel, string>>(
  definition: DerivedFieldGetter<TModel, TModel[TTargetKey]>,
): DerivedFieldGetter<TModel, TModel[TTargetKey]>;
export function defineDerivedField<TModel, TTargetKey extends Extract<keyof TModel, string>>(
  definition: DerivedFieldDefinition<TModel, TModel[TTargetKey]>,
): DerivedFieldDefinition<TModel, TModel[TTargetKey]>;
export function defineDerivedField<TModel, TTargetKey extends Extract<keyof TModel, string>>(
  definition: DerivedFieldDefinition<TModel, TModel[TTargetKey]>,
): DerivedFieldDefinition<TModel, TModel[TTargetKey]> {
  return definition;
}

/** One target's unavailable dependency paths; never includes source values. */
export interface DerivedFieldDependencyIssue {
  readonly targetPath: string;
  readonly missingPaths: readonly string[];
}

/**
 * Raised by dependency preflight before any getter runs. `issues` lists every
 * scheduled target with missing inputs. No implicit database fetch is attempted.
 */
export class DerivedFieldsDependencyError extends Error {
  /** Stable discriminator, including across separately bundled entrypoints. */
  readonly code = 'MOO_DERIVED_FIELDS_MISSING_DEPENDENCIES' as const;
  /** Frozen path-only issues; no source values or hydrated document are attached. */
  readonly issues: readonly DerivedFieldDependencyIssue[];

  constructor(issues: readonly DerivedFieldDependencyIssue[]) {
    const snapshot = Object.freeze(
      issues.map(({ targetPath, missingPaths }) =>
        Object.freeze({ targetPath, missingPaths: Object.freeze([...missingPaths]) }),
      ),
    );
    const details = snapshot
      .map(
        ({ targetPath, missingPaths }) =>
          `${JSON.stringify(targetPath)} requires ${missingPaths.map((path) => JSON.stringify(path)).join(', ')}`,
      )
      .join('; ');
    super(`derivedFieldsPlugin missing dependencies: ${details}`);
    this.name = 'DerivedFieldsDependencyError';
    this.issues = snapshot;
  }
}
