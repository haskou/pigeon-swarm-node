import { BearerCapability } from '@haskou/pigeon-swarm-crypto';

import type { IssuedRealtimeTicket } from './IssuedRealtimeTicket';
import type { RealtimeTicketEntry } from './RealtimeTicketEntry';

export const REALTIME_PROTOCOL_VERSION = 'pigeon-realtime.v1';
export const REALTIME_TICKET_PROTOCOL_PREFIX = 'ticket.';

/**
 * Node-local, in-memory, single-use WebSocket tickets. Only a SHA-256 digest
 * of each ticket is stored, so a memory dump does not reveal usable tickets.
 * Tickets are consumed on first use, whether or not the upgrade succeeds, and
 * expire after TTL_MS. Capacity is bounded globally and per identity; at
 * capacity issuance fails closed instead of evicting live tickets.
 */
export class RealtimeTicketStore {
  public static readonly TTL_MS = 30 * 1000;
  public static readonly MAX_ACTIVE_TICKETS = 10_000;
  public static readonly MAX_ACTIVE_TICKETS_PER_IDENTITY = 8;

  // TTL is constant, so insertion order is expiry order.
  private readonly entries = new Map<string, RealtimeTicketEntry>();

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt > now) {
        break;
      }

      this.entries.delete(key);
    }
  }

  private countActiveFor(identityId: string): number {
    let count = 0;

    for (const entry of this.entries.values()) {
      if (entry.identityId === identityId) {
        count += 1;
      }
    }

    return count;
  }

  /**
   * Returns undefined at capacity so the caller can refuse issuance.
   */
  public issue(identityId: string): IssuedRealtimeTicket | undefined {
    const now = Date.now();

    this.prune(now);

    if (
      this.entries.size >= RealtimeTicketStore.MAX_ACTIVE_TICKETS ||
      this.countActiveFor(identityId) >=
        RealtimeTicketStore.MAX_ACTIVE_TICKETS_PER_IDENTITY
    ) {
      return undefined;
    }

    const { hash, token } = BearerCapability.generate();
    const expiresAt = now + RealtimeTicketStore.TTL_MS;

    this.entries.set(hash, { expiresAt, identityId });

    return { expiresAt, ticket: token };
  }

  /**
   * Atomically consumes a ticket. Returns the identity it was issued to only
   * when the ticket exists and has not expired; it is removed either way.
   */
  public consume(ticket: string): string | undefined {
    let key: string;

    try {
      key = BearerCapability.hash(ticket);
    } catch {
      return undefined;
    }

    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    this.entries.delete(key);

    return entry.expiresAt > Date.now() ? entry.identityId : undefined;
  }
}

export const realtimeTicketStore = new RealtimeTicketStore();
