import { MailboxNotFoundError } from '../domain/errors/MailboxNotFoundError';
import MailboxRepository from '../domain/repositories/MailboxRepository';
import MailboxCoordinator from './MailboxCoordinator';
import MailboxEnvelopeNotifier from './MailboxEnvelopeNotifier';

export default class MailboxRemover {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly coordinator: MailboxCoordinator,
    private readonly notifier: MailboxEnvelopeNotifier,
  ) {}

  public async remove(mailboxId: string, readToken: string): Promise<void> {
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
