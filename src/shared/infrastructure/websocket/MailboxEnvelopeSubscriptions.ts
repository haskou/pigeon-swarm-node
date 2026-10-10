import { WebSocket } from 'ws';

export const MAX_MAILBOX_SUBSCRIPTIONS_PER_CLIENT = 256;

export default class MailboxEnvelopeSubscriptions {
  private readonly clientsByMailbox = new Map<string, Set<WebSocket>>();
  private readonly mailboxesByClient = new Map<WebSocket, Set<string>>();

  public add(client: WebSocket, mailboxId: string): void {
    const mailboxes = this.mailboxesByClient.get(client) || new Set<string>();

    if (
      mailboxes.has(mailboxId) ||
      mailboxes.size >= MAX_MAILBOX_SUBSCRIPTIONS_PER_CLIENT
    ) {
      return;
    }

    mailboxes.add(mailboxId);
    this.mailboxesByClient.set(client, mailboxes);

    const clients =
      this.clientsByMailbox.get(mailboxId) || new Set<WebSocket>();

    clients.add(client);
    this.clientsByMailbox.set(mailboxId, clients);
  }

  public remove(client: WebSocket): void {
    const mailboxes = this.mailboxesByClient.get(client);

    if (!mailboxes) {
      return;
    }

    mailboxes.forEach((mailboxId) => {
      const clients = this.clientsByMailbox.get(mailboxId);

      if (!clients) {
        return;
      }

      clients.delete(client);

      if (clients.size === 0) {
        this.clientsByMailbox.delete(mailboxId);
      }
    });

    this.mailboxesByClient.delete(client);
  }

  public subscribersOf(mailboxId: string): WebSocket[] {
    return [...(this.clientsByMailbox.get(mailboxId) || [])];
  }

  public clear(): void {
    this.clientsByMailbox.clear();
    this.mailboxesByClient.clear();
  }
}
