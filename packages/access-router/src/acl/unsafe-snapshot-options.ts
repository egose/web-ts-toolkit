/** Server model/default-model options only. Never forward through service or wire controls. */
export const unsafeSnapshotCheckOptions = [
  'unsafeSkipListDocumentSnapshotChecks',
  'unsafeSkipReadDocumentSnapshotChecks',
  'unsafeSkipListOutputSnapshotChecks',
  'unsafeSkipReadOutputSnapshotChecks',
  'unsafeSkipListNestedDocumentSnapshotChecks',
  'unsafeSkipReadNestedDocumentSnapshotChecks',
] as const;

export const unsafeInitialOutputCopyOptions = [
  'unsafeSkipListInitialOutputSnapshotCopy',
  'unsafeSkipReadInitialOutputSnapshotCopy',
] as const;

export const unsafeSnapshotOptions = [...unsafeSnapshotCheckOptions, ...unsafeInitialOutputCopyOptions] as const;

/** Independent of the original six comparison / two initial-copy options. */
export const unsafeAuthorizationFastPathOptions = [
  'unsafeUseListAuthorizationFastPath',
  'unsafeUseReadAuthorizationFastPath',
] as const;

/** Admission/normalization only; never reinterpret the original eight-option group. */
export const unsafeServerOptions = [...unsafeSnapshotOptions, ...unsafeAuthorizationFastPathOptions] as const;

export type AuthorizationFastPathOrigin = 'list' | 'read';
export interface AuthorizationFastPathCapture {
  readonly origin: AuthorizationFastPathOrigin;
  readonly mode: 'off' | 'dormant' | 'active';
  /** Origin's document/output/nested/initial-copy decisions, not a descendant's mode. */
  readonly prerequisites: number;
}

export function authorizationFastPathPrerequisites(origin: AuthorizationFastPathOrigin) {
  const operation = origin === 'read' ? 'Read' : 'List';
  return [
    `unsafeSkip${operation}DocumentSnapshotChecks`,
    `unsafeSkip${operation}OutputSnapshotChecks`,
    `unsafeSkip${operation}NestedDocumentSnapshotChecks`,
    `unsafeSkip${operation}InitialOutputSnapshotCopy`,
  ] as const;
}

/** Capture literal decisions BEFORE any snapshot/native normalization can change a value. */
export function captureAuthorizationFastPath(
  options: Readonly<Record<string, unknown>>,
  origin: AuthorizationFastPathOrigin,
): AuthorizationFastPathCapture {
  // Invalid accessor configuration still fails in the existing snapshot validator;
  // selection must not invoke it first or promote a normalized/native value to true.
  const literalTrue = (key: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    return !!descriptor && 'value' in descriptor && descriptor.value === true;
  };
  const key = origin === 'read' ? unsafeAuthorizationFastPathOptions[1] : unsafeAuthorizationFastPathOptions[0];
  const requested = literalTrue(key);
  const prerequisites = authorizationFastPathPrerequisites(origin).reduce(
    (mask, key, index) => mask | (literalTrue(key) ? 1 << index : 0),
    0,
  );
  return Object.freeze({
    origin,
    mode: !requested ? 'off' : prerequisites === 15 ? 'active' : 'dormant',
    prerequisites,
  });
}
