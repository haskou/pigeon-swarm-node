import { Timestamp } from '@haskou/value-objects';

import { MailboxNotFoundError } from '../../domain/errors/MailboxNotFoundError';
import { MailboxEnvelope } from '../../domain/MailboxEnvelope';
import MailboxPolicy from '../../domain/MailboxPolicy';
import MailboxRepository from '../../domain/repositories/MailboxRepository';
import MailboxCoordinator from '../coordinate/MailboxCoordinator';
import { MailboxReadMessage } from './messages/MailboxReadMessage';

export interface MailboxPage {
  envelopes: MailboxEnvelope[];
  hasMore: boolean;
}

export default class MailboxReader {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly coordinator: MailboxCoordinator,
  ) {}

  public read(message: MailboxReadMessage): Promise<MailboxPage> {
    const mailboxId = message.mailboxId.valueOf();
    const readToken = message.readToken.valueOf();

    return this.coordinator.run(async (): Promise<MailboxPage> => {
      const mailbox = await this.repository.requireById(mailboxId);

      if (!mailbox.acceptsRead(readToken)) {
        throw new MailboxNotFoundError();
      }

      const bounded = Math.min(
        Math.max(message.limit, 1),
        MailboxPolicy.MAX_PAGE,
      );
      const page = await this.repository.listEnvelopes(
        mailboxId,
        message.after,
        bounded + 1,
      );

      mailbox.markRead(Timestamp.now());
      await this.repository.save(mailbox);

      return {
        envelopes: page.slice(0, bounded),
        hasMore: page.length > bounded,
      };
    });
  }
}
