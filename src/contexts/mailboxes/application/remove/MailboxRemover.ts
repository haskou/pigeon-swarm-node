import { MailboxNotFoundError } from '../../domain/errors/MailboxNotFoundError';
import MailboxRepository from '../../domain/repositories/MailboxRepository';
import MailboxCoordinator from '../coordinate/MailboxCoordinator';
import MailboxEnvelopeNotifier from '../notify/MailboxEnvelopeNotifier';
import { MailboxRemoveMessage } from './messages/MailboxRemoveMessage';

export default class MailboxRemover {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly coordinator: MailboxCoordinator,
    private readonly notifier: MailboxEnvelopeNotifier,
  ) {}

  public async remove(message: MailboxRemoveMessage): Promise<void> {
    const mailboxId = message.mailboxId.valueOf();
    const readToken = message.readToken.valueOf();

    await this.coordinator.run(async (): Promise<void> => {
      const mailbox = await this.repository.findById(mailboxId);

      if (!mailbox || !mailbox.acceptsRead(readToken)) {
        throw new MailboxNotFoundError();
      }

      await this.repository.remove(mailboxId);
    });

    this.notifier.mailboxRemoved(mailboxId);
  }
}
