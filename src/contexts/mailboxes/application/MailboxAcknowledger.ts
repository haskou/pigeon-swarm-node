import { MailboxNotFoundError } from '../domain/errors/MailboxNotFoundError';
import MailboxRepository from '../domain/repositories/MailboxRepository';
import MailboxCoordinator from './MailboxCoordinator';

export default class MailboxAcknowledger {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly coordinator: MailboxCoordinator,
  ) {}

  /** Deletes every envelope up to and including the cursor. */
  public acknowledge(
    mailboxId: string,
    readToken: string,
    upTo: number,
  ): Promise<void> {
    return this.coordinator.run(async (): Promise<void> => {
      const mailbox = await this.repository.findById(mailboxId);

      if (!mailbox || !mailbox.acceptsRead(readToken)) {
        throw new MailboxNotFoundError();
      }

      const all = await this.repository.listEnvelopes(
        mailboxId,
        0,
        Number.MAX_SAFE_INTEGER,
      );
      const removed = all.filter((envelope) => envelope.cursor <= upTo);

      mailbox.releaseEnvelopes(
        removed.length,
        removed.reduce((sum, envelope) => sum + envelope.size, 0),
      );
      mailbox.markRead(Date.now());
      await this.repository.commitRemoval(mailbox, removed);
    });
  }
}
