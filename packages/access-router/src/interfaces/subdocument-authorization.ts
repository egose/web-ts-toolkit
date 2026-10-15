import type {
  FieldAuthorization,
  InputFieldAuthorization,
  OperationAuthorization,
  OutputFieldPath,
  RowAuthorization,
} from './service-authorization';

/**
 * One dedicated parent/child gate. Grants never imply the other scope or dimension.
 * Row scope replaces only baseFilter; overrideFilter still transforms once. The
 * captured parent identifier, child identifier and selected-array membership are
 * ANDed afterward, even if the hook mutates its query in place. False is terminal.
 */
export interface SubdocumentGateAuthorization<T = unknown> {
  readonly operation?: OperationAuthorization;
  readonly rows?: RowAuthorization<T>;
  readonly outputFields?: never;
  readonly inputFields?: never;
  readonly related?: never;
}

/**
 * Child-relative selected output paths; referenced targets always retain request authority.
 * Additive grant/unrestricted output uses the shared planner and owning RAW parent's
 * read-stage document grants, independently of input and operation authority.
 */
export interface SubdocumentOutputAuthorization<T = unknown, V extends object = Record<never, never>> extends Omit<
  SubdocumentGateAuthorization<T>,
  'outputFields'
> {
  readonly outputFields?: FieldAuthorization<OutputFieldPath<T, V>>;
}

/**
 * Trusted dedicated list/read policy with independent parent/child authority.
 * Parent gates read; child gates list/read.
 * Supplying this policy opts into both base-operation gates (missing dimensions use
 * request authority). Omission preserves historical route-owned initiating guards.
 * Rows cannot replace the resolved parent ID or selected child ID. Child paths are
 * relative to the named embedded array. No defaults, wire input or related elevation.
 * Unknown fields, inapplicable dimensions and malformed/deep/oversized policies fail
 * before effects. Scope filters are inert (no $$sq/$$date), schema-validated and bounded
 * by requestComplexity, including maxDepth, maxNodes, maxInValues and maxLogicalClauses.
 */
export interface SubdocumentReadAuthorization<P = unknown, C = unknown, V extends object = Record<never, never>> {
  readonly parent?: SubdocumentGateAuthorization<P>;
  readonly child?: SubdocumentOutputAuthorization<C, V>;
  readonly visibility?: never;
}

/** Independent post-write parent-read and child-read gates/rows/output; never inherits writes. */
export interface SubdocumentVisibilityAuthorization<P = unknown, C = unknown, V extends object = Record<never, never>> {
  readonly parent?: SubdocumentGateAuthorization<P>;
  readonly child?: SubdocumentOutputAuthorization<C, V>;
  /** Only create returns a full array and also requires child list admission. */
  readonly list?: never;
}

/** Create visibility requires child list AND read, using read output fields. */
export interface SubdocumentCreateVisibilityAuthorization<
  P = unknown,
  C = unknown,
  V extends object = Record<never, never>,
> extends Omit<SubdocumentVisibilityAuthorization<P, C, V>, 'list'> {
  readonly list?: SubdocumentGateAuthorization<C>;
}

/**
 * Child-relative persisted writes, using InputFieldAuthorization semantics. Descendant
 * grants patch existing nested array objects by index; explicit containers replace
 * their eligible subtree. No output authority or outer-array structural authority.
 * Update grants resolve once from the original hydrated owning parent; create uses
 * request-only pre-document rules. Virtual/control/identity elevation is forbidden.
 */
export interface SubdocumentInputAuthorization<C = unknown> extends Omit<
  SubdocumentGateAuthorization<C>,
  'inputFields'
> {
  readonly inputFields?: InputFieldAuthorization<C>;
}

/**
 * Trusted single/bulk update: parent update and child update gates/rows; independent
 * child input admission. Visibility defaults to request-only read. Hidden persisted
 * writes succeed with null/[]; never retry solely because the response is hidden.
 */
export interface SubdocumentMutationAuthorization<P = unknown, C = unknown, V extends object = Record<never, never>> {
  readonly parent?: SubdocumentGateAuthorization<P>;
  readonly child?: SubdocumentInputAuthorization<C>;
  readonly visibility?: SubdocumentVisibilityAuthorization<P, C, V>;
}

/** Append/prepend admitted children; no existing-child rows dimension. Returns the visible full array. */
export interface SubdocumentCreateAuthorization<P = unknown, C = unknown, V extends object = Record<never, never>> {
  readonly parent?: SubdocumentGateAuthorization<P>;
  readonly child?: Omit<SubdocumentInputAuthorization<C>, 'rows'> & { readonly rows?: never };
  readonly visibility?: SubdocumentCreateVisibilityAuthorization<P, C, V>;
}

/** Parent update and child delete gates/rows. The successful result is only the removed ID. */
export interface SubdocumentDeleteAuthorization<P = unknown, C = unknown> {
  readonly parent?: SubdocumentGateAuthorization<P>;
  readonly child?: SubdocumentGateAuthorization<C>;
  readonly visibility?: never;
}
