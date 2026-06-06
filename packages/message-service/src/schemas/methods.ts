import type { MessageUser, UserId } from '../types/message';

export function isSender(
  this: { fromUser: UserId | null },
  user: MessageUser,
): boolean {
  return String(this.fromUser) === String(user.id || user._id);
}

export function isReceiver(
  this: { toUser: UserId | null; toRoles: string[] },
  user: MessageUser,
): boolean {
  const id = String(user.id || user._id);
  return String(this.toUser) === id || this.toRoles.some((r) => user.roles?.includes(r));
}
