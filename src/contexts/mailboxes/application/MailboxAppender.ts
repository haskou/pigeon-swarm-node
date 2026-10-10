import { MailboxEnvelopeInvalidError } from '../domain/errors/MailboxEnvelopeInvalidError';
import { MailboxNotFoundError } from '../domain/errors/MailboxNotFoundError';
import MailboxPolicy from '../domain/MailboxPolicy';
import MailboxRepository from '../domain/repositories/MailboxRepository';
import MailboxCoordinator from './MailboxCoordinator';

export default class MailboxAppender {
  private static readonly BASE64URL = /^[A-Za-z0-9_-]+$/;

  constructor(
    private readonly repository: MailboxRepository,
    private readonly policy: MailboxPolicy,
    private readonly coordinator: MailboxCoordinator,
  ) {}

  private decodedSize(body: string): number {
    if (!MailboxAppender.BASE64URL.test(body)) {
      throw new MailboxEnvelopeInvalidError(MailboxPolicy.SIZE_BUCKETS);
    }

    const size = Buffer.from(body, 'base64url').length;

    if (!this.policy.isAllowedBodySize(size)) {
      throw new MailboxEnvelopeInvalidError(MailboxPolicy.SIZE_BUCKETS);
    }

    return size;
  }

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

      const size = this.decodedSize(body);
      const known = await this.repository.findCursorByEnvelopeId(
        mailboxId,
        envelopeId,
      );

      if (known !== undefined) {
        return { created: false, cursor: known };
      }

      const cursor = mailbox.reserveEnvelope(size, this.policy);

      await this.repository.commitAppend(mailbox, {
        body,
        cursor,
        envelopeId,
        size,
        storedAt: Date.now(),
      });

      return { created: true, cursor };
    });
  }
}
