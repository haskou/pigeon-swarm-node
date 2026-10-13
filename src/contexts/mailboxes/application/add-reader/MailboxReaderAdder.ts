import { Timestamp } from '@haskou/value-objects';

import { MailboxNotFoundError } from '../../domain/errors/MailboxNotFoundError';
import MailboxPolicy from '../../domain/MailboxPolicy';
import MailboxRepository from '../../domain/repositories/MailboxRepository';
import MailboxCoordinator from '../coordinate/MailboxCoordinator';
import { MailboxReaderAddMessage } from './messages/MailboxReaderAddMessage';

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
  public add(message: MailboxReaderAddMessage): Promise<boolean> {
    return this.coordinator.run(async (): Promise<boolean> => {
      const mailbox = await this.repository.requireById(message.mailboxId);

      if (!mailbox.acceptsRead(message.readToken)) {
        throw new MailboxNotFoundError();
      }

      const added = mailbox.addReader(message.readTokenHash, this.policy);

      mailbox.markRead(Timestamp.now());
      await this.repository.save(mailbox);

      return added;
    });
  }
}
