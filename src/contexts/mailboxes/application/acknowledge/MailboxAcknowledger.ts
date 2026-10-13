import { Timestamp } from '@haskou/value-objects';

import { MailboxNotFoundError } from '../../domain/errors/MailboxNotFoundError';
import MailboxRepository from '../../domain/repositories/MailboxRepository';
import MailboxCoordinator from '../coordinate/MailboxCoordinator';
import MailboxSettler from '../settle/MailboxSettler';
import { MailboxAcknowledgeMessage } from './messages/MailboxAcknowledgeMessage';

export default class MailboxAcknowledger {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly coordinator: MailboxCoordinator,
    private readonly settler: MailboxSettler,
  ) {}

  /** Records this reader's progress, then deletes what all readers passed. */
  public acknowledge(message: MailboxAcknowledgeMessage): Promise<void> {
    const mailboxId = message.mailboxId.valueOf();
    const readToken = message.readToken.valueOf();

    return this.coordinator.run(async (): Promise<void> => {
      const mailbox = await this.repository.findById(mailboxId);

      if (!mailbox || !mailbox.acknowledge(readToken, message.upTo)) {
        throw new MailboxNotFoundError();
      }

      mailbox.markRead(Timestamp.now());
      await this.repository.commitRemoval(
        mailbox,
        await this.settler.settle(mailbox),
      );
    });
  }
}
