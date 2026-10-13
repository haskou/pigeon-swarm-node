import { Timestamp } from '@haskou/value-objects';

import { MailboxNotFoundError } from '../../domain/errors/MailboxNotFoundError';
import MailboxPolicy from '../../domain/MailboxPolicy';
import MailboxRepository from '../../domain/repositories/MailboxRepository';
import MailboxCoordinator from '../coordinate/MailboxCoordinator';
import MailboxEnvelopeNotifier from '../notify/MailboxEnvelopeNotifier';
import { MailboxAppendMessage } from './messages/MailboxAppendMessage';

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
    message: MailboxAppendMessage,
  ): Promise<{ created: boolean; cursor: number }> {
    const body = message.body.valueOf();

    return this.coordinator.run(async () => {
      const mailbox = await this.repository.requireById(message.mailboxId);

      if (!mailbox.acceptsPost(message.postToken)) {
        throw new MailboxNotFoundError();
      }

      const size = this.policy.decodedBodySize(body);

      if (
        await this.repository.hasEnvelope(message.mailboxId, message.envelopeId)
      ) {
        return {
          created: false,
          cursor: await this.repository.requireEnvelopeCursor(
            message.mailboxId,
            message.envelopeId,
          ),
        };
      }

      const now = Timestamp.now();
      mailbox.consumeAppend(now, this.policy);

      const cursor = mailbox.reserveEnvelope(size, this.policy);

      await this.repository.commitAppend(mailbox, {
        body,
        cursor,
        envelopeId: message.envelopeId.valueOf(),
        size,
        storedAt: now.toMilliseconds(),
      });
      this.notifier.envelopeAppended(message.mailboxId.valueOf(), cursor);

      return { created: true, cursor };
    });
  }
}
