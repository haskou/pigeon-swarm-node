import { MailboxNotFoundError } from '../domain/errors/MailboxNotFoundError';
import MailboxRepository from '../domain/repositories/MailboxRepository';
import MailboxCoordinator from './MailboxCoordinator';
import MailboxSettler from './MailboxSettler';

export default class MailboxAcknowledger {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly coordinator: MailboxCoordinator,
    private readonly settler: MailboxSettler,
  ) {}

  /** Records this reader's progress, then deletes what all readers passed. */
  public acknowledge(
    mailboxId: string,
    readToken: string,
    upTo: number,
  ): Promise<void> {
    return this.coordinator.run(async (): Promise<void> => {
      const mailbox = await this.repository.findById(mailboxId);

      if (!mailbox || !mailbox.acknowledge(readToken, upTo)) {
        throw new MailboxNotFoundError();
      }

      mailbox.markRead(Date.now());
      await this.repository.commitRemoval(
        mailbox,
        await this.settler.settle(mailbox),
      );
    });
  }
}
