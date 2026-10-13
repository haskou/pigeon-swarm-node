import { MailboxNotFoundError } from '../../domain/errors/MailboxNotFoundError';
import MailboxRepository from '../../domain/repositories/MailboxRepository';
import MailboxCoordinator from '../coordinate/MailboxCoordinator';
import MailboxEnvelopeNotifier from '../notify/MailboxEnvelopeNotifier';
import MailboxSettler from '../settle/MailboxSettler';
import { MailboxReaderRevokeMessage } from './messages/MailboxReaderRevokeMessage';

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

  public async revoke(message: MailboxReaderRevokeMessage): Promise<void> {
    await this.coordinator.run(async (): Promise<void> => {
      const mailbox = await this.repository.requireById(message.mailboxId);

      if (!mailbox.acceptsRead(message.readToken)) {
        throw new MailboxNotFoundError();
      }

      mailbox.removeReader(message.readTokenHash);
      await this.repository.commitRemoval(
        mailbox,
        await this.settler.settle(mailbox),
      );
    });

    this.notifier.readerRevoked(
      message.mailboxId.valueOf(),
      message.readTokenHash.valueOf(),
    );
  }
}
