import { RealtimeTicketStore } from '@app/shared/infrastructure/websocket/RealtimeTicketStore';

import { cryptoVectors } from '../../../../support/cryptoVectors';

const { hash } = cryptoVectors<{
  hash: { invalid: { name: string; token: string }[] };
}>('bearer-capabilities');

describe('RealtimeTicketStore', () => {
  const START = 1_700_000_000_000;
  let store: RealtimeTicketStore;
  let now: number;

  beforeEach(() => {
    now = START;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    store = new RealtimeTicketStore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function issueFor(identityId: string): string {
    const issued = store.issue(identityId);

    if (!issued) {
      throw new Error('expected ticket issuance to succeed');
    }

    return issued.ticket;
  }

  it('issues a random base64url ticket that expires after the TTL', () => {
    const issued = store.issue('alice');

    expect(issued?.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued?.expiresAt).toBe(START + RealtimeTicketStore.TTL_MS);
    expect(store.issue('alice')?.ticket).not.toBe(issued?.ticket);
  });

  it('consumes a ticket exactly once and returns its identity', () => {
    const ticket = issueFor('alice');

    expect(store.consume(ticket)).toBe('alice');
    expect(store.consume(ticket)).toBeUndefined();
  });

  it('refuses a ticket that was never issued', () => {
    issueFor('alice');

    expect(store.consume('A'.repeat(43))).toBeUndefined();
  });

  it.each(hash.invalid)('refuses a ticket with $name', ({ token }) => {
    issueFor('alice');

    expect(store.consume(token)).toBeUndefined();
  });

  it('accepts a ticket until the instant before expiry', () => {
    const ticket = issueFor('alice');

    now += RealtimeTicketStore.TTL_MS - 1;

    expect(store.consume(ticket)).toBe('alice');
  });

  it('refuses a ticket at and after expiry', () => {
    const ticket = issueFor('alice');

    now += RealtimeTicketStore.TTL_MS;

    expect(store.consume(ticket)).toBeUndefined();
  });

  it('caps outstanding tickets per identity and frees them on expiry', () => {
    for (
      let index = 0;
      index < RealtimeTicketStore.MAX_ACTIVE_TICKETS_PER_IDENTITY;
      index += 1
    ) {
      issueFor('alice');
    }

    expect(store.issue('alice')).toBeUndefined();
    expect(store.issue('bob')).toBeDefined();

    now += RealtimeTicketStore.TTL_MS;

    expect(store.issue('alice')).toBeDefined();
  });

  it('frees a per-identity slot when its ticket is consumed', () => {
    const tickets = Array.from(
      { length: RealtimeTicketStore.MAX_ACTIVE_TICKETS_PER_IDENTITY },
      () => issueFor('alice'),
    );

    expect(store.issue('alice')).toBeUndefined();

    store.consume(tickets[0]);

    expect(store.issue('alice')).toBeDefined();
  });

  it('fails closed at global capacity instead of evicting live tickets', () => {
    const first = issueFor('identity-0');

    for (
      let index = 1;
      index < RealtimeTicketStore.MAX_ACTIVE_TICKETS;
      index += 1
    ) {
      issueFor(`identity-${index}`);
    }

    expect(store.issue('late')).toBeUndefined();
    expect(store.consume(first)).toBe('identity-0');
  });
});
