import { MailboxNotFoundError } from '../domain/errors/MailboxNotFoundError';
import MailboxPolicy from '../domain/MailboxPolicy';
import MailboxRepository from '../domain/repositories/MailboxRepository';
import MailboxCoordinator from './MailboxCoordinator';

/**
 * Joins a device to a mailbox. Only an existing reader can add one: a post
 * token never authenticates here, so a sender cannot add a reader.
 */
export default class MailboxReaderAdder {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly policy: MailboxPolicy,
    private readonly coordinator: MailboxCoordinator,
  ) {}

  /** Returns false when the hash is already a reader. */
  public add(
    mailboxId: string,
    readToken: string,
    readTokenHash: string,
  ): Promise<boolean> {
    return this.coordinator.run(async (): Promise<boolean> => {
      const mailbox = await this.repository.findById(mailboxId);

      if (!mailbox || !mailbox.acceptsRead(readToken)) {
        throw new MailboxNotFoundError();
      }

      const added = mailbox.addReader(readTokenHash, this.policy);

      mailbox.markRead(Date.now());
      await this.repository.save(mailbox);

      return added;
    });
  }
}
