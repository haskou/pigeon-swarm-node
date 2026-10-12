import { Timestamp } from '@haskou/value-objects';

import { MailboxNotFoundError } from '../domain/errors/MailboxNotFoundError';
import MailboxPolicy from '../domain/MailboxPolicy';
import MailboxRepository from '../domain/repositories/MailboxRepository';
import MailboxCoordinator from './MailboxCoordinator';
import MailboxEnvelopeNotifier from './MailboxEnvelopeNotifier';

export default class MailboxAppender {
  constructor(
    private readonly repository: MailboxRepository,
    private readonly policy: MailboxPolicy,
    private readonly coordinator: MailboxCoordinator,
    private readonly notifier: MailboxEnvelopeNotifier,
  ) {}

  /**
   * Appending the same envelopeId twice returns the first cursor and stores
   * nothing new. A missing mailbox or wrong capability is one uniform error.
   */
  public append(
    mailboxId: string,
    postToken: string,
    envelopeId: string,
    body: string,
  ): Promise<{ created: boolean; cursor: number }> {
    return this.coordinator.run(async () => {
      const mailbox = await this.repository.findById(mailboxId);

      if (!mailbox || !mailbox.acceptsPost(postToken)) {
        throw new MailboxNotFoundError();
      }

      const size = this.policy.decodedBodySize(body);
      const known = await this.repository.findCursorByEnvelopeId(
        mailboxId,
        envelopeId,
      );

      if (known !== undefined) {
        return { created: false, cursor: known };
      }

      const now = Timestamp.now();
      mailbox.consumeAppend(now, this.policy);

      const cursor = mailbox.reserveEnvelope(size, this.policy);

      await this.repository.commitAppend(mailbox, {
        body,
        cursor,
        envelopeId,
        size,
        storedAt: now.toMilliseconds(),
      });
      this.notifier.envelopeAppended(mailboxId, cursor);

      return { created: true, cursor };
    });
  }
}
