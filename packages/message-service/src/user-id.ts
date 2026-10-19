import type { UserId } from './types/message';

/** Internal persistence normalization; never stringify native ObjectIds or fold opaque string case. */
export function normalizeUserIdForStorage(id: UserId): UserId {
  return typeof id === 'string' ? id.trim() : id;
}
