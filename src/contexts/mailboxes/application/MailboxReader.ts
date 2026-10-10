import { MailboxNotFoundError } from '../domain/errors/MailboxNotFoundError';
import { MailboxEnvelope } from '../domain/MailboxEnvelope';
import MailboxPolicy from '../domain/MailboxPolicy';
import MailboxRepository from '../domain/repositories/MailboxRepository';
import MailboxCoordinator from './MailboxCoordinator';

export interface MailboxPage {
  envelopes: MailboxEnvelope[];
  hasMore: boolean;
}

export default class MailboxReader {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly coordinator: MailboxCoordinator,
  ) {}

  public read(
    mailboxId: string,
    readToken: string,
    after: number,
    limit: number,
  ): Promise<MailboxPage> {
    return this.coordinator.run(async (): Promise<MailboxPage> => {
      const mailbox = await this.repository.findById(mailboxId);

      if (!mailbox || !mailbox.acceptsRead(readToken)) {
        throw new MailboxNotFoundError();
      }

      const bounded = Math.min(Math.max(limit, 1), MailboxPolicy.MAX_PAGE);
      const page = await this.repository.listEnvelopes(
        mailboxId,
        after,
        bounded + 1,
      );

      mailbox.markRead(Date.now());
      await this.repository.save(mailbox);

      return {
        envelopes: page.slice(0, bounded),
        hasMore: page.length > bounded,
      };
    });
  }
}
