import { Types } from 'mongoose';
import type { MessageUser, UserId } from '../types/message';

export function isSender(this: { fromUser: UserId | null }, user: MessageUser): boolean {
  const fromUser = normalizeStoredUserId(this.fromUser);
  const userId = normalizeMessageUserId(user);
  return fromUser !== null && userId !== null && fromUser === userId;
}

export function isReceiver(this: { toUser: UserId | null; toRoles: string[] }, user: MessageUser): boolean {
  const toUser = normalizeStoredUserId(this.toUser);
  const userId = normalizeMessageUserId(user);
  return (toUser !== null && userId !== null && toUser === userId) || this.toRoles.some((r) => user.roles?.includes(r));
}

function normalizeMessageUserId(user: MessageUser | undefined): string | null {
  return normalizeId(user?._id);
}

function normalizeStoredUserId(value: unknown): string | null {
  // ObjectId itself has an `_id` getter. Handle it before populated documents;
  // unwrap only one level so missing/malformed references never stringify to IDs.
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (value !== null && typeof value === 'object') {
    return normalizeId((value as { _id?: unknown })._id);
  }
  return normalizeId(value);
}

function normalizeId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return value instanceof Types.ObjectId ? value.toHexString() : null;
}
