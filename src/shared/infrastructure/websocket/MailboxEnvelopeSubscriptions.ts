import { WebSocket } from 'ws';

export const MAX_MAILBOX_SUBSCRIPTIONS_PER_CLIENT = 256;

type Subscription = { mailboxId: string; readTokenHash: string };

/**
 * Hint routing for mailbox subscriptions. A subscription is bound to the read
 * token hash that authorised it, so revoking that reader or deleting the
 * mailbox stops its hints at once. The socket stays open: the protocol has no
 * unsubscribe message.
 */
export default class MailboxEnvelopeSubscriptions {
  private readonly clientsByMailbox = new Map<
    string,
    Map<string, Set<WebSocket>>
  >();

  private readonly subscriptionsByClient = new Map<
    WebSocket,
    Map<string, Subscription>
  >();

  private detach(
    client: WebSocket,
    mailboxId: string,
    readTokenHash: string,
  ): void {
    const readers = this.clientsByMailbox.get(mailboxId);
    const clients = readers?.get(readTokenHash);

    if (!readers || !clients) {
      return;
    }

    clients.delete(client);

    if (clients.size === 0) {
      readers.delete(readTokenHash);
    }

    if (readers.size === 0) {
      this.clientsByMailbox.delete(mailboxId);
    }
  }

  public add(
    client: WebSocket,
    mailboxId: string,
    readTokenHash: string,
  ): void {
    const subscriptions =
      this.subscriptionsByClient.get(client) || new Map<string, Subscription>();
    // The key is JSON so a mailbox id can never collide with a hash.
    const key = JSON.stringify([mailboxId, readTokenHash]);

    if (
      subscriptions.has(key) ||
      subscriptions.size >= MAX_MAILBOX_SUBSCRIPTIONS_PER_CLIENT
    ) {
      return;
    }

    subscriptions.set(key, { mailboxId, readTokenHash });
    this.subscriptionsByClient.set(client, subscriptions);

    const readers =
      this.clientsByMailbox.get(mailboxId) || new Map<string, Set<WebSocket>>();
    const clients = readers.get(readTokenHash) || new Set<WebSocket>();

    clients.add(client);
    readers.set(readTokenHash, clients);
    this.clientsByMailbox.set(mailboxId, readers);
  }

  public removeSubscription(
    client: WebSocket,
    mailboxId: string,
    readTokenHash: string,
  ): void {
    const subscriptions = this.subscriptionsByClient.get(client);

    if (!subscriptions) {
      return;
    }

    subscriptions.delete(JSON.stringify([mailboxId, readTokenHash]));

    if (subscriptions.size === 0) {
      this.subscriptionsByClient.delete(client);
    }

    this.detach(client, mailboxId, readTokenHash);
  }

  public remove(client: WebSocket): void {
    const subscriptions = this.subscriptionsByClient.get(client);

    if (!subscriptions) {
      return;
    }

    for (const { mailboxId, readTokenHash } of [...subscriptions.values()]) {
      this.removeSubscription(client, mailboxId, readTokenHash);
    }
  }

  /** Only the revoked reader's subscriptions stop; the socket's other readers keep theirs. */
  public dropReader(mailboxId: string, readTokenHash: string): void {
    const clients = [
      ...(this.clientsByMailbox.get(mailboxId)?.get(readTokenHash) || []),
    ];

    for (const client of clients) {
      this.removeSubscription(client, mailboxId, readTokenHash);
    }
  }

  public dropMailbox(mailboxId: string): void {
    const readers = this.clientsByMailbox.get(mailboxId);

    if (!readers) {
      return;
    }

    for (const readTokenHash of [...readers.keys()]) {
      this.dropReader(mailboxId, readTokenHash);
    }
  }

  public subscribersOf(mailboxId: string): WebSocket[] {
    const readers = this.clientsByMailbox.get(mailboxId);

    if (!readers) {
      return [];
    }

    const clients = [...readers.values()].flatMap((set) => [...set]);

    return [...new Set(clients)];
  }

  public clear(): void {
    this.clientsByMailbox.clear();
    this.subscriptionsByClient.clear();
  }
}
