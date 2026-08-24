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
  return normalizeStoredUserId(user?._id ?? null);
}

function normalizeStoredUserId(value: UserId | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return String(value);
}
