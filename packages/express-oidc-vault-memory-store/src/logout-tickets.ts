import {
  OidcVaultLogoutNavigationCapacityError,
  OidcVaultStoreConflictError,
} from '@web-ts-toolkit/express-oidc-vault';
import type {
  ConsumeLogoutNavigationTicketInput,
  OidcVaultLogoutNavigationTicket,
} from '@web-ts-toolkit/express-oidc-vault';
import { assertTicket, ticketId, ticketNow, validTicket } from './logout-ticket-validation';

type Entry = { id: string; record: OidcVaultLogoutNavigationTicket; index: number };

/** One removable expiry node per ticket. No tombstones, full-map sweeps or timers. */
export class LogoutNavigationTickets {
  private readonly tickets = new Map<string, Entry>();
  private readonly expiryHeap: Entry[] = [];

  constructor(private readonly maxEntries: number) {}

  create(record: OidcVaultLogoutNavigationTicket, now: number): void {
    ticketNow(now);
    assertTicket(record, now);
    const id = ticketId(record);
    const existing = this.tickets.get(id);
    if (existing && validTicket(existing.record, now)) throw new OidcVaultStoreConflictError();
    if (existing) this.remove(existing.index);
    this.cleanup(now);
    if (this.tickets.size >= this.maxEntries) throw new OidcVaultLogoutNavigationCapacityError();
    const entry = { id, record, index: this.expiryHeap.length };
    this.tickets.set(id, entry);
    this.expiryHeap.push(entry);
    this.moveUp(entry.index);
  }

  consume(input: ConsumeLogoutNavigationTicketInput, now: number): OidcVaultLogoutNavigationTicket | null {
    ticketNow(now);
    const selected = this.tickets.get(ticketId(input));
    if (selected) this.remove(selected.index);
    this.cleanup(now);
    return selected && validTicket(selected.record, now) && ticketId(selected.record) === ticketId(input)
      ? { ...selected.record }
      : null;
  }

  private cleanup(now: number): void {
    for (let cleaned = 0; cleaned < 64 && this.expiryHeap[0]?.record.expiresAt <= now; cleaned += 1) this.remove(0);
  }

  private remove(index: number): void {
    const removed = this.expiryHeap[index]!;
    const last = this.expiryHeap.pop()!;
    this.tickets.delete(removed.id);
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
      if (this.expiryHeap[parent]!.record.expiresAt <= this.expiryHeap[index]!.record.expiresAt) break;
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
        right < this.expiryHeap.length &&
        this.expiryHeap[right]!.record.expiresAt < this.expiryHeap[left]!.record.expiresAt
          ? right
          : left;
      if (this.expiryHeap[index]!.record.expiresAt <= this.expiryHeap[child]!.record.expiresAt) return;
      this.swap(index, child);
      index = child;
    }
  }
}
