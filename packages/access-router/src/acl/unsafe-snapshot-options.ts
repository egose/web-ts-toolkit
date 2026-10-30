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
