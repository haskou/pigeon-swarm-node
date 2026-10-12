import { MailboxNotFoundError } from '../domain/errors/MailboxNotFoundError';
import MailboxRepository from '../domain/repositories/MailboxRepository';
import MailboxCoordinator from './MailboxCoordinator';
import MailboxEnvelopeNotifier from './MailboxEnvelopeNotifier';
import MailboxSettler from './MailboxSettler';

/**
 * Removes one reader. Envelopes that reader was holding back become
 * deletable as soon as the remaining readers have passed them, and its
 * realtime subscriptions stop at once.
 */
export default class MailboxReaderRevoker {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly coordinator: MailboxCoordinator,
    private readonly settler: MailboxSettler,
    private readonly notifier: MailboxEnvelopeNotifier,
  ) {}

  public async revoke(
    mailboxId: string,
    readToken: string,
    readTokenHash: string,
  ): Promise<void> {
    await this.coordinator.run(async (): Promise<void> => {
      const mailbox = await this.repository.findById(mailboxId);

      if (!mailbox || !mailbox.acceptsRead(readToken)) {
        throw new MailboxNotFoundError();
      }

      mailbox.removeReader(readTokenHash);
      await this.repository.commitRemoval(
        mailbox,
        await this.settler.settle(mailbox),
      );
    });

    this.notifier.readerRevoked(mailboxId, readTokenHash);
  }
}
