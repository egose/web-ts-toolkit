/**
 * VIRT-05 populate target plan transport (VIRT-00A D1/D5/D6).
 *
 * `genPopulate` retains per-entry target plans (target's original selection,
 * captured virtual descriptors via the planner, dependency fetch requirements,
 * effective target accesses) while keeping Mongoose descriptors separate from
 * package internal plan metadata.
 *
 * - Mongoose descriptors are the enumerable `{ path, select, match }` keys
 *   passed to `Model.find/populate` and `populateDoc`. They never contain
 *   virtual names (stripped via `genSelect`), never contain `-_id` for DB
 *   fetches (fetch always retains `_id`; output `-_id` is honored by the
 *   target finalizer independently), and never contain internal metadata.
 * - Internal metadata is stored non-enumerably under {@link POPULATE_TARGET_PLAN}
 *   (a `Symbol`, invisible to Mongoose and to JSON serializers). It carries
 *   the target's `VirtualProjectionPlan` + coherent `FinalizeSnapshot` for the
 *   operation so planning and finalization share one snapshot and in-flight
 *   descriptor replacement cannot mix versions.
 *
 * Existing nested populate-descriptor support: dotted paths through embedded
 * data (e.g. `contacts.friend` where `contacts` is an array of subdocuments)
 * are supported as single Mongoose populate entries. No recursive Mongoose
 * `populate` public API is invented here; the `Populate` interface stays
 * `{ path, select, match, access }` (see `interfaces/query-types.ts`). Dotted
 * traversal through embedded arrays is handled during target finalization in
 * `services/service.ts` (per-parent isolated copies, null/scalar/array aware).
 *
 * Denial/registration behavior is preserved: parent-path allowlist,
 * target-operation `isAllowed`, terminal `genFilter === false`, and
 * `requireRegisteredPopulateModels` all still drop/keep entries exactly as
 * before. Global-only virtual denial is never reinterpreted as definitive —
 * document-dependent/function rules stay `deferred` in the retained plan until
 * the target finalizer evaluates actual document grants.
 */
import type { Populate } from '../interfaces';
import type { VirtualProjectionAccess, VirtualProjectionPlan } from './virtual-projection';
import type { FinalizeSnapshot } from '../output/finalize-model-output';

/** Effective target data policy; trusted non-reserved custom accesses remain exact. */
export type PopulateTargetAccess = VirtualProjectionAccess;

export interface PopulateTargetMeta {
  targetModelName: string;
  virtualAccess: PopulateTargetAccess;
  outputAccess: PopulateTargetAccess;
  docPermissionsAccess: PopulateTargetAccess;
  /** Original requested selection for the target (`p.select`, may be undefined). */
  requestedSelect?: unknown;
  /** Coherent planner output for the target (candidates + fetch vs output). */
  plan: VirtualProjectionPlan;
  /** Coherent options snapshot for the target finalizer. */
  snapshot: FinalizeSnapshot;
}

/**
 * Non-enumerable internal key. Mongoose `populate()` only reads enumerable
 * `path`/`select`/`match` (+ unknown keys ignored); JSON serializers drop
 * symbols. This keeps descriptors and plans separate by construction.
 */
export const POPULATE_TARGET_PLAN: unique symbol = Symbol('accessRouter.populateTargetPlan');

export function setPopulateTargetMeta(entry: Populate, meta: PopulateTargetMeta): void {
  Object.defineProperty(entry, POPULATE_TARGET_PLAN, {
    value: meta,
    enumerable: false,
    writable: false,
    configurable: false,
  });
}

export function getPopulateTargetMeta(entry: Populate | string | null | undefined): PopulateTargetMeta | undefined {
  if (!entry || typeof entry === 'string') return undefined;
  try {
    return (entry as unknown as Record<symbol, unknown>)[POPULATE_TARGET_PLAN] as PopulateTargetMeta | undefined;
  } catch {
    return undefined;
  }
}
