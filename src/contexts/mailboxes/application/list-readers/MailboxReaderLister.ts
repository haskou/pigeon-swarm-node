import { MailboxNotFoundError } from '../../domain/errors/MailboxNotFoundError';
import MailboxPolicy from '../../domain/MailboxPolicy';
import { MailboxReaderPrimitives } from '../../domain/MailboxReaderPrimitives';
import MailboxRepository from '../../domain/repositories/MailboxRepository';
import { MailboxReaderListMessage } from './messages/MailboxReaderListMessage';

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
    message: MailboxReaderListMessage,
  ): Promise<{ maxReaders: number; readers: MailboxReaderPrimitives[] }> {
    const mailboxId = message.mailboxId.valueOf();
    const readToken = message.readToken.valueOf();

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
