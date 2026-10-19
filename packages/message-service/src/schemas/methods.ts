import { Types } from 'mongoose';
import type { MessageUser, UserId } from '../types/message';

/** Internal role-shape check shared by service/route validation and relationships. */
export function isValidMessageUserRoles(roles: unknown): roles is string[] | undefined {
  if (roles === undefined) return true;
  if (!Array.isArray(roles)) return false;
  // Iteration also rejects sparse entries, which Array#every would skip.
  for (const role of roles) {
    if (typeof role !== 'string') return false;
  }
  return true;
}

export function isSender(this: { fromUser: UserId | null }, user: MessageUser): boolean {
  if (!isValidMessageUserRoles(user?.roles)) return false;
  return matchesStoredUserId(this.fromUser, user);
}

export function isReceiver(this: { toUser: UserId | null; toRoles: string[] }, user: MessageUser): boolean {
  const roles = user?.roles;
  if (!isValidMessageUserRoles(roles)) return false;
  return matchesStoredUserId(this.toUser, user) || this.toRoles.some((r) => roles?.includes(r));
}

function matchesStoredUserId(value: unknown, user: MessageUser | undefined): boolean {
  // ObjectId itself has an `_id` getter. Handle it before populated documents;
  // unwrap only one level so missing/malformed references never stringify to IDs.
  const stored =
    value instanceof Types.ObjectId || value === null || typeof value !== 'object'
      ? value
      : (value as { _id?: unknown })._id;
  const userId = normalizeId(user?._id);
  if (userId === null) return false;
  // Match Mongoose's ObjectId query casting, but only when the stored party is
  // actually an ObjectId. Hex-looking String IDs remain case-sensitive.
  if (stored instanceof Types.ObjectId && /^[a-f\d]{24}$/i.test(userId)) {
    return stored.toHexString() === userId.toLowerCase();
  }
  const storedId = normalizeId(stored);
  return storedId !== null && storedId === userId;
}

function normalizeId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return value instanceof Types.ObjectId ? value.toHexString() : null;
}
