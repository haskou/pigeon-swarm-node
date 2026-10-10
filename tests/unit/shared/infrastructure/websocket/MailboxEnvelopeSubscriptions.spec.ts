import MailboxEnvelopeSubscriptions, {
  MAX_MAILBOX_SUBSCRIPTIONS_PER_CLIENT,
} from '@app/shared/infrastructure/websocket/MailboxEnvelopeSubscriptions';
import { WebSocket } from 'ws';

const socket = (name: string): WebSocket => ({ name }) as unknown as WebSocket;

describe('MailboxEnvelopeSubscriptions', () => {
  it('returns only the sockets subscribed to the mailbox', () => {
    const subscriptions = new MailboxEnvelopeSubscriptions();
    const subscribed = socket('subscribed');

    subscriptions.add(subscribed, 'mailbox-a');
    subscriptions.add(socket('other'), 'mailbox-b');

    expect(subscriptions.subscribersOf('mailbox-a')).toEqual([subscribed]);
  });

  it('forgets every subscription of a socket once it is removed', () => {
    const subscriptions = new MailboxEnvelopeSubscriptions();
    const client = socket('client');

    subscriptions.add(client, 'mailbox-a');
    subscriptions.add(client, 'mailbox-b');
    subscriptions.remove(client);

    expect(subscriptions.subscribersOf('mailbox-a')).toEqual([]);
    expect(subscriptions.subscribersOf('mailbox-b')).toEqual([]);
  });

  it('caps the number of mailboxes one socket can subscribe to', () => {
    const subscriptions = new MailboxEnvelopeSubscriptions();
    const client = socket('client');

    Array.from({ length: MAX_MAILBOX_SUBSCRIPTIONS_PER_CLIENT }).forEach(
      (_, index) => subscriptions.add(client, `mailbox-${index}`),
    );
    subscriptions.add(client, 'mailbox-overflow');

    expect(subscriptions.subscribersOf('mailbox-overflow')).toEqual([]);
    expect(subscriptions.subscribersOf('mailbox-0')).toEqual([client]);
  });
});
