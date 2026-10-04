import { OidcVaultDpopReplayCapacityError } from '@web-ts-toolkit/express-oidc-vault';
import type { ReserveDpopProofInput } from '@web-ts-toolkit/express-oidc-vault';

type Reservation = { replayKey: string; expiresAt: number; index: number };

/** Indexed min-heap: exactly one expiry node per retained key, no lazy tombstone growth or full-map rebuilds. */
export class DpopReplayReservations {
  private readonly reservations = new Map<string, Reservation>();
  private readonly expiryHeap: Reservation[] = [];

  constructor(private readonly maxEntries: number) {}

  reserve({ replayKey, expiresAt }: ReserveDpopProofInput, now: number): boolean {
    if (!Number.isFinite(now)) throw new Error('OIDC vault DPoP replay store clock is invalid.');
    if (
      typeof replayKey !== 'string' ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= now ||
      expiresAt - now > 360_000
    ) {
      return false;
    }
    const existing = this.reservations.get(replayKey);
    if (existing && existing.expiresAt > now) return false;
    if (existing) this.remove(existing.index);
    for (let cleaned = 0; cleaned < 64 && this.expiryHeap[0]?.expiresAt <= now; cleaned += 1) this.remove(0);
    if (this.reservations.size >= this.maxEntries) throw new OidcVaultDpopReplayCapacityError();
    const reservation = { replayKey, expiresAt, index: this.expiryHeap.length };
    this.reservations.set(replayKey, reservation);
    this.expiryHeap.push(reservation);
    this.moveUp(reservation.index);
    return true;
  }

  private remove(index: number): void {
    const removed = this.expiryHeap[index]!;
    const last = this.expiryHeap.pop()!;
    this.reservations.delete(removed.replayKey);
    if (index === this.expiryHeap.length) return;
    this.expiryHeap[index] = last;
    last.index = index;
    this.moveUp(index);
    this.moveDown(last.index);
  }

  private swap(left: number, right: number): void {
    [this.expiryHeap[left], this.expiryHeap[right]] = [this.expiryHeap[right]!, this.expiryHeap[left]!];
    this.expiryHeap[left]!.index = left;
    this.expiryHeap[right]!.index = right;
  }

  private moveUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.expiryHeap[parent]!.expiresAt <= this.expiryHeap[index]!.expiresAt) break;
      this.swap(parent, index);
      index = parent;
    }
  }

  private moveDown(index: number): void {
    for (;;) {
      const left = index * 2 + 1;
      if (left >= this.expiryHeap.length) return;
      const right = left + 1;
      const child =
        right < this.expiryHeap.length && this.expiryHeap[right]!.expiresAt < this.expiryHeap[left]!.expiresAt
          ? right
          : left;
      if (this.expiryHeap[index]!.expiresAt <= this.expiryHeap[child]!.expiresAt) return;
      this.swap(index, child);
      index = child;
    }
  }
}
