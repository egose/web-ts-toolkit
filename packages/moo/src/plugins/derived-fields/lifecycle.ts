import { isDeepStrictEqual } from 'node:util';
import { Document, type Error as MongooseError, type Schema } from 'mongoose';

import {
  isFullySelected,
  planDerivedFields,
  type DerivedFieldsPlan,
  type DerivedFieldsPlanningDocument,
} from './planner';
import { registerDerivedFields } from './registration';
import { cloneDerivedScalar, copyDerivedSnapshot, snapshotDerivedInputs, type ScalarSnapshot } from './snapshot';

type SaveOptions = { validateBeforeSave?: boolean; validateModifiedOnly?: boolean };
type PluginDocument = Document &
  DerivedFieldsPlanningDocument & {
    $__: {
      saveOptions?: SaveOptions | null;
      validationError?: MongooseError.ValidationError | null;
    };
  };

type Checkpoint = {
  readonly saveOptions: SaveOptions | null | undefined;
  readonly isNew: boolean;
  readonly targets: readonly string[];
  readonly inputs: ScalarSnapshot;
  readonly results: ScalarSnapshot;
};

type DocumentState = {
  replacedPaths: ReadonlySet<string>;
  assignedPaths: Set<string>;
  applyingResults: boolean;
  checkpoint?: Checkpoint;
};

const watchedPaths = (plan: DerivedFieldsPlan) => [
  ...new Set(plan.fields.flatMap((field) => (field.mode === 'always' ? plan.availablePaths : field.dependsOn))),
];

/**
 * Computes opt-in root scalar `derived` fields before asynchronous document
 * validation and hydrated `save()` (including `Model.create()`). Results are
 * staged, then assigned through Mongoose setters/casting; `undefined` clears a
 * target. Getters receive separate frozen plain views with copied scalar values.
 * Supported targets/dependencies: root String, Number, Boolean, Date, ObjectId,
 * Decimal128, BigInt; containers, nested paths, and derived chains are rejected.
 * Mongoose's managed version key (default `__v` or custom) is rejected as a
 * target/dependency and omitted from inputs; with versionKey:false it is ordinary.
 *
 * Register after defining paths and source-mutating middleware, before compiling
 * the model. Source-changing pre-validation hooks must precede this plugin for
 * standalone validation to see their final values. Earlier pre-save changes are
 * recomputed and, unless validation is disabled, revalidated. Changes made by
 * later pre-save hooks are outside this guarantee. Validation hooks/validators
 * must not change inputs after this plugin computes them: a save that still has
 * such changes after revalidation rejects with an ordering error.
 *
 * No inputs are fetched. Explicit descriptors skip unless a dependency modification
 * or target assignment requests work, including actual pending default writes.
 * Mongoose writes non-null defaults (including '', 0, false) without modification
 * flags; null/undefined defaults alone do not write. Pending defaults schedule work
 * but do not prove excluded inputs available: all dependencies must be selected or
 * fully replaced. Missing/projected-out targets without a write request still skip.
 * Bare getters run on every validation/save and require every supported input.
 * New documents retain their supplied/defaulted/absent input availability on
 * later saves, including when constructed with projection metadata.
 * A normal save reuses its own validation computation when inputs/results are
 * unchanged. Separate validations/saves do not share that computation cache.
 * Validation-disabled saves still compute and reject getter/casting failures,
 * but intentionally skip required/custom validation.
 *
 * Query writes, replacements, insertMany/bulkWrite fast paths, raw-driver writes,
 * validateSync(), middleware bypass, and restricted pathsToSave are outside the
 * document-save contract. Some bulk insert paths invoke async document validation
 * and therefore compute incidentally; that is not all-writer consistency.
 * Backfill old rows/formula changes explicitly; ordinary Mongoose concurrent-write
 * semantics apply (consider optimisticConcurrency for source/result invariants).
 */
export function derivedFieldsPlugin<TRawDocType>(schema: Schema<TRawDocType>): void {
  const registration = registerDerivedFields(schema);
  const trackedPaths = [...registration.inputPaths, ...registration.fields.map((field) => field.targetPath)];
  const states = new WeakMap<PluginDocument, DocumentState>();
  const stateFor = (document: PluginDocument) => {
    let state = states.get(document);
    if (!state) {
      state = { replacedPaths: new Set(), assignedPaths: new Set(), applyingResults: false };
      states.set(document, state);
    }
    return state;
  };

  // After a successful save Mongoose can unmark an excluded assignment that
  // equals its unknown in-memory value (notably undefined or an applied default).
  // Observe full scalar assignments so those still supply/persist replacements.
  // Defaults/population use _skipMarkModified; queries have no document state.
  for (const path of trackedPaths) {
    schema.path(path).set(function derivedFieldsObserveAssignment(
      this: unknown,
      value: unknown,
      _priorValue: unknown,
      _schemaType: unknown,
      options?: { _skipMarkModified?: boolean },
    ) {
      if (this instanceof Document && !this.isNew && !options?._skipMarkModified && !isFullySelected(this, path)) {
        const state = stateFor(this as PluginDocument);
        if (!state.applyingResults) state.assignedPaths.add(path);
      }
      return value;
    });
  }

  const planFor = (document: PluginDocument, state: DocumentState) => {
    for (const path of state.assignedPaths) {
      // The observer precedes casting and $inc's atomic bookkeeping. Neither a
      // failed cast nor a relative increment proves a full replacement.
      if (!document.$__.validationError?.errors[path] && !document.$__.primitiveAtomics?.[path]) {
        document.markModified(path);
      }
    }
    state.assignedPaths.clear();
    // Mongoose 8/9 also writes non-null defaults that are not marked modified.
    // Mirror the root-scalar default filter in $__dirty()/delta generation:
    // _id and nullish defaults do not write; numeric-0 exclusions suppress writes.
    // In particular, defaults manufactured for omitted inclusive-projection paths
    // can write, but must never establish that those inputs were loaded/replaced.
    // Do not generate a delta via getChanges(), which can alter versioning state.
    const pendingWritePaths = new Set(
      document.isNew
        ? []
        : trackedPaths.filter(
            (path) =>
              path !== '_id' &&
              document.$isDefault(path) &&
              document.$__.selected?.[path] !== 0 &&
              document.get(path, undefined, { getters: false }) != null,
          ),
    );
    const plan = planDerivedFields(registration, document, {
      knownReplacedPaths: state.replacedPaths,
      pendingWritePaths,
    });
    // Keep full replacements after save clears dirty state, including when a
    // later getter or validator fails. Application assignments are never undone.
    // A new document also owns its absent/defaulted inputs, even with projection
    // metadata: those are the complete values being inserted, not omitted reads.
    state.replacedPaths = new Set(document.isNew ? plan.availablePaths : plan.replacedPaths);
    return plan;
  };

  const matches = (document: PluginDocument, plan: DerivedFieldsPlan, checkpoint: Checkpoint | undefined) =>
    checkpoint !== undefined &&
    checkpoint.saveOptions === document.$__.saveOptions &&
    checkpoint.isNew === document.isNew &&
    // Restoring a target to its original persisted value can clear its dirty
    // flag. It was still computed; only newly scheduled fields invalidate reuse.
    plan.fields.every((field) => checkpoint.targets.includes(field.targetPath)) &&
    isDeepStrictEqual(checkpoint.inputs, snapshotDerivedInputs(document, Object.keys(checkpoint.inputs))) &&
    isDeepStrictEqual(checkpoint.results, snapshotDerivedInputs(document, checkpoint.targets));

  const compute = async (document: PluginDocument) => {
    const state = stateFor(document);
    state.checkpoint = undefined;
    // Aggregate preflight always precedes every getter, including ready fields
    // that happen to occur before one with missing dependencies in schema order.
    const plan = planFor(document, state);
    const inputs = snapshotDerivedInputs(document, plan.availablePaths);
    const staged: { path: string; value: unknown }[] = [];
    for (const { targetPath, get } of plan.fields) {
      const result = await get(copyDerivedSnapshot(inputs));
      // Returning a Date/BSON input must not reconnect a retained getter view to
      // the document through Mongoose's identity-preserving scalar cast.
      staged.push({ path: targetPath, value: cloneDerivedScalar(result) });
    }
    state.applyingResults = true;
    try {
      for (const { path, value } of staged) document.set(path, value);
    } finally {
      state.applyingResults = false;
    }

    // set() records, rather than throws, most casting/setter failures. Preserve
    // Mongoose's structured error, also when validateBeforeSave is false.
    const validationError = document.$__.validationError;
    if (staged.some(({ path }) => validationError?.errors[path]?.name === 'CastError')) throw validationError;

    const targets = plan.fields.map((field) => field.targetPath);
    state.checkpoint = {
      saveOptions: document.$__.saveOptions,
      isNew: document.isNew,
      targets,
      inputs: copyDerivedSnapshot(inputs, watchedPaths(plan)),
      results: snapshotDerivedInputs(document, targets),
    };
  };

  schema.pre('validate', async function derivedFieldsPreValidate(this: PluginDocument) {
    await compute(this);
  });

  schema.pre('save', async function derivedFieldsPreSave(this: PluginDocument) {
    const state = stateFor(this);
    const plan = planFor(this, state);
    if (this.$__.saveOptions && matches(this, plan, state.checkpoint)) return;

    const options = this.$__.saveOptions;
    const validate =
      options && 'validateBeforeSave' in options ? !!options.validateBeforeSave : schema.options.validateBeforeSave;
    if (validate) {
      // A preceding save hook (or a later validation hook) changed inputs or a
      // target after normal save validation. Re-enter the regular validation
      // lifecycle so required/custom/type validators see the new computation.
      await this.validate(
        undefined,
        options && 'validateModifiedOnly' in options
          ? { validateModifiedOnly: options.validateModifiedOnly }
          : undefined,
      );
    } else {
      await compute(this);
    }

    if (!matches(this, planFor(this, state), state.checkpoint)) {
      throw new Error(
        'derivedFieldsPlugin inputs or targets changed after computation; register source-mutating validation hooks before the plugin and keep getters/validators free of document mutations',
      );
    }
  });
}
