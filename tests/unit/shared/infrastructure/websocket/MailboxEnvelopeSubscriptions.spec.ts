import MailboxEnvelopeSubscriptions, {
  MAX_MAILBOX_SUBSCRIPTIONS_PER_CLIENT,
} from '@app/shared/infrastructure/websocket/MailboxEnvelopeSubscriptions';
import { WebSocket } from 'ws';

const socket = (name: string): WebSocket => ({ name }) as unknown as WebSocket;

const READER_A = 'reader-hash-a';
const READER_B = 'reader-hash-b';

describe('MailboxEnvelopeSubscriptions', () => {
  it('returns only the sockets subscribed to the mailbox', () => {
    const subscriptions = new MailboxEnvelopeSubscriptions();
    const subscribed = socket('subscribed');

    subscriptions.add(subscribed, 'mailbox-a', READER_A);
    subscriptions.add(socket('other'), 'mailbox-b', READER_A);

    expect(subscriptions.subscribersOf('mailbox-a')).toEqual([subscribed]);
  });

  it('forgets every subscription of a socket once it is removed', () => {
    const subscriptions = new MailboxEnvelopeSubscriptions();
    const client = socket('client');

    subscriptions.add(client, 'mailbox-a', READER_A);
    subscriptions.add(client, 'mailbox-b', READER_A);
    subscriptions.remove(client);

    expect(subscriptions.subscribersOf('mailbox-a')).toEqual([]);
    expect(subscriptions.subscribersOf('mailbox-b')).toEqual([]);
  });

  it('caps the number of mailbox readers one socket can subscribe to', () => {
    const subscriptions = new MailboxEnvelopeSubscriptions();
    const client = socket('client');

    Array.from({ length: MAX_MAILBOX_SUBSCRIPTIONS_PER_CLIENT }).forEach(
      (_, index) => subscriptions.add(client, `mailbox-${index}`, READER_A),
    );
    subscriptions.add(client, 'mailbox-overflow', READER_A);

    expect(subscriptions.subscribersOf('mailbox-overflow')).toEqual([]);
    expect(subscriptions.subscribersOf('mailbox-0')).toEqual([client]);
  });

  it('stops only the revoked reader, keeping the socket on its other reader', () => {
    const subscriptions = new MailboxEnvelopeSubscriptions();
    const client = socket('client');

    subscriptions.add(client, 'mailbox-a', READER_A);
    subscriptions.add(client, 'mailbox-a', READER_B);
    subscriptions.dropReader('mailbox-a', READER_A);

    expect(subscriptions.subscribersOf('mailbox-a')).toEqual([client]);

    subscriptions.dropReader('mailbox-a', READER_B);

    expect(subscriptions.subscribersOf('mailbox-a')).toEqual([]);
  });

  it('leaves other sockets on the same mailbox subscribed when one reader is dropped', () => {
    const subscriptions = new MailboxEnvelopeSubscriptions();
    const revoked = socket('revoked');
    const stillReading = socket('still-reading');

    subscriptions.add(revoked, 'mailbox-a', READER_A);
    subscriptions.add(stillReading, 'mailbox-a', READER_B);
    subscriptions.dropReader('mailbox-a', READER_A);

    expect(subscriptions.subscribersOf('mailbox-a')).toEqual([stillReading]);
  });

  it('drops every reader of a mailbox without touching other mailboxes', () => {
    const subscriptions = new MailboxEnvelopeSubscriptions();
    const client = socket('client');
    const other = socket('other');

    subscriptions.add(client, 'mailbox-a', READER_A);
    subscriptions.add(client, 'mailbox-a', READER_B);
    subscriptions.add(other, 'mailbox-b', READER_A);
    subscriptions.dropMailbox('mailbox-a');

    expect(subscriptions.subscribersOf('mailbox-a')).toEqual([]);
    expect(subscriptions.subscribersOf('mailbox-b')).toEqual([other]);
  });

  it('frees the per-socket cap slot when a reader is dropped', () => {
    const subscriptions = new MailboxEnvelopeSubscriptions();
    const client = socket('client');

    Array.from({ length: MAX_MAILBOX_SUBSCRIPTIONS_PER_CLIENT }).forEach(
      (_, index) => subscriptions.add(client, `mailbox-${index}`, READER_A),
    );
    subscriptions.dropReader('mailbox-0', READER_A);
    subscriptions.add(client, 'mailbox-overflow', READER_A);

    expect(subscriptions.subscribersOf('mailbox-overflow')).toEqual([client]);
  });

  it('removes one subscription pair and nothing else', () => {
    const subscriptions = new MailboxEnvelopeSubscriptions();
    const client = socket('client');

    subscriptions.add(client, 'mailbox-a', READER_A);
    subscriptions.add(client, 'mailbox-a', READER_B);
    subscriptions.removeSubscription(client, 'mailbox-a', READER_A);

    expect(subscriptions.subscribersOf('mailbox-a')).toEqual([client]);
  });
});
