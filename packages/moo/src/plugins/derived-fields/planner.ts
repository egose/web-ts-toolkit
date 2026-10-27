import { DerivedFieldsDependencyError, type DerivedFieldDependencyIssue } from './definitions';
import type { DerivedFieldsRegistration, RegisteredDerivedField } from './registration';

export interface DerivedFieldsPlanningDocument {
  readonly isNew: boolean;
  isModified(path: string): boolean;
  isDirectModified(path: string): boolean;
  isDirectSelected(path: string): boolean;
  /**
   * Mongoose 8/9 metadata: selection alone is too broad for dotted/operator
   * projections, and isDirectModified() also includes relative numeric $inc().
   * Reading these avoids getChanges(), which can mutate versioning state.
   */
  readonly $__?: {
    readonly selected?: Record<string, unknown>;
    readonly primitiveAtomics?: Record<string, unknown>;
  };
}

export interface DerivedFieldsPlan {
  /** Fully preflighted fields, in schema order. No getters have run. */
  readonly fields: readonly RegisteredDerivedField[];
  /** Allowlist for the isolated plain input snapshot; omit unavailable defaults. */
  readonly availablePaths: readonly string[];
  /**
   * Full in-memory replacements, including those supplied by the caller. A
   * lifecycle owner can retain these after save resets Mongoose's dirty state.
   */
  readonly replacedPaths: readonly string[];
}

export interface DerivedFieldsPlanningOptions {
  /** Previously observed full replacements on this same hydrated document. */
  readonly knownReplacedPaths?: ReadonlySet<string>;
  /** Actual pending writes (for example non-null defaults), not proof of availability. */
  readonly pendingWritePaths?: ReadonlySet<string>;
}

const hasOwn = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

export const isFullySelected = (document: DerivedFieldsPlanningDocument, path: string) => {
  const projection = document.$__?.selected;
  if (projection) {
    // Computed/operator projections must not masquerade as persisted inputs.
    if (hasOwn(projection, path) && projection[path] !== 1 && projection[path] !== true) return false;
    const keys = Object.keys(projection);
    if (keys.some((key) => key.startsWith(`${path}.`))) return false;
    // Mongoose's _id special cases compare to numeric 0, not boolean false.
    if (path !== '_id' && keys.length === 1 && projection._id === false) return true;
  }
  return document.isDirectSelected(path);
};

/**
 * Plan without reading values, running getters, assigning results, or doing I/O.
 * All scheduled fields are preflighted together, so a later missing dependency
 * cannot be discovered after an earlier getter has already run.
 */
export function planDerivedFields(
  registration: DerivedFieldsRegistration,
  document: DerivedFieldsPlanningDocument,
  options: DerivedFieldsPlanningOptions = {},
): DerivedFieldsPlan {
  const replacedPaths = registration.inputPaths.filter(
    (path) =>
      options.knownReplacedPaths?.has(path) ||
      (document.isDirectModified(path) && !document.$__?.primitiveAtomics?.[path]),
  );
  const replacements = new Set(replacedPaths);
  const availablePaths = registration.inputPaths.filter(
    (path) => document.isNew || replacements.has(path) || isFullySelected(document, path),
  );
  const available = new Set(availablePaths);
  const fields = registration.fields.filter(
    (field) =>
      document.isNew ||
      field.mode === 'always' ||
      document.isDirectModified(field.targetPath) ||
      options.pendingWritePaths?.has(field.targetPath) ||
      field.dependsOn.some((path) => document.isModified(path) || options.pendingWritePaths?.has(path)),
  );
  const issues: DerivedFieldDependencyIssue[] = [];
  for (const field of fields) {
    const dependencies = field.mode === 'always' ? registration.inputPaths : field.dependsOn;
    const missingPaths = dependencies.filter((path) => !available.has(path));
    if (missingPaths.length) issues.push({ targetPath: field.targetPath, missingPaths });
  }
  if (issues.length) throw new DerivedFieldsDependencyError(issues);

  return Object.freeze({
    fields: Object.freeze(fields),
    availablePaths: Object.freeze(availablePaths),
    replacedPaths: Object.freeze(replacedPaths),
  });
}
