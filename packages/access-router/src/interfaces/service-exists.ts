import { BaseFilterAccess } from './root';

/** Terminal false row policy returns Forbidden in either result mode, before adapter dispatch. */
export interface ExistsOptions {
  /** Row-policy access, defaulting to read. */
  access?: BaseFilterAccess;
  /** Return an `{ _id }` record or null instead of a match/miss boolean. Denial is an ErrorResult, never a miss. */
  includeId?: boolean;
}
