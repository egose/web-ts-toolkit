import type { ListResult, ModelHookContext, SingleResult } from './base';
import type { DeepFieldPath, Filter, WithVirtuals } from './query-types';

/**
 * Bounded persisted/registered-virtual response paths, including embedded array children.
 * Use `contacts.email`, not `contacts.sub.email`, signed selection tokens or wildcards.
 * Unknown/any models deliberately accept strings; the receiving runtime schema still
 * validates every path. Referenced-model interiors belong to that target's policy.
 */
export type OutputFieldPath<TModel = unknown, TVirtuals extends object = Record<never, never>> = unknown extends TModel
  ? string
  : Extract<DeepFieldPath<WithVirtuals<TModel, TVirtuals>>, string>;

/**
 * Trusted server-only output authority, independent of selection and write admission.
 * Missing policy defaults to `request`. `grant` is additive: request permission OR
 * an explicit grant authorizes a selected field, even with a false/missing request rule.
 * An empty grant adds nothing. Grants never add to an explicit selection or defeat
 * exclusions. `unrestricted` authorizes selected eligible catalog fields, not every
 * fetched key. With omitted select, grants add named candidates; unrestricted uses
 * the captured persisted/registered-virtual catalog. `requireExplicitSelect` still applies.
 *
 * A container path grants its selected eligible subtree; a descendant grants only
 * that branch and minimal ancestors, never siblings or referenced-model data.
 * Identity and permission metadata have separate output rules and cannot be elevated
 * through business-field grants. Missing persisted values are not fabricated;
 * selected virtuals may still be omitted for inapplicable getters, missing dependencies,
 * undefined results or errors. This policy does not promise required output fields.
 * It grants no rows, writes, query/sort/distinct fields or related target operations.
 */
export type FieldAuthorization<TPath extends string = string> =
  | { readonly mode: 'request'; readonly paths?: never }
  | { readonly mode: 'grant'; readonly paths: readonly TPath[] }
  | { readonly mode: 'unrestricted'; readonly paths?: never };

/**
 * Trusted server-only row policy. Missing policy uses the request `baseFilter`.
 * `scope` replaces that base scope with an inert predicate; `unrestricted` skips it.
 * The configured `overrideFilter` query-transform hook still runs once in EVERY mode,
 * including unrestricted, and can restrict/deny the query. The transformed ordinary
 * query, chosen scope and mandatory reference/join constraints are ANDed afterward.
 * A false query/identifier/scope/transform is terminal; `{}` is an explicit all-row
 * scope within those constraints. Null/undefined scope filters reject. Scope values
 * never expand client `$$sq`/`$$date` markers or stamp input on an upsert create branch.
 */
export type RowAuthorization<TModel = unknown> =
  | { readonly mode: 'request'; readonly filter?: never }
  | { readonly mode: 'scope'; readonly filter: Filter<TModel> }
  | { readonly mode: 'unrestricted'; readonly filter?: never };

/**
 * Trusted related-target operation admission only. Omission uses its request/base
 * gate; `grant` permits that scoped target operation, not its rows, fields or writes.
 * It does not select an HTTP route variant or grant an initiating service operation.
 */
export type OperationAuthorization = { readonly mode: 'request' } | { readonly mode: 'grant' };

/**
 * Trusted server-only per-call capability for model reads, update and upsert.
 * Each omitted dimension defaults to request authority. The service captures an
 * immutable call policy before awaiting hooks; list rows share that policy but have
 * separate document-hook results/field decisions. No authority is merged from prior
 * calls or router defaults, and the original request actor/permission map is retained.
 *
 * Use the service from `router.getService(req)` or `req.macl.getService(modelName)`.
 * Keep query/select/populate in ordinary args and authority in `options.authorization`.
 * The complete service `overrides` container was removed in this breaking release;
 * any supplied legacy control slot, including undefined/empty, returns BadRequest
 * before parsing/persistence. See the package README migration table.
 *
 * Never accept this input from HTTP/OpenAPI/client transport or public `_` wrappers.
 * Output grants do not authorize writes, query fields or related operations implicitly;
 * validation/save hooks remain active. `inputFields` and `subdocuments` are unsupported.
 */
export interface ServiceAuthorization<TModel = unknown, TVirtuals extends object = Record<never, never>> {
  /** Existing-row scope, independent of output-field authority. */
  readonly rows?: RowAuthorization<TModel>;
  /** Additive, selection-limited business-field authority; metadata still describes the user. */
  readonly outputFields?: FieldAuthorization<OutputFieldPath<TModel, TVirtuals>>;
  /** Exact requested populate/include paths, relative to this receiving model. */
  readonly related?: Readonly<Record<string, RelatedAuthorization>>;
}

/**
 * Trusted policy for one exact requested relationship/attachment path. The map key
 * identifies that path and `model` must match its registered target. Unused, ambiguous
 * or mismatched entries reject before target persistence. Child dimensions default
 * to request; parent unrestricted/output grants never elevate a target implicitly.
 * Ref IDs, populate match and include joins/filters still constrain every row mode.
 * Nested policies live under the immediate target's `related` map. Count targets
 * accept only model/operation/rows. Neither parent nor related grants flow into `$$sq`.
 */
export interface RelatedAuthorization {
  /** Exact expected registered target model name; checked against the descriptor/ref. */
  readonly model: string;
  /** Explicit target operation gate; output grants alone do not permit the operation. */
  readonly operation?: OperationAuthorization;
  readonly rows?: RowAuthorization;
  /** Paths belong to the target model and still require its ordinary selection. */
  readonly outputFields?: FieldAuthorization;
  readonly related?: Readonly<Record<string, RelatedAuthorization>>;
}

/** Create output/related authority only. Rows reject even in request mode; writes stay request-authorized. */
export type CreateAuthorization<TModel = unknown, TVirtuals extends object = Record<never, never>> = Omit<
  ServiceAuthorization<TModel, TVirtuals>,
  'rows'
> & { readonly rows?: never };
/** Output-only authority for named helpers and new templates; row/target options reject. */
export type OutputAuthorization<TModel = unknown, TVirtuals extends object = Record<never, never>> = Pick<
  ServiceAuthorization<TModel, TVirtuals>,
  'outputFields'
> & { readonly rows?: never; readonly related?: never };

declare const documentAuthorizationBrand: unique symbol;

/**
 * Package-issued same-execution output handle, authenticated by private runtime state.
 * Bound to request/runtime/model, projected document snapshot, scope and access stage.
 * Obtain it from an internal result context, never from DTO metadata or JSON. It is
 * an opaque consumer handle, not a constructor, reusable call policy or wire token.
 * It reuses full document grants and memoized decisions after ownerId/private inputs
 * and permission metadata are trimmed. Use the original unchanged output or a
 * package-created helper subset; caller spreads, matching IDs, changed values, another
 * row/call/access or pre-/post-write stages cannot establish validity and reject.
 */
export interface DocumentAuthorization {
  readonly [documentAuthorizationBrand]: true;
}

/** Internal output context; public serializers omit it and no authority is attached to data. */
export interface ServiceOutputContext extends ModelHookContext {
  /** Non-enumerable, non-writable handle for this output row/scope/access stage. */
  readonly documentAuthorization: DocumentAuthorization;
  /**
   * Look up an exact unchanged value in this result's output graph, including
   * registered embedded/related copies. Unknown/stale values return undefined;
   * scalar IDs/null/counts have no child handle. Pass a related handle to that
   * target model's helper at its output access. This method cannot issue new authority.
   */
  getDocumentAuthorization(output: object): DocumentAuthorization | undefined;
}

/** Successful integrated single output plus its internal context; no stronger field-existence inference. */
export type AuthorizedSingleResult<T = unknown> = Omit<SingleResult<T>, 'context'> & {
  readonly context: ServiceOutputContext;
};
/** Successful list/create output with one context per data row at the same index (empty list: empty contexts). */
export type AuthorizedListResult<T = unknown> = Omit<ListResult<T>, 'contexts'> & {
  readonly contexts: readonly ServiceOutputContext[];
};
/**
 * Trusted post-finalization presentation. May remove/construct output; no automatic
 * second authorization pass or handle association for arbitrary mutations/replacements.
 */
export type ServiceOutputDecorator = (doc: unknown, context: ServiceOutputContext) => unknown;

/**
 * Named output-only genSelect/genQuerySelect planning options. Each helper call
 * resolves a fresh policy and returns persisted fetch inputs, including private
 * dependencies/identity, not an output allowlist. Document rules are deferred;
 * planning invokes no permission functions or virtual getters. Declare additional
 * projected document-hook inputs with alwaysSelectFields. No rows/baseFields/skip flags.
 */
export interface OutputPlanningOptions<TModel = unknown, TVirtuals extends object = Record<never, never>> {
  readonly authorization?: OutputAuthorization<TModel, TVirtuals>;
  /** Ordinary response segments (e.g. ['contacts']); grants remain relative to the owning model. */
  readonly scopePath?: readonly string[];
}

/**
 * Mutually exclusive named output filtering inputs: raw policy OR an issued handle.
 * Raw-policy evaluation (including `{}` for request mode) is a fresh call; only an
 * issued handle reuses full document decisions from the immutable original call.
 * A fresh unassociated document needs suitable untrimmed projected hook inputs.
 * On recognized trimmed output, fresh evaluation retains unconditional request fields
 * and explicit grants but denies unresolved document-dependent rules without rerunning
 * their hook on the DTO. Metadata is never proof of cached authority.
 *
 * pickAllowedFields/trimOutputFields filter existing values only: no selection,
 * virtual getters, absent-value restoration, row checks or write grants. Omitted
 * options/positional baseFields use the separately retained legacy helper overloads.
 */
export type OutputFieldOptions<TModel = unknown, TVirtuals extends object = Record<never, never>> =
  | (OutputPlanningOptions<TModel, TVirtuals> & { readonly documentAuthorization?: never })
  | {
      readonly documentAuthorization: DocumentAuthorization;
      readonly authorization?: never;
      readonly scopePath?: never;
    };

/** Named genAllowedFields requires purpose: 'output'; it must not be used for write admission. */
export type AllowedOutputFieldOptions<
  TModel = unknown,
  TVirtuals extends object = Record<never, never>,
> = OutputFieldOptions<TModel, TVirtuals> & { readonly purpose: 'output' };
