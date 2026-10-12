import { MailboxNotFoundError } from '../domain/errors/MailboxNotFoundError';
import MailboxPolicy from '../domain/MailboxPolicy';
import { MailboxReaderPrimitives } from '../domain/MailboxPrimitives';
import MailboxRepository from '../domain/repositories/MailboxRepository';

/**
 * Lists reader hashes and acknowledged cursors for any reader. Only hashes
 * leave the node, never tokens.
 */
export default class MailboxReaderLister {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly policy: MailboxPolicy,
  ) {}

  public async list(
    mailboxId: string,
    readToken: string,
  ): Promise<{ maxReaders: number; readers: MailboxReaderPrimitives[] }> {
    const mailbox = await this.repository.findById(mailboxId);

    if (!mailbox || !mailbox.acceptsRead(readToken)) {
      throw new MailboxNotFoundError();
    }

    return {
      maxReaders: this.policy.maxReaders(),
      readers: mailbox.readers(),
    };
  }
}
