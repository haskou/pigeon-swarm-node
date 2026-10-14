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
    const mailbox = await this.repository.requireById(message.mailboxId);

    if (!mailbox.acceptsRead(message.readToken)) {
      throw new MailboxNotFoundError();
    }

    return {
      maxReaders: this.policy.maxReaders(),
      readers: mailbox.readers().map((reader) => reader.toPrimitives()),
    };
  }
}
