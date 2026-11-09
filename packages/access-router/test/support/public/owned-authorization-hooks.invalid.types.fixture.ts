// Intentional negative fixture, compiled separately from the valid example.
import type {
  DocumentGrants,
  FieldPermissionHook,
  GuardHook,
  ModelDocPermissionsHook,
  OperationAccess,
} from '@web-ts-toolkit/access-router';

export const richFacts: DocumentGrants = { owner: 1, expires: new Date(), absent: undefined };
export const richHook: ModelDocPermissionsHook = () => ({ owner: { membership: true } });
export const twoArgumentGuard: GuardHook = (_permissions, _grants: DocumentGrants) => true;
export const mutableField: FieldPermissionHook = (_permissions, grants) => {
  grants.owner = false;
  return true;
};
export const fieldAsOperation: OperationAccess = { read: (_permissions, grants: DocumentGrants) => grants.owner };
